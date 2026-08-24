import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { MCPServerConfig } from './mcp-manager';

export type McpConnectorKey = 'confluence' | 'bilibili' | 'xiaohongshu';

export interface McpConnectorDefinition {
  key: McpConnectorKey;
  presetKey: string;
  displayName: string;
  profileEnabled: boolean;
  isServer: (server: MCPServerConfig) => boolean;
  skillPath: () => string | null;
}

const CONFLUENCE_NPX_PACKAGE = '@fleetsnowfluff/confluence-mcp';
const BILIBILI_MCP_PACKAGE = 'bilibili-mcp';
const XIAOHONGSHU_MCP_PACKAGE = 'xiaohongshu-mcp';

function firstExistingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function resolveConnectorSkillPath(connectorKey: McpConnectorKey): string | null {
  const relativeSkillPath = path.join('connectors', connectorKey, 'skill', 'SKILL.md');
  const appPath = app.getAppPath?.() || process.cwd();
  const resourcesPath = process.resourcesPath || '';

  if (app.isPackaged) {
    return firstExistingFile([
      path.join(resourcesPath, 'mcp', relativeSkillPath),
      path.join(appPath, 'mcp', relativeSkillPath),
    ]);
  }

  return firstExistingFile([
    path.join(process.cwd(), 'src', 'main', 'mcp', relativeSkillPath),
    path.join(__dirname, relativeSkillPath),
    path.join(__dirname, '..', 'mcp', relativeSkillPath),
    path.join(appPath, 'src', 'main', 'mcp', relativeSkillPath),
    path.join(resourcesPath, 'mcp', relativeSkillPath),
  ]);
}

export function isConfluenceServer(server: MCPServerConfig): boolean {
  const normalizedName = server.name.trim().toLowerCase();
  if (normalizedName === 'confluence' || normalizedName === 'confluence mcp') {
    return true;
  }
  return Boolean(server.args?.some((arg) => arg.includes(CONFLUENCE_NPX_PACKAGE)));
}

export function isBilibiliServer(server: MCPServerConfig): boolean {
  const normalizedName = server.name.trim().toLowerCase();
  if (
    normalizedName === 'bilibili' ||
    normalizedName === 'bilibili mcp' ||
    normalizedName === 'bilibili-mcp'
  ) {
    return true;
  }
  return Boolean(server.args?.some((arg) => arg.includes(BILIBILI_MCP_PACKAGE)));
}

export function isXiaohongshuServer(server: MCPServerConfig): boolean {
  const normalizedName = server.name.trim().toLowerCase();
  if (
    normalizedName === 'xiaohongshu' ||
    normalizedName === 'xiaohongshu mcp' ||
    normalizedName === 'xiaohongshu-mcp' ||
    normalizedName === '小红书'
  ) {
    return true;
  }
  return Boolean(server.args?.some((arg) => arg.includes(XIAOHONGSHU_MCP_PACKAGE)));
}

export const MCP_CONNECTOR_REGISTRY: Record<McpConnectorKey, McpConnectorDefinition> = {
  confluence: {
    key: 'confluence',
    presetKey: 'confluence',
    displayName: 'Confluence',
    profileEnabled: true,
    isServer: isConfluenceServer,
    skillPath: () => resolveConnectorSkillPath('confluence'),
  },
  bilibili: {
    key: 'bilibili',
    presetKey: 'bilibili',
    displayName: 'Bilibili',
    profileEnabled: false,
    isServer: isBilibiliServer,
    skillPath: () => resolveConnectorSkillPath('bilibili'),
  },
  xiaohongshu: {
    key: 'xiaohongshu',
    presetKey: 'xiaohongshu',
    displayName: 'Xiaohongshu',
    profileEnabled: false,
    isServer: isXiaohongshuServer,
    skillPath: () => resolveConnectorSkillPath('xiaohongshu'),
  },
};

export function getConnectorDefinitionForServer(
  server: MCPServerConfig
): McpConnectorDefinition | null {
  for (const definition of Object.values(MCP_CONNECTOR_REGISTRY)) {
    if (definition.isServer(server)) {
      return definition;
    }
  }
  return null;
}

export function getRelatedSkillPathsForMcpServers(servers: MCPServerConfig[]): string[] {
  const paths = new Set<string>();
  for (const server of servers) {
    if (!server.enabled) continue;
    const definition = getConnectorDefinitionForServer(server);
    const skillPath = definition?.skillPath();
    if (skillPath) {
      paths.add(skillPath);
    }
  }
  return Array.from(paths);
}

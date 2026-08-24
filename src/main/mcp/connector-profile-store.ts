import { app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { MCPServerConfig } from './mcp-manager';
import { getConnectorDefinitionForServer, type McpConnectorKey } from './connector-registry';

export type ConnectorProfileStatus = 'not_started' | 'ready' | 'skipped' | 'stale';

export interface ConnectorProfileManifest {
  version: 1;
  mcp: McpConnectorKey;
  profileKey: string;
  sourceServerIds: string[];
  status: Exclude<ConnectorProfileStatus, 'not_started'>;
  siteUrl?: string;
  accountIdHash?: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
  lastExploredAt?: string;
  files: Record<string, string>;
}

export interface ConnectorProfileStatusResult {
  mcp: McpConnectorKey;
  profileKey: string;
  status: ConnectorProfileStatus;
  directory: string;
  manifest?: ConnectorProfileManifest;
  profileSummary?: string;
}

export interface ConnectorProfileWriteInput {
  mcp: McpConnectorKey;
  serverId?: string;
  profileKey?: string;
  siteUrl?: string;
  accountId?: string;
  email?: string;
  displayName?: string;
  files: Record<string, string>;
}

const DEFAULT_PROFILE_FILES = [
  'profile.md',
  'spaces.md',
  'recurring-pages.md',
  'people.md',
  'page-patterns.md',
  'preferences.md',
];

function sha256Short(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function normalizeKeyPart(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function safeReadText(filePath: string, maxChars: number): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.length > maxChars ? `${content.slice(0, maxChars)}\n...` : content;
  } catch {
    return undefined;
  }
}

function sanitizeProfileFilename(filename: string): string {
  const base = path.basename(filename.trim());
  if (!base || base === '.' || base === '..' || base !== filename.trim()) {
    throw new Error(`Invalid profile filename: ${filename}`);
  }
  if (!/^[a-zA-Z0-9._-]+\.md$/.test(base) && !/^[a-zA-Z0-9._-]+\.json$/.test(base)) {
    throw new Error(`Unsupported profile filename: ${filename}`);
  }
  return base;
}

export class ConnectorProfileStore {
  constructor(private readonly baseDir = path.join(app.getPath('userData'), 'mcp-profiles')) {}

  getBaseDir(): string {
    return this.baseDir;
  }

  resolveProfileKey(
    mcp: McpConnectorKey,
    options: {
      server?: MCPServerConfig;
      profileKey?: string;
      siteUrl?: string;
      accountId?: string;
      email?: string;
    } = {}
  ): string {
    if (options.profileKey?.trim()) {
      return options.profileKey.trim();
    }

    const siteUrl = normalizeKeyPart(
      options.siteUrl ||
        options.server?.env?.CONFLUENCE_DOMAIN ||
        options.server?.env?.CONFLUENCE_BASE_URL
    );
    const account = normalizeKeyPart(
      options.accountId || options.email || options.server?.env?.CONFLUENCE_EMAIL
    );

    if (siteUrl || account) {
      return sha256Short(`${mcp}:${siteUrl}:${account}`);
    }

    const server = options.server;
    if (server) {
      return sha256Short(
        `${mcp}:${server.id}:${server.name}:${server.command || ''}:${(server.args || []).join(' ')}`
      );
    }

    return sha256Short(`${mcp}:default`);
  }

  getProfileDirectory(mcp: McpConnectorKey, profileKey: string): string {
    return path.join(this.baseDir, mcp, profileKey);
  }

  getStatusForServer(server: MCPServerConfig): ConnectorProfileStatusResult | null {
    const definition = getConnectorDefinitionForServer(server);
    if (!definition?.profileEnabled) {
      return null;
    }

    const profileKey = this.resolveProfileKey(definition.key, { server });
    return this.getStatus(definition.key, profileKey);
  }

  getStatus(mcp: McpConnectorKey, profileKey: string): ConnectorProfileStatusResult {
    const directory = this.getProfileDirectory(mcp, profileKey);
    const manifestPath = path.join(directory, 'manifest.json');
    let manifest: ConnectorProfileManifest | undefined;

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ConnectorProfileManifest;
      } catch {
        manifest = undefined;
      }
    }

    const profileSummary = safeReadText(path.join(directory, 'profile.md'), 4000);
    const status: ConnectorProfileStatus = manifest?.status || 'not_started';
    return { mcp, profileKey, status, directory, manifest, profileSummary };
  }

  writeProfile(input: ConnectorProfileWriteInput): ConnectorProfileStatusResult {
    const profileKey = this.resolveProfileKey(input.mcp, input);
    const directory = this.getProfileDirectory(input.mcp, profileKey);
    fs.mkdirSync(directory, { recursive: true });

    const now = new Date().toISOString();
    const existing = this.getStatus(input.mcp, profileKey).manifest;
    const files: Record<string, string> = {};

    for (const filename of DEFAULT_PROFILE_FILES) {
      if (!(filename in input.files)) continue;
      const content = input.files[filename];
      if (typeof content !== 'string') continue;
      fs.writeFileSync(path.join(directory, filename), content, 'utf8');
      files[filename.replace(/\.md$/, '').replace(/-/g, '_')] = filename;
    }

    for (const [filename, content] of Object.entries(input.files)) {
      if (DEFAULT_PROFILE_FILES.includes(filename)) continue;
      const safeName = sanitizeProfileFilename(filename);
      if (typeof content !== 'string') continue;
      fs.writeFileSync(path.join(directory, safeName), content, 'utf8');
      files[safeName.replace(/\.(md|json)$/, '').replace(/-/g, '_')] = safeName;
    }

    const manifest: ConnectorProfileManifest = {
      version: 1,
      mcp: input.mcp,
      profileKey,
      sourceServerIds: input.serverId ? [input.serverId] : existing?.sourceServerIds || [],
      status: 'ready',
      siteUrl: input.siteUrl || existing?.siteUrl,
      accountIdHash:
        input.accountId || input.email
          ? `sha256:${sha256Short(input.accountId || input.email || '')}`
          : existing?.accountIdHash,
      displayName: input.displayName || existing?.displayName,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastExploredAt: now,
      files: { ...(existing?.files || {}), ...files },
    };

    fs.writeFileSync(
      path.join(directory, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
    return this.getStatus(input.mcp, profileKey);
  }

  buildPromptContextForServers(servers: MCPServerConfig[]): string {
    const contexts: string[] = [];
    for (const server of servers) {
      if (!server.enabled) continue;
      const status = this.getStatusForServer(server);
      if (!status) continue;
      const manifest = status.manifest;
      contexts.push(
        [
          `<${status.mcp}_profile_status>`,
          `status: ${status.status}`,
          `server_id: ${server.id}`,
          `profile_key: ${status.profileKey}`,
          `profile_storage: app-managed`,
          manifest?.updatedAt ? `updated_at: ${manifest.updatedAt}` : '',
          status.profileSummary
            ? `profile_summary:\n${status.profileSummary}`
            : 'profile_summary: none',
          `</${status.mcp}_profile_status>`,
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
    return contexts.join('\n\n');
  }
}

export const connectorProfileStore = new ConnectorProfileStore();

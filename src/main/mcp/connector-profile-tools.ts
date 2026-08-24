import { Type, type TSchema } from 'typebox';
import type { ToolDefinition } from '../agent/pi-sdk';
import type { MCPServerConfig } from './mcp-manager';
import { connectorProfileStore, type ConnectorProfileWriteInput } from './connector-profile-store';
import { getConnectorDefinitionForServer, type McpConnectorKey } from './connector-registry';

function getProfileCapableConnectors(servers: MCPServerConfig[]): Set<McpConnectorKey> {
  const connectors = new Set<McpConnectorKey>();
  for (const server of servers) {
    if (!server.enabled) continue;
    const definition = getConnectorDefinitionForServer(server);
    if (definition?.profileEnabled) {
      connectors.add(definition.key);
    }
  }
  return connectors;
}

function getServerForConnector(
  servers: MCPServerConfig[],
  mcp: McpConnectorKey,
  serverId?: string
): MCPServerConfig | undefined {
  return servers.find((server) => {
    if (!server.enabled) return false;
    if (serverId && server.id !== serverId) return false;
    const definition = getConnectorDefinitionForServer(server);
    return definition?.key === mcp;
  });
}

function assertProfileConnectorEnabled(
  servers: MCPServerConfig[],
  mcp: McpConnectorKey,
  serverId?: string
): MCPServerConfig {
  const server = getServerForConnector(servers, mcp, serverId);
  if (!server) {
    throw new Error(`No enabled ${mcp} MCP connector is available for profile storage`);
  }
  return server;
}

function asMcpConnectorKey(value: unknown): McpConnectorKey {
  if (value === 'confluence') return value;
  throw new Error(`Unsupported profile connector: ${String(value)}`);
}

export function buildConnectorProfileTools(servers: MCPServerConfig[]): ToolDefinition[] {
  if (getProfileCapableConnectors(servers).size === 0) {
    return [];
  }

  const statusTool: ToolDefinition<TSchema, unknown> = {
    name: 'connector_profile_status',
    label: 'Connector profile status',
    description:
      'Read the app-managed profile status for an enabled MCP connector such as Confluence.',
    parameters: Type.Object({
      mcp: Type.Union([Type.Literal('confluence')]),
      serverId: Type.Optional(Type.String()),
      profileKey: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const input = params as { mcp?: unknown; serverId?: string; profileKey?: string };
      const mcp = asMcpConnectorKey(input.mcp);
      const server = assertProfileConnectorEnabled(servers, mcp, input.serverId);
      const profileKey = connectorProfileStore.resolveProfileKey(mcp, {
        server,
        profileKey: input.profileKey,
      });
      const status = connectorProfileStore.getStatus(mcp, profileKey);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                mcp: status.mcp,
                profileKey: status.profileKey,
                status: status.status,
                updatedAt: status.manifest?.updatedAt,
                hasProfileSummary: Boolean(status.profileSummary),
                directory: status.directory,
              },
              null,
              2
            ),
          },
        ],
        details: undefined,
      };
    },
  };

  const writeTool: ToolDefinition<TSchema, unknown> = {
    name: 'connector_profile_write',
    label: 'Connector profile write',
    description:
      'Save app-managed Markdown profile files after a user-approved, read-only MCP connector exploration.',
    parameters: Type.Object({
      mcp: Type.Union([Type.Literal('confluence')]),
      serverId: Type.Optional(Type.String()),
      profileKey: Type.Optional(Type.String()),
      siteUrl: Type.Optional(Type.String()),
      accountId: Type.Optional(Type.String()),
      email: Type.Optional(Type.String()),
      displayName: Type.Optional(Type.String()),
      files: Type.Record(Type.String(), Type.String()),
    }),
    async execute(_toolCallId, params) {
      const input = params as ConnectorProfileWriteInput;
      const mcp = asMcpConnectorKey(input.mcp);
      const server = assertProfileConnectorEnabled(servers, mcp, input.serverId);
      const status = connectorProfileStore.writeProfile({
        ...input,
        mcp,
        serverId: input.serverId || server.id,
        profileKey: input.profileKey || connectorProfileStore.resolveProfileKey(mcp, { server }),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                saved: true,
                mcp: status.mcp,
                profileKey: status.profileKey,
                status: status.status,
                updatedAt: status.manifest?.updatedAt,
                directory: status.directory,
              },
              null,
              2
            ),
          },
        ],
        details: undefined,
      };
    },
  };

  return [statusTool, writeTool];
}

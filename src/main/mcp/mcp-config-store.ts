import Store, { type Options as StoreOptions } from 'electron-store';
import { app } from 'electron';
import * as fs from 'fs';
import * as crypto from 'crypto';
import path from 'path';
import type { MCPServerConfig } from './mcp-manager';
import { log, logError } from '../utils/logger';

const CONFLUENCE_NPX_PACKAGE = '@fleetsnowfluff/confluence-mcp';
const CONFLUENCE_NPX_ARGS = ['-y', CONFLUENCE_NPX_PACKAGE];
const BILIBILI_NODE_ARGS = ['{BILIBILI_MCP_SERVER_PATH}'];
const TWITTER_NODE_ARGS = ['{TWITTER_MCP_SERVER_PATH}'];
const XIAOHONGSHU_NODE_ARGS = ['{XIAOHONGSHU_MCP_SERVER_PATH}'];

/**
 * Preset MCP Server Configurations
 * These are common MCP servers that users can quickly add
 */
export const MCP_SERVER_PRESETS: Record<
  string,
  Omit<MCPServerConfig, 'id' | 'enabled'> & {
    requiresEnv?: string[];
    envDescription?: Record<string, string>;
    icon?: string;
    description?: string;
  }
> = {
  chrome: {
    name: 'Chrome',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest', '--browser-url', 'http://localhost:9222'],
    icon: '/connectors/chrome.svg',
    description:
      'Control Chrome browser via DevTools Protocol. Supports page navigation, DOM inspection, screenshots, and JavaScript execution.',
  },
  notion: {
    name: 'Notion',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: {
      NOTION_TOKEN: '',
    },
    requiresEnv: ['NOTION_TOKEN'],
    envDescription: {
      NOTION_TOKEN: 'Notion Internal Integration Token (get from notion.so/profile/integrations)',
    },
    icon: '/connectors/notion.svg',
    description:
      'Create, read, update, and search Notion pages and databases. Manage workspaces, users, and content blocks.',
  },
  twitter: {
    name: 'Twitter',
    type: 'stdio',
    command: 'node',
    args: TWITTER_NODE_ARGS,
    env: {},
    requiresEnv: [],
    envDescription: {
      TWITTER_OPENCLI_BIN: 'Optional. Defaults to opencli.',
      TWITTER_OPENCLI_DAEMON_URL: 'Optional. Defaults to http://127.0.0.1:19825.',
      TWITTER_OPENCLI_TIMEOUT: 'Optional. Defaults to 60 seconds.',
      TWITTER_OPENCLI_WINDOW: 'Optional. Defaults to background.',
      TWITTER_OPENCLI_SITE_SESSION: 'Optional. Defaults to ephemeral.',
      TWITTER_OPENCLI_KEEP_TAB: 'Optional. Defaults to false.',
    },
    icon: '/connectors/twitter.svg',
    description:
      'Access Twitter/X via OpenCLI Browser Bridge with the current Chrome login session: search, timeline, bookmarks, followers, notifications, post/reply drafts, and safe actions.',
  },
  xiaohongshu: {
    name: 'Xiaohongshu',
    type: 'stdio',
    command: 'node',
    args: XIAOHONGSHU_NODE_ARGS,
    env: {
      XIAOHONGSHU_STARTUP_CHECK: 'bridge',
    },
    requiresEnv: [],
    envDescription: {
      XIAOHONGSHU_OPENCLI_BIN: 'Optional. Defaults to opencli.',
      XIAOHONGSHU_OPENCLI_DAEMON_URL: 'Optional. Defaults to http://127.0.0.1:19825.',
      XIAOHONGSHU_OPENCLI_TIMEOUT: 'Optional. Defaults to 60 seconds.',
      XIAOHONGSHU_OPENCLI_WINDOW: 'Optional. Defaults to background.',
      XIAOHONGSHU_OPENCLI_SITE_SESSION: 'Optional. Defaults to persistent.',
      XIAOHONGSHU_OPENCLI_KEEP_TAB: 'Optional. Defaults to true.',
      XIAOHONGSHU_STARTUP_CHECK:
        'Optional. Use login, bridge, or false. Defaults to bridge in cowoker so the connector can start before login.',
    },
    icon: '/connectors/xiaohongshu.svg',
    description:
      'Access Xiaohongshu via OpenCLI Browser Bridge with the current Chrome login session: feed, search, notes, comments, creator analytics, downloads, drafts, and guarded publish/delete actions.',
  },
  'software-development': {
    name: 'Software Development',
    type: 'stdio',
    command: 'node',
    args: ['{SOFTWARE_DEV_SERVER_PATH}'], // Path will be resolved at runtime (compiled JS in production)
    env: {
      WORKSPACE_DIR: '',
      TEST_ENV: 'development',
    },
    requiresEnv: [],
    envDescription: {
      WORKSPACE_DIR: 'Workspace directory for code development (optional)',
      TEST_ENV: 'Test environment: development, staging, or production (optional)',
    },
    icon: '/connectors/software-development.svg',
    description:
      'Software development toolkit with file operations, terminal commands, code analysis, and git integration.',
  },
  'gui-operate': {
    name: 'GUI Operate',
    type: 'stdio',
    command: 'node',
    args: ['{GUI_OPERATE_SERVER_PATH}'], // Path will be resolved at runtime (compiled JS in production)
    env: {},
    requiresEnv: [],
    envDescription: {
      // No environment variables required
    },
    icon: '/connectors/gui-operate.svg',
    description:
      'Automate GUI interactions including mouse clicks, keyboard input, window management, and screen capture.',
  },
  confluence: {
    name: 'Confluence',
    type: 'stdio',
    command: 'npx',
    args: CONFLUENCE_NPX_ARGS,
    env: {},
    requiresEnv: [],
    envDescription: {
      // No environment variables required
    },
    icon: '/connectors/confluence.svg',
    description:
      'Read and write Confluence pages and spaces. Search content, create documentation, and manage team knowledge.',
  },
  bilibili: {
    name: 'Bilibili',
    type: 'stdio',
    command: 'node',
    args: BILIBILI_NODE_ARGS,
    env: {},
    requiresEnv: [],
    envDescription: {
      BILIBILI_OPENCLI_BIN: 'Optional. Defaults to opencli.',
      BILIBILI_OPENCLI_DAEMON_URL: 'Optional. Defaults to http://127.0.0.1:19825.',
      BILIBILI_OPENCLI_TIMEOUT: 'Optional. Defaults to 60 seconds.',
      BILIBILI_OPENCLI_WINDOW: 'Optional. Defaults to background.',
      BILIBILI_OPENCLI_SITE_SESSION: 'Optional. Defaults to ephemeral.',
      BILIBILI_OPENCLI_KEEP_TAB: 'Optional. Defaults to false.',
    },
    icon: '/connectors/bilibili.svg',
    description:
      'Access Bilibili via OpenCLI Browser Bridge with the current Chrome login session: status, hot/ranking/search, video metadata, summaries, subtitles, comments, history, favorites, feeds, user videos, following, and safe comment drafts.',
  },
  'azure-image': {
    name: 'Azure Image',
    type: 'stdio',
    command: 'node',
    args: ['{AZURE_IMAGE_SERVER_PATH}'],
    env: {
      AZURE_OPENAI_ENDPOINT: '',
      AZURE_OPENAI_API_KEY: '',
      IMAGE_MCP_OUTPUT_DIR: '',
    },
    requiresEnv: ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY'],
    envDescription: {
      AZURE_OPENAI_ENDPOINT:
        'Full Azure OpenAI image endpoint URL, including deployment and api-version.',
      AZURE_OPENAI_API_KEY: 'Azure OpenAI API key. AZURE_API_KEY is also supported at runtime.',
      IMAGE_MCP_OUTPUT_DIR:
        'Optional output directory for generated images. Defaults to generated-images under the app working directory.',
    },
    icon: '/connectors/azure-image.svg',
    description:
      'Generate and edit images with Azure OpenAI image models, saving outputs to local files.',
  },
};

/**
 * MCP Server Configuration Store
 */
class MCPConfigStore {
  private store: Store<{ servers: MCPServerConfig[] }>;

  constructor() {
    const storeOptions: StoreOptions<{ servers: MCPServerConfig[] }> & { projectName?: string } = {
      name: 'mcp-config',
      projectName: 'coworker',
      defaults: {
        servers: [],
      },
    };

    this.store = new Store<{ servers: MCPServerConfig[] }>(storeOptions);
  }

  /**
   * Get all MCP server configurations
   */
  getServers(): MCPServerConfig[] {
    const servers = this.store.get('servers', []);
    let migratedServers = servers.map((server) => this.migrateConfluenceServer(server));
    migratedServers = migratedServers.map((server) => this.migratePlaceholderPaths(server));
    const changed = migratedServers.some((server, index) => server !== servers[index]);

    if (changed) {
      this.store.set('servers', migratedServers);
    }

    return migratedServers;
  }

  /**
   * Get a specific server configuration
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    const servers = this.getServers();
    return servers.find((s) => s.id === serverId);
  }

  /**
   * Add or update a server configuration
   */
  saveServer(config: MCPServerConfig): void {
    const servers = this.getServers();
    const index = servers.findIndex((s) => s.id === config.id);

    if (index >= 0) {
      servers[index] = config;
    } else {
      servers.push(config);
    }

    this.store.set('servers', servers);
  }

  /**
   * Delete a server configuration
   */
  deleteServer(serverId: string): void {
    const servers = this.getServers();
    const filtered = servers.filter((s) => s.id !== serverId);
    this.store.set('servers', filtered);
  }

  /**
   * Update all server configurations
   */
  setServers(servers: MCPServerConfig[]): void {
    this.store.set('servers', servers);
  }

  /**
   * Get enabled servers only
   */
  getEnabledServers(): MCPServerConfig[] {
    return this.getServers().filter((s) => s.enabled);
  }

  /**
   * Get preset configurations
   */
  getPresets(): Record<string, Omit<MCPServerConfig, 'id' | 'enabled'>> {
    return MCP_SERVER_PRESETS;
  }

  /**
   * Get the path to a MCP server file in the mcp directory
   */
  private getMcpServerPath(filename: string): string | null {
    // In development: __dirname points to dist-electron/main
    // In production: appPath points to the app.asar or unpacked app
    if (app.isPackaged) {
      // Production: use compiled JavaScript files from extraResources/mcp
      // Convert .ts extension to .js
      const jsFilename = filename.replace(/\.ts$/, '.js');
      const mcpPath = path.join(process.resourcesPath || '', 'mcp', jsFilename);

      // Check if compiled JS file exists in resources
      try {
        if (fs.existsSync(mcpPath)) {
          return mcpPath;
        }
      } catch {
        // Fall through to development path
      }
    }

    // Development: __dirname is dist-electron/main
    // Need to go up 2 levels to get to project root (dist-electron/main -> dist-electron -> project root)
    const projectRoot = path.join(__dirname, '..', '..');

    // Prefer bundled JS from dist-mcp in development.
    // This avoids attempting to run TypeScript directly with `node`.
    const jsFilename = filename.replace(/\.ts$/, '.js');
    const devBundledPath = path.join(projectRoot, 'dist-mcp', jsFilename);
    try {
      if (fs.existsSync(devBundledPath)) {
        return devBundledPath;
      }
    } catch {
      // Fall through to source path
    }

    // Fallback: navigate to src/main/mcp/[filename]
    const sourcePath = path.join(projectRoot, 'src', 'main', 'mcp', filename);

    // Verify file exists and log for debugging
    try {
      if (fs.existsSync(sourcePath)) {
        log(`[MCPConfigStore] MCP Server path resolved (${filename}):`, sourcePath);
        return sourcePath;
      } else {
        logError(`[MCPConfigStore] File not found at:`, sourcePath);
        logError('[MCPConfigStore] __dirname:', __dirname);
        logError('[MCPConfigStore] projectRoot:', projectRoot);
      }
    } catch (error) {
      logError('[MCPConfigStore] Error checking file:', error);
    }

    return null;
  }

  /**
   * Get the path to the Software Development MCP server file
   */
  private getSoftwareDevServerPath(): string | null {
    return this.getMcpServerPath('software-dev-server-example.ts');
  }

  /**
   * Get the path to the GUI Operate MCP server file
   */
  private getGuiOperateServerPath(): string | null {
    return this.getMcpServerPath('gui-operate-server.ts');
  }

  /**
   * Get the path to the Azure Image MCP server file
   */
  private getAzureImageServerPath(): string | null {
    return this.getMcpServerPath('azure-image-server.ts');
  }

  /**
   * Confluence is always launched through the published npm MCP package.
   */
  private migrateConfluenceServer(server: MCPServerConfig): MCPServerConfig {
    if (!this.isConfluenceServer(server)) {
      return server;
    }

    if (
      server.command === 'npx' &&
      server.args?.length === CONFLUENCE_NPX_ARGS.length &&
      server.args.every((arg, index) => arg === CONFLUENCE_NPX_ARGS[index])
    ) {
      return server;
    }

    return {
      ...server,
      command: 'npx',
      args: CONFLUENCE_NPX_ARGS,
    };
  }

  private isConfluenceServer(server: MCPServerConfig): boolean {
    const name = server.name.trim().toLowerCase();
    return name === 'confluence' || name === 'confluence mcp';
  }

  /**
   * Migrate old absolute-path args back to placeholders for built-in MCP
   * servers that were previously resolved at preset-creation time.
   */
  private migratePlaceholderPaths(server: MCPServerConfig): MCPServerConfig {
    if (!server.args || server.args.length === 0) {
      return server;
    }

    const name = server.name.trim().toLowerCase();
    let matchPattern: string | null = null;
    let placeholder: string | null = null;

    if (name === 'twitter' || name === 'twitter mcp') {
      matchPattern = 'twitter-mcp/dist/server.js';
      placeholder = '{TWITTER_MCP_SERVER_PATH}';
    } else if (name === 'xiaohongshu' || name === 'xiaohongshu mcp') {
      matchPattern = 'xiaohongshu-mcp/dist/server.js';
      placeholder = '{XIAOHONGSHU_MCP_SERVER_PATH}';
    }

    if (!matchPattern || !placeholder) {
      return server;
    }

    const hasExternalPath = server.args.some((arg) =>
      arg.includes(matchPattern!)
    );

    if (!hasExternalPath) {
      return server;
    }

    return {
      ...server,
      args: server.args.map((arg) =>
        arg.includes(matchPattern!) ? placeholder! : arg
      ),
    };
  }

  /**
   * Create a server config from a preset
   */
  createFromPreset(presetKey: string, enabled: boolean = false): MCPServerConfig | null {
    const preset = MCP_SERVER_PRESETS[presetKey];
    if (!preset) {
      return null;
    }

    // Resolve path placeholders for presets
    let resolvedPreset = { ...preset };

    if (preset.args) {
      resolvedPreset = {
        ...preset,
        args: preset.args.map((arg) => {
          // Software Development server path
          if (arg === '{SOFTWARE_DEV_SERVER_PATH}') {
            return this.getSoftwareDevServerPath() || arg;
          }
          // GUI Operate server path
          if (arg === '{GUI_OPERATE_SERVER_PATH}') {
            return this.getGuiOperateServerPath() || arg;
          }
          // Azure Image server path
          if (arg === '{AZURE_IMAGE_SERVER_PATH}') {
            return this.getAzureImageServerPath() || arg;
          }
          // Bilibili / Twitter / Xiaohongshu: keep placeholder so
          // MCPManager resolves at runtime (same as other built-in servers in
          // packaged builds). Resolving here would bake absolute paths into
          // stored config, breaking portability.
          return arg;
        }),
      };
    }

    return {
      ...resolvedPreset,
      id: `mcp-${presetKey}-${crypto.randomUUID()}`,
      enabled,
    };
  }
}

// Singleton instance
export const mcpConfigStore = new MCPConfigStore();

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MCPServerConfig } from '../src/main/mcp/mcp-manager';
import type { DatabaseInstance } from '../src/main/db/database';

const tempRoots: string[] = [];
const originalResourcesPath = process.resourcesPath;

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/coworker-test-user-data',
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
}));

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cowork-mcp-profile-'));
  tempRoots.push(root);
  return root;
}

function confluenceServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'mcp-confluence-1',
    name: 'Confluence',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@fleetsnowfluff/confluence-mcp'],
    env: {},
    enabled: true,
    ...overrides,
  };
}

function bilibiliServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'mcp-bilibili-1',
    name: 'Bilibili',
    type: 'stdio',
    command: 'node',
    args: ['/Users/demo/Projects/bilibili-mcp/dist/server.js'],
    env: {},
    enabled: true,
    ...overrides,
  };
}

function xiaohongshuServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'mcp-xiaohongshu-1',
    name: 'Xiaohongshu',
    type: 'stdio',
    command: 'node',
    args: ['/Users/demo/Projects/xiaohongshu-mcp/dist/server.js'],
    env: {},
    enabled: true,
    ...overrides,
  };
}

function createDbMock(): DatabaseInstance {
  const statement = { run: vi.fn() } as unknown as ReturnType<DatabaseInstance['prepare']>;
  return {
    raw: {} as DatabaseInstance['raw'],
    sessions: {} as DatabaseInstance['sessions'],
    messages: {} as DatabaseInstance['messages'],
    traceSteps: {} as DatabaseInstance['traceSteps'],
    scheduledTasks: {} as DatabaseInstance['scheduledTasks'],
    prepare: vi.fn(() => statement),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
  };
}

afterEach(() => {
  vi.resetModules();
  vi.doMock('electron', () => ({
    app: {
      getPath: () => '/tmp/coworker-test-user-data',
      getAppPath: () => process.cwd(),
      isPackaged: false,
    },
  }));
  process.resourcesPath = originalResourcesPath;
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('connector profile store', () => {
  it('returns not_started then saves an app-managed Confluence profile', async () => {
    const { ConnectorProfileStore } = await import('../src/main/mcp/connector-profile-store');
    const store = new ConnectorProfileStore(makeTempRoot());
    const server = confluenceServer();

    const initial = store.getStatusForServer(server);
    expect(initial?.status).toBe('not_started');

    const saved = store.writeProfile({
      mcp: 'confluence',
      serverId: server.id,
      profileKey: initial?.profileKey,
      siteUrl: 'https://example.atlassian.net',
      displayName: 'Ada Lovelace',
      files: {
        'profile.md': '# Confluence Profile\n\n- User: Ada Lovelace\n',
        'spaces.md': '# Spaces\n\n- ENG\n',
      },
    });

    expect(saved.status).toBe('ready');
    expect(saved.manifest?.displayName).toBe('Ada Lovelace');
    expect(saved.profileSummary).toContain('Ada Lovelace');
  });

  it('injects ready profile context for enabled Confluence servers', async () => {
    const { ConnectorProfileStore } = await import('../src/main/mcp/connector-profile-store');
    const store = new ConnectorProfileStore(makeTempRoot());
    const server = confluenceServer();
    const profileKey = store.resolveProfileKey('confluence', { server });

    store.writeProfile({
      mcp: 'confluence',
      serverId: server.id,
      profileKey,
      files: { 'profile.md': '# Existing Profile\n\nUse ENG first.\n' },
    });

    const context = store.buildPromptContextForServers([server]);
    expect(context).toContain('<confluence_profile_status>');
    expect(context).toContain('status: ready');
    expect(context).toContain('Use ENG first');
  });
});

describe('connector registry', () => {
  it('maps enabled Confluence MCP servers to the bundled connector skill', async () => {
    const { getRelatedSkillPathsForMcpServers } =
      await import('../src/main/mcp/connector-registry');

    const paths = getRelatedSkillPathsForMcpServers([confluenceServer()]);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/connectors[/\\]confluence[/\\]skill[/\\]SKILL\.md$/);
  });

  it('maps enabled Bilibili MCP servers to the bundled connector skill', async () => {
    const { getRelatedSkillPathsForMcpServers } =
      await import('../src/main/mcp/connector-registry');

    const paths = getRelatedSkillPathsForMcpServers([bilibiliServer()]);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/connectors[/\\]bilibili[/\\]skill[/\\]SKILL\.md$/);
  });

  it('maps enabled Xiaohongshu MCP servers to the bundled connector skill', async () => {
    const { getRelatedSkillPathsForMcpServers } =
      await import('../src/main/mcp/connector-registry');

    const paths = getRelatedSkillPathsForMcpServers([xiaohongshuServer()]);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/connectors[/\\]xiaohongshu[/\\]skill[/\\]SKILL\.md$/);
  });

  it('uses packaged Resources/mcp connector skill path in packaged builds', async () => {
    const root = makeTempRoot();
    const resourcesPath = join(root, 'Resources');
    const skillDir = join(resourcesPath, 'mcp', 'connectors', 'confluence', 'skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: confluence\ndescription: packaged connector skill\n---\n',
      'utf8'
    );

    vi.resetModules();
    vi.doMock('electron', () => ({
      app: {
        getPath: () => join(root, 'userData'),
        getAppPath: () => join(root, 'Coworker.app', 'Contents', 'Resources', 'app.asar'),
        isPackaged: true,
      },
    }));
    process.resourcesPath = resourcesPath;

    const { getRelatedSkillPathsForMcpServers } =
      await import('../src/main/mcp/connector-registry');
    const paths = getRelatedSkillPathsForMcpServers([confluenceServer()]);

    expect(paths).toEqual([join(skillDir, 'SKILL.md')]);
  });
});

describe('connector-bound skills', () => {
  it('exposes Confluence as a locked built-in skill managed by the connector', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: {
        getPath: () => '/tmp/coworker-test-user-data',
        getAppPath: () => process.cwd(),
        isPackaged: false,
      },
    }));

    const { SkillsManager } = await import('../src/main/skills/skills-manager');
    const manager = new SkillsManager(createDbMock(), {
      getConnectorServers: () => [confluenceServer()],
    });

    const skills = await manager.listSkills();
    const confluenceSkill = skills.find((skill) => skill.id === 'builtin-connector-confluence');

    expect(confluenceSkill).toMatchObject({
      name: 'confluence',
      type: 'builtin',
      enabled: true,
      locked: true,
      managedBy: 'Confluence',
    });
    expect(() => manager.setSkillEnabled('builtin-connector-confluence', false)).toThrow(
      /managed automatically/
    );
  });
});

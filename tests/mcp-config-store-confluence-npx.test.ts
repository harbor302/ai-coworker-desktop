import { describe, expect, it, vi } from 'vitest';

const storeState = vi.hoisted(() => ({
  data: {
    servers: [
      {
        id: 'mcp-confluence-existing',
        name: 'Confluence',
        type: 'stdio' as const,
        command: 'node',
        args: ['/old/local/confluence-server.js'],
        env: {},
        enabled: true,
      },
      {
        id: 'mcp-confluence-server-path-existing',
        name: 'Confluence',
        type: 'stdio' as const,
        command: 'node',
        args: ['/another/local/confluence-server.js'],
        env: {},
        enabled: true,
      },
    ],
  },
  setCalls: [] as Array<[string, unknown]>,
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/tmp/work/coworker',
  },
}));

vi.mock('electron-store', () => ({
  default: class MockStore {
    get(key: 'servers', fallback: unknown) {
      return storeState.data[key] ?? fallback;
    }

    set(key: 'servers', value: unknown) {
      storeState.data[key] = value as typeof storeState.data.servers;
      storeState.setCalls.push([key, value]);
    }
  },
}));

describe('MCP config store presets', () => {
  it('normalizes persisted Confluence MCP configs to the npm package on load', async () => {
    const { mcpConfigStore } = await import('../src/main/mcp/mcp-config-store');

    const servers = mcpConfigStore.getServers();

    expect(servers[0].command).toBe('npx');
    expect(servers[0].args).toEqual(['-y', '@fleetsnowfluff/confluence-mcp']);
    expect(servers[1].command).toBe('npx');
    expect(servers[1].args).toEqual(['-y', '@fleetsnowfluff/confluence-mcp']);
    expect(storeState.setCalls).toHaveLength(1);
    expect(storeState.setCalls[0][0]).toBe('servers');

    const preset = mcpConfigStore.createFromPreset('confluence', true);
    expect(preset?.command).toBe('npx');
    expect(preset?.args).toEqual(['-y', '@fleetsnowfluff/confluence-mcp']);
  });

  it('exposes the Azure Image preset to the connector picker', async () => {
    const { mcpConfigStore } = await import('../src/main/mcp/mcp-config-store');

    const presets = mcpConfigStore.getPresets();

    expect(presets['azure-image']).toMatchObject({
      name: 'Azure Image',
      type: 'stdio',
      command: 'node',
      args: ['{AZURE_IMAGE_SERVER_PATH}'],
      icon: '/connectors/azure-image.svg',
    });
    expect(presets['azure-image'].requiresEnv).toEqual([
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_API_KEY',
    ]);
  });

  it('exposes the Bilibili preset to the connector picker', async () => {
    const { mcpConfigStore } = await import('../src/main/mcp/mcp-config-store');

    const presets = mcpConfigStore.getPresets();

    expect(presets.bilibili).toMatchObject({
      name: 'Bilibili',
      type: 'stdio',
      command: 'node',
      args: ['{BILIBILI_MCP_SERVER_PATH}'],
      icon: '/connectors/bilibili.svg',
    });

    const preset = mcpConfigStore.createFromPreset('bilibili', true);
    expect(preset?.args).toContain('/Users/demo/Projects/bilibili-mcp/dist/server.js');
  });

  it('exposes the Xiaohongshu preset to the connector picker', async () => {
    const { mcpConfigStore } = await import('../src/main/mcp/mcp-config-store');

    const presets = mcpConfigStore.getPresets();

    expect(presets.xiaohongshu).toMatchObject({
      name: 'Xiaohongshu',
      type: 'stdio',
      command: 'node',
      args: ['{XIAOHONGSHU_MCP_SERVER_PATH}'],
      icon: '/connectors/xiaohongshu.svg',
      env: {
        XIAOHONGSHU_STARTUP_CHECK: 'bridge',
      },
    });

    const preset = mcpConfigStore.createFromPreset('xiaohongshu', true);
    expect(preset?.args).toContain('/Users/demo/Projects/xiaohongshu-mcp/dist/server.js');
  });
});

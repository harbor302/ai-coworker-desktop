import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createAgentSession = vi.fn(async (options: unknown) => ({
    session: { id: 'pi-session', options },
    extensionsResult: {},
  }));
  const createReadToolDefinition = vi.fn(() => ({ name: 'read' }));
  const createBashToolDefinition = vi.fn(() => ({ name: 'bash' }));
  const createEditToolDefinition = vi.fn(() => ({ name: 'edit' }));
  const createWriteToolDefinition = vi.fn(() => ({ name: 'write' }));
  const reload = vi.fn(async () => undefined);
  const DefaultResourceLoader = vi.fn(function DefaultResourceLoader(this: unknown, options) {
    Object.assign(this as object, { options, reload });
  });
  const modelRegistry = { kind: 'model-registry' };
  const ModelRegistry = { inMemory: vi.fn(() => modelRegistry) };
  const sessionManager = { kind: 'session-manager' };
  const settingsManager = { kind: 'settings-manager' };

  return {
    createAgentSession,
    createReadToolDefinition,
    createBashToolDefinition,
    createEditToolDefinition,
    createWriteToolDefinition,
    reload,
    DefaultResourceLoader,
    ModelRegistry,
    modelRegistry,
    sessionManager,
    settingsManager,
    PiSessionManager: { inMemory: vi.fn(() => sessionManager) },
    PiSettingsManager: { inMemory: vi.fn(() => settingsManager) },
  };
});

vi.mock('../src/main/agent/pi-sdk', () => ({
  createAgentSession: mocks.createAgentSession,
  createReadToolDefinition: mocks.createReadToolDefinition,
  createBashToolDefinition: mocks.createBashToolDefinition,
  createEditToolDefinition: mocks.createEditToolDefinition,
  createWriteToolDefinition: mocks.createWriteToolDefinition,
  DefaultResourceLoader: mocks.DefaultResourceLoader,
  ModelRegistry: mocks.ModelRegistry,
  PiSessionManager: mocks.PiSessionManager,
  PiSettingsManager: mocks.PiSettingsManager,
}));

import {
  createPiAgentSession,
  createPiCodingToolDefinitions,
  createPiResourceLoader,
} from '../src/main/agent/pi-runtime';

describe('pi runtime compatibility layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps coding tool creation behind a stable app-level helper', () => {
    const tools = createPiCodingToolDefinitions('/tmp/work', { bash: { operations: {} } as never });

    expect(tools).toEqual([
      { name: 'read' },
      { name: 'bash' },
      { name: 'edit' },
      { name: 'write' },
    ]);
    expect(mocks.createReadToolDefinition).toHaveBeenCalledWith('/tmp/work');
    expect(mocks.createBashToolDefinition).toHaveBeenCalledWith('/tmp/work', {
      operations: {},
    });
    expect(mocks.createEditToolDefinition).toHaveBeenCalledWith('/tmp/work');
    expect(mocks.createWriteToolDefinition).toHaveBeenCalledWith('/tmp/work');
  });

  it('creates and reloads the old DefaultResourceLoader with app-filtered skills', async () => {
    const loader = await createPiResourceLoader({
      cwd: '/tmp/work',
      agentDir: '/tmp/agent',
      additionalSkillPaths: ['/skills/confluence'],
      appendSystemPrompt: 'extra prompt',
    });

    expect(loader).toBeInstanceOf(mocks.DefaultResourceLoader);
    expect(mocks.DefaultResourceLoader).toHaveBeenCalledWith({
      cwd: '/tmp/work',
      agentDir: '/tmp/agent',
      additionalSkillPaths: ['/skills/confluence'],
      noSkills: true,
      appendSystemPrompt: ['extra prompt'],
    });
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it('isolates old createAgentSession option assembly for the future 0.78 migration', async () => {
    const authStorage = { kind: 'auth' };
    const model = { id: 'model', api: 'openai', provider: 'custom' };
    const tools = [{ name: 'read' }];
    const customTools = [{ name: 'mcp__Confluence__search' }];

    const result = await createPiAgentSession({
      model: model as never,
      thinkingLevel: 'off',
      authStorage: authStorage as never,
      tools: tools as never,
      customTools: customTools as never,
      resourceLoader: {
        cwd: '/tmp/work',
        agentDir: '/tmp/agent',
        additionalSkillPaths: [],
        appendSystemPrompt: 'extra prompt',
      },
      compaction: { enabled: true },
      cwd: '/tmp/work',
    });

    expect(result.session.id).toBe('pi-session');
    expect(mocks.ModelRegistry.inMemory).toHaveBeenCalledWith(authStorage);
    expect(mocks.PiSessionManager.inMemory).toHaveBeenCalledTimes(1);
    expect(mocks.PiSettingsManager.inMemory).toHaveBeenCalledWith({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 2 },
    });
    expect(mocks.createAgentSession).toHaveBeenCalledWith({
      model,
      thinkingLevel: 'off',
      authStorage,
      modelRegistry: mocks.modelRegistry,
      noTools: 'builtin',
      tools: ['read', 'mcp__Confluence__search'],
      customTools: [...tools, ...customTools],
      sessionManager: mocks.sessionManager,
      settingsManager: mocks.settingsManager,
      resourceLoader: expect.any(mocks.DefaultResourceLoader),
      cwd: '/tmp/work',
    });
  });
});

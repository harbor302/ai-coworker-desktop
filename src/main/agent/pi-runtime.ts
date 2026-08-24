import {
  createAgentSession,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  DefaultResourceLoader,
  ModelRegistry,
  PiSessionManager,
  PiSettingsManager,
  type Api,
  type AuthStorage,
  type BashToolOptions,
  type Model,
  type ToolDefinition,
} from './pi-sdk';

type PiCreateAgentSessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;
type PiThinkingLevel = PiCreateAgentSessionOptions['thinkingLevel'];
type PiAgentSessionResult = Awaited<ReturnType<typeof createAgentSession>>;

export interface PiResourceLoaderInput {
  cwd: string;
  agentDir: string;
  additionalSkillPaths: string[];
  appendSystemPrompt: string | string[];
  noSkills?: boolean;
}

export interface PiCompactionSettings {
  enabled: boolean;
  reserveTokens?: number;
  keepRecentTokens?: number;
}

export interface PiAgentSessionInput {
  model: Model<Api>;
  thinkingLevel: PiThinkingLevel;
  authStorage: AuthStorage;
  tools: ToolDefinition[];
  customTools: ToolDefinition[];
  resourceLoader: PiResourceLoaderInput;
  compaction: PiCompactionSettings;
  cwd: string;
}

export function createPiCodingToolDefinitions(
  cwd: string,
  options?: { bash?: BashToolOptions }
): ToolDefinition[] {
  return [
    createReadToolDefinition(cwd),
    createBashToolDefinition(cwd, options?.bash),
    createEditToolDefinition(cwd),
    createWriteToolDefinition(cwd),
    createGrepToolDefinition(cwd),
    createFindToolDefinition(cwd),
  ] as ToolDefinition[];
}

export async function createPiResourceLoader(input: PiResourceLoaderInput) {
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir: input.agentDir,
    additionalSkillPaths: input.additionalSkillPaths,
    // Prevent SDK auto-discovery from ~/.agents, .agents, or the app
    // skills directory. The app already filtered skill paths by enabled state.
    noSkills: input.noSkills ?? true,
    appendSystemPrompt: Array.isArray(input.appendSystemPrompt)
      ? input.appendSystemPrompt
      : [input.appendSystemPrompt],
  });
  await resourceLoader.reload();
  return resourceLoader;
}

export function createPiModelRegistry(authStorage: AuthStorage): ModelRegistry {
  return ModelRegistry.inMemory(authStorage);
}

export async function createPiAgentSession(
  input: PiAgentSessionInput
): Promise<PiAgentSessionResult> {
  const resourceLoader = await createPiResourceLoader(input.resourceLoader);
  const modelRegistry = createPiModelRegistry(input.authStorage);

  return createAgentSession({
    model: input.model,
    thinkingLevel: input.thinkingLevel,
    authStorage: input.authStorage,
    modelRegistry,
    noTools: 'builtin',
    tools: [...input.tools, ...input.customTools].map((tool) => tool.name),
    customTools: [...input.tools, ...input.customTools],
    sessionManager: PiSessionManager.inMemory(),
    settingsManager: PiSettingsManager.inMemory({
      compaction: input.compaction,
      retry: { enabled: true, maxRetries: 2 },
    }),
    resourceLoader,
    cwd: input.cwd,
  });
}

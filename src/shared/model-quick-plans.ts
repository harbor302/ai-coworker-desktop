import type { SharedCustomProtocolType, SharedProviderType } from './api-model-presets';

export type ProviderQuickPlanCategory = 'official' | 'compatible' | 'local';

export interface ProviderQuickPlanTemplate {
  provider: SharedProviderType;
  customProtocol: SharedCustomProtocolType;
  baseUrl: string;
  model: string;
  contextWindow?: number;
  maxTokens?: number;
  enableThinking?: boolean;
}

export interface ProviderQuickPlan extends ProviderQuickPlanTemplate {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  category: ProviderQuickPlanCategory;
}

export const PROVIDER_QUICK_PLANS: ProviderQuickPlan[] = [
  {
    id: 'openrouter',
    title: 'OpenRouter',
    subtitle: 'One key for Claude, GPT, Gemini and more routed models',
    badge: 'Router',
    category: 'official',
    provider: 'openrouter',
    customProtocol: 'anthropic',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4-6',
  },
  {
    id: 'anthropic',
    title: 'Anthropic',
    subtitle: 'Official Claude endpoint for long coding and reasoning tasks',
    badge: 'Official',
    category: 'official',
    provider: 'anthropic',
    customProtocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-6',
  },
  {
    id: 'openai',
    title: 'OpenAI',
    subtitle: 'Official GPT endpoint with coding and planning models',
    badge: 'Official',
    category: 'official',
    provider: 'openai',
    customProtocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.3-codex',
  },
  {
    id: 'deepseek',
    title: 'DeepSeek',
    subtitle: 'OpenAI-compatible endpoint for economical coding models',
    badge: 'OpenAI',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'kimi',
    title: 'Kimi',
    subtitle: 'Anthropic-compatible Moonshot coding endpoint',
    badge: 'Claude',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'anthropic',
    baseUrl: 'https://api.kimi.com/coding',
    model: 'kimi-k2-thinking',
    enableThinking: true,
  },
  {
    id: 'glm',
    title: 'GLM',
    subtitle: 'Anthropic-compatible Zhipu endpoint',
    badge: 'Claude',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'anthropic',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-5',
    enableThinking: true,
  },
  {
    id: 'dashscope',
    title: 'DashScope',
    subtitle: 'DashScope OpenAI-compatible endpoint',
    badge: 'OpenAI',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
  },
  {
    id: 'local-ollama',
    title: 'Ollama',
    subtitle: 'Use a local OpenAI-compatible Ollama server',
    badge: 'Local',
    category: 'local',
    provider: 'ollama',
    customProtocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3.5:0.8b',
  },
  {
    id: 'custom-openai-compatible',
    title: 'OpenAI-compatible',
    subtitle: 'Blank provider template for gateways, relays, or vendor APIs',
    badge: 'Custom',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'openai',
    baseUrl: '',
    model: '',
  },
  {
    id: 'custom-anthropic-compatible',
    title: 'Anthropic-compatible',
    subtitle: 'Blank provider template for Claude-style compatible endpoints',
    badge: 'Custom',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'anthropic',
    baseUrl: '',
    model: '',
  },
  {
    id: 'custom-gemini-compatible',
    title: 'Gemini-compatible',
    subtitle: 'Blank provider template for Gemini-style compatible endpoints',
    badge: 'Custom',
    category: 'compatible',
    provider: 'custom',
    customProtocol: 'gemini',
    baseUrl: '',
    model: '',
  },
];

export type ModelQuickPlanCategory = ProviderQuickPlanCategory;
export type ModelQuickPlanTemplate = ProviderQuickPlanTemplate;
export type ModelQuickPlan = ProviderQuickPlan;
export const MODEL_QUICK_PLANS = PROVIDER_QUICK_PLANS;

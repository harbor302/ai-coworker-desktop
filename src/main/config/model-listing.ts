import type { AppConfig } from './config-store';
import type { ProviderModelInfo } from '../../renderer/types';
import { API_PROVIDER_PRESETS } from '../../shared/api-model-presets';
import { listOllamaModels } from './ollama-api';

const MODEL_LIST_TIMEOUT_MS = 12000;

type ProviderType = AppConfig['provider'];
type CustomProtocolType = NonNullable<AppConfig['customProtocol']>;

interface ListProviderModelsInput {
  provider: ProviderType;
  customProtocol?: CustomProtocolType;
  apiKey?: string;
  baseUrl?: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function appendPath(baseUrl: string, path: string): string {
  const normalizedBase = trimTrailingSlash(baseUrl.trim());
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function defaultBaseUrl(provider: ProviderType): string {
  return API_PROVIDER_PRESETS[provider]?.baseUrl || '';
}

function resolveOpenAIBaseUrl(input: ListProviderModelsInput): string {
  return trimTrailingSlash(input.baseUrl?.trim() || defaultBaseUrl(input.provider));
}

function resolveAnthropicBaseUrl(input: ListProviderModelsInput): string {
  const baseUrl = trimTrailingSlash(input.baseUrl?.trim() || defaultBaseUrl(input.provider));
  if (!baseUrl) {
    return '';
  }
  return /\/v\d+(?:\/)?$/i.test(baseUrl) ? baseUrl : appendPath(baseUrl, '/v1');
}

function resolveGeminiBaseUrl(input: ListProviderModelsInput): string {
  return trimTrailingSlash(input.baseUrl?.trim() || defaultBaseUrl(input.provider));
}

function modelNameFromGeminiName(name: string): string {
  return name.replace(/^models\//, '').trim();
}

async function parseJson(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${label} model list failed: HTTP ${response.status}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} model list returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

function uniqueModels(models: ProviderModelInfo[]): ProviderModelInfo[] {
  const seen = new Set<string>();
  const result: ProviderModelInfo[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({ id, name: model.name.trim() || id });
  }
  return result;
}

function parseOpenAIModels(data: Record<string, unknown>): ProviderModelInfo[] {
  const items = Array.isArray(data.data) ? data.data : [];
  return uniqueModels(
    items
      .map((item) => {
        const raw = item as { id?: unknown; name?: unknown };
        const id = typeof raw.id === 'string' ? raw.id : '';
        const name = typeof raw.name === 'string' ? raw.name : id;
        return { id, name };
      })
      .filter((item) => item.id)
  );
}

function parseAnthropicModels(data: Record<string, unknown>): ProviderModelInfo[] {
  const items = Array.isArray(data.data) ? data.data : [];
  return uniqueModels(
    items
      .map((item) => {
        const raw = item as { id?: unknown; display_name?: unknown; name?: unknown };
        const id = typeof raw.id === 'string' ? raw.id : '';
        const name =
          typeof raw.display_name === 'string'
            ? raw.display_name
            : typeof raw.name === 'string'
              ? raw.name
              : id;
        return { id, name };
      })
      .filter((item) => item.id)
  );
}

function parseGeminiModels(data: Record<string, unknown>): ProviderModelInfo[] {
  const items = Array.isArray(data.models) ? data.models : [];
  return uniqueModels(
    items
      .map((item) => {
        const raw = item as {
          name?: unknown;
          displayName?: unknown;
          supportedGenerationMethods?: unknown;
        };
        const fullName = typeof raw.name === 'string' ? raw.name : '';
        const id = modelNameFromGeminiName(fullName);
        const methods = Array.isArray(raw.supportedGenerationMethods)
          ? raw.supportedGenerationMethods
          : [];
        const canGenerate =
          methods.length === 0 || methods.some((method) => String(method).includes('generate'));
        const name = typeof raw.displayName === 'string' ? raw.displayName : id;
        return canGenerate ? { id, name } : null;
      })
      .filter((item): item is ProviderModelInfo => Boolean(item?.id))
  );
}

async function fetchOpenAICompatibleModels(
  input: ListProviderModelsInput
): Promise<ProviderModelInfo[]> {
  const baseUrl = resolveOpenAIBaseUrl(input);
  if (!baseUrl) {
    throw new Error('Base URL is required to list models');
  }
  const response = await fetch(appendPath(baseUrl, '/models'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.apiKey?.trim() || ''}`,
    },
    signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
  });
  return parseOpenAIModels(await parseJson(response, 'OpenAI-compatible'));
}

async function fetchAnthropicModels(input: ListProviderModelsInput): Promise<ProviderModelInfo[]> {
  const baseUrl = resolveAnthropicBaseUrl(input);
  if (!baseUrl) {
    throw new Error('Base URL is required to list models');
  }
  const apiKey = input.apiKey?.trim() || '';
  const response = await fetch(appendPath(baseUrl, '/models'), {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
  });
  return parseAnthropicModels(await parseJson(response, 'Anthropic-compatible'));
}

async function fetchGeminiModels(input: ListProviderModelsInput): Promise<ProviderModelInfo[]> {
  const baseUrl = resolveGeminiBaseUrl(input);
  if (!baseUrl) {
    throw new Error('Base URL is required to list models');
  }
  const url = new URL(appendPath(baseUrl, '/v1beta/models'));
  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    url.searchParams.set('key', apiKey);
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
  });
  return parseGeminiModels(await parseJson(response, 'Gemini'));
}

export async function listProviderModels(
  input: ListProviderModelsInput
): Promise<ProviderModelInfo[]> {
  if (input.provider === 'ollama') {
    return listOllamaModels(input);
  }

  if (
    input.provider === 'gemini' ||
    (input.provider === 'custom' && input.customProtocol === 'gemini')
  ) {
    return fetchGeminiModels(input);
  }

  if (
    input.provider === 'anthropic' ||
    (input.provider === 'custom' && input.customProtocol === 'anthropic')
  ) {
    return fetchAnthropicModels(input);
  }

  return fetchOpenAICompatibleModels(input);
}

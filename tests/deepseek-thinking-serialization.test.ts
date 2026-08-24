import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const completionsPath = path.resolve(
  'node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js'
);
const mod = await import(pathToFileURL(completionsPath).href);
const { convertMessages } = mod;

describe('DeepSeek thinking block serialization', () => {
  const baseModel = {
    id: 'deepseek-v4-pro',
    name: 'deepseek-v4-pro',
    api: 'openai-completions' as const,
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    reasoning: true,
    input: ['text' as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };

  const baseCompat = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    maxTokensField: 'max_completion_tokens' as const,
    requiresToolResultName: false,
    requiresAssistantAfterToolResult: false,
    requiresThinkingAsText: false,
    requiresReasoningContentOnAssistantMessages: true,
    thinkingFormat: 'deepseek' as const,
    openRouterRouting: {},
    vercelGatewayRouting: {},
    zaiToolStream: false,
    supportsStrictMode: true,
    cacheControlFormat: undefined,
    sendSessionAffinityHeaders: false,
    supportsLongCacheRetention: true,
  };

  const sameModelMeta = {
    provider: 'deepseek',
    api: 'openai-completions',
    model: 'deepseek-v4-pro',
  };

  it('puts thinking blocks in top-level reasoning_content on assistant replay', () => {
    const context = {
      systemPrompt: undefined,
      messages: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] },
        {
          role: 'assistant' as const,
          ...sameModelMeta,
          content: [
            {
              type: 'thinking' as const,
              thinking: 'Let me think about this...',
              thinkingSignature: 'reasoning_content',
            },
            { type: 'text' as const, text: 'Hi there!' },
          ],
        },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Follow up' }] },
      ],
    };

    const result = convertMessages(baseModel, context, baseCompat);
    const assistantMsg = result.find((m: { role: string }) => m.role === 'assistant');

    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('Hi there!');
    expect((assistantMsg as Record<string, unknown>).reasoning_content).toBe(
      'Let me think about this...'
    );
  });

  it('preserves requiresThinkingAsText compatibility as text content blocks', () => {
    const context = {
      systemPrompt: undefined,
      messages: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] },
        {
          role: 'assistant' as const,
          ...sameModelMeta,
          content: [
            {
              type: 'thinking' as const,
              thinking: 'Zai style reasoning',
              thinkingSignature: 'reasoning_content',
            },
            { type: 'text' as const, text: 'Visible answer' },
          ],
        },
      ],
    };

    const result = convertMessages(baseModel, context, {
      ...baseCompat,
      requiresThinkingAsText: true,
    });
    const assistantMsg = result.find((m: { role: string }) => m.role === 'assistant');

    expect(assistantMsg!.content).toEqual([
      { type: 'text', text: 'Zai style reasoning' },
      { type: 'text', text: 'Visible answer' },
    ]);
    expect((assistantMsg as Record<string, unknown>).reasoning_content).toBe('');
  });

  it('handles assistant messages with only thinking blocks', () => {
    const context = {
      systemPrompt: undefined,
      messages: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] },
        {
          role: 'assistant' as const,
          ...sameModelMeta,
          content: [
            {
              type: 'thinking' as const,
              thinking: 'Deep reasoning here...',
              thinkingSignature: 'reasoning_content',
            },
          ],
        },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Follow up' }] },
      ],
    };

    const result = convertMessages(baseModel, context, baseCompat);
    const assistantMsg = result.find((m: { role: string }) => m.role === 'assistant');

    expect(assistantMsg).toBeUndefined();
  });

  it('joins multiple thinking blocks with newlines', () => {
    const context = {
      systemPrompt: undefined,
      messages: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] },
        {
          role: 'assistant' as const,
          ...sameModelMeta,
          content: [
            {
              type: 'thinking' as const,
              thinking: 'First thought',
              thinkingSignature: 'reasoning_content',
            },
            {
              type: 'thinking' as const,
              thinking: 'Second thought',
              thinkingSignature: 'reasoning_content',
            },
            { type: 'text' as const, text: 'Response' },
          ],
        },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Follow up' }] },
      ],
    };

    const result = convertMessages(baseModel, context, baseCompat);
    const assistantMsg = result.find((m: { role: string }) => m.role === 'assistant');

    expect(assistantMsg!.content).toBe('Response');
    expect((assistantMsg as Record<string, unknown>).reasoning_content).toBe(
      'First thought\nSecond thought'
    );
  });
});

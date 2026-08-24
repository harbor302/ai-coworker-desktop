import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const providerPaths = [
  'node_modules/@earendil-works/pi-ai/dist/providers/anthropic.js',
  'node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/anthropic.js',
];

async function expectAnthropicProviderConsumesNodeStream(providerPath: string) {
  const mod = await import(pathToFileURL(path.resolve(providerPath)).href);
  const { streamAnthropic } = mod;
  const sse = [
    'event: message_start\n',
    'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
    'event: content_block_start\n',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\n',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n',
    'event: content_block_stop\n',
    'data: {"type":"content_block_stop","index":0}\n\n',
    'event: message_delta\n',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
    'event: message_stop\n',
    'data: {"type":"message_stop"}\n\n',
  ];
  const nodeBody = Readable.from(sse);
  expect(typeof (nodeBody as unknown as { getReader?: unknown }).getReader).toBe('undefined');

  const client = {
    messages: {
      create: () => ({
        asResponse: async () => ({
          status: 200,
          headers: new Headers(),
          body: nodeBody,
        }),
      }),
    },
  };
  const stream = streamAnthropic(
    {
      id: 'kimi-for-coding',
      name: 'kimi-for-coding',
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.kimi.com/coding',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    },
    {
      systemPrompt: undefined,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
    },
    { client }
  );

  const events: Array<{ type: string; [key: string]: unknown }> = [];
  for await (const event of stream) {
    events.push(event);
  }
  const result = await stream.result();

  expect(events.map((event) => event.type)).toContain('text_delta');
  expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
  expect(result.stopReason).toBe('stop');
}

describe('pi-ai anthropic stream compatibility', () => {
  it.each(providerPaths)(
    'consumes Node.js Readable response bodies in %s',
    async (providerPath) => {
      await expectAnthropicProviderConsumesNodeStream(providerPath);
    }
  );
});

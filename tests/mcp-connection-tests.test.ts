import { afterEach, describe, expect, it, vi } from 'vitest';
import { testMcpConnection } from '../src/main/mcp/mcp-connection-tests';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('testMcpConnection', () => {
  it('returns a generic not implemented result for presets without diagnostics', async () => {
    const result = await testMcpConnection({ presetKey: 'notion', env: {} });

    expect(result).toMatchObject({
      ok: false,
      presetKey: 'notion',
      name: 'notion',
    });
  });

  it('tests Confluence through the generic MCP connection result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const value = String(url);
        if (value.endsWith('/user/current')) {
          return jsonResponse({
            displayName: 'Ada Lovelace',
            emailAddress: 'ada@example.com',
            accountId: 'account-1',
          });
        }
        if (value.endsWith('/space?limit=1')) {
          return jsonResponse({
            size: 1,
            results: [{ key: 'ENG', name: 'Engineering' }],
          });
        }
        return jsonResponse({}, 404);
      })
    );

    const result = await testMcpConnection({
      presetKey: 'confluence',
      env: {
        CONFLUENCE_DOMAIN: 'example.atlassian.net',
        CONFLUENCE_TOKEN: 'token',
        CONFLUENCE_API_PATH: '/wiki/rest/api',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.presetKey).toBe('confluence');
    expect(result.items).toEqual(
      expect.arrayContaining([
        { label: 'User', value: 'Ada Lovelace' },
        { label: 'Email', value: 'ada@example.com' },
        { label: 'Spaces', value: 'Accessible (1 checked) - ENG' },
      ])
    );
  });

  it('suggests the Atlassian Cloud /wiki/rest/api path when /rest/api fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const value = String(url);
        if (value.includes('/wiki/rest/api/user/current')) {
          return jsonResponse({ displayName: 'Cloud User' });
        }
        if (value.includes('/wiki/rest/api/space?limit=1')) {
          return jsonResponse({ size: 0, results: [] });
        }
        if (value.includes('/rest/api/user/current')) {
          return jsonResponse({ message: 'Not found' }, 404);
        }
        return jsonResponse({}, 404);
      })
    );

    const result = await testMcpConnection({
      presetKey: 'confluence',
      env: {
        CONFLUENCE_DOMAIN: 'example.atlassian.net',
        CONFLUENCE_TOKEN: 'token',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.suggestedEnv).toEqual({ CONFLUENCE_API_PATH: '/wiki/rest/api' });
  });
});

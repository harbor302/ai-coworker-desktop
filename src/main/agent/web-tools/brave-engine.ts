import { fetchJson } from './http';
import type { WebResult, WebSearchEngine, WebSearchOptions, WebSearchResponse } from './types';

interface BraveWebResult {
  title?: string;
  url: string;
  description?: string;
  age?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

function getBraveApiKey(): string {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY is required for the Brave web search engine.');
  }
  return apiKey;
}

function normalizeResults(results: BraveWebResult[] | undefined): WebResult[] {
  return (results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    publishedDate: result.age,
    highlights: result.description ? [result.description] : undefined,
  }));
}

export class BraveWebSearchEngine implements WebSearchEngine {
  readonly name = 'brave' as const;

  async search(options: WebSearchOptions, signal?: AbortSignal): Promise<WebSearchResponse> {
    const count = Math.min(Math.max(Math.floor(options.limit ?? 10), 1), 20);
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', options.query);
    url.searchParams.set('count', String(count));

    const response = await fetchJson<BraveSearchResponse>(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': getBraveApiKey(),
      },
      signal,
      timeoutMs: 30000,
    });

    return {
      engine: this.name,
      query: options.query,
      results: normalizeResults(response.web?.results),
    };
  }
}

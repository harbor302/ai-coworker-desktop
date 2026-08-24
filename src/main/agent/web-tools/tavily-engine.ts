import { fetchJson } from './http';
import type { WebResult, WebSearchEngine, WebSearchOptions, WebSearchResponse } from './types';

interface TavilyResult {
  title?: string;
  url: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilySearchResponse {
  results?: TavilyResult[];
}

function getTavilyApiKey(): string {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is required for the Tavily web search engine.');
  }
  return apiKey;
}

function normalizeResults(results: TavilyResult[] | undefined): WebResult[] {
  return (results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    score: result.score,
    publishedDate: result.published_date,
    highlights: result.content ? [result.content] : undefined,
  }));
}

export class TavilyWebSearchEngine implements WebSearchEngine {
  readonly name = 'tavily' as const;

  async search(options: WebSearchOptions, signal?: AbortSignal): Promise<WebSearchResponse> {
    const maxResults = Math.min(Math.max(Math.floor(options.limit ?? 10), 1), 20);
    const response = await fetchJson<TavilySearchResponse>('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getTavilyApiKey()}` },
      body: {
        query: options.query,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_domains: options.includeDomains,
        exclude_domains: options.excludeDomains,
      },
      signal,
      timeoutMs: 30000,
    });

    return {
      engine: this.name,
      query: options.query,
      results: normalizeResults(response.results),
    };
  }
}

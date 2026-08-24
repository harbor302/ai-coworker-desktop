import { fetchJson } from './http';
import { assertPublicHttpUrl } from './url-safety';
import type {
  ExaSearchType,
  WebFetchEngine,
  WebFetchOptions,
  WebFetchResponse,
  WebResult,
  WebSearchEngine,
  WebSearchOptions,
  WebSearchResponse,
} from './types';

interface ExaSearchResult {
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  highlights?: string[];
  summary?: string;
  text?: string;
}

interface ExaSearchApiResponse {
  results?: ExaSearchResult[];
}

interface ExaContentsApiResponse {
  results?: ExaSearchResult[];
}

function getExaApiKey(): string {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('EXA_API_KEY is required for the Exa web engine.');
  }
  return apiKey;
}

function exaHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  };
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.floor(limit ?? 10), 1), 20);
}

function normalizeSearchType(searchType: ExaSearchType | undefined): ExaSearchType {
  return searchType ?? 'auto';
}

function normalizeResults(results: ExaSearchResult[] | undefined): WebResult[] {
  return (results ?? []).map((result) => ({
    title: result.title,
    url: result.url,
    publishedDate: result.publishedDate,
    author: result.author,
    score: result.score,
    highlights: result.highlights,
    summary: result.summary,
    text: result.text,
  }));
}

export class ExaWebSearchEngine implements WebSearchEngine {
  readonly name = 'exa' as const;

  async search(options: WebSearchOptions, signal?: AbortSignal): Promise<WebSearchResponse> {
    const apiKey = getExaApiKey();
    const contents: Record<string, unknown> = { highlights: true };
    if (typeof options.maxAgeHours === 'number') {
      contents.maxAgeHours = options.maxAgeHours;
    }

    const body: Record<string, unknown> = {
      query: options.query,
      type: normalizeSearchType(options.searchType),
      numResults: normalizeLimit(options.limit),
      contents,
    };
    if (options.includeDomains?.length) {
      body.includeDomains = options.includeDomains;
    }
    if (options.excludeDomains?.length) {
      body.excludeDomains = options.excludeDomains;
    }

    const response = await fetchJson<ExaSearchApiResponse>('https://api.exa.ai/search', {
      method: 'POST',
      headers: exaHeaders(apiKey),
      body,
      signal,
      timeoutMs: 45000,
    });

    return {
      engine: this.name,
      query: options.query,
      results: normalizeResults(response.results),
    };
  }
}

export class ExaWebFetchEngine implements WebFetchEngine {
  readonly name = 'exa' as const;

  async fetch(options: WebFetchOptions, signal?: AbortSignal): Promise<WebFetchResponse> {
    const apiKey = getExaApiKey();
    const url = await assertPublicHttpUrl(options.url);
    const maxCharacters = Math.min(
      Math.max(Math.floor(options.maxCharacters ?? 20000), 1000),
      50000
    );
    const body: Record<string, unknown> = {
      urls: [url.toString()],
      text: { maxCharacters },
    };
    if (options.query) {
      body.highlights = true;
      body.summary = { query: options.query };
    }
    if (typeof options.maxAgeHours === 'number') {
      body.maxAgeHours = options.maxAgeHours;
    }

    const response = await fetchJson<ExaContentsApiResponse>('https://api.exa.ai/contents', {
      method: 'POST',
      headers: exaHeaders(apiKey),
      body,
      signal,
      timeoutMs: 45000,
    });
    const result = response.results?.[0];
    if (!result) {
      throw new Error(`No content returned for ${url.toString()}`);
    }

    return {
      engine: this.name,
      url: result.url || url.toString(),
      title: result.title,
      text: result.text,
      highlights: result.highlights,
      summary: result.summary,
    };
  }
}

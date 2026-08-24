import { assertPublicHttpUrl } from './url-safety';
import type { WebFetchEngine, WebFetchOptions, WebFetchResponse } from './types';

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(p|div|section|article|header|footer|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeBasicEntities(match[1].replace(/\s+/g, ' ').trim()) : undefined;
}

export class NativeWebFetchEngine implements WebFetchEngine {
  readonly name = 'native' as const;

  async fetch(options: WebFetchOptions, signal?: AbortSignal): Promise<WebFetchResponse> {
    const url = await assertPublicHttpUrl(options.url);
    const maxCharacters = Math.min(
      Math.max(Math.floor(options.maxCharacters ?? 20000), 1000),
      50000
    );
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        'User-Agent': 'Coworker-WebFetch/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    const title = contentType.includes('html') ? extractTitle(raw) : undefined;
    const text = contentType.includes('html') ? htmlToText(raw) : raw.trim();

    return {
      engine: this.name,
      url: response.url || url.toString(),
      title,
      text: text.slice(0, maxCharacters),
    };
  }
}

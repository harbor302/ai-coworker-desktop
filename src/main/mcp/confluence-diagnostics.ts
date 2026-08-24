import type { McpConnectionTestResult } from '../../shared/ipc-types';

export interface ConfluenceConnectionInput {
  CONFLUENCE_DOMAIN?: string;
  CONFLUENCE_TOKEN?: string;
  CONFLUENCE_AUTH_TYPE?: string;
  CONFLUENCE_EMAIL?: string;
  CONFLUENCE_API_PATH?: string;
}

export interface ConfluenceConnectionResult {
  ok: boolean;
  baseUrl: string;
  apiPath: string;
  authType: string;
  latencyMs: number;
  details?: string;
  suggestedApiPath?: string;
  user?: {
    displayName?: string;
    email?: string;
    accountId?: string;
    username?: string;
    type?: string;
  };
  space?: {
    accessible: boolean;
    count?: number;
    firstKey?: string;
    firstName?: string;
  };
}

interface ConfluenceAttemptSuccess {
  baseUrl: string;
  apiPath: string;
  user: ConfluenceConnectionResult['user'];
  space: ConfluenceConnectionResult['space'];
}

function normalizeOrigin(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  return parsed.origin;
}

function normalizeApiPath(value: string | undefined): string {
  const trimmed = (value || '/rest/api').trim() || '/rest/api';
  return trimmed.startsWith('/') ? trimmed.replace(/\/+$/, '') : `/${trimmed.replace(/\/+$/, '')}`;
}

function joinApiUrl(baseUrl: string, pathPart: string): string {
  return `${baseUrl}${pathPart.startsWith('/') ? pathPart : `/${pathPart}`}`;
}

function buildAuthHeader(input: ConfluenceConnectionInput): string {
  const token = input.CONFLUENCE_TOKEN?.trim();
  const authType = (input.CONFLUENCE_AUTH_TYPE || 'bearer').trim().toLowerCase();
  if (!token) {
    throw new Error('Missing Confluence token');
  }

  if (authType === 'basic') {
    const email = input.CONFLUENCE_EMAIL?.trim();
    if (!email) {
      throw new Error('Missing Confluence email for basic auth');
    }
    return `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`;
  }

  return `Bearer ${token}`;
}

async function readResponseDetails(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  const shortText = text.replace(/\s+/g, ' ').trim().slice(0, 240);
  return shortText ? `HTTP ${response.status}: ${shortText}` : `HTTP ${response.status}`;
}

function mapUser(value: unknown): ConfluenceConnectionResult['user'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    displayName: typeof record.displayName === 'string' ? record.displayName : undefined,
    email: typeof record.emailAddress === 'string' ? record.emailAddress : undefined,
    accountId: typeof record.accountId === 'string' ? record.accountId : undefined,
    username: typeof record.username === 'string' ? record.username : undefined,
    type: typeof record.type === 'string' ? record.type : undefined,
  };
}

function mapSpace(value: unknown): ConfluenceConnectionResult['space'] {
  if (!value || typeof value !== 'object') {
    return { accessible: true };
  }
  const record = value as Record<string, unknown>;
  const results = Array.isArray(record.results) ? record.results : [];
  const first =
    results[0] && typeof results[0] === 'object' ? (results[0] as Record<string, unknown>) : {};
  return {
    accessible: true,
    count: typeof record.size === 'number' ? record.size : results.length,
    firstKey: typeof first.key === 'string' ? first.key : undefined,
    firstName: typeof first.name === 'string' ? first.name : undefined,
  };
}

async function attemptConnection(
  origin: string,
  apiPath: string,
  authorization: string
): Promise<ConfluenceAttemptSuccess> {
  const baseUrl = `${origin}${apiPath}`;
  const headers = {
    Authorization: authorization,
    Accept: 'application/json',
  };

  const userResponse = await fetch(joinApiUrl(baseUrl, '/user/current'), { headers });
  if (!userResponse.ok) {
    throw new Error(await readResponseDetails(userResponse));
  }

  const user = mapUser(await userResponse.json().catch(() => null));

  let space: ConfluenceConnectionResult['space'] = { accessible: false };
  const spaceResponse = await fetch(joinApiUrl(baseUrl, '/space?limit=1'), { headers }).catch(
    () => null
  );
  if (spaceResponse?.ok) {
    space = mapSpace(await spaceResponse.json().catch(() => null));
  }

  return { baseUrl, apiPath, user, space };
}

export async function testConfluenceConnection(
  input: ConfluenceConnectionInput
): Promise<ConfluenceConnectionResult> {
  const startedAt = Date.now();
  const authType = (input.CONFLUENCE_AUTH_TYPE || 'bearer').trim().toLowerCase() || 'bearer';
  let origin = '';
  let apiPath = normalizeApiPath(input.CONFLUENCE_API_PATH);

  try {
    if (!input.CONFLUENCE_DOMAIN?.trim()) {
      throw new Error('Missing Confluence domain');
    }

    origin = normalizeOrigin(input.CONFLUENCE_DOMAIN);
    const authorization = buildAuthHeader(input);

    try {
      const success = await attemptConnection(origin, apiPath, authorization);
      return {
        ok: true,
        authType,
        latencyMs: Date.now() - startedAt,
        ...success,
      };
    } catch (initialError) {
      const shouldTryCloudPath =
        /\.atlassian\.net$/i.test(new URL(origin).hostname) && apiPath !== '/wiki/rest/api';
      if (!shouldTryCloudPath) {
        throw initialError;
      }

      apiPath = '/wiki/rest/api';
      const success = await attemptConnection(origin, apiPath, authorization);
      return {
        ok: true,
        authType,
        latencyMs: Date.now() - startedAt,
        suggestedApiPath: apiPath,
        ...success,
      };
    }
  } catch (error) {
    return {
      ok: false,
      baseUrl: origin ? `${origin}${apiPath}` : '',
      apiPath,
      authType,
      latencyMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testConfluenceMcpConnection(
  env: ConfluenceConnectionInput
): Promise<McpConnectionTestResult> {
  const result = await testConfluenceConnection(env);
  const items: Array<{ label: string; value: string }> = [];

  if (result.ok) {
    items.push({ label: 'Base URL', value: result.baseUrl });
    items.push({ label: 'Auth', value: result.authType });
    if (result.user?.displayName) {
      items.push({ label: 'User', value: result.user.displayName });
    }
    if (result.user?.email) {
      items.push({ label: 'Email', value: result.user.email });
    }
    if (result.user?.accountId) {
      items.push({ label: 'Account', value: result.user.accountId });
    }
    if (result.space?.accessible) {
      const count =
        typeof result.space.count === 'number' ? ` (${result.space.count} checked)` : '';
      const firstSpace = result.space.firstKey ? ` - ${result.space.firstKey}` : '';
      items.push({ label: 'Spaces', value: `Accessible${count}${firstSpace}` });
    }
  }

  return {
    ok: result.ok,
    presetKey: 'confluence',
    name: 'Confluence',
    latencyMs: result.latencyMs,
    summary: result.ok ? 'Confluence connected' : 'Confluence connection failed',
    details: result.details,
    suggestedEnv: result.suggestedApiPath
      ? { CONFLUENCE_API_PATH: result.suggestedApiPath }
      : undefined,
    items,
  };
}

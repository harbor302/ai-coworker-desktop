import { lookup } from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);
const BLOCKED_IPV4_CIDRS: Array<[number, number]> = [
  [ip4ToInt('0.0.0.0'), 8],
  [ip4ToInt('10.0.0.0'), 8],
  [ip4ToInt('127.0.0.0'), 8],
  [ip4ToInt('169.254.0.0'), 16],
  [ip4ToInt('172.16.0.0'), 12],
  [ip4ToInt('192.168.0.0'), 16],
  [ip4ToInt('224.0.0.0'), 4],
  [ip4ToInt('240.0.0.0'), 4],
];

function ip4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function ipv4InCidr(ip: string, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip4ToInt(ip) & mask) === (base & mask);
}

function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return BLOCKED_IPV4_CIDRS.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:')
    );
  }
  return false;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are allowed, got ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error(`Blocked private host: ${url.hostname}`);
  }

  if (isBlockedIp(hostname)) {
    throw new Error(`Blocked private IP address: ${url.hostname}`);
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error(`Blocked URL resolving to private address: ${url.hostname}`);
  }

  return url;
}

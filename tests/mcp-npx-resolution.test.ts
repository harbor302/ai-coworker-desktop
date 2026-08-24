import { describe, expect, it } from 'vitest';

import { findPreferredUnixNpxPath, findPreferredWindowsNpxPath } from '../src/main/mcp/mcp-manager';

describe('findPreferredWindowsNpxPath', () => {
  it('prefers a system npx.cmd later in PATH over the bundled npx.cmd', () => {
    const bundled = 'C:\\coworker\\resources\\node\\npx.cmd';
    const pathEnv = [
      'C:\\coworker\\resources\\node',
      'C:\\Program Files\\nodejs',
      'C:\\Windows\\System32',
    ].join(';');

    const resolved = findPreferredWindowsNpxPath(pathEnv, bundled, (candidate) => {
      return candidate === bundled || candidate === 'C:\\Program Files\\nodejs\\npx.cmd';
    });

    expect(resolved).toBe('C:\\Program Files\\nodejs\\npx.cmd');
  });

  it('falls back to the bundled npx.cmd when no system npx.cmd is present', () => {
    const bundled = 'C:\\coworker\\resources\\node\\npx.cmd';
    const pathEnv = ['C:\\coworker\\resources\\node', 'C:\\Windows\\System32'].join(';');

    const resolved = findPreferredWindowsNpxPath(pathEnv, bundled, (candidate) => {
      return candidate === bundled;
    });

    expect(resolved).toBe(bundled);
  });

  it('ignores quoted PATH entries when resolving system npx.cmd', () => {
    const bundled = 'C:\\coworker\\resources\\node\\npx.cmd';
    const pathEnv = ['"C:\\coworker\\resources\\node"', '"C:\\Program Files\\nodejs"'].join(';');

    const resolved = findPreferredWindowsNpxPath(pathEnv, bundled, (candidate) => {
      return candidate === bundled || candidate === 'C:\\Program Files\\nodejs\\npx.cmd';
    });

    expect(resolved).toBe('C:\\Program Files\\nodejs\\npx.cmd');
  });

  it('ignores untrusted PATH entries and keeps searching for a trusted system npx.cmd', () => {
    const bundled = 'C:\\coworker\\resources\\node\\npx.cmd';
    const pathEnv = ['C:\\Users\\tester\\AppData\\Roaming\\npm', 'C:\\Program Files\\nodejs'].join(
      ';'
    );

    const resolved = findPreferredWindowsNpxPath(
      pathEnv,
      bundled,
      (candidate) => {
        return (
          candidate === bundled ||
          candidate === 'C:\\Users\\tester\\AppData\\Roaming\\npm\\npx.cmd' ||
          candidate === 'C:\\Program Files\\nodejs\\npx.cmd'
        );
      },
      ['C:\\Program Files\\nodejs']
    );

    expect(resolved).toBe('C:\\Program Files\\nodejs\\npx.cmd');
  });

  it('treats trusted PATH entries with a trailing slash as trusted', () => {
    const bundled = 'C:\\coworker\\resources\\node\\npx.cmd';
    const pathEnv = 'C:\\Program Files\\nodejs\\';

    const resolved = findPreferredWindowsNpxPath(
      pathEnv,
      bundled,
      (candidate) => {
        return candidate === bundled || candidate === 'C:\\Program Files\\nodejs\\npx.cmd';
      },
      ['C:\\Program Files\\nodejs']
    );

    expect(resolved).toBe('C:\\Program Files\\nodejs\\npx.cmd');
  });
});

describe('findPreferredUnixNpxPath', () => {
  it('prefers a system npx later in PATH over the bundled npx', () => {
    const bundled = '/app/resources/node/darwin-arm64/bin/npx';
    const pathEnv = ['/app/resources/node/darwin-arm64/bin', '/opt/homebrew/bin', '/usr/bin'].join(
      ':'
    );

    const resolved = findPreferredUnixNpxPath(pathEnv, bundled, (candidate) => {
      return candidate === bundled || candidate === '/opt/homebrew/bin/npx';
    });

    expect(resolved).toBe('/opt/homebrew/bin/npx');
  });

  it('falls back to bundled npx when no system npx is present', () => {
    const bundled = '/app/resources/node/darwin-arm64/bin/npx';
    const pathEnv = ['/app/resources/node/darwin-arm64/bin', '/usr/bin'].join(':');

    const resolved = findPreferredUnixNpxPath(pathEnv, bundled, (candidate) => {
      return candidate === bundled;
    });

    expect(resolved).toBe(bundled);
  });
});

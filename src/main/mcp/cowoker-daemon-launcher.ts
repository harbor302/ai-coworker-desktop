import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app, shell } from 'electron';
import { log, logError, logWarn } from '../utils/logger';
import type { WebBridgeStatus } from '../../renderer/types';

const DEFAULT_DAEMON_PORT = 19826;
const DAEMON_STATUS_URL = `http://127.0.0.1:${DEFAULT_DAEMON_PORT}/status`;

let daemonProcess: ChildProcess | null = null;

function getProjectRoot(): string {
  // In development: __dirname points to dist-electron/main
  // Need to go up two levels to reach the project root.
  return path.join(__dirname, '..', '..');
}

function getDaemonDir(): string {
  if (app.isPackaged) {
    const packedPath = path.join(process.resourcesPath || '', 'cowoker-web-bridge', 'daemon');
    try {
      if (fs.existsSync(packedPath)) {
        return packedPath;
      }
    } catch {
      // fall through
    }
  }
  return path.join(getProjectRoot(), 'cowoker-web-bridge', 'daemon');
}

function getDaemonCommand(): { command: string; args: string[]; cwd: string } {
  const daemonDir = getDaemonDir();
  const distJs = path.join(daemonDir, 'dist', 'daemon.js');
  try {
    if (fs.existsSync(distJs)) {
      return { command: process.execPath, args: [distJs], cwd: daemonDir };
    }
  } catch {
    // fall through
  }

  const tsxBinary = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxPath = path.join(daemonDir, 'node_modules', '.bin', tsxBinary);
  return { command: tsxPath, args: ['src/daemon.ts'], cwd: daemonDir };
}

function getExtensionDistDir(): string {
  return path.join(getDaemonDir(), '..', 'extension', 'dist');
}

export function showCowokerExtensionFolder(): { success: boolean; error?: string } {
  try {
    const extensionDir = getExtensionDistDir();
    shell.showItemInFolder(extensionDir);
    return { success: true };
  } catch (error) {
    logError('[CowokerDaemon] Failed to show extension folder:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to show extension folder',
    };
  }
}

function isProcessAlive(process: ChildProcess | null): process is ChildProcess {
  return process !== null && process.exitCode === null && process.signalCode === null;
}

export function isCowokerDaemonRunning(): boolean {
  return isProcessAlive(daemonProcess);
}

export async function getCowokerDaemonStatus(): Promise<WebBridgeStatus> {
  if (!isProcessAlive(daemonProcess)) {
    return { healthy: false, running: false };
  }

  try {
    const response = await fetch(DAEMON_STATUS_URL, {
      method: 'GET',
      headers: { 'X-Cowoker': '1' },
      signal: AbortSignal.timeout(3000),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return {
        healthy: false,
        running: true,
        error: typeof data.error === 'string' ? data.error : `HTTP ${response.status}`,
        details: data,
      };
    }
    return {
      healthy: true,
      running: true,
      extensionConnected: data.extensionConnected === true,
      extensionVersion: typeof data.extensionVersion === 'string' ? data.extensionVersion : undefined,
      pending: typeof data.pending === 'number' ? data.pending : undefined,
      details: data,
    };
  } catch (error) {
    return {
      healthy: false,
      running: true,
      error: error instanceof Error ? error.message : 'Daemon status request failed',
    };
  }
}

export async function startCowokerDaemon(): Promise<{ success: boolean; error?: string }> {
  if (isProcessAlive(daemonProcess)) {
    log('[CowokerDaemon] Daemon already running');
    return { success: true };
  }

  const { command, args, cwd } = getDaemonCommand();
  if (!command) {
    return { success: false, error: 'Could not resolve daemon executable' };
  }

  log('[CowokerDaemon] Starting daemon:', command, args.join(' '), 'cwd:', cwd);

  try {
    const spawned = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        COWOKER_DAEMON_PORT: String(DEFAULT_DAEMON_PORT),
      },
      stdio: 'pipe',
      windowsHide: true,
    });

    daemonProcess = spawned;

    spawned.stdout?.on('data', (chunk: Buffer) => {
      log('[CowokerDaemon stdout]', chunk.toString().trimEnd());
    });

    spawned.stderr?.on('data', (chunk: Buffer) => {
      logWarn('[CowokerDaemon stderr]', chunk.toString().trimEnd());
    });

    spawned.on('error', (error) => {
      logError('[CowokerDaemon] Process error:', error);
      if (daemonProcess === spawned) {
        daemonProcess = null;
      }
    });

    spawned.on('exit', (code, signal) => {
      log(`[CowokerDaemon] Process exited: code=${code}, signal=${signal}`);
      if (daemonProcess === spawned) {
        daemonProcess = null;
      }
    });

    // Give the daemon a moment to fail immediately (e.g. missing binary)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    if (!isProcessAlive(daemonProcess)) {
      return { success: false, error: 'Daemon process exited immediately after spawn' };
    }

    return { success: true };
  } catch (error) {
    logError('[CowokerDaemon] Failed to spawn daemon:', error);
    daemonProcess = null;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start daemon',
    };
  }
}

export async function stopCowokerDaemon(): Promise<{ success: boolean; error?: string }> {
  const processToStop = daemonProcess;
  if (!isProcessAlive(processToStop)) {
    daemonProcess = null;
    return { success: true };
  }

  log('[CowokerDaemon] Stopping daemon...');

  const gracefulKill = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      logWarn('[CowokerDaemon] Daemon did not exit gracefully, forcing kill');
      try {
        processToStop.kill('SIGKILL');
      } catch (error) {
        logError('[CowokerDaemon] Force kill failed:', error);
      }
      resolve();
    }, 5000);

    processToStop.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      processToStop.kill('SIGTERM');
    } catch (error) {
      logError('[CowokerDaemon] SIGTERM failed:', error);
      clearTimeout(timeout);
      resolve();
    }
  });

  await gracefulKill;

  if (daemonProcess === processToStop) {
    daemonProcess = null;
  }
  return { success: true };
}

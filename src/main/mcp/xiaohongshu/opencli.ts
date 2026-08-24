import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";

export class OpenCliError extends Error {}

export type BrowserMode = "background_session" | "bound_only" | "foreground";
export type StartupCheckMode = "off" | "bridge" | "login";

export type OpenCliSettings = {
  binPath: string;
  daemonUrl: string;
  timeoutSeconds: number;
  window: "background" | "foreground";
  siteSession: "persistent" | "ephemeral";
  keepTab: "true" | "false";
  startupCheck: StartupCheckMode;
};

export const defaultSettings = (): OpenCliSettings => ({
  binPath: process.env.XIAOHONGSHU_OPENCLI_BIN || "opencli",
  daemonUrl: (process.env.XIAOHONGSHU_OPENCLI_DAEMON_URL || "http://127.0.0.1:19825").replace(/\/+$/, ""),
  timeoutSeconds: Number(process.env.XIAOHONGSHU_OPENCLI_TIMEOUT || "60"),
  window: parseWindowMode(process.env.XIAOHONGSHU_OPENCLI_WINDOW),
  siteSession: parseSiteSession(process.env.XIAOHONGSHU_OPENCLI_SITE_SESSION),
  keepTab: parseKeepTab(process.env.XIAOHONGSHU_OPENCLI_KEEP_TAB),
  startupCheck: parseStartupCheck(process.env.XIAOHONGSHU_STARTUP_CHECK),
});

const ALLOWED_COMMANDS: Record<string, Set<string>> = {
  comments: new Set(["limit", "with-replies"]),
  "creator-note-detail": new Set([]),
  "creator-notes": new Set(["limit"]),
  "creator-notes-summary": new Set(["limit", "timeout"]),
  "creator-profile": new Set([]),
  "creator-stats": new Set(["period"]),
  "delete-note": new Set(["execute"]),
  download: new Set(["output"]),
  "draft-clear": new Set(["type", "execute"]),
  "draft-delete": new Set(["type", "execute"]),
  "draft-open": new Set(["type"]),
  drafts: new Set(["type"]),
  feed: new Set(["limit"]),
  login: new Set(["timeout"]),
  note: new Set([]),
  notifications: new Set(["type", "limit"]),
  publish: new Set(["title", "images", "topics", "draft"]),
  search: new Set(["limit"]),
  user: new Set(["limit"]),
  whoami: new Set([]),
};

const POSITIONAL_COUNTS: Record<string, [number, number]> = {
  comments: [1, 1],
  "creator-note-detail": [1, 1],
  "creator-notes": [0, 0],
  "creator-notes-summary": [0, 0],
  "creator-profile": [0, 0],
  "creator-stats": [0, 0],
  "delete-note": [1, 1],
  download: [1, 1],
  "draft-clear": [0, 0],
  "draft-delete": [1, 1],
  "draft-open": [1, 1],
  drafts: [0, 0],
  feed: [0, 0],
  login: [0, 0],
  note: [1, 1],
  notifications: [0, 0],
  publish: [1, 1],
  search: [1, 1],
  user: [1, 1],
  whoami: [0, 0],
};

const INT_OPTIONS = new Set(["limit", "timeout"]);
const BOOL_OPTIONS = new Set(["with-replies", "execute", "draft"]);
const STR_OPTIONS = new Set(["type", "period", "output", "title", "images", "topics"]);

function cleanStderr(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const stripped = line.trim();
      return stripped && !stripped.includes("Update available:") && !stripped.startsWith("Run: npm install");
    })
    .join("\n")
    .trim();
}

function parseJsonStdout(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf("["), text.indexOf("{")].filter((idx) => idx >= 0);
    if (!starts.length) throw new Error("stdout does not contain JSON");
    return JSON.parse(text.slice(Math.min(...starts)));
  }
}

function parseWindowMode(value: string | undefined): "background" | "foreground" {
  const raw = (value || "background").trim().toLowerCase();
  if (raw === "background" || raw === "foreground") return raw;
  throw new Error("Invalid XIAOHONGSHU_OPENCLI_WINDOW: use background or foreground");
}

function parseSiteSession(value: string | undefined): "persistent" | "ephemeral" {
  const raw = (value || "persistent").trim().toLowerCase();
  if (raw === "persistent" || raw === "ephemeral") return raw;
  throw new Error("Invalid XIAOHONGSHU_OPENCLI_SITE_SESSION: use persistent or ephemeral");
}

function parseKeepTab(value: string | undefined): "true" | "false" {
  const raw = (value || "true").trim().toLowerCase();
  if (["true", "1", "yes"].includes(raw)) return "true";
  if (["false", "0", "no"].includes(raw)) return "false";
  throw new Error("Invalid XIAOHONGSHU_OPENCLI_KEEP_TAB: use true or false");
}

function parseStartupCheck(value: string | undefined): StartupCheckMode {
  const raw = (value || "bridge").trim().toLowerCase();
  if (["false", "off", "0", "none", "disabled"].includes(raw)) return "off";
  if (["bridge", "daemon", "true", "1", "yes"].includes(raw)) return "bridge";
  if (["login", "xiaohongshu", "strict"].includes(raw)) return "login";
  throw new Error("Invalid XIAOHONGSHU_STARTUP_CHECK: use login, bridge, or false");
}

function normalizeBrowserMode(mode?: BrowserMode): BrowserMode {
  return mode || "background_session";
}

function windowModeFor(mode: BrowserMode, fallback: "background" | "foreground"): "background" | "foreground" {
  if (mode === "foreground") return "foreground";
  if (mode === "background_session" || mode === "bound_only") return "background";
  return fallback;
}

function isXiaohongshuHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "xiaohongshu.com" || normalized.endsWith(".xiaohongshu.com");
}

function findExecutable(binPath: string): string | null {
  if (binPath.includes(path.sep)) {
    try {
      accessSync(binPath, constants.X_OK);
      return binPath;
    } catch {
      return null;
    }
  }
  const pathEnv = process.env.PATH || "";
  for (const dir of pathEnv.split(path.delimiter)) {
    const full = path.join(dir, binPath);
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      // keep looking
    }
  }
  return null;
}

export class OpenCliXiaohongshu {
  constructor(public readonly settings: OpenCliSettings = defaultSettings()) {}

  async status(options: { checkLogin?: boolean; browserMode?: BrowserMode } = {}): Promise<Record<string, unknown>> {
    const pathFound = findExecutable(this.settings.binPath);
    if (!pathFound) {
      return { ok: false, opencli_found: false, message: "opencli not found in PATH" };
    }
    const version = await this.runRaw(["--version"], { timeout: 15, parseJson: false });
    const daemon = await this.daemonStatus();
    let whoami: Record<string, unknown> | null = null;
    if (options.checkLogin) whoami = await this.run("whoami", [], {}, { check: false, browserMode: options.browserMode });
    const daemonOk = Boolean(daemon.running && daemon.extensionConnected);
    const loginOk = !whoami || Boolean(whoami.ok);
    return {
      ok: Boolean(daemonOk && loginOk),
      stage: !daemonOk ? "browser_bridge" : !loginOk ? "xiaohongshu_login" : "ready",
      opencli_found: true,
      opencli_path: pathFound,
      opencli_version_output: String(version.stdout || "").trim(),
      daemon_status: daemon,
      default_browser_mode: "background_session",
      background_session_available: daemonOk,
      session: "site:xiaohongshu",
      login_checked: Boolean(options.checkLogin),
      whoami,
      message: !daemonOk
        ? "浏览器桥接服务未就绪；请确认 OpenCLI daemon 已启动且 Browser Bridge 插件已连接。"
        : !loginOk
          ? "小红书登录态不可用；请在 Chrome 中打开小红书并完成登录。"
          : options.checkLogin
            ? "已连接，小红书登录态可用。"
            : "已连接，Browser Bridge 可用。",
      note: "Xiaohongshu login is reused from Chrome through OpenCLI Browser Bridge.",
      browser_side_effect: options.checkLogin ? "background_session_login_check" : "none",
    };
  }

  async daemonStatus(): Promise<Record<string, unknown>> {
    try {
      const resp = await fetch(`${this.settings.daemonUrl}/status`, { headers: { "X-OpenCLI": "1" }, signal: AbortSignal.timeout(3000) });
      const payload = (await resp.json()) as Record<string, unknown>;
      return {
        running: resp.ok,
        extensionConnected: Boolean(payload.extensionConnected),
        daemonVersion: payload.daemonVersion,
        extensionVersion: payload.extensionVersion,
        extensionCompatRange: payload.extensionCompatRange,
        contextId: payload.contextId,
        profiles: payload.profiles || [],
        pending: payload.pending,
        daemon_url: this.settings.daemonUrl,
      };
    } catch (error) {
      return {
        running: false,
        extensionConnected: false,
        daemon_url: this.settings.daemonUrl,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async run(
    command: string,
    positionals: string[] = [],
    options: Record<string, unknown> = {},
    runOptions: { check?: boolean; browserMode?: BrowserMode; keepTab?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const normalized = command.trim();
    if (!ALLOWED_COMMANDS[normalized]) throw new Error(`Unsupported xiaohongshu command: ${normalized}`);
    const args = positionals.filter((item) => item != null).map(String);
    const [minArgs, maxArgs] = POSITIONAL_COUNTS[normalized];
    if (args.length < minArgs || args.length > maxArgs) {
      throw new Error(`Command ${normalized} expects ${minArgs}-${maxArgs} positional args, got ${args.length}`);
    }
    const browserMode = normalizeBrowserMode(runOptions.browserMode);
    if (browserMode === "bound_only" && !(await this.hasExistingXiaohongshuPage())) {
      return {
        ok: false,
        browser_mode: browserMode,
        browser_side_effect: "blocked_by_bound_only",
        message: "当前没有可复用的小红书后台会话；本次调用要求只复用已有页面，因此未创建后台会话。",
        suggestion: "改用 browser_mode=background_session，或先手动打开小红书页面后重试。",
      };
    }
    // Commands that read specific note pages can suffer from SPA state reuse
    // when the same background tab is kept open. Allow callers to force a
    // fresh tab (--keep-tab false) for those cases.
    const keepTab = runOptions.keepTab !== undefined
      ? String(runOptions.keepTab)
      : this.settings.keepTab;
    const cliArgs = [
      "xiaohongshu", normalized, ...args, "-f", "json",
      ...this.optionArgs(normalized, options),
      "--window", windowModeFor(browserMode, this.settings.window),
      "--site-session", this.settings.siteSession,
      "--keep-tab", keepTab,
    ];
    return this.runRaw(cliArgs, { timeout: this.settings.timeoutSeconds, parseJson: true, check: runOptions.check ?? true });
  }

  private async hasExistingXiaohongshuPage(): Promise<boolean> {
    try {
      const tabs = await this.daemonCommand("tabs", { op: "list", session: "site:xiaohongshu", workspace: "site:xiaohongshu", surface: "adapter" }, 5);
      const list = Array.isArray(tabs) ? tabs : [];
      return list.some((tab) => {
        try {
          const url = new URL(String((tab as Record<string, unknown>).url || ""));
          return isXiaohongshuHost(url.hostname);
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  private async daemonCommand(action: string, params: Record<string, unknown>, timeoutS: number): Promise<unknown> {
    const resp = await fetch(`${this.settings.daemonUrl}/command`, {
      method: "POST",
      headers: { "X-OpenCLI": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ id: `xiaohongshu_mcp_${Date.now()}_${Math.random().toString(36).slice(2)}`, action, timeout: timeoutS, ...params }),
      signal: AbortSignal.timeout((timeoutS + 5) * 1000),
    });
    const result = (await resp.json()) as Record<string, unknown>;
    if (!result.ok) throw new OpenCliError(String(result.error || "OpenCLI daemon command failed"));
    return result.data;
  }

  private optionArgs(command: string, options: Record<string, unknown>): string[] {
    const allowed = ALLOWED_COMMANDS[command];
    const out: string[] = [];
    for (const [key, value] of Object.entries(options)) {
      if (value == null || value === "") continue;
      if (!allowed.has(key)) throw new Error(`Option ${key} is not allowed for xiaohongshu ${command}`);
      const flag = `--${key.replace(/_/g, "-")}`;
      if (BOOL_OPTIONS.has(key)) {
        if (Boolean(value)) out.push(flag);
      } else if (INT_OPTIONS.has(key)) {
        out.push(flag, String(Number(value)));
      } else if (STR_OPTIONS.has(key)) {
        out.push(flag, String(value));
      } else {
        out.push(flag, String(value));
      }
    }
    return out;
  }

  private runRaw(args: string[], opts: { timeout: number; parseJson: boolean; check?: boolean }): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.settings.binPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new OpenCliError(`opencli command timed out after ${opts.timeout}s: ${args.join(" ")}`));
      }, opts.timeout * 1000);

      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(chunks).toString("utf8");
        const stderr = cleanStderr(Buffer.concat(errChunks).toString("utf8"));
        const result: Record<string, unknown> = { ok: code === 0, returncode: code, command: [this.settings.binPath, ...args], stderr };
        if (opts.parseJson && stdout.trim()) {
          try {
            result.data = parseJsonStdout(stdout);
          } catch (error) {
            result.ok = false;
            result.parse_error = error instanceof Error ? error.message : String(error);
            result.stdout = stdout;
          }
        } else {
          result.stdout = stdout;
        }
        if ((opts.check ?? true) && !result.ok) {
          reject(new OpenCliError(String(stderr || result.parse_error || stdout || "opencli command failed")));
          return;
        }
        resolve(result);
      });
    });
  }
}

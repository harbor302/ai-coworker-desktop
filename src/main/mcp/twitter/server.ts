import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { OpenCliError, OpenCliTwitter } from "./opencli.js";

const client = new OpenCliTwitter();

const browserMode = z
  .enum(["background_session", "bound_only", "foreground"])
  .default("background_session")
  .describe("浏览器会话模式：background_session 默认后台会话；bound_only 只复用已有页面；foreground 仅在用户明确要求打开可见页面时使用");

function asToolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function safeResult(fn: () => Promise<unknown>) {
  return fn().then(asToolResult).catch((error) => {
    if (error instanceof OpenCliError) {
      return asToolResult({ ok: false, error: error.message, stage: "opencli_bridge_error" });
    }
    throw error;
  });
}

const server = new McpServer(
  { name: "twitter-mcp", version: "0.1.0" },
  {
    instructions:
      "Twitter/X MCP backed by OpenCLI Browser Bridge. Reuses the user's Chrome login. Tools do not open browser pages unless browser_mode=foreground or background_session is explicitly used.",
  },
);

server.registerTool(
  "twitter_connection_status",
  {
    description: "检测 Twitter/X MCP 浏览器连接和登录态；默认只检查 daemon，不打开业务 tab。",
    inputSchema: {
      check_login: z.boolean().default(false).describe("是否检查 Twitter/X 登录态；默认 false"),
      browser_mode: browserMode,
    },
  },
  async ({ check_login, browser_mode }) => asToolResult(await client.status({ checkLogin: check_login, browserMode: browser_mode })),
);

server.registerTool("twitter_trending", { description: "获取 Twitter/X trends。", inputSchema: { limit: z.number().int().min(1).max(100).default(20), browser_mode: browserMode } }, async ({ limit, browser_mode }) => safeResult(() => client.run("trending", [], { limit }, { browserMode: browser_mode })));

server.registerTool(
  "twitter_search",
  {
    description: "搜索 Twitter/X 帖子。支持 product/top/live/photos/videos、from、has、exclude 等过滤。",
    inputSchema: {
      query: z.string().describe("搜索关键词；也可包含 X 搜索操作符，例如 lang:en since:2026-01-01"),
      product: z.enum(["top", "live", "photos", "videos"]).optional().describe("搜索 tab：top/live/photos/videos"),
      from: z.string().optional().describe("限定作者 handle，可带 @"),
      has: z.enum(["media", "images", "videos", "links", "replies"]).optional().describe("限定包含的内容类型"),
      exclude: z.enum(["replies", "retweets", "media", "links"]).optional().describe("排除内容类型"),
      limit: z.number().int().min(1).max(100).default(15),
      top_by_engagement: z.number().int().min(0).max(100).default(0).describe("大于 0 时按互动重排并返回前 N 条"),
      browser_mode: browserMode,
    },
  },
  async (args) => safeResult(() => client.run("search", [args.query], { product: args.product, from: args.from, has: args.has, exclude: args.exclude, limit: args.limit, "top-by-engagement": args.top_by_engagement }, { browserMode: args.browser_mode })),
);

server.registerTool("twitter_profile", { description: "获取用户资料；username 不填时取当前登录用户。", inputSchema: { username: z.string().optional().describe("Twitter/X handle，可带 @"), browser_mode: browserMode } }, async ({ username, browser_mode }) => safeResult(() => client.run("profile", username ? [username] : [], {}, { browserMode: browser_mode })));
server.registerTool("twitter_timeline", { description: "获取当前账号时间线。", inputSchema: { type: z.enum(["for-you", "following"]).default("for-you"), limit: z.number().int().min(1).max(100).default(20), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ type, limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("timeline", [], { type, limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));
server.registerTool("twitter_thread", { description: "读取单条 tweet 的 thread/replies。", inputSchema: { tweet_id_or_url: z.string().describe("Tweet numeric ID 或完整 status URL"), limit: z.number().int().min(1).max(200).default(50), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ tweet_id_or_url, limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("thread", [tweet_id_or_url], { limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));
server.registerTool("twitter_article", { description: "读取 tweet 附带的长文 article。", inputSchema: { tweet_id_or_url: z.string().describe("Tweet ID 或包含 article 的 status URL"), browser_mode: browserMode } }, async ({ tweet_id_or_url, browser_mode }) => safeResult(() => client.run("article", [tweet_id_or_url], {}, { browserMode: browser_mode })));
server.registerTool("twitter_user_tweets", { description: "获取指定用户发帖；username 不填时取当前登录用户。", inputSchema: { username: z.string().optional().describe("Twitter/X handle，可带 @"), limit: z.number().int().min(1).max(100).default(20), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ username, limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("tweets", username ? [username] : [], { limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));
server.registerTool("twitter_bookmarks", { description: "获取当前账号书签。", inputSchema: { limit: z.number().int().min(1).max(100).default(20), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("bookmarks", [], { limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));
server.registerTool("twitter_likes", { description: "获取用户 liked tweets；username 不填时取当前登录用户。", inputSchema: { username: z.string().optional(), limit: z.number().int().min(1).max(100).default(20), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ username, limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("likes", username ? [username] : [], { limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));
server.registerTool("twitter_followers", { description: "获取 followers。", inputSchema: { user: z.string().optional().describe("handle，不填则当前登录用户"), limit: z.number().int().min(1).max(200).default(50), browser_mode: browserMode } }, async ({ user, limit, browser_mode }) => safeResult(() => client.run("followers", user ? [user] : [], { limit }, { browserMode: browser_mode })));
server.registerTool("twitter_following", { description: "获取 following。", inputSchema: { user: z.string().optional().describe("handle，不填则当前登录用户"), limit: z.number().int().min(1).max(200).default(50), browser_mode: browserMode } }, async ({ user, limit, browser_mode }) => safeResult(() => client.run("following", user ? [user] : [], { limit }, { browserMode: browser_mode })));
server.registerTool("twitter_notifications", { description: "获取通知。", inputSchema: { limit: z.number().int().min(1).max(100).default(20), browser_mode: browserMode } }, async ({ limit, browser_mode }) => safeResult(() => client.run("notifications", [], { limit }, { browserMode: browser_mode })));
server.registerTool("twitter_lists", { description: "获取当前账号 Lists。", inputSchema: { limit: z.number().int().min(1).max(100).default(50), browser_mode: browserMode } }, async ({ limit, browser_mode }) => safeResult(() => client.run("lists", [], { limit }, { browserMode: browser_mode })));
server.registerTool("twitter_list_tweets", { description: "读取指定 List 时间线。", inputSchema: { list_id: z.string().describe("Twitter/X list numeric ID"), limit: z.number().int().min(1).max(100).default(50), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ list_id, limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("list-tweets", [list_id], { limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));
server.registerTool("twitter_bookmark_folders", { description: "获取书签文件夹。", inputSchema: { browser_mode: browserMode } }, async ({ browser_mode }) => safeResult(() => client.run("bookmark-folders", [], {}, { browserMode: browser_mode })));
server.registerTool("twitter_bookmark_folder", { description: "读取指定书签文件夹。", inputSchema: { folder_id: z.string(), limit: z.number().int().min(1).max(100).default(20), top_by_engagement: z.number().int().min(0).max(100).default(0), browser_mode: browserMode } }, async ({ folder_id, limit, top_by_engagement, browser_mode }) => safeResult(() => client.run("bookmark-folder", [folder_id], { limit, "top-by-engagement": top_by_engagement }, { browserMode: browser_mode })));

server.registerTool(
  "twitter_post_draft",
  {
    description: "准备或发布 tweet；默认只返回草案，confirm_execute=true 时才真实发布。",
    inputSchema: { text: z.string(), images: z.string().optional().describe("本地图片路径，逗号分隔，最多 4 张"), confirm_execute: z.boolean().default(false), browser_mode: browserMode },
  },
  async ({ text, images, confirm_execute, browser_mode }) => {
    if (!confirm_execute) return asToolResult({ ok: true, mode: "draft_only", message: "已生成 tweet 草案；不会发布。确认发布时请设置 confirm_execute=true 且 browser_mode=background_session 或 foreground。", draft: { text, images } });
    return safeResult(() => client.run("post", [text], { images }, { check: false, browserMode: browser_mode }));
  },
);

server.registerTool(
  "twitter_reply_draft",
  {
    description: "准备或发布 reply；默认只返回草案，confirm_execute=true 时才真实回复。",
    inputSchema: { url: z.string(), text: z.string(), image: z.string().optional(), image_url: z.string().optional(), confirm_execute: z.boolean().default(false), browser_mode: browserMode },
  },
  async ({ url, text, image, image_url, confirm_execute, browser_mode }) => {
    if (!confirm_execute) return asToolResult({ ok: true, mode: "draft_only", message: "已生成 reply 草案；不会回复。确认回复时请设置 confirm_execute=true 且 browser_mode=background_session 或 foreground。", draft: { url, text, image, image_url } });
    return safeResult(() => client.run("reply", [url, text], { image, "image-url": image_url }, { check: false, browserMode: browser_mode }));
  },
);

server.registerTool(
  "twitter_action",
  {
    description: "执行安全白名单内的单条 Twitter/X 动作。写操作必须 confirm_execute=true；默认不会执行。",
    inputSchema: {
      action: z.enum(["like", "unlike", "bookmark", "unbookmark", "retweet", "unretweet", "follow", "unfollow", "block", "unblock", "delete", "hide-reply"]),
      target: z.string().describe("tweet URL 或 username，取决于 action"),
      confirm_execute: z.boolean().default(false),
      browser_mode: browserMode,
    },
  },
  async ({ action, target, confirm_execute, browser_mode }) => {
    if (!confirm_execute) return asToolResult({ ok: true, mode: "draft_only", message: "已生成动作草案；不会执行。确认执行时请设置 confirm_execute=true 且 browser_mode=background_session 或 foreground。", draft: { action, target } });
    return safeResult(() => client.run(action, [target], {}, { check: false, browserMode: browser_mode }));
  },
);

server.registerTool(
  "twitter_run",
  {
    description: "高级入口：运行 allowlist 内的 twitter OpenCLI 命令；不会执行任意 shell。",
    inputSchema: { command: z.string(), positionals: z.array(z.string()).optional(), options: z.record(z.string(), z.unknown()).optional(), browser_mode: browserMode },
  },
  async ({ command, positionals, options, browser_mode }) => safeResult(() => client.run(command, positionals || [], options || {}, { browserMode: browser_mode })),
);

async function assertStartupReady() {
  if (client.settings.startupCheck === "off") return;
  const checkLogin = client.settings.startupCheck === "login";
  const status = await client.status({ checkLogin, browserMode: "background_session" });
  if (status.ok) {
    console.error(`[twitter-mcp] startup check ok: ${status.message || "Browser Bridge ready"}`);
    return;
  }

  const reason = {
    ok: false,
    stage: status.stage,
    message: status.message || "Twitter/X MCP startup check failed",
    daemon_status: status.daemon_status,
    browser_side_effect: status.browser_side_effect || "none",
  };
  console.error(`[twitter-mcp] startup check failed: ${JSON.stringify(reason)}`);
  process.exit(1);
}

async function main() {
  await assertStartupReady();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

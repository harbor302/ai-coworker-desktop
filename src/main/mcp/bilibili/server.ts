import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { OpenCliBilibili } from './opencli.js';

const client = new OpenCliBilibili();
const browserMode = z
  .enum(['background_session', 'bound_only', 'foreground'])
  .default('background_session')
  .describe(
    '浏览器会话模式：background_session 默认后台会话；bound_only 只复用已有页面；foreground 仅在用户明确要求打开可见页面时使用'
  );

function asToolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

const server = new McpServer(
  { name: 'bilibili-mcp', version: '0.1.0' },
  {
    instructions:
      "Bilibili MCP backed by OpenCLI Browser Bridge. It reuses the user's Chrome login and exposes allowlisted Bilibili tools with a consistent browser_mode policy.",
  }
);

server.registerTool(
  'bilibili_connection_status',
  {
    description: '检测 Bilibili MCP 浏览器连接和登录态；默认使用后台会话验证，不打开前台页面。',
    inputSchema: {
      check_login: z
        .boolean()
        .default(true)
        .describe('是否检查 Bilibili 登录态；默认 true，使用后台会话验证'),
      browser_mode: browserMode,
    },
  },
  async ({ check_login, browser_mode }) =>
    asToolResult(await client.status({ checkLogin: check_login, browserMode: browser_mode }))
);

server.registerTool(
  'bilibili_hot',
  {
    description: '获取 B 站热门视频。',
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ limit, browser_mode }) =>
    asToolResult(await client.run('hot', [], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_ranking',
  {
    description: '获取 B 站排行榜。',
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ limit, browser_mode }) =>
    asToolResult(await client.run('ranking', [], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_search',
  {
    description: '搜索 Bilibili 视频或用户。',
    inputSchema: {
      query: z.string().describe('搜索关键词'),
      type: z.enum(['video', 'user']).default('video').describe('搜索类型：video 或 user'),
      page: z.number().int().min(1).default(1).describe('页码'),
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ query, type, page, limit, browser_mode }) =>
    asToolResult(
      await client.run('search', [query], { type, page, limit }, { browserMode: browser_mode })
    )
);
server.registerTool(
  'bilibili_video',
  {
    description: '获取视频元信息。',
    inputSchema: {
      bvid_or_url: z.string().describe('BV 号、视频 URL 或 b23.tv 短链'),
      browser_mode: browserMode,
    },
  },
  async ({ bvid_or_url, browser_mode }) =>
    asToolResult(await client.run('video', [bvid_or_url], {}, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_summary',
  {
    description: '获取 B 站视频官方 AI 总结。',
    inputSchema: {
      bvid_or_url: z.string().describe('BV 号、视频 URL 或 b23.tv 短链'),
      browser_mode: browserMode,
    },
  },
  async ({ bvid_or_url, browser_mode }) =>
    asToolResult(await client.run('summary', [bvid_or_url], {}, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_subtitle',
  {
    description: '获取视频字幕。',
    inputSchema: {
      bvid_or_url: z.string().describe('BV 号、视频 URL 或 b23.tv 短链'),
      lang: z
        .string()
        .optional()
        .describe('字幕语言代码，例如 zh-CN、en-US、ai-zh；不填则取默认字幕'),
      browser_mode: browserMode,
    },
  },
  async ({ bvid_or_url, lang, browser_mode }) =>
    asToolResult(
      await client.run('subtitle', [bvid_or_url], { lang }, { browserMode: browser_mode })
    )
);
server.registerTool(
  'bilibili_comments',
  {
    description: '获取视频评论或楼中楼回复。',
    inputSchema: {
      bvid: z.string().describe('BV 号'),
      parent: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('可选，评论 rpid；传入后读取该评论下的楼中楼'),
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ bvid, parent, limit, browser_mode }) =>
    asToolResult(
      await client.run('comments', [bvid], { parent, limit }, { browserMode: browser_mode })
    )
);
server.registerTool(
  'bilibili_me',
  { description: '获取当前登录 Bilibili 账号资料。', inputSchema: { browser_mode: browserMode } },
  async ({ browser_mode }) =>
    asToolResult(await client.run('me', [], {}, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_history',
  {
    description: '获取当前账号观看历史。',
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ limit, browser_mode }) =>
    asToolResult(await client.run('history', [], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_favorite',
  {
    description: '获取当前账号收藏夹内容。',
    inputSchema: {
      fid: z.number().int().min(1).optional().describe('收藏夹 ID；不填默认第一个收藏夹'),
      page: z.number().int().min(1).default(1).describe('页码'),
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ fid, page, limit, browser_mode }) =>
    asToolResult(
      await client.run('favorite', [], { fid, page, limit }, { browserMode: browser_mode })
    )
);
server.registerTool(
  'bilibili_feed',
  {
    description: '获取关注动态或指定用户动态。',
    inputSchema: {
      uid: z.string().optional().describe('用户 UID 或用户名；不填则查询关注时间线'),
      type: z
        .enum(['all', 'video', 'article', 'draw', 'text'])
        .default('all')
        .describe('动态类型过滤'),
      pages: z.number().int().min(1).max(5).default(1).describe('抓取页数'),
      limit: z.number().int().min(1).max(100).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ uid, type, pages, limit, browser_mode }) =>
    asToolResult(
      await client.run(
        'feed',
        uid ? [uid] : [],
        { type, pages, limit },
        { browserMode: browser_mode }
      )
    )
);
server.registerTool(
  'bilibili_dynamic',
  {
    description: '获取用户动态流。',
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(15).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ limit, browser_mode }) =>
    asToolResult(await client.run('dynamic', [], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'bilibili_user_videos',
  {
    description: '查看指定用户投稿视频。',
    inputSchema: {
      uid: z.string().describe('用户 UID 或用户名'),
      order: z
        .enum(['pubdate', 'click', 'stow'])
        .default('pubdate')
        .describe('排序：pubdate 最新、click 播放、stow 收藏'),
      page: z.number().int().min(1).default(1).describe('页码'),
      limit: z.number().int().min(1).max(50).default(20).describe('返回数量'),
      browser_mode: browserMode,
    },
  },
  async ({ uid, order, page, limit, browser_mode }) =>
    asToolResult(
      await client.run('user-videos', [uid], { order, page, limit }, { browserMode: browser_mode })
    )
);
server.registerTool(
  'bilibili_following',
  {
    description: '获取用户关注列表。',
    inputSchema: {
      uid: z.string().optional().describe('目标用户 UID；不填默认当前登录用户'),
      page: z.number().int().min(1).default(1).describe('页码'),
      limit: z.number().int().min(1).max(50).default(50).describe('每页数量'),
      browser_mode: browserMode,
    },
  },
  async ({ uid, page, limit, browser_mode }) =>
    asToolResult(
      await client.run(
        'following',
        uid ? [uid] : [],
        { page, limit },
        { browserMode: browser_mode }
      )
    )
);
server.registerTool(
  'bilibili_comment_draft',
  {
    description: '准备或发布评论；默认不发布，confirm_execute=true 时才真实评论。',
    inputSchema: {
      bvid_or_url: z.string().describe('BV 号、视频 URL 或 b23.tv 短链'),
      message: z.string().describe('评论内容；支持 @用户名，由 OpenCLI 解析真实提及'),
      parent: z.number().int().min(1).optional().describe('可选，回复的顶层评论 rpid'),
      confirm_execute: z
        .boolean()
        .default(false)
        .describe('是否真实发布评论；默认 false 只做安全预览'),
      browser_mode: browserMode,
    },
  },
  async ({ bvid_or_url, message, parent, confirm_execute, browser_mode }) =>
    asToolResult(
      await client.run(
        'comment',
        [bvid_or_url, message],
        { parent, execute: confirm_execute },
        { check: false, browserMode: browser_mode }
      )
    )
);
server.registerTool(
  'bilibili_run',
  {
    description: '高级入口：运行 allowlist 内的 bilibili OpenCLI 命令；不会执行任意 shell。',
    inputSchema: {
      command: z
        .string()
        .describe(
          'OpenCLI bilibili 白名单命令，例如 hot/search/video/summary/subtitle/comments/feed'
        ),
      positionals: z
        .array(z.string())
        .optional()
        .describe('位置参数列表，例如 search 的 [query]、video 的 [BV号]'),
      options: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('命令选项，只允许该命令白名单内的参数'),
      browser_mode: browserMode,
    },
  },
  async ({ command, positionals, options, browser_mode }) =>
    asToolResult(
      await client.run(command, positionals || [], options || {}, { browserMode: browser_mode })
    )
);

async function assertStartupReady() {
  if (client.settings.startupCheck === 'off') return;
  const checkLogin = client.settings.startupCheck === 'login';
  const status = await client.status({ checkLogin, browserMode: 'background_session' });
  if (status.ok) {
    console.error(`[bilibili-mcp] startup check ok: ${status.message || 'Browser Bridge ready'}`);
    return;
  }

  const reason = {
    ok: false,
    stage: status.stage,
    message: status.message || 'Bilibili MCP startup check failed',
    daemon_status: status.daemon_status,
    browser_side_effect: status.browser_side_effect || 'none',
  };
  console.error(`[bilibili-mcp] startup check failed: ${JSON.stringify(reason)}`);
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

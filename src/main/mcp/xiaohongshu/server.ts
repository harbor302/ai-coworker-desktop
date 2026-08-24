import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { OpenCliError, OpenCliXiaohongshu } from './opencli.js';

const client = new OpenCliXiaohongshu();

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

function safeResult(fn: () => Promise<unknown>) {
  return fn()
    .then(asToolResult)
    .catch((error) => {
      if (error instanceof OpenCliError) {
        return asToolResult({ ok: false, error: error.message, stage: 'opencli_bridge_error' });
      }
      throw error;
    });
}

const server = new McpServer(
  { name: 'xiaohongshu-mcp', version: '0.1.0' },
  {
    instructions:
      "Xiaohongshu (小红书) MCP backed by OpenCLI Browser Bridge. Reuses the user's Chrome login. Read tools work by default; write tools require confirm_execute=true. IMPORTANT: when you need to read multiple notes, read them ONE AT A TIME — finish reading one note before calling the next note tool. Parallel or batched note reads will cause cache pollution and return the same content for different note IDs.",
  }
);

server.registerTool(
  'xiaohongshu_connection_status',
  {
    description: '检测小红书 MCP 浏览器连接和登录态；默认只检查 daemon，不打开业务 tab。',
    inputSchema: {
      check_login: z.boolean().default(false).describe('是否检查小红书登录态；默认 false'),
      browser_mode: browserMode,
    },
  },
  async ({ check_login, browser_mode }) =>
    asToolResult(await client.status({ checkLogin: check_login, browserMode: browser_mode }))
);

server.registerTool(
  'xiaohongshu_whoami',
  { description: '获取当前登录小红书账号信息。', inputSchema: { browser_mode: browserMode } },
  async ({ browser_mode }) =>
    safeResult(() => client.run('whoami', [], {}, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_feed',
  {
    description: '获取小红书首页推荐 Feed。',
    inputSchema: { limit: z.number().int().min(1).max(50).default(20), browser_mode: browserMode },
  },
  async ({ limit, browser_mode }) =>
    safeResult(() => client.run('feed', [], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_search',
  {
    description: '搜索小红书笔记。',
    inputSchema: {
      query: z.string().describe('搜索关键词'),
      limit: z.number().int().min(1).max(50).default(20),
      browser_mode: browserMode,
    },
  },
  async ({ query, limit, browser_mode }) =>
    safeResult(() => client.run('search', [query], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_note',
  {
    description: '获取单篇笔记正文和互动数据。',
    inputSchema: {
      note_id: z.string().describe('笔记 ID 或完整 URL（需含 xsec_token）'),
      browser_mode: browserMode,
    },
  },
  async ({ note_id, browser_mode }) =>
    safeResult(() =>
      client.run('note', [note_id], {}, { browserMode: browser_mode, keepTab: false })
    )
);
server.registerTool(
  'xiaohongshu_comments',
  {
    description: '获取笔记评论（支持楼中楼）。',
    inputSchema: {
      note_id: z.string().describe('笔记 ID 或完整 URL'),
      limit: z.number().int().min(1).max(50).default(20),
      with_replies: z.boolean().default(false).describe('是否包含子回复'),
      browser_mode: browserMode,
    },
  },
  async ({ note_id, limit, with_replies, browser_mode }) =>
    safeResult(() =>
      client.run(
        'comments',
        [note_id],
        { limit, 'with-replies': with_replies },
        { browserMode: browser_mode, keepTab: false }
      )
    )
);
server.registerTool(
  'xiaohongshu_user_notes',
  {
    description: '获取指定用户的公开笔记。',
    inputSchema: {
      user_id: z.string().describe('用户 ID 或主页 URL'),
      limit: z.number().int().min(1).max(50).default(15),
      browser_mode: browserMode,
    },
  },
  async ({ user_id, limit, browser_mode }) =>
    safeResult(() => client.run('user', [user_id], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_notifications',
  {
    description: '获取小红书通知。',
    inputSchema: {
      type: z.enum(['mentions', 'likes', 'connections']).default('mentions'),
      limit: z.number().int().min(1).max(50).default(20),
      browser_mode: browserMode,
    },
  },
  async ({ type, limit, browser_mode }) =>
    safeResult(() =>
      client.run('notifications', [], { type, limit }, { browserMode: browser_mode })
    )
);

server.registerTool(
  'xiaohongshu_creator_profile',
  {
    description: '获取创作者账号信息（粉丝/关注/获赞/成长等级）。',
    inputSchema: { browser_mode: browserMode },
  },
  async ({ browser_mode }) =>
    safeResult(() => client.run('creator-profile', [], {}, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_creator_notes',
  {
    description: '获取创作者笔记列表及数据。',
    inputSchema: { limit: z.number().int().min(1).max(50).default(20), browser_mode: browserMode },
  },
  async ({ limit, browser_mode }) =>
    safeResult(() => client.run('creator-notes', [], { limit }, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_creator_note_detail',
  {
    description: '获取单篇创作者笔记详情（含观看来源、观众画像、趋势）。',
    inputSchema: { note_id: z.string().describe('笔记 ID'), browser_mode: browserMode },
  },
  async ({ note_id, browser_mode }) =>
    safeResult(() =>
      client.run(
        'creator-note-detail',
        [note_id],
        {},
        { browserMode: browser_mode, keepTab: false }
      )
    )
);
server.registerTool(
  'xiaohongshu_creator_notes_summary',
  {
    description: '批量摘要最近笔记数据。',
    inputSchema: { limit: z.number().int().min(1).max(20).default(3), browser_mode: browserMode },
  },
  async ({ limit, browser_mode }) =>
    safeResult(() =>
      client.run('creator-notes-summary', [], { limit }, { browserMode: browser_mode })
    )
);
server.registerTool(
  'xiaohongshu_creator_stats',
  {
    description: '获取创作者数据总览（观看/点赞/收藏/评论/分享/涨粉趋势）。',
    inputSchema: {
      period: z.enum(['seven', 'thirty']).default('seven'),
      browser_mode: browserMode,
    },
  },
  async ({ period, browser_mode }) =>
    safeResult(() => client.run('creator-stats', [], { period }, { browserMode: browser_mode }))
);

server.registerTool(
  'xiaohongshu_download',
  {
    description: '下载笔记中的图片和视频。',
    inputSchema: {
      note_id: z.string().describe('笔记 ID 或 URL'),
      output: z.string().optional().describe('下载目录，默认 ./xiaohongshu-downloads'),
      browser_mode: browserMode,
    },
  },
  async ({ note_id, output, browser_mode }) =>
    safeResult(() => client.run('download', [note_id], { output }, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_drafts',
  {
    description: '获取本地草稿箱列表。',
    inputSchema: { type: z.enum(['image', 'video']).default('image'), browser_mode: browserMode },
  },
  async ({ type, browser_mode }) =>
    safeResult(() => client.run('drafts', [], { type }, { browserMode: browser_mode }))
);
server.registerTool(
  'xiaohongshu_draft_open',
  {
    description: '读取单条本地草稿详情。',
    inputSchema: {
      id: z.string().describe('草稿 ID'),
      type: z.enum(['image', 'video']).default('image'),
      browser_mode: browserMode,
    },
  },
  async ({ id, type, browser_mode }) =>
    safeResult(() => client.run('draft-open', [id], { type }, { browserMode: browser_mode }))
);

server.registerTool(
  'xiaohongshu_publish',
  {
    description:
      '发布或存草稿小红书笔记；默认只返回预览，confirm_execute=true 时真实发布，save_draft=true 时存草稿。',
    inputSchema: {
      content: z.string().describe('笔记正文'),
      title: z.string().optional().describe('标题'),
      images: z.string().optional().describe('本地图片路径，逗号分隔'),
      topics: z.string().optional().describe('话题标签，逗号分隔'),
      save_draft: z.boolean().default(false).describe('是否只保存草稿不发布'),
      confirm_execute: z.boolean().default(false).describe('是否真实发布；默认 false 只预览'),
      browser_mode: browserMode,
    },
  },
  async ({ content, title, images, topics, save_draft, confirm_execute, browser_mode }) => {
    if (!confirm_execute && !save_draft) {
      return asToolResult({
        ok: true,
        mode: 'draft_only',
        message:
          '已生成笔记预览；不会发布。确认发布请设置 confirm_execute=true，或设置 save_draft=true 保存草稿。',
        draft: { content, title, images, topics },
      });
    }
    return safeResult(() =>
      client.run(
        'publish',
        [content],
        { title, images, topics, draft: save_draft },
        { check: false, browserMode: browser_mode }
      )
    );
  }
);

server.registerTool(
  'xiaohongshu_delete_note',
  {
    description: '删除已发布笔记；默认不执行，confirm_execute=true 时删除。',
    inputSchema: {
      note_id: z.string().describe('笔记 ID'),
      confirm_execute: z.boolean().default(false),
      browser_mode: browserMode,
    },
  },
  async ({ note_id, confirm_execute, browser_mode }) => {
    if (!confirm_execute)
      return asToolResult({
        ok: true,
        mode: 'draft_only',
        message: '已生成删除预览；不会执行。确认删除请设置 confirm_execute=true。',
        draft: { note_id },
      });
    return safeResult(() =>
      client.run(
        'delete-note',
        [note_id],
        { execute: true },
        { check: false, browserMode: browser_mode }
      )
    );
  }
);

server.registerTool(
  'xiaohongshu_draft_delete',
  {
    description: '删除本地草稿；默认不执行，confirm_execute=true 时删除。',
    inputSchema: {
      id: z.string().describe('草稿 ID'),
      type: z.enum(['image', 'video']).default('image'),
      confirm_execute: z.boolean().default(false),
      browser_mode: browserMode,
    },
  },
  async ({ id, type, confirm_execute, browser_mode }) => {
    if (!confirm_execute)
      return asToolResult({
        ok: true,
        mode: 'draft_only',
        message: '已生成删除预览；不会执行。确认删除请设置 confirm_execute=true。',
        draft: { id, type },
      });
    return safeResult(() =>
      client.run(
        'draft-delete',
        [id],
        { type, execute: true },
        { check: false, browserMode: browser_mode }
      )
    );
  }
);

server.registerTool(
  'xiaohongshu_draft_clear',
  {
    description: '清空本地草稿箱；默认不执行，confirm_execute=true 时清空。',
    inputSchema: {
      type: z.enum(['image', 'video']).default('image'),
      confirm_execute: z.boolean().default(false),
      browser_mode: browserMode,
    },
  },
  async ({ type, confirm_execute, browser_mode }) => {
    if (!confirm_execute)
      return asToolResult({
        ok: true,
        mode: 'draft_only',
        message: '已生成清空预览；不会执行。确认清空请设置 confirm_execute=true。',
        draft: { type },
      });
    return safeResult(() =>
      client.run(
        'draft-clear',
        [],
        { type, execute: true },
        { check: false, browserMode: browser_mode }
      )
    );
  }
);

server.registerTool(
  'xiaohongshu_run',
  {
    description: '高级入口：运行 allowlist 内的小红书 OpenCLI 命令；不会执行任意 shell。',
    inputSchema: {
      command: z.string(),
      positionals: z.array(z.string()).optional(),
      options: z.record(z.string(), z.unknown()).optional(),
      browser_mode: browserMode,
    },
  },
  async ({ command, positionals, options, browser_mode }) =>
    safeResult(() =>
      client.run(command, positionals || [], options || {}, { browserMode: browser_mode })
    )
);

async function assertStartupReady() {
  if (client.settings.startupCheck === 'off') return;
  const checkLogin = client.settings.startupCheck === 'login';
  const status = await client.status({ checkLogin, browserMode: 'background_session' });
  if (status.ok) {
    console.error(
      `[xiaohongshu-mcp] startup check ok: ${status.message || 'Browser Bridge ready'}`
    );
    return;
  }

  const reason = {
    ok: false,
    stage: status.stage,
    message: status.message || 'Xiaohongshu MCP startup check failed',
    daemon_status: status.daemon_status,
    browser_side_effect: status.browser_side_effect || 'none',
  };
  console.error(`[xiaohongshu-mcp] startup check failed: ${JSON.stringify(reason)}`);
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

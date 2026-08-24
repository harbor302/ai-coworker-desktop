---
name: xiaohongshu
description: Use the Xiaohongshu MCP connector for Xiaohongshu / 小红书 account-aware content discovery, notes, comments, creator analytics, downloads, local drafts, and guarded publish/delete actions through OpenCLI Browser Bridge.
---

# Xiaohongshu MCP Usage

Use this skill when the Xiaohongshu MCP connector is enabled and the user asks about Xiaohongshu / 小红书 / XHS notes, search, feed, creators, comments, downloads, notifications, drafts, publishing, or creator analytics.

Prefer MCP tools over shell commands when the Xiaohongshu connector is enabled.

## First step

Before using domain tools for a Xiaohongshu task, call `xiaohongshu_connection_status` once in the session if you have not already verified the connector.

Use the status result to check:

- OpenCLI is installed and callable.
- Browser Bridge is available.
- Chrome has a usable Xiaohongshu login/session when the requested task needs account data.

If status fails, explain the missing prerequisite briefly and ask the user to open Chrome, enable OpenCLI Browser Bridge, and log in to Xiaohongshu. Do not guess private account data.

## Tool selection

- Connection or login check: use `xiaohongshu_connection_status`; use `check_login=true` when account state matters.
- Current account: use `xiaohongshu_whoami` only when the user asks for current login/account info.
- Feed or discovery: use `xiaohongshu_feed` for recommendations and `xiaohongshu_search` for keyword searches.
- Single note: use `xiaohongshu_note`; use `xiaohongshu_comments` only when comments are needed.
- User profile content: use `xiaohongshu_user_notes` after resolving the user id or profile URL.
- Notifications: use `xiaohongshu_notifications` only when the user asks for private account notifications.
- Creator analytics: use `xiaohongshu_creator_profile`, `xiaohongshu_creator_notes`, `xiaohongshu_creator_note_detail`, `xiaohongshu_creator_notes_summary`, or `xiaohongshu_creator_stats`.
- Downloads: use `xiaohongshu_download` with an explicit note id or URL.
- Drafts: use `xiaohongshu_drafts` and `xiaohongshu_draft_open` for read-only draft inspection.
- Advanced fallback: use `xiaohongshu_run` only when a dedicated tool does not cover the request, and keep commands within the allowlist.

## Safety rules

- Never ask for or expose cookies, tokens, authorization headers, or raw browser session data.
- Treat account profile, notifications, drafts, creator analytics, and unpublished content as private user data. Summarize only what is relevant.
- For publishing, use `xiaohongshu_publish` with `confirm_execute=false` by default. Only set `confirm_execute=true` when the user explicitly asks to publish the exact content.
- For deletion or clearing drafts, use `confirm_execute=false` by default. Only set `confirm_execute=true` after the user explicitly confirms the exact destructive action.
- Prefer typed tools over generic browser automation or guessed URLs.

## Result style

When returning note lists, include compact useful fields:

- Title or summary
- Author when available
- Note ID or URL when available
- Likes/comments/collects/date when available
- One short reason why it matches the request

For creator analytics, distinguish between raw MCP data and your own synthesis. Explain if results are partial because only visible/readable page content was available.

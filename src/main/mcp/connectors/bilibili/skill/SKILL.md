---
name: bilibili
description: Use the Bilibili MCP connector for Bilibili content discovery and account-aware read actions through OpenCLI Browser Bridge: status checks, hot/ranking/search, video metadata, AI summaries, subtitles, comments, history, favorites, feeds, user videos, following, and safe comment drafts.
---

# Bilibili MCP Usage

Use this skill when the Bilibili MCP connector is enabled and the user asks about Bilibili / B 站 / 哔哩哔哩 videos, creators, hot content, rankings, search, summaries, subtitles, comments, history, favorites, feeds, following, or drafting a comment.

Prefer MCP tools over shell commands when the Bilibili connector is enabled.

## First Step

Before using domain tools for a Bilibili task, call `mcp__Bilibili__bilibili_status` once in the session if you have not already verified the connector.

Use the status result to check:

- OpenCLI is installed and callable.
- Browser Bridge is available.
- Chrome has a usable Bilibili login/session when the requested task needs account data.

If status fails, explain the missing prerequisite briefly and ask the user to open Chrome, enable OpenCLI Browser Bridge, and log in to Bilibili. Do not guess private account data.

## Tool Selection

- Trending or broad discovery: use `bilibili_hot` or `bilibili_ranking`.
- Keyword discovery: use `bilibili_search` with `type="video"` unless the user clearly asks for users/UP 主, then use `type="user"`.
- Single video: use `bilibili_video` first for metadata; then use `bilibili_summary`, `bilibili_subtitle`, or `bilibili_comments` only when needed.
- Current account: use `bilibili_me`, `bilibili_history`, `bilibili_favorite`, `bilibili_feed`, `bilibili_dynamic`, or `bilibili_following` only when the user asks for personal/account-aware data.
- Creator analysis: use `bilibili_user_videos` after resolving the UID/user from search or user input.
- Advanced fallback: use `bilibili_run` only when a dedicated tool does not cover the request, and keep commands within the allowlist.

## Safety Rules

- Never claim access to cookies, tokens, or authorization headers. The connector should not expose them.
- Treat history, favorites, feed, following, and account profile as private user data. Summarize only what is relevant to the task.
- For comments, use `bilibili_comment_draft` with `confirm_execute=false` by default. Only set `confirm_execute=true` when the user explicitly asks to publish the exact comment.
- Avoid write-like actions unless the user clearly requests them.

## Result Style

When returning video lists, include compact useful fields:

- Title
- UP 主 / author when available
- BV ID or URL when available
- Duration / views / date when available
- One short reason why it matches the request

For video summaries, distinguish between official AI summary, subtitles, comments, and your own synthesis.

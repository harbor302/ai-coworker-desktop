---
name: confluence
description: Use when Confluence MCP is connected and the user asks about Confluence, work summaries, project history, meeting notes, team documentation, spaces, pages, or content creation/update workflows.
---

# Confluence Connector Skill

Use this skill when the user asks to search, read, summarize, organize, create, or update Confluence content through the connected Confluence MCP.

This skill also applies when the user asks work-context questions that likely require Confluence, even if they do not say "Confluence" explicitly. Examples: "总结我上周的工作", "找一下最近项目进展", "整理我的会议记录", or "基于团队文档写一份说明".

## MCP tool quick reference

The app exposes Confluence tools with model-facing names such as `mcp__Confluence__search_pages`; the exact prefix may vary with the MCP server name. The original Confluence MCP tool names are:

| Task              | Tool                | Key inputs                                               |
| ----------------- | ------------------- | -------------------------------------------------------- |
| List spaces       | `list_spaces`       | none                                                     |
| Current user      | `whoami`            | none                                                     |
| Search pages      | `search_pages`      | `query`, optional `useCql`, `limit`                      |
| Find exact title  | `find_page`         | `title`, optional `spaceKey`                             |
| Read page         | `read_page`         | `pageId`, optional `format` (`markdown`, `html`, `text`) |
| Page metadata     | `page_info`         | `pageId`                                                 |
| Child pages       | `page_children`     | `pageId`, optional `limit`                               |
| Contributors      | `page_contributors` | `pageId`, optional `limit`                               |
| Attachments       | `list_attachments`  | `pageId`                                                 |
| Create child page | `create_child_page` | `parentId`, `title`, `content`, optional `format`        |
| Replace page body | `update_page`       | `pageId`, `content`, optional `format`                   |

Prefer MCP tools over shell commands when the Confluence connector is enabled.

## Search and CQL rules

Use `search_pages` in two modes:

1. Broad discovery: `useCql: false` or omitted. Put natural-language keywords in `query`.
2. Precise filtering: `useCql: true`. Put a raw CQL expression in `query`; do not include CLI flags such as `--cql`.

For CQL searches, include `type=page` by default so results do not mix in blog posts, attachments, or comments.

## Current-user scoping is mandatory for "my" work

When the user asks for their own work, their own documents, their recent activity, "我/我的", "my", "上周我做了什么", "总结我上周的工作", or any first-person work summary:

1. Call `whoami` first unless the current user identity is already available from fresh profile context.
2. Prefer CQL user functions when supported:
   - `contributor = currentUser()` for pages the current user created or edited.
   - `creator = currentUser()` for pages the current user created.
   - `mention = currentUser()` for pages that explicitly mention the current user.
3. If `currentUser()` is not supported by the connected Confluence instance, use identifiers returned by `whoami`. Prefer account ID / user key / username over display name. Use email only if the MCP/server search accepts it.
4. Do not start with only `text ~ "keyword"` for first-person requests. That usually returns other people's pages. First search pages scoped to the current user, then optionally broaden.
5. After searching, call `page_info` and/or `page_contributors` on likely pages to verify creator/contributor/last modifier before summarizing them as the user's work.
6. If scoped results are too sparse, explicitly say you are broadening the search and keep the broader results separate from verified "my work" results.

For "my work" searches, use this order:

1. Edited or contributed by me in the time window.
2. Created by me in the time window.
3. Mentioning me in the time window, if the user asks for "related to me" rather than only "written by me".
4. Profile-informed recurring pages or likely spaces, still with `contributor = currentUser()`, `creator = currentUser()`, or `mention = currentUser()`.
5. Broader text/title search only as a fallback, followed by metadata/contributor verification.

Important: `contributor` in Confluence CQL covers content created or edited by a user. Use it as the primary filter for work summaries. Use `creator` when the user specifically asks for pages they authored/created.

Common `search_pages` examples:

```json
{
  "query": "architecture decisions",
  "limit": 10
}
```

```json
{
  "query": "type=page AND text ~ \"architecture decisions\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 20
}
```

```json
{
  "query": "type=page AND space = \"ABC\" AND title ~ \"weekly\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 20
}
```

```json
{
  "query": "type=page AND contributor = \"<account>\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 50
}
```

```json
{
  "query": "type=page AND creator = \"<account>\" ORDER BY created DESC",
  "useCql": true,
  "limit": 20
}
```

```json
{
  "query": "type=page AND contributor = currentUser() AND lastmodified >= \"YYYY-MM-DD\" AND lastmodified < \"YYYY-MM-DD\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 50
}
```

```json
{
  "query": "type=page AND creator = currentUser() AND created >= \"YYYY-MM-DD\" AND created < \"YYYY-MM-DD\" ORDER BY created DESC",
  "useCql": true,
  "limit": 50
}
```

```json
{
  "query": "type=page AND contributor = currentUser() AND text ~ \"周报\" AND lastmodified >= \"YYYY-MM-DD\" AND lastmodified < \"YYYY-MM-DD\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 20
}
```

```json
{
  "query": "type=page AND mention = currentUser() AND lastmodified >= \"YYYY-MM-DD\" AND lastmodified < \"YYYY-MM-DD\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 20
}
```

```json
{
  "query": "type=page AND ancestor = <parentPageId> AND title ~ \"design\" ORDER BY lastmodified DESC",
  "useCql": true,
  "limit": 20
}
```

Useful CQL fields and patterns:

- Text search: `text ~ "keyword"` or `text ~ "multi word phrase"`.
- Title search: `title ~ "weekly"`; for exact titles, prefer `find_page`.
- Space filter: `space = "SPACEKEY"`.
- Parent/subtree filter: `ancestor = <pageId>`.
- Author filters: `creator = "<account>"`, `contributor = "<account>"`.
- Current-user filters: `creator = currentUser()`, `contributor = currentUser()`, `mention = currentUser()`.
- Time filters: `created >= "YYYY-MM-DD"`, `lastmodified >= "YYYY-MM-DD"`.
- Sort newest first: `ORDER BY lastmodified DESC` or `ORDER BY created DESC`.

For time-based requests such as "总结我上周的工作":

1. Resolve concrete start/end dates first.
2. Call `whoami` and keep the current user's identifiers in mind.
3. Start with contributor-based CQL:
   `type=page AND contributor = currentUser() AND lastmodified >= "YYYY-MM-DD" AND lastmodified < "YYYY-MM-DD" ORDER BY lastmodified DESC`
4. Also search pages created by the current user:
   `type=page AND creator = currentUser() AND created >= "YYYY-MM-DD" AND created < "YYYY-MM-DD" ORDER BY created DESC`
5. If the user asks for pages related to them, not only pages they edited, search mentions separately:
   `type=page AND mention = currentUser() AND lastmodified >= "YYYY-MM-DD" AND lastmodified < "YYYY-MM-DD" ORDER BY lastmodified DESC`
6. If profile context has known spaces or recurring reports, add space/title/text filters while preserving the current-user constraint:
   `type=page AND space = "SPACEKEY" AND contributor = currentUser() AND text ~ "周报" AND lastmodified >= "YYYY-MM-DD" AND lastmodified < "YYYY-MM-DD" ORDER BY lastmodified DESC`
7. Use `page_info` and `page_contributors` for the top results to verify authorship/contribution.
8. Read the most relevant verified pages with `read_page` before summarizing.
9. If the user asks about teammates or team work rather than their own work, then remove the current-user constraint and say that the scope is team-wide.

Person search rules:

- Use account IDs/emails returned by Confluence tools, not display names, for `creator` and `contributor`.
- If you only have a display name, first search pages by text/title or inspect page contributors to find the account value.
- Do not assume a page is authored by a person just because their name appears in the text; verify with metadata/contributors when authorship matters.
- If `whoami` returns display name plus account ID / user key / username, use the stable account identifier in CQL and use display name only for final human-readable summaries.
- For pages found through broad text search, never label them as "my work" until `page_info` or `page_contributors` confirms the current user is creator/contributor/last modifier.

Search result handling:

- Start with small limits (`5-10`) for broad discovery, then increase to `20-50` for focused summary collection.
- If multiple pages match a write target or parent page, list candidates and ask the user to choose.
- Search results are only leads; read pages before making factual claims.

## First-use profiling

Before substantial Confluence work, check the injected `confluence_profile_status` context.

If the status is `not_started` or `skipped`, do not start broad exploration automatically. Tell the user that Confluence is connected, but you do not yet know their spaces, recurring pages, or team conventions. Ask whether they want a read-only exploration first.

Offer these choices:

1. Quick profile: list accessible spaces and inspect a small set of recent/search-result pages.
2. Standard profile: spaces, likely recurring reports, recent work, collaborators, and page patterns.
3. Skip for now: continue with the current task using only live search/read tools.

If the user skips profiling, continue the task normally. If they agree, perform only read-only exploration.

## Read-only profiling workflow

Allowed during profiling:

- list spaces
- search content
- read pages
- inspect page metadata/history if exposed by the MCP

Not allowed during profiling unless the user explicitly asks:

- create pages
- update pages
- delete pages
- upload attachments
- change permissions

For a standard profile:

1. Identify the current user/account if a tool exposes it.
2. List or search accessible spaces and record useful space keys/names.
3. Search for recent or relevant pages associated with the user.
4. Search for recurring-page patterns using terms such as 周报, 日报, 月报, weekly, daily, monthly, meeting notes, standup, project update.
5. Read only small samples needed to understand structure and conventions.
6. Summarize findings into Markdown profile files.
7. Save the profile with `connector_profile_write`.
8. Tell the user what was saved and ask whether to continue the original task.

## Profile file format

Save these files when enough information is available:

- `profile.md`: overview, account/site, common spaces, common tasks, recommended workflow.
- `spaces.md`: accessible/common spaces and when to use them.
- `recurring-pages.md`: likely daily/weekly/monthly reports and naming/location patterns.
- `people.md`: work-related collaborators inferred from pages, without sensitive speculation.
- `page-patterns.md`: templates, title conventions, parent-page patterns, write rules.
- `preferences.md`: user-confirmed preferences only.

Keep profile content factual and concise. Do not invent spaces, people, or pages.

## Using an existing profile

If `confluence_profile_status` is `ready`, read the injected profile summary first. Use it to scope searches and choose safer workflows. Still verify live Confluence content with MCP tools before answering factual questions or writing pages.

For follow-up Confluence work, this skill remains responsible for tool usage strategy:

- Prefer profile-informed search terms, likely spaces, and recurring-page patterns.
- Use live MCP reads before factual summaries; profile context is routing memory, not proof.
- For time-based summaries such as last week or recent work, combine profile hints with live search/read results.
- For broad or ambiguous requests, search first, show the likely sources, then summarize.

When creating or updating Confluence pages:

- Search/read first to avoid duplicates.
- Ask before writing if the parent page, target space, or title is ambiguous.
- Summarize the intended change before performing destructive or high-impact updates.
- Include page links in the final answer when available.

When writing code snippets, JSON, shell commands, or other text where quoting and
escaping must be preserved, prefer Confluence storage-format code macros with
`ac:plain-text-body` wrapped in `CDATA`. Pass this as HTML/storage content when
the tool supports a `format` argument. Do not rely on plain rendered text if the
content contains double quotes, angle brackets, or other characters Confluence may
HTML-escape.

Example storage-format code macro:

```xml
<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">text</ac:parameter>
  <ac:plain-text-body><![CDATA[
{
  "mcpServers": {
    "bilibili": {
      "command": "node",
      "args": ["/path/to/bilibili-mcp/dist/server.js"]
    }
  }
}
  ]]></ac:plain-text-body>
</ac:structured-macro>
```

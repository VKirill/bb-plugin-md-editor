---
title: Markdown file access
type: component
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: high
tags: [files, rpc, bb-plugin]
sources:
  - server.ts
  - locate.ts
  - app.tsx
  - links.ts
  - package.json
---

# Markdown file access

TL;DR: The frontend sends a BB opener source and path to four typed RPC operations; the server resolves the owning host and delegates reads, previews, and conditional writes to BB’s SDK.

## Purpose

The server plugin advertises the `markdown-pro` skill and registers `open`, `stat`, `assetBase`, and `save` in BB RPC (`server.ts:65-78`). The app converts BB’s file-opener context into this contract and displays the returned file (`app.tsx:193-218`).

## How it works

1. `MarkdownFileOpener` sends path, locale, source kind, thread, environment, project, and optional host identifiers (`app.tsx:193-212`).
2. `locate` resolves that source to a host and absolute path; workspace relative paths are constrained beneath a root, while host paths must be absolute (`locate.ts:91-132`).
3. `open` reads UTF-8 content from that host and returns content, SHA-256, modification time, host identity, absolute path, and root path (`server.ts:77-95`).
4. `stat` reads the file to probe its current hash and maps not-found errors to `{exists:false}` (`server.ts:97-106`).
5. `assetBase` requests a one-hour preview URL rooted at the document root for relative image assets (`server.ts:108-112`).
6. `save` calls BB file write with the expected hash; a changed file returns `conflict`, while a successful write returns its new hash (`server.ts:114-122`).
7. The app polls `stat`; if the source changed and local edits are dirty it marks an external change, otherwise it reloads (`app.tsx:377-392`).

| Source kind | Resolution | Boundary and failure |
|---|---|---|
| `thread-storage` | Resolve the thread’s storage root and append the requested relative path (`locate.ts:94-98`). | Requires `threadId`; `within` rejects lexical traversal outside the storage root (`locate.ts:49-55`, `locate.ts:94-97`). |
| `workspace` | Use environment, thread environment, or matching/default project source (`locate.ts:99-115`). | Unknown folder or machine returns `LocateError`; when probing a repository root, candidates remain on the same host (`locate.ts:76-89`, `locate.ts:110-115`). |
| `host` | Require an absolute path; use explicit host, source environment/thread host, then configured primary host (`locate.ts:117-132`). | Fails if path is relative or the owning machine cannot be determined (`locate.ts:117-132`). |

## Business rules

- RPC inputs are strict Zod objects; source kind is one of `host`, `thread-storage`, or `workspace`, and locale is `en` or `ru` (`server.ts:11-21`).
- Open rejects non-UTF-8 files and files over 5 MiB; save content is limited to 5 MiB (`server.ts:9-34`, `server.ts:81-86`, `server.ts:44-49`).
- Save uses `expectedSha256` for compare-and-swap; a conflict is a normal discriminated result, not a successful write (`server.ts:44-49`, `server.ts:114-122`).
- A save with `expectedSha256: null` asks BB to create parent directories; non-null hashes do not (`server.ts:114-118`).
- `within` resolves the candidate path and rejects `..` escapes and absolute paths outside the root (`locate.ts:48-56`).
- Relative file links resolve against the document path and remain within the associated root; URL and anchor links take separate navigation paths (`app.tsx:435-452`, `links.ts:47-88`).

## Public API or commands

| RPC method | File:line | Input / output |
|---|---|---|
| `open` | `server.ts:35-37`, `server.ts:77-95` | File reference → UTF-8 content and file metadata. |
| `stat` | `server.ts:37-38`, `server.ts:97-106` | File reference → existence and current SHA-256. |
| `assetBase` | `server.ts:39-43`, `server.ts:108-112` | File reference → temporary preview base URL and root. |
| `save` | `server.ts:44-50`, `server.ts:114-122` | File reference, content, expected hash → written hash or conflict result. |
| `MAX_BYTES`, `rpcContract`, `plugin` | `server.ts:9-51`, `server.ts:65-124` | File size limit, typed RPC schemas, and BB server registration. |
| `OpenerSource`, `Location`, `LocateSdk`, `LocateError`, `Lang`, `cleanRelative`, `within`, `locate` | `locate.ts:6-56`, `locate.ts:91-135` | Source and resolved location types, boundary validation, and source resolution. |

## Failures

| Failure | Result |
|---|---|
| File not found during open | Server translates common not-found messages into a localized error naming host and path (`server.ts:53-63`, `server.ts:81-86`). |
| Host unavailable | Server translates offline/unreachable messages into a localized error (`server.ts:53-63`). |
| File changed after load | Save returns `conflict`; the app sets conflict state and does not replace the current content (`server.ts:44-49`, `app.tsx:327-331`). |
| File removed while editing | The app checks existence after save failure and marks the document missing; a later save can use a null expected hash (`app.tsx:340-348`, `app.tsx:322-327`). |
| Invalid path or unknown owner | `locate` throws `LocateError` for traversal, missing environment, relative host path, or unresolved host (`locate.ts:43-56`, `locate.ts:91-132`). |

## Gotchas

A workspace file can be looked up under the nearest enclosing Git root when BB supplied a repo-relative changed-file path, but the fallback probes the same host and checks the candidate’s existence (`locate.ts:70-89`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Architecture](architecture.md)
- [Gotchas](gotchas.md)
- [Markdown PRO overview](overview.md)

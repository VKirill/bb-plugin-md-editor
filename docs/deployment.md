---
title: Deployment
type: deployment
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: low
tags: [deployment, bb-plugin, release]
sources:
  - package.json
  - package-lock.json
  - overview.md
  - server.ts
  - app.tsx
  - locate.ts
---

# Deployment

TL;DR: Install the published plugin through BB’s plugin CLI, or build and install the checked-out source for local verification.

## Prerequisites

- BB `>=0.43` and Plugin SDK `>=0.4.87` are declared as engine requirements (`package.json:4-7`).
- Node.js and npm are required by the lockfile and npm scripts; the plugin package is ESM (`package.json:1-4`).
- The plugin manifest points BB at `server.ts`, `app.tsx`, and the `skills` directory (`package.json:4-13`).

## Deploy procedure

1. Install the published plugin:

   ```sh
   bb plugin install https://github.com/VKirill/bb-plugin-md-editor.git
   ```

   The plugin manifest declares BB’s app and server entry points (`package.json:9-17`); see [overview](overview.md#quick-start) for the install entry point.

2. For a checkout install, install dependencies and build:

   ```sh
   npm install
   npm run build
   ```

   `build` runs `bb plugin build .` (`package.json:69-75`).

3. Install the checkout into BB:

   ```sh
   bb plugin install . --yes
   ```

   The local package exposes its BB app and server through the plugin manifest (`package.json:9-17`, `app.tsx:624-631`); see [overview](overview.md) for the plugin setup context.

4. Confirm the installed manifest exposes the React app, server handler, and skill directory (`package.json:4-13`).

## Verify

1. Open a `.md` file and confirm the opener calls `open` and renders the returned content (`app.tsx:270-281`).
2. Edit and save a file; the app calls `save` with the loaded hash and handles written or conflict results (`app.tsx:314-352`).
3. Confirm BB’s server handler registered all four RPC endpoints (`server.ts:35-50`, `server.ts:77-123`).
4. Run local static checks with `npm test` and `npm run typecheck` (`package.json:69-75`).

## Rollback

1. To leave the Markdown PRO view for a file, select its `Original` action; the opener renders BB’s `Original` component (`app.tsx:455-467`).
2. To roll back an installed release, install the chosen known-good plugin revision through BB’s plugin CLI using its source URL or local checkout, then reopen the file. The plugin manifest identifies the BB app and server entry points (`package.json:9-17`); follow the [deployment procedure](#deploy-procedure) with the selected known-good source.

## Troubleshooting

- If BB does not load the app or RPC handler, check that the manifest paths point to `./app.tsx` and `./server.ts` (`package.json:4-12`).
- If open fails, check that the source resolves to a host and the file is UTF-8 and no larger than 5 MiB (`locate.ts:91-132`, `server.ts:81-86`).
- If save reports conflict, another writer changed the file hash after open; reload or resolve that change before saving again (`server.ts:44-49`, `app.tsx:327-331`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Markdown PRO overview](overview.md)

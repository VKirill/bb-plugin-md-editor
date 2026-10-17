# Markdown PRO for BB

Markdown PRO is a BB plugin that opens Markdown files in a formatted editor and saves changes to the file’s owning machine. It supports source editing, rich Markdown blocks, diagrams, and quoting selected text into chat.

## Quick start

```sh
bb plugin install https://github.com/VKirill/bb-plugin-md-editor.git
```

BB 0.43 or later is required. The plugin registers `.md`, `.markdown`, and `.mdx` file openers.

## Font size

Use **Aa** in the desktop header or **Font size** in the compact actions menu to adjust typography. See [Markdown editing](docs/editor.md#how-it-works) for the setting’s range, persistence, and fallback behavior.

## Mobile viewing

On screens narrower than 768 px and touch devices up to 1024 px wide, files open formatted and read-only without focusing the editor. **View**, **Code**, and **Edit** switch between formatted reading, read-only Markdown source, and explicit editing. Panels narrower than 880 px use compact controls even on desktop. Resizing preserves your selected mode and unsaved edits.

The BB actions menu holds Save, font size, formatting tools, and autosave; saving status stays visible. The reading context menu retains quoting, comments, and copying references while hiding editing commands. YAML properties remain visible when leaving YAML editing. All controls support English and Russian.

## Documentation

- [Overview](docs/overview.md) — purpose, stack, and starting points
- [Architecture](docs/architecture.md) — plugin containers and execution paths
- [Markdown editor](docs/editor.md) — rich and source editing, navigation, and tab menu
- [File access](docs/file-access.md) — location resolution and RPC contract
- [Markdown rendering](docs/rendering.md) — supported custom blocks and diagram editing
- [Deployment](docs/deployment.md) — install, build, verify, and rollback
- [Gotchas](docs/gotchas.md) — implementation constraints
- [Demo document](docs/demo.md) — sample Markdown syntax

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
bb plugin install . --yes
```

## License

MIT

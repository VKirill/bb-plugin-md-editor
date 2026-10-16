# Markdown PRO for BB

Markdown PRO is a BB plugin that opens Markdown files in a formatted editor and saves changes to the file’s owning machine. It supports source editing, rich Markdown blocks, diagrams, and quoting selected text into chat.

## Quick start

```sh
bb plugin install https://github.com/VKirill/bb-plugin-md-editor.git
```

BB 0.43 or later is required. The plugin registers `.md`, `.markdown`, and `.mdx` file openers.

## Font size

Use **Aa** in the editor header to set a font size (10–32 px), or choose **Follow BB** (the default). Formatted text and Markdown/YAML source follow BB’s `--text-base` typography token and root scale automatically. The optional override is saved in this browser and shared by open documents; it does not change the file. The control follows BB’s English or Russian interface language.

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

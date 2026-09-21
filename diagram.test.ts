import assert from "node:assert/strict";
import { test } from "node:test";
import { addAfter, addNode, deleteNode, findDeclaration, isFlowchart, labelOf, renameNode, reshapeNode } from "./mermaid-edit.ts";
import { looksLikeBoxDiagram, looksLikeForkDiagram, matchAsciiDiagram, parseBoxDiagram, parseForkDiagram } from "./box-diagram.ts";
import { looksLikeTree, parseTree } from "./tree.ts";

const chart = "flowchart LR\n  A[Чат] --> B[Markdown PRO]\n  B --> C[Файл на Mac mini]\n";

test("flowchart detection and labels", () => {
  assert.ok(isFlowchart(chart));
  assert.ok(!isFlowchart("sequenceDiagram\n A->>B: hi"));
  assert.equal(labelOf(chart, "B"), "Markdown PRO");
  assert.equal(findDeclaration(chart, "C")?.shape.id, "rect");
});

test("rename and reshape keep the id", () => {
  assert.match(renameNode(chart, "B", "Редактор"), /A\[Чат\] --> B\[Редактор\]/);
  assert.match(reshapeNode(chart, "B", "diamond"), /B\{Markdown PRO\}/);
  assert.match(renameNode(chart, "A", "Да (ok)"), /A\["Да \(ok\)"\]/);
});

test("add blocks", () => {
  const added = addAfter(chart, "C", "Проверка", "diamond", "да");
  assert.equal(added.id, "N1");
  assert.match(added.code, /C -->\|да\| N1\{Проверка\}$/);
  assert.match(addNode(added.code).code, /N2\[New block\]$/);
});

test("delete reconnects neighbours and keeps inline declarations", () => {
  const out = deleteNode(chart, "B");
  assert.doesNotMatch(out, /(^|[^\w])B([^\w]|$)/);
  assert.match(out, /A\[Чат\]/);
  assert.match(out, /C\[Файл на Mac mini\]/);
  assert.match(out, /A --> C/);
});

test("delete in the middle of a chain", () => {
  const out = deleteNode("graph TD\n  A --> B --> C --> D\n", "C");
  assert.match(out, /A --> B/);
  assert.match(out, /B --> D/);
  assert.doesNotMatch(out, /C/);
});

test("tree detection and parsing", () => {
  const code = [
    "project/",
    "├── src/            # исходники",
    "│   ├── app.ts",
    "│   └── lib/",
    "│       └── util.ts  // утилиты",
    "└── README.md",
  ].join("\n");
  assert.ok(looksLikeTree(code));
  assert.ok(!looksLikeTree("const a = 1;\nconst b = 2;"));
  assert.deepEqual(parseTree(code), [
    { depth: 0, name: "project", comment: null, folder: true },
    { depth: 1, name: "src", comment: "исходники", folder: true },
    { depth: 2, name: "app.ts", comment: null, folder: false },
    { depth: 2, name: "lib", comment: null, folder: true },
    { depth: 3, name: "util.ts", comment: "утилиты", folder: false },
    { depth: 1, name: "README.md", comment: null, folder: false },
  ]);
});

const boxMap = [
  "┌─────────────────────────────────────────────────────────────┐",
  "│ H1: Молитва Николаю Чудотворцу о здравии                   │",
  "│ Введение: что это, для кого                                │",
  "└─────────────────────────────────────────────────────────────┘",
  "                            ↓",
  "┌─────────────────────────────────────────────────────────────┐",
  "│ СЛОЙ 2: Святой Николай                                      │",
  "│ - Кто такой, почему Чудотворец                              │",
  "└─────────────────────────────────────────────────────────────┘",
].join("\n");

test("box maps are not directory trees", () => {
  assert.ok(looksLikeBoxDiagram(boxMap));
  assert.ok(!looksLikeTree(boxMap));
  assert.ok(!looksLikeBoxDiagram("project/\n├── src/\n└── README.md"));
});

test("box map parse extracts titles, bullets and arrows", () => {
  assert.deepEqual(parseBoxDiagram(boxMap), [
    { kind: "box", title: "H1: Молитва Николаю Чудотворцу о здравии", lines: ["Введение: что это, для кого"] },
    { kind: "arrow", symbol: "↓" },
    { kind: "box", title: "СЛОЙ 2: Святой Николай", lines: ["- Кто такой, почему Чудотворец"] },
  ]);
});

test("split-join query matrix becomes a fork diagram", () => {
  const fork = [
    "КАНОНИЧНЫЙ ЗАПРОС",
    '"Молитва Николаю Чудотворцу о здравии"',
    "        ↓",
    "    ┌───┴───────────────────────┐",
    "    ↓                           ↓",
    "Вариант 1                   Вариант 2",
    '"молитва николаю          "молитва николая',
    'чудотворцу здравии"       чудотворца о здравии"',
    "(дательный)               (генитив + предлог)",
    "    ↓                           ↓",
    "    └───┬───────────────────────┘",
    "        ↓",
    "    ЕДИНАЯ СТРАНИЦА",
    "    /molitva",
  ].join("\n");
  assert.ok(looksLikeForkDiagram(fork));
  assert.ok(!looksLikeBoxDiagram(fork));
  assert.ok(!looksLikeTree(fork));
  assert.deepEqual(parseForkDiagram(fork), {
    root: { title: "КАНОНИЧНЫЙ ЗАПРОС", lines: ['"Молитва Николаю Чудотворцу о здравии"'] },
    branches: [
      { title: "Вариант 1", lines: ['"молитва николаю', 'чудотворцу здравии"', "(дательный)"] },
      { title: "Вариант 2", lines: ['"молитва николая', 'чудотворца о здравии"', "(генитив + предлог)"] },
    ],
    merge: { title: "ЕДИНАЯ СТРАНИЦА", lines: ["/molitva"] },
  });
});

test("unfenced box map matcher stops before the next heading", () => {
  const src = `${boxMap}\n\n## Дальше\n`;
  const found = matchAsciiDiagram(src);
  assert.ok(found);
  assert.equal(found.text, boxMap);
  assert.ok(found.raw.endsWith("\n"));
  assert.ok(!found.raw.includes("Дальше"));
});

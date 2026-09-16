// Markdown PRO — frontend: a Markdown file opener. Files open formatted and
// editable in place (Tiptap) with a style toolbar, Mermaid, LaTeX and a YAML
// properties panel. BB routes .md files here from chat links, the file picker,
// Tasks/Docs panels and `bb thread open`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { definePluginApp, useBbNavigate, useComposer, useRpc, type PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import type { Editor } from "@tiptap/react";
import { parseDocument } from "yaml";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { MarkdownEditor, revealLines, type EditorHandle } from "./editor";
import { RICH_CSS, RichMarkdownEditor, revealSourceLine, type AssetResolver } from "./rich";
import { dirnamePosix, normalizePosix, resolveLink, type DocumentContext } from "./links";
import { joinFrontMatter, splitFrontMatter } from "./frontmatter";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { detectLocale, t } from "./i18n";
import { findSourceLines, formatChatQuote, lineLabel } from "./quote";
import { mountTabMenu } from "./tabs";

type Loaded = {
  content: string;
  sha256: string;
  hostName: string;
  hostId: string;
  absPath: string;
  rootPath: string | null;
};
type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";
type Prompt = { title: string; value: string; multiline: boolean; hint?: string; apply: (value: string) => void } | null;

const AUTOSAVE_KEY = "md-editor:autosave";
const AUTOSAVE_MS = 1500;
const POLL_MS = 4000;

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function slug(text: string) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
}

function Banner({ tone, children }: { tone: "warn" | "error"; children: ReactNode }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs", tone === "error" ? "text-destructive" : "text-foreground")}>
      <Icon name="AlertTriangle" className={cn("size-3.5 shrink-0", tone === "warn" && "text-amber-500")} />
      {children}
    </div>
  );
}

function PromptDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(prompt?.value ?? ""), [prompt]);
  const submit = () => {
    prompt?.apply(value);
    onClose();
  };
  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-bb-ru-skip="">
        <DialogHeader>
          <DialogTitle>{prompt?.title}</DialogTitle>
        </DialogHeader>
        {prompt?.multiline ? (
          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && submit()}
            rows={5}
            className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm outline-none focus:border-ring"
          />
        ) : (
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-ring"
          />
        )}
        {prompt?.hint ? <p className="text-xs text-muted-foreground">{prompt.hint}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={submit}>{t("apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_TONE: [RegExp, string][] = [
  [/^(done|complete(d)?|ready|published|active|approved|готово|опубликовано|активно|принято)$/i, "ok"],
  [/^(fail(ed)?|error|blocked|rejected|archived|ошибка|заблокировано|отклонено|в архиве)$/i, "fail"],
  [/^(draft|wip|in[ -]?progress|review|pending|черновик|в работе|на проверке|ожидает)$/i, "warn"],
];
const toneOf = (value: string) => STATUS_TONE.find(([re]) => re.test(value.trim()))?.[1] ?? "info";

function formatValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PropertiesPanel({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editingYaml, setEditingYaml] = useState(false);
  const handle = useRef<EditorHandle>({ view: null }).current;
  const parsed = useMemo(() => {
    const document = parseDocument(value);
    const error = document.errors[0]?.message.split("\n")[0] ?? null;
    const data = error ? null : (document.toJS() as unknown);
    const entries = data && typeof data === "object" && !Array.isArray(data) ? Object.entries(data as Record<string, unknown>) : [];
    return { error, entries };
  }, [value]);
  const pick = (...keys: string[]) => parsed.entries.find(([key]) => keys.includes(key.toLowerCase()));
  const title = pick("title", "name");
  const status = pick("status", "state");
  const tags = pick("tags", "tag", "labels", "keywords");
  const people = pick("owner", "author", "assignee", "authors");
  const dates = parsed.entries.filter(([key]) => /^(date|created|updated|modified|deadline|due)(_at|At)?$/i.test(key));
  const used = new Set([title, status, tags, people, ...dates].filter(Boolean).map((entry) => entry![0]));
  const rest = parsed.entries.filter(([key]) => !used.has(key));
  return (
    <div className="mdpro-props border-b border-border">
      <div className="w-full px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground">
          <Icon name={open ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
          <span className="font-medium">{t("properties")}</span>
          {parsed.error ? <span className="text-destructive">{t("yamlError")}</span> : <span>{parsed.entries.length}</span>}
        </button>
        {open ? (
          <div className="mdpro-props-card">
            {!editingYaml && parsed.entries.length > 0 ? (
              <>
                {title || status ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {title ? <span className="text-base font-semibold">{formatValue(title[1])}</span> : null}
                    {status ? <span className={`mdpro-badge mdpro-badge-${toneOf(formatValue(status[1]))}`}>{formatValue(status[1])}</span> : null}
                  </div>
                ) : null}
                {people || dates.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {people ? <span>👤 {formatValue(people[1])}</span> : null}
                    {dates.map(([key, v]) => (
                      <span key={key}>📅 {key}: {formatValue(v)}</span>
                    ))}
                  </div>
                ) : null}
                {tags ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(tags[1]) ? tags[1] : String(tags[1]).split(/[,\s]+/)).filter(Boolean).map((tag) => (
                      <span key={String(tag)} className="mdpro-tag">#{formatValue(tag)}</span>
                    ))}
                  </div>
                ) : null}
                {rest.length > 0 ? (
                  <dl className="mdpro-props-grid">
                    {rest.map(([key, v]) => (
                      <div key={key} className="contents">
                        <dt>{key}</dt>
                        <dd>{formatValue(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </>
            ) : null}
            {editingYaml || parsed.error ? (
              <div className="rounded-md border border-border">
                <MarkdownEditor value={value} onChange={onChange} onSave={() => undefined} handle={handle} language="yaml" gutter={false} />
                {parsed.error ? <p className="border-t border-border px-2 py-1 text-xs text-destructive">{parsed.error}</p> : null}
              </div>
            ) : null}
            <div>
              <button type="button" className="mdpro-chip mdpro-chip-plain" onClick={() => setEditingYaml((v) => !v)}>
                {editingYaml ? t("doneEditing") : t("editYaml")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MarkdownFileOpener({ path, source, experimental_lineRange, Original }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();

  const request = useMemo(
    () => ({
      path,
      locale: detectLocale(),
      source: {
        kind: source.kind,
        threadId: source.threadId,
        environmentId: source.environmentId,
        projectId: source.projectId,
        hostId: source.experimental_hostId ?? null,
      },
    }),
    [path, source.kind, source.threadId, source.environmentId, source.projectId, source.experimental_hostId],
  );

  const [doc, setDoc] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const [missing, setMissing] = useState(false);
  const [autosave, setAutosave] = useState(() => globalThis.localStorage?.getItem(AUTOSAVE_KEY) !== "off");
  const [prompt, setPrompt] = useState<Prompt>(null);

  // Document parts. `baseline*` is what the editor produced for the file on
  // disk, so merely opening a file never marks it dirty or rewrites it.
  const [frontMatter, setFrontMatter] = useState<string | null>(null);
  const [baselineFront, setBaselineFront] = useState<string | null>(null);
  const [eol, setEol] = useState<"\n" | "\r\n">("\n");
  const [body, setBody] = useState("");
  const [baselineBody, setBaselineBody] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const richRef = useRef<Editor | null>(null);
  const sourceHandle = useRef<EditorHandle>({ view: null }).current;

  const dirty = doc !== null && (sourceMode
    ? sourceText !== doc.content
    : baselineBody !== null && (body.trimEnd() !== baselineBody.trimEnd() || frontMatter !== baselineFront));
  const composed = () => {
    const current = state.current;
    if (!current.doc) return "";
    if (current.sourceMode) return current.sourceText;
    return current.dirty ? joinFrontMatter(current.frontMatter, current.body, current.eol) : current.doc.content;
  };
  const state = useRef({ doc, dirty, missing, sourceMode, sourceText, frontMatter, body, eol, saving: false });
  state.current = { ...state.current, doc, dirty, missing, sourceMode, sourceText, frontMatter, body, eol };

  const applyContent = useCallback((content: string) => {
    const parts = splitFrontMatter(content);
    setFrontMatter(parts.frontMatter);
    setBaselineFront(parts.frontMatter);
    setEol(parts.eol);
    setSourceText(content);
    const editor = richRef.current;
    if (editor && !editor.isDestroyed) {
      const scroller = editor.view.dom.closest(".mdpro-scroll");
      const top = scroller?.scrollTop ?? 0;
      editor.commands.setContent(parts.body, { contentType: "markdown", emitUpdate: false });
      const normalized = editor.getMarkdown();
      setBody(normalized);
      setBaselineBody(normalized);
      if (scroller) scroller.scrollTop = top;
    } else {
      setBody(parts.body);
      setBaselineBody(null);
      setVersion((v) => v + 1);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await rpc.call("open", request);
      setDoc(result);
      applyContent(result.content);
      setLoadError(null);
      setExternalChange(false);
      setSaveState("idle");
    } catch (cause) {
      setLoadError(errorText(cause));
    }
  }, [rpc, request, applyContent]);

  useEffect(() => {
    richRef.current = null;
    setDoc(null);
    void load();
  }, [load]);

  // Image URLs: files beneath the document root are served by a short-lived preview.
  const assetBase = useRef<{ baseUrl: string; rootPath: string } | null>(null);
  const resolveAsset = useRef<AssetResolver>((src) => src);
  useEffect(() => {
    if (!doc) return;
    rpc.call("assetBase", request).then((base) => {
      assetBase.current = base;
    }, () => undefined);
  }, [doc?.absPath, rpc, request]); // eslint-disable-line react-hooks/exhaustive-deps
  resolveAsset.current = (src) => {
    const base = assetBase.current;
    if (!doc || !base || src === "" || /^(https?:|data:|blob:)/i.test(src)) return src;
    let decoded = src;
    try {
      decoded = decodeURIComponent(src.split(/[?#]/)[0]);
    } catch {
      /* literal */
    }
    const absolute = normalizePosix(decoded.startsWith("/") ? decoded : `${dirnamePosix(doc.absPath)}/${decoded}`);
    const root = base.rootPath.endsWith("/") ? base.rootPath : `${base.rootPath}/`;
    if (!absolute.startsWith(root)) return src;
    const relative = absolute.slice(root.length).split("/").map(encodeURIComponent).join("/");
    return `${base.baseUrl.replace(/\/?$/, "/")}${relative}`;
  };

  const save = useCallback(
    async (force = false) => {
      const current = state.current;
      if (!current.doc || current.saving || (!force && !current.dirty)) return;
      const content = composed();
      state.current.saving = true;
      setSaveState("saving");
      try {
        let expected: string | null = current.doc.sha256;
        if (force || state.current.missing) {
          const stat = await rpc.call("stat", request);
          expected = stat.exists ? stat.sha256 : null;
        }
        const result = await rpc.call("save", { ...request, content, expectedSha256: expected });
        if (result.outcome === "conflict") {
          setSaveState("conflict");
          return;
        }
        setDoc({ ...current.doc, content, sha256: result.sha256 });
        setSourceText(content);
        setBaselineBody(state.current.body);
        setBaselineFront(state.current.frontMatter);
        setSaveState("saved");
        setSaveError(null);
        setExternalChange(false);
        setMissing(false);
      } catch (cause) {
        const exists = await rpc.call("stat", request).then((stat) => stat.exists, () => true);
        if (!exists) {
          setMissing(true);
          setSaveState("idle");
          return;
        }
        setSaveState("error");
        setSaveError(errorText(cause));
      } finally {
        state.current.saving = false;
      }
    },
    [rpc, request], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Cmd+S anywhere in the panel.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [save, doc !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autosave || !dirty || missing || saveState === "conflict") return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [autosave, dirty, missing, body, frontMatter, sourceText, saveState, save]);

  // Pick up changes made by agents or other windows.
  useEffect(() => {
    if (!doc) return;
    const timer = setInterval(async () => {
      if (document.hidden || state.current.saving) return;
      const stat = await rpc.call("stat", request).catch(() => null);
      if (!stat) return;
      setMissing(!stat.exists);
      const { sha256 } = stat;
      const latest = state.current.doc;
      if (!sha256 || !latest || sha256 === latest.sha256) return;
      if (state.current.dirty) setExternalChange(true);
      else void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [doc !== null, rpc, request, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Targeted opens (file.md:120): scroll the formatted document to that line;
  // fall back to the Markdown source when the line can't be matched.
  useEffect(() => {
    if (!experimental_lineRange || !doc) return;
    const timer = setTimeout(() => {
      const editor = richRef.current;
      const content = state.current.doc?.content ?? "";
      if (!state.current.sourceMode && editor && !editor.isDestroyed && revealSourceLine(editor, content, experimental_lineRange.startLineNumber)) return;
      setSourceMode(true);
      setTimeout(() => {
        if (sourceHandle.view) revealLines(sourceHandle.view, experimental_lineRange.startLineNumber, experimental_lineRange.endLineNumber);
      }, 50);
    }, 250);
    return () => clearTimeout(timer);
  }, [experimental_lineRange, doc !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSource = () => {
    if (!doc) return;
    if (sourceMode) {
      const content = sourceText;
      setSourceMode(false);
      // Re-parse the edited source into the rich editor; keep it dirty if changed.
      const parts = splitFrontMatter(content);
      setFrontMatter(parts.frontMatter);
      setEol(parts.eol);
      const editor = richRef.current;
      if (editor) {
        editor.commands.setContent(parts.body, { contentType: "markdown", emitUpdate: false });
        const normalized = editor.getMarkdown();
        setBody(normalized);
        if (content === doc.content) {
          setBaselineBody(normalized);
          setBaselineFront(parts.frontMatter);
        }
      }
    } else {
      setSourceText(composed());
      setSourceMode(true);
    }
  };

  const onLink = (href: string, event: MouseEvent) => {
    const current = state.current.doc;
    if (!current) return false;
    const context: DocumentContext = { source: request.source, hostId: current.hostId, absPath: current.absPath, rootPath: current.rootPath };
    const action = resolveLink(href, context);
    if (!action) return false;
    if (action.type === "url") navigate.openUrl(action.url);
    else if (action.type === "anchor") {
      const scroller = rootRef.current?.querySelector(".mdpro-scroll");
      const wanted = slug(action.id);
      const heading = Array.from(scroller?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? []).find((h) => slug(h.textContent ?? "") === wanted);
      heading?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      const options = { target: action.target, location: action.location };
      const opened = event.metaKey || event.ctrlKey ? navigate.experimental_openFileExternally(options) : navigate.experimental_openFilePreview(options);
      if (!opened) toast.error(t("openInPanelFailed"));
    }
    return true;
  };

  if (useOriginal) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-end border-b border-border px-2 py-1">
          <Button variant="ghost" size="sm" onClick={() => setUseOriginal(false)}>
            <Icon name="Edit" className="size-3.5" /> Markdown PRO
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <Original />
        </div>
      </div>
    );
  }

  const status = saveState === "saving" ? t("saving") : dirty ? t("unsaved") : saveState === "saved" ? t("saved") : null;

  return (
    <div ref={rootRef} data-bb-ru-skip="" className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <style>{RICH_CSS}</style>
      <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{path.split("/").pop()}</span>
            {dirty ? <span aria-label={t("unsavedDot")} className="size-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={doc ? `${doc.hostName} · ${doc.absPath}` : path}>
            {doc ? `${doc.hostName} · ${doc.absPath}` : path}
          </div>
        </div>
        {status ? <span className="shrink-0 text-xs text-muted-foreground">{status}</span> : null}
        <Button
          variant="ghost"
          size="icon"
          className="mdpro-tool size-7"
          aria-label={autosave ? t("autosaveOnLabel") : t("autosaveOffLabel")}
          data-tip={autosave ? t("autosaveOn") : t("autosaveOff")}
          data-tip-align="end"
          onClick={() => {
            const next = !autosave;
            setAutosave(next);
            globalThis.localStorage?.setItem(AUTOSAVE_KEY, next ? "on" : "off");
          }}
        >
          <Icon name={autosave ? "Repeat" : "Pause"} className="size-3.5" />
        </Button>
        <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saveState === "saving"} onClick={() => void save()}>
          {t("save")}
        </Button>
      </div>

      {externalChange && saveState !== "conflict" ? (
        <Banner tone="warn">
          <span className="flex-1">{t("externalChange")}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>{t("loadTheirs")}</Button>
          <Button size="sm" variant="ghost" onClick={() => void save(true)}>{t("keepMine")}</Button>
        </Banner>
      ) : null}
      {saveState === "conflict" ? (
        <Banner tone="warn">
          <span className="flex-1">{t("conflict")}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>{t("loadTheirs")}</Button>
          <Button size="sm" variant="ghost" onClick={() => void save(true)}>{t("overwrite")}</Button>
        </Banner>
      ) : null}
      {missing ? (
        <Banner tone="warn">
          <span className="flex-1">{t("fileDeleted")}</span>
          <Button size="sm" variant="outline" onClick={() => void save(true)}>{t("recreate")}</Button>
        </Banner>
      ) : null}
      {saveState === "error" && saveError ? (
        <Banner tone="error">
          <span className="flex-1">{saveError}</span>
          <Button size="sm" variant="outline" onClick={() => void save()}>{t("retry")}</Button>
        </Banner>
      ) : null}

      {loadError ? (
        <div className="m-4 flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4 text-sm">
          <div className="flex items-center gap-2 text-destructive">
            <Icon name="AlertCircle" className="size-4" /> {t("openFailed")}
          </div>
          <p className="text-muted-foreground">{loadError}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()}>{t("retry")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setUseOriginal(true)}>{t("standardPreview")}</Button>
          </div>
        </div>
      ) : doc === null ? (
        <div role="status" className="p-4 text-sm text-muted-foreground">{t("loading")}</div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {sourceMode ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3 py-1 text-xs text-muted-foreground">
                <span className="flex-1">{t("sourceTitle")}</span>
                <Button size="sm" variant="outline" onClick={toggleSource}>{t("backToEditor")}</Button>
              </div>
              <div className="min-h-0 flex-1">
                <MarkdownEditor value={sourceText} onChange={setSourceText} onSave={() => void save()} handle={sourceHandle} />
              </div>
            </div>
          ) : null}
          <div className={cn("flex min-h-0 flex-1 flex-col", sourceMode && "hidden")}>
            {frontMatter !== null ? <PropertiesPanel value={frontMatter} onChange={setFrontMatter} /> : null}
            <div className="min-h-0 flex-1">
              <RichMarkdownEditor
                key={version}
                initialMarkdown={body}
                resolveAsset={resolveAsset}
                onReady={(editor, normalized) => {
                  richRef.current = editor;
                  setBody(normalized);
                  setBaselineBody(normalized);
                  // Plugins (e.g. the trailing paragraph after a final code block)
                  // may append a transaction right after creation; re-baseline then.
                  requestAnimationFrame(() => {
                    if (editor.isDestroyed) return;
                    const settled = editor.getMarkdown();
                    setBody(settled);
                    setBaselineBody(settled);
                  });
                }}
                onChange={setBody}
                onLink={onLink}
                onThread={(threadId) => navigate.toThread(threadId)}
                onQuote={(markdown, comment, ratio) => {
                  const current = state.current.doc;
                  if (!current || !markdown.trim()) return;
                  const source = composed();
                  const range = findSourceLines(source, markdown, Math.round(ratio * source.split("\n").length) + 1);
                  const block = formatChatQuote({ path: current.absPath, host: current.hostName, range, markdown, comment });
                  composer.updateText((text) => `${text.trim() ? `${text.trimEnd()}\n\n` : ""}${block}\n\n`);
                  composer.focus();
                  toast.success(t("ctxQuoted"));
                }}
                onReference={(markdown, ratio) => {
                  const current = state.current.doc;
                  if (!current) return;
                  const source = composed();
                  const range = findSourceLines(source, markdown, Math.round(ratio * source.split("\n").length) + 1);
                  void navigator.clipboard.writeText(`${current.absPath}${lineLabel(range)}`).then(() => toast.success(t("copied")));
                }}
                onEditMath={(latex, apply) => setPrompt({ title: t("mathTitle"), value: latex, multiline: true, hint: t("mathHint"), apply })}
                onEditLink={(href, apply) => setPrompt({ title: t("linkTitle"), value: href, multiline: false, hint: t("linkHint"), apply: (v) => apply(v.trim() || null) })}
                toolbarEnd={
                  <>
                    <button
                      type="button"
                      onClick={toggleSource}
                      data-tip={t("showSource")}
                      data-tip-align="end"
                      className="mdpro-tool flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Icon name="Code" className="size-3.5" /> {t("source")}
                    </button>
                  </>
                }
              />
            </div>
          </div>
        </div>
      )}
      <PromptDialog prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({ id: "tab-menu", mount: mountTabMenu });
  app.slots.fileOpener({
    id: "markdown",
    title: "Markdown PRO",
    extensions: ["md", "mdx", "markdown"],
    component: MarkdownFileOpener,
  });
});

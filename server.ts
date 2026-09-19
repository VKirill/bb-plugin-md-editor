// bb-plugin-md-editor — server: locate, read and CAS-save Markdown files on
// the machine that owns them.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { locate, LocateError, type Lang, type LocateSdk } from "./locate.ts";

const say = (lang: Lang, en: string, ru: string) => (lang === "ru" ? ru : en);

export const MAX_BYTES = 5 * 1024 * 1024;

const sourceSchema = z
  .object({
    kind: z.enum(["host", "thread-storage", "workspace"]),
    threadId: z.string().max(256).nullable(),
    environmentId: z.string().max(256).nullable(),
    projectId: z.string().max(256).nullable(),
    hostId: z.string().max(256).nullable().optional(),
  })
  .strict();

const fileSchema = z.object({ source: sourceSchema, path: z.string().min(1).max(8192), locale: z.enum(["en", "ru"]).optional() }).strict();

const documentSchema = z
  .object({
    content: z.string(),
    sha256: z.string(),
    modifiedAtMs: z.number().nullable(),
    hostId: z.string(),
    hostName: z.string(),
    absPath: z.string(),
    rootPath: z.string().nullable(),
  })
  .strict();

export const rpcContract = defineRpcContract({
  open: { input: fileSchema, output: documentSchema },
  /** Cheap change probe: sha256 only. */
  stat: { input: fileSchema, output: z.object({ sha256: z.string().nullable(), exists: z.boolean() }).strict() },
  /** Short-lived URL base serving files beneath the document root, for images. */
  assetBase: {
    input: fileSchema,
    output: z.object({ baseUrl: z.string(), rootPath: z.string() }).strict(),
  },
  save: {
    input: fileSchema.extend({ content: z.string().max(MAX_BYTES), expectedSha256: z.string().nullable() }).strict(),
    output: z.discriminatedUnion("outcome", [
      z.object({ outcome: z.literal("written"), sha256: z.string() }).strict(),
      z.object({ outcome: z.literal("conflict"), currentSha256: z.string().nullable() }).strict(),
    ]),
  },
});

function describe(error: unknown, hostName: string, absPath: string, lang: Lang): Error {
  if (error instanceof LocateError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/does not exist|ENOENT|404/i.test(message)) {
    return new Error(say(lang, `File not found on “${hostName}”: ${absPath}`, `Файл не найден на машине «${hostName}»: ${absPath}`));
  }
  if (/offline|not connected|unreachable|ECONNREFUSED/i.test(message)) {
    return new Error(say(lang, `Machine “${hostName}” is unavailable: ${message}`, `Машина «${hostName}» недоступна: ${message}`));
  }
  return new Error(message);
}

export default function plugin(bb: BbPluginApi) {
  const sdk = bb.sdk as unknown as LocateSdk;
  const hostName = async (hostId: string) =>
    (await bb.sdk.hosts.get({ hostId }).catch(() => null))?.name || hostId;

  bb.agents.configure(() => ({
    tools: [],
    skills: ["markdown-pro"],
    instructions:
      "When you create or substantially rewrite a Markdown (.md) file for the user, follow the markdown-pro skill: callouts, collapsible details, Mermaid, LaTeX, task lists, status tables, directory trees, YAML front matter, and paired HTML template comments (`<!-- name:start -->` … `<!-- name:end -->`) render as a formatted, editable document in BB's Markdown PRO editor.",
  }));

  bb.rpc.register(rpcContract, {
    open: async ({ source, path, locale = "en" }) => {
      const where = await locate(sdk, source, path, locale);
      const name = await hostName(where.hostId);
      const file = await bb.sdk.files
        .read({ hostId: where.hostId, path: where.absPath })
        .catch((error: unknown) => { throw describe(error, name, where.absPath, locale); });
      if (!("content" in file)) throw new Error(say(locale, "The server returned no file content.", "Сервер не вернул содержимое файла."));
      if (file.contentEncoding !== "utf8") throw new Error(say(locale, "The file is not UTF-8 text.", "Файл не является текстовым (UTF-8)."));
      if (file.sizeBytes > MAX_BYTES) throw new Error(say(locale, "The file is larger than 5 MB; open it with the standard preview.", "Файл больше 5 МБ, откройте его стандартным просмотром."));
      return {
        content: file.content,
        sha256: file.sha256,
        modifiedAtMs: file.modifiedAtMs ?? null,
        hostId: where.hostId,
        hostName: name,
        absPath: where.absPath,
        rootPath: where.rootPath,
      };
    },
    stat: async ({ source, path, locale = "en" }) => {
      const where = await locate(sdk, source, path, locale);
      try {
        const file = await bb.sdk.files.read({ hostId: where.hostId, path: where.absPath });
        return { sha256: file.sha256, exists: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/does not exist|ENOENT|404/i.test(message)) return { sha256: null, exists: false };
        throw error;
      }
    },
    assetBase: async ({ source, path, locale = "en" }) => {
      const where = await locate(sdk, source, path, locale);
      const rootPath = where.rootPath ?? where.absPath.slice(0, where.absPath.lastIndexOf("/")) ?? "/";
      const preview = await bb.sdk.files.createPreview({ hostId: where.hostId, rootPath, ttlMs: 60 * 60 * 1000 });
      return { baseUrl: preview.baseUrl, rootPath };
    },
    save: async ({ source, path, content, expectedSha256, locale = "en" }) => {
      const where = await locate(sdk, source, path, locale);
      const result = await bb.sdk.files
        .write({ hostId: where.hostId, path: where.absPath, content, contentEncoding: "utf8", expectedSha256, createParents: expectedSha256 === null })
        .catch(async (error: unknown) => { throw describe(error, await hostName(where.hostId), where.absPath, locale); });
      if (result.outcome === "conflict") return { outcome: "conflict" as const, currentSha256: result.currentSha256 };
      bb.log.info(`saved ${where.hostId}:${where.absPath}`);
      return { outcome: "written" as const, sha256: result.sha256 };
    },
  });
}

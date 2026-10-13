import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./errors";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIN_TEXT_CHARS = 40;
// caps keep one upload from monopolising memory and the embedding model
const MAX_PDF_PAGES = 150;
export const MAX_TEXT_CHARS = 300_000; // ~375 passages of 800 characters

export type StoredFileType = "pdf" | "txt" | "md";

const EXTENSIONS: Record<string, StoredFileType> = { ".pdf": "pdf", ".txt": "txt", ".md": "md", ".markdown": "md" };

// A fixed folder (web/storage/uploads, git-ignored). Keeping the path static
// lets the Next.js build know exactly which files the server touches.
function storedPath(storedName: string): string {
  return path.join(process.cwd(), "storage", "uploads", path.basename(storedName));
}

export function detectFileType(fileName: string): StoredFileType {
  const type = EXTENSIONS[path.extname(fileName).toLowerCase()];
  if (!type) throw new ApiError(400, "Only .pdf, .txt and .md files are supported", { file: "Unsupported file type" });
  return type;
}

/** Pull plain text out of the upload so it can be indexed and embedded. */
export async function extractText(bytes: Uint8Array, type: StoredFileType): Promise<string> {
  let text: string;
  if (type === "pdf") {
    if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
      throw new ApiError(400, "This file is not a valid PDF", { file: "Not a PDF" });
    }
    const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ApiError(413, `PDFs may have at most ${MAX_PDF_PAGES} pages`, { file: "Too many pages" });
    }
    const result = await extractPdfText(pdf, { mergePages: false });
    text = (result.text as string[]).join("\n\n");
  } else {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  const cleaned = text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (cleaned.length < MIN_TEXT_CHARS) {
    throw new ApiError(400, "No readable text found (scanned PDFs are not supported)", { file: "No text found" });
  }
  if (cleaned.length > MAX_TEXT_CHARS) {
    throw new ApiError(413, `The text is too long (limit ${MAX_TEXT_CHARS.toLocaleString("en")} characters) — split it into smaller notes`, { file: "Too long" });
  }
  return cleaned;
}

/**
 * Store under a random name: the client-supplied file name never touches the
 * file system, so path traversal is impossible.
 */
export async function saveUpload(bytes: Uint8Array, type: StoredFileType): Promise<string> {
  const fileName = `${randomUUID()}.${type}`;
  await mkdir(path.join(process.cwd(), "storage", "uploads"), { recursive: true });
  await writeFile(storedPath(fileName), bytes);
  return fileName;
}

export async function readUpload(storedName: string): Promise<Buffer | null> {
  try {
    return await readFile(storedPath(storedName));
  } catch {
    return null;
  }
}

export async function deleteUpload(storedName: string): Promise<void> {
  await unlink(storedPath(storedName)).catch(() => undefined);
}

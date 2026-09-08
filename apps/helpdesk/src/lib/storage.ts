import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import {
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  humanSize,
  isAllowedMimeType,
} from "./uploads";

// Reexportado para quem já importa daqui; a definição vive em uploads.ts, que
// o navegador também consegue carregar.
export * from "./uploads";

// Armazenamento de anexos em disco, num volume nomeado do Docker.
//
// Fica isolado atrás desta interface de propósito: trocar por S3, MinIO ou
// Supabase Storage no futuro é reescrever este arquivo, e nada mais.

export interface StoredFile {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadRejection {
  filename: string;
  reason: string;
}

/**
 * Nome no disco derivado de bytes aleatórios, nunca do nome enviado.
 *
 * O nome original vai para o banco e é usado só na hora de exibir/baixar.
 * Assim nada que o usuário digite chega ao sistema de arquivos — some a
 * classe inteira de ataques de travessia de caminho ("../../etc/passwd").
 */
function newStorageKey(mimeType: string): string {
  const ext =
    {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/heic": ".heic",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
      "text/csv": ".csv",
    }[mimeType] ?? ".bin";

  const now = new Date();
  const pasta = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${pasta}/${randomBytes(16).toString("hex")}${ext}`;
}

export function resolveStoragePath(storageKey: string): string {
  // Defesa em profundidade: mesmo com as chaves sendo geradas por nós, uma
  // vinda corrompida do banco não pode escapar do diretório de uploads.
  const base = path.resolve(env.UPLOAD_DIR);
  const full = path.resolve(base, storageKey);
  if (!full.startsWith(base + path.sep) && full !== base) {
    throw new Error("Caminho de anexo inválido.");
  }
  return full;
}

/**
 * Grava os arquivos aceitos e devolve, junto, os que foram recusados — para a
 * tela poder dizer exatamente qual arquivo não passou e por quê, em vez de
 * falhar o envio inteiro em silêncio.
 */
export async function storeUploads(
  files: File[],
): Promise<{ stored: StoredFile[]; rejected: UploadRejection[] }> {
  const stored: StoredFile[] = [];
  const rejected: UploadRejection[] = [];

  for (const file of files.slice(0, MAX_FILES_PER_UPLOAD)) {
    if (file.size === 0) continue;

    if (!isAllowedMimeType(file.type)) {
      rejected.push({ filename: file.name, reason: "tipo de arquivo não aceito" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({
        filename: file.name,
        reason: `${humanSize(file.size)} — o limite é ${humanSize(MAX_FILE_BYTES)}`,
      });
      continue;
    }

    const storageKey = newStorageKey(file.type);
    const destino = resolveStoragePath(storageKey);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(await file.arrayBuffer()));

    stored.push({
      storageKey,
      // Só o nome do arquivo, sem caminho: alguns navegadores enviam o
      // caminho completo, e ele não interessa nem deve ser exibido.
      filename: path.basename(file.name).slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
    });
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    rejected.push({
      filename: `+${files.length - MAX_FILES_PER_UPLOAD} arquivo(s)`,
      reason: `máximo de ${MAX_FILES_PER_UPLOAD} por envio`,
    });
  }

  return { stored, rejected };
}

export async function deleteUpload(storageKey: string): Promise<void> {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch {
    // Arquivo já ausente não é erro: o registro no banco é a fonte de verdade.
  }
}

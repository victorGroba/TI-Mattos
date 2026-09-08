// Regras de anexo compartilhadas entre navegador e servidor.
//
// Separado de storage.ts porque aquele importa node:fs — e o seletor de
// arquivos é um componente de cliente. Sem esta divisão, o bundle do navegador
// tentaria carregar o módulo de sistema de arquivos e o build falha.
//
// Aqui ficam só as regras (limites, tipos aceitos, formatação); lá fica a
// gravação em disco. As duas pontas validam a partir da MESMA fonte, então o
// que a tela recusa é exatamente o que o servidor recusaria.

/** 8 MB por arquivo — cabe foto de celular sem virar depósito de vídeo. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 5;

/**
 * Tipos aceitos. Lista fechada, não bloqueio de extensões perigosas: negar o
 * que se conhece deixa passar o que não se previu.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Valor do atributo `accept` do <input type="file">. */
export const ACCEPT_ATTRIBUTE = ALLOWED_MIME_TYPES.join(",");

export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

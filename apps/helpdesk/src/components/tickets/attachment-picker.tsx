"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  humanSize,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";

// Seletor de anexos com arrastar-e-soltar e pré-visualização.
//
// Mantém a própria lista em estado porque um <input type="file"> não permite
// remover um arquivo individual: a única operação nativa é substituir a seleção
// inteira. Sem isso, quem escolhesse quatro fotos e errasse uma teria de
// recomeçar.

export function AttachmentPicker({ name = "anexos" }: { name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  /**
   * O input é a fonte de verdade no envio do formulário, então a lista visível
   * é reescrita nele via DataTransfer a cada mudança.
   */
  function sync(next: File[]) {
    const limitados = next.slice(0, MAX_FILES_PER_UPLOAD);
    const dt = new DataTransfer();
    for (const f of limitados) dt.items.add(f);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFiles(limitados);
  }

  function add(novos: FileList | null) {
    if (!novos?.length) return;
    sync([...files, ...Array.from(novos)]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-primary bg-primary-subtle"
            : "border-border-strong hover:border-primary hover:bg-surface-muted/60",
        )}
      >
        <Paperclip className="mb-2 size-5 text-subtle-foreground" />
        <p className="text-[13px] text-foreground">
          Arraste uma imagem aqui ou <span className="text-primary">clique para escolher</span>
        </p>
        <p className="mt-1 text-[11px] text-subtle-foreground">
          Print da tela ajuda muito · até {MAX_FILES_PER_UPLOAD} arquivos de{" "}
          {humanSize(MAX_FILE_BYTES)}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />

      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((file, i) => {
            const imagem = file.type.startsWith("image/");
            return (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-1.5"
              >
                {imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="size-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-surface-muted">
                    <FileText className="size-4 text-subtle-foreground" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">
                    {file.name}
                  </span>
                  <span className="block text-[11px] text-subtle-foreground">
                    {humanSize(file.size)}
                    {file.size > MAX_FILE_BYTES && (
                      <span className="text-danger"> · acima do limite</span>
                    )}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sync(files.filter((_, idx) => idx !== i));
                  }}
                  className="rounded p-1 text-subtle-foreground transition-colors hover:bg-surface-muted hover:text-danger"
                  aria-label={`Remover ${file.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Ícone por tipo, usado também na exibição dos anexos já salvos. */
export function AttachmentIcon({ mimeType }: { mimeType: string }) {
  return mimeType.startsWith("image/") ? (
    <ImageIcon className="size-4" />
  ) : (
    <FileText className="size-4" />
  );
}

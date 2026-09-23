"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/lib/image-resize";
import { MAX_FILES_PER_UPLOAD, humanSize } from "@/lib/uploads";

// Fotos no formulário de cadastro.
//
// Dois botões, não um: "Tirar foto" abre a câmera traseira direto (o
// atributo `capture`), que é o caminho de quem está diante da máquina com o
// celular; "Da galeria" serve a quem já fotografou antes ou está no
// computador. As fotos são reduzidas no aparelho antes de entrar no
// formulário.

export function PhotoPicker({ name = "fotos" }: { name?: string }) {
  // O input que vai no envio. Os dois de escolha só alimentam a lista.
  const formInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Array<{ file: File; url: string }>>([]);
  const [processing, setProcessing] = useState(false);

  function sync(next: Array<{ file: File; url: string }>) {
    const dt = new DataTransfer();
    for (const f of next) dt.items.add(f.file);
    if (formInput.current) formInput.current.files = dt.files;
    setFiles(next);
  }

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setProcessing(true);
    const espaco = MAX_FILES_PER_UPLOAD - files.length;
    const escolhidos = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, espaco);
    const reduzidos = await Promise.all(escolhidos.map(shrinkImage));
    sync([...files, ...reduzidos.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setProcessing(false);
  }

  function remove(index: number) {
    URL.revokeObjectURL(files[index]!.url);
    sync(files.filter((_, i) => i !== index));
  }

  const cheio = files.length >= MAX_FILES_PER_UPLOAD;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {files.map((f, i) => (
          <div
            key={f.url}
            className="group relative aspect-square overflow-hidden rounded-md border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt="" className="size-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                capa
              </span>
            )}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
              {humanSize(f.file.size)}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-danger"
              aria-label="Remover foto"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {!cheio && (
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={processing}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-primary hover:bg-primary-subtle hover:text-primary disabled:opacity-60"
          >
            {processing ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
            <span className="text-[12px] font-medium">
              {processing ? "Preparando…" : files.length === 0 ? "Tirar foto" : "Mais uma"}
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!cheio && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => galleryInput.current?.click()}
            disabled={processing}
          >
            <ImagePlus />
            Da galeria
          </Button>
        )}
        <span className="text-[11px] text-subtle-foreground">
          Frente da máquina primeiro — ela vira a capa. Depois, a etiqueta de série.
          Até {MAX_FILES_PER_UPLOAD} fotos.
        </span>
      </div>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <input ref={formInput} type="file" name={name} multiple className="hidden" />
    </div>
  );
}

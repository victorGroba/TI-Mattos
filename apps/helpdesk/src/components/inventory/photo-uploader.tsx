"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addPhotosAction, type PhotoState } from "@/app/(app)/inventario/actions";
import { shrinkImage } from "@/lib/image-resize";
import { MAX_FILES_PER_UPLOAD } from "@/lib/uploads";

// Acrescentar fotos a um equipamento já cadastrado.
//
// Envia assim que a foto é escolhida, sem botão de confirmar: quem está com o
// celular apontado para a máquina quer tirar e seguir, e um passo a mais é o
// que faz a foto não ser tirada.

export function PhotoUploader({ assetId }: { assetId: number }) {
  const [state, action] = useActionState<PhotoState, FormData>(addPhotosAction, {});
  const [pending, startTransition] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const shown = useRef<PhotoState | null>(null);

  useEffect(() => {
    if (state === shown.current) return;
    shown.current = state;
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  async function send(list: FileList | null) {
    if (!list?.length) return;
    setPreparing(true);
    const fotos = await Promise.all(
      Array.from(list)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, MAX_FILES_PER_UPLOAD)
        .map(shrinkImage),
    );
    setPreparing(false);
    if (fotos.length === 0) return;

    const fd = new FormData();
    fd.set("id", String(assetId));
    for (const f of fotos) fd.append("fotos", f);
    startTransition(() => action(fd));
  }

  const busy = pending || preparing;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => camera.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        {preparing ? "Preparando…" : pending ? "Enviando…" : "Tirar foto"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => gallery.current?.click()}
        disabled={busy}
      >
        <ImagePlus />
        Da galeria
      </Button>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void send(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void send(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

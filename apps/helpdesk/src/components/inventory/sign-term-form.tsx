"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signTermAction, type SignState } from "@/app/(app)/termos/actions";
import { SignaturePad } from "./signature-pad";

// Aceite do termo: marcar que leu, desenhar a assinatura, confirmar. O botão
// só libera com as duas coisas feitas — é mais claro que deixar clicar e
// depois explicar o que faltou.

function Confirmar({ pronto, pending }: { pronto: boolean; pending: boolean }) {
  return (
    <Button type="submit" disabled={!pronto || pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="animate-spin" /> : <PenLine />}
      {pending ? "Registrando…" : "Assinar termo"}
    </Button>
  );
}

export function SignTermForm({
  termId,
  bodyHash,
  signerName,
}: {
  termId: number;
  bodyHash: string;
  signerName: string;
}) {
  const [state, action, actionPending] = useActionState<SignState, FormData>(signTermAction, {});
  const [transitionPending, startTransition] = useTransition();
  const [assinado, setAssinado] = useState(false);
  const [aceite, setAceite] = useState(false);
  const avisado = useRef(false);

  useEffect(() => {
    if (state.ok && !avisado.current) {
      avisado.current = true;
      toast.success("Termo assinado. Obrigado!");
    }
  }, [state]);

  return (
    // onSubmit em vez de <form action>: o reset automático do React apagaria
    // a assinatura do campo oculto após um erro, com o desenho ainda visível
    // no quadro — e o reenvio sairia vazio.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="bodyHash" value={bodyHash} />

      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5">
        <input
          type="checkbox"
          name="aceite"
          value="on"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span className="text-[13px] leading-relaxed text-foreground">
          Eu, <strong className="font-semibold">{signerName}</strong>, li o termo acima e concordo
          com as condições de guarda e uso do equipamento.
        </span>
      </label>

      <SignaturePad name="assinatura" onChange={setAssinado} />

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Confirmar pronto={assinado && aceite} pending={actionPending || transitionPending} />
        <p className="text-[11px] leading-snug text-subtle-foreground">
          Ficam registrados a data, a hora, o endereço IP e o navegador usados na assinatura.
        </p>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { addCommentAction, type FormState } from "@/app/(app)/chamados/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Send />
      {pending ? "Enviando…" : "Responder"}
    </Button>
  );
}

export function ReplyForm({
  ticketId,
  canPostInternal,
}: {
  ticketId: number;
  canPostInternal: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(addCommentAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  // Limpa o campo só depois que a action volta sem erro. Limpar no submit
  // faria a pessoa perder o texto se o envio falhasse.
  useEffect(() => {
    if (!submittedRef.current) return;
    if (state.error) {
      toast.error(state.error);
    } else {
      formRef.current?.reset();
    }
    submittedRef.current = false;
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => {
        submittedRef.current = true;
      }}
      className="space-y-2.5"
    >
      <input type="hidden" name="ticketId" value={ticketId} />

      <Textarea
        name="body"
        required
        rows={4}
        placeholder="Escreva sua resposta…"
        aria-label="Resposta"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />

        {canPostInternal && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name="internal"
              className="size-3.5 accent-[var(--warning)]"
            />
            <Lock className="size-3.5" />
            Nota interna (o solicitante não vê)
          </label>
        )}
      </div>
    </form>
  );
}

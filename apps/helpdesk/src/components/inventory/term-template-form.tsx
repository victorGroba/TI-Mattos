"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { AdminState } from "@/app/(app)/admin/actions";
import { saveTermTemplateAction } from "@/app/(app)/inventario/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { ConfirmSubmit } from "./client-buttons";

export function TermTemplateForm({ template, padrao }: { template: string; padrao: boolean }) {
  const [state, action, actionPending] = useActionState<AdminState, FormData>(saveTermTemplateAction, {});
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const ultimoOk = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.ok && state.ok !== ultimoOk.current) {
      ultimoOk.current = state.ok;
      toast.success(state.ok);
    }
  }, [state]);

  return (
    // onSubmit, não <form action>: o reset automático do React apagaria as
    // edições do texto quando a validação recusasse o modelo.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // O submitter entra no FormData: é por ele que o servidor distingue
        // "salvar" de "restaurar padrão".
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => action(fd));
      }}
      className="space-y-4"
    >
      {/* key: depois de salvar ou restaurar, o campo remonta com o texto que
          veio do servidor em vez de manter o que estava digitado. */}
      <Field label="Texto do termo" htmlFor="template" error={state.fieldErrors?.template}>
        <Textarea
          key={template}
          id="template"
          name="template"
          required
          defaultValue={template}
          rows={28}
          className="font-mono text-[13px] leading-relaxed"
        />
      </Field>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar modelo"}
        </Button>
        {!padrao && (
          <ConfirmSubmit
            message="Voltar ao modelo padrão? O texto personalizado será descartado."
            variant="ghost"
            size="sm"
            name="restaurar"
            value="1"
            // Pula o `required` do texto: restaurar não depende do que está digitado.
            formNoValidate
            disabled={pending}
          >
            Restaurar padrão
          </ConfirmSubmit>
        )}
      </div>
    </form>
  );
}

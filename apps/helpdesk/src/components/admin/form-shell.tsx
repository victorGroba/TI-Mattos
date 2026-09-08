"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminState } from "@/app/(app)/admin/actions";

// Casca comum dos formulários de cadastro: estado da action, mensagem de erro
// e botão de envio. Sem isso, as três telas de administração repetiriam o mesmo
// bloco de useActionState e tratamento de erro — e divergiriam com o tempo.

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  // useFormStatus só enxerga o <form> pai, por isso o botão precisa ser um
  // componente separado.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function FormShell({
  action,
  submitLabel = "Salvar",
  pendingLabel = "Salvando…",
  /** Limpa os campos após sucesso — usado nos formulários de criação. */
  resetOnSuccess = false,
  secondary,
  children,
}: {
  action: (prev: AdminState, formData: FormData) => Promise<AdminState>;
  submitLabel?: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  secondary?: ReactNode;
  children: (state: AdminState) => ReactNode;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const lastOk = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.ok && state.ok !== lastOk.current) {
      lastOk.current = state.ok;
      toast.success(state.ok);
      if (resetOnSuccess) formRef.current?.reset();
    }
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {children(state)}

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
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        {secondary}
      </div>
    </form>
  );
}

/** Caixa de seleção com rótulo, no mesmo espaçamento dos demais campos. */
export function Checkbox({
  name,
  label,
  hint,
  defaultChecked = true,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      {/* Um checkbox desmarcado não é enviado pelo navegador, então a action
          testa presença ("on") em vez de ausência — sem campo escondido, cuja
          ordem no FormData mudaria o valor lido. */}
      <input
        type="checkbox"
        name={name}
        value="on"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-3.5 accent-[var(--primary)]"
      />
      <span>
        <span className="block text-[13px] text-foreground">{label}</span>
        {hint && (
          <span className="block text-[11px] text-subtle-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

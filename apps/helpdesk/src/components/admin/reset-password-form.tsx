"use client";

import { resetPasswordAction } from "@/app/(app)/admin/actions";
import { Field, Input } from "@/components/ui/field";
import { FormShell } from "./form-shell";

/**
 * Redefinição de senha pelo administrador. Não existe fluxo de "esqueci minha
 * senha" por e-mail ainda, então este é o caminho oficial — e por isso fica
 * visível na ficha do usuário, não escondido.
 */
export function ResetPasswordForm({ userId }: { userId: number }) {
  return (
    <FormShell
      action={resetPasswordAction}
      submitLabel="Redefinir senha"
      pendingLabel="Redefinindo…"
      resetOnSuccess
    >
      {() => (
        <>
          <input type="hidden" name="id" value={userId} />
          <Field
            label="Nova senha"
            htmlFor="new-password"
            required
            hint="Mínimo de 8 caracteres. Passe para a pessoa por um canal seguro — o sistema não envia a senha."
          >
            <Input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
        </>
      )}
    </FormShell>
  );
}

"use client";

import { Field, Input } from "@/components/ui/field";
import { createTeamAction, updateTeamAction } from "@/app/(app)/admin/actions";
import { Checkbox, FormShell } from "./form-shell";

export interface TeamFormValues {
  id?: number;
  name?: string;
  email?: string | null;
  description?: string | null;
  active?: boolean;
}

export function TeamForm({ values = {} }: { values?: TeamFormValues }) {
  const editing = values.id !== undefined;

  return (
    <FormShell
      action={editing ? updateTeamAction : createTeamAction}
      submitLabel={editing ? "Salvar" : "Criar setor"}
      resetOnSuccess={!editing}
    >
      {(state) => (
        <>
          {editing && <input type="hidden" name="id" value={values.id} />}

          <Field label="Nome" htmlFor={`name-${values.id ?? "novo"}`} required error={state.fieldErrors?.name}>
            <Input
              id={`name-${values.id ?? "novo"}`}
              name="name"
              required
              defaultValue={values.name ?? ""}
              placeholder="Ex.: Qualidade"
            />
          </Field>

          <Field
            label="E-mail do setor"
            htmlFor={`email-${values.id ?? "novo"}`}
            error={state.fieldErrors?.email}
            hint="Recebe aviso de chamado novo direcionado ao setor."
          >
            <Input
              id={`email-${values.id ?? "novo"}`}
              name="email"
              type="email"
              defaultValue={values.email ?? ""}
            />
          </Field>

          <Field label="Descrição" htmlFor={`desc-${values.id ?? "novo"}`}>
            <Input
              id={`desc-${values.id ?? "novo"}`}
              name="description"
              defaultValue={values.description ?? ""}
            />
          </Field>

          <Checkbox
            name="active"
            label="Setor ativo"
            hint="Inativo some das listas de abertura, mas o histórico continua."
            defaultChecked={values.active ?? true}
          />
        </>
      )}
    </FormShell>
  );
}

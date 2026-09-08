"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { typeLabels, typeOrder } from "@/lib/labels";
import type { TicketType } from "@/generated/prisma/enums";
import { createCategoryAction, updateCategoryAction } from "@/app/(app)/admin/actions";
import { Checkbox, FormShell } from "./form-shell";

export interface CategoryFormValues {
  id?: number;
  name?: string;
  teamId?: number | null;
  defaultType?: TicketType;
  description?: string | null;
  active?: boolean;
}

export function CategoryForm({
  teams,
  values = {},
}: {
  teams: Array<{ id: number; name: string }>;
  values?: CategoryFormValues;
}) {
  const editing = values.id !== undefined;
  const uid = values.id ?? "novo";

  return (
    <FormShell
      action={editing ? updateCategoryAction : createCategoryAction}
      submitLabel={editing ? "Salvar" : "Criar categoria"}
      resetOnSuccess={!editing}
    >
      {(state) => (
        <>
          {editing && <input type="hidden" name="id" value={values.id} />}

          <Field label="Nome" htmlFor={`cname-${uid}`} required error={state.fieldErrors?.name}>
            <Input
              id={`cname-${uid}`}
              name="name"
              required
              defaultValue={values.name ?? ""}
              placeholder="Ex.: Infraestrutura"
            />
          </Field>

          <Field
            label="Setor que atende"
            htmlFor={`cteam-${uid}`}
            hint="É isto que faz o chamado cair no time certo sem triagem manual."
          >
            <Select
              id={`cteam-${uid}`}
              name="teamId"
              defaultValue={values.teamId ? String(values.teamId) : ""}
            >
              <option value="">Definir na triagem</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tipo padrão" htmlFor={`ctype-${uid}`}>
            <Select
              id={`ctype-${uid}`}
              name="defaultType"
              defaultValue={values.defaultType ?? "SUPPORT"}
            >
              {typeOrder.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Descrição" htmlFor={`cdesc-${uid}`}>
            <Input
              id={`cdesc-${uid}`}
              name="description"
              defaultValue={values.description ?? ""}
            />
          </Field>

          <Checkbox
            name="active"
            label="Categoria ativa"
            defaultChecked={values.active ?? true}
          />
        </>
      )}
    </FormShell>
  );
}

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { roleDescriptions, roleLabels } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";
import { createUserAction, updateUserAction } from "@/app/(app)/admin/actions";
import { Checkbox, FormShell } from "./form-shell";

const ROLES: Role[] = ["USER", "ADMIN"];

export interface UserFormValues {
  id?: number;
  name?: string;
  email?: string;
  role?: Role;
  teamId?: number | null;
  phone?: string | null;
  active?: boolean;
}

export function UserForm({
  teams,
  values = {},
}: {
  teams: Array<{ id: number; name: string }>;
  values?: UserFormValues;
}) {
  const editing = values.id !== undefined;

  return (
    <FormShell
      action={editing ? updateUserAction : createUserAction}
      submitLabel={editing ? "Salvar alterações" : "Criar usuário"}
      resetOnSuccess={!editing}
      secondary={
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/usuarios">Voltar</Link>
        </Button>
      }
    >
      {(state) => (
        <>
          {editing && <input type="hidden" name="id" value={values.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name" required error={state.fieldErrors?.name}>
              <Input id="name" name="name" required defaultValue={values.name ?? ""} />
            </Field>

            <Field
              label="E-mail"
              htmlFor="email"
              required
              error={state.fieldErrors?.email}
              hint="É com ele que a pessoa entra no sistema."
            >
              <Input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={values.email ?? ""}
              />
            </Field>
          </div>

          {!editing && (
            <Field
              label="Senha inicial"
              htmlFor="password"
              required
              error={state.fieldErrors?.password}
              hint="Mínimo de 8 caracteres. Combine com a pessoa para ela trocar depois."
            >
              <Input id="password" name="password" type="password" required minLength={8} />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Papel"
              htmlFor="role"
              hint={roleDescriptions[values.role ?? "USER"]}
            >
              <Select id="role" name="role" defaultValue={values.role ?? "USER"}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Setor" htmlFor="teamId">
              <Select
                id="teamId"
                name="teamId"
                defaultValue={values.teamId ? String(values.teamId) : ""}
              >
                <option value="">Sem setor</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Telefone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values.phone ?? ""} />
          </Field>

          <Checkbox
            name="active"
            label="Conta ativa"
            hint="Desativar bloqueia o acesso sem apagar o histórico de chamados."
            defaultChecked={values.active ?? true}
          />
        </>
      )}
    </FormShell>
  );
}

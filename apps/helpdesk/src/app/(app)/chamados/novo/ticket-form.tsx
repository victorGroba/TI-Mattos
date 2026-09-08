"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  priorityLabels,
  priorityOrder,
  projectTypes,
  typeLabels,
  typeOrder,
} from "@/lib/labels";
import { createTicketAction, type FormState } from "../actions";

export interface FormOptions {
  teams: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; teamId: number | null }>;
  projects: Array<{ id: number; name: string; key: string }>;
  agents: Array<{ id: number; name: string }>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Send />
      {pending ? "Abrindo…" : "Abrir chamado"}
    </Button>
  );
}

export function TicketForm({
  options,
  isAdmin,
}: {
  options: FormOptions;
  isAdmin: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(createTicketAction, {});

  const [type, setType] = useState<string>("SUPPORT");
  const [categoryId, setCategoryId] = useState<string>("");

  // O setor segue a categoria por padrão, mas continua editável: a maioria dos
  // chamados vai para o time certo sem ninguém pensar, e a exceção ainda é
  // possível sem precisar de outra tela.
  const categoryTeam = options.categories.find(
    (c) => String(c.id) === categoryId,
  )?.teamId;

  const showProject = projectTypes.includes(type as never);

  return (
    <form action={action} className="space-y-5">
      <Field
        label="Tipo de pedido"
        htmlFor="type"
        hint={
          showProject
            ? "Demandas de projeto entram na fila de planejamento, com prazo de calendário."
            : "Suporte e incidentes seguem o SLA de atendimento, em horário útil."
        }
      >
        <Select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {typeOrder.map((t) => (
            <option key={t} value={t}>
              {typeLabels[t]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Assunto"
        htmlFor="title"
        required
        error={state.fieldErrors?.title}
        hint="Uma frase que resuma o pedido, como você diria para um colega."
      >
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="Ex.: Impressora da recepção não imprime em rede"
        />
      </Field>

      <Field
        label="Descrição"
        htmlFor="description"
        required
        error={state.fieldErrors?.description}
        hint="O que acontece, desde quando, e o que já foi tentado."
      >
        <Textarea
          id="description"
          name="description"
          required
          rows={7}
          placeholder="Descreva o problema ou a mudança desejada com o máximo de detalhe possível."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="categoryId">
          <Select
            id="categoryId"
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Não sei / outra</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Setor responsável"
          htmlFor="teamId"
          hint={
            categoryTeam
              ? "Preenchido pela categoria — pode trocar se souber o setor certo."
              : undefined
          }
        >
          <Select
            id="teamId"
            name="teamId"
            key={categoryTeam ?? "sem-categoria"}
            defaultValue={categoryTeam ? String(categoryTeam) : ""}
          >
            <option value="">Definir na triagem</option>
            {options.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {showProject && options.projects.length > 0 && (
        <Field
          label="Projeto"
          htmlFor="projectId"
          hint="Vincular ao projeto é o que faz a demanda aparecer nos relatórios de entrega."
        >
          <Select id="projectId" name="projectId" defaultValue="">
            <option value="">Sem projeto</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} — {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridade" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue="MEDIUM">
              {priorityOrder.map((p) => (
                <option key={p} value={p}>
                  {priorityLabels[p]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Responsável" htmlFor="assigneeId">
            <Select id="assigneeId" name="assigneeId" defaultValue="">
              <option value="">Sem responsável ainda</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {/* Usuário comum não escolhe prioridade — o servidor também ignora se
          vier no formulário, mas mandar o padrão mantém o payload coerente. */}
      {!isAdmin && <input type="hidden" name="priority" value="MEDIUM" />}

      {state.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <SubmitButton />
        <Button asChild variant="ghost">
          <Link href="/meus-chamados">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

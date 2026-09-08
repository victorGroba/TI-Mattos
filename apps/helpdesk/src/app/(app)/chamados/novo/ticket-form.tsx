"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowRight, Lightbulb, LifeBuoy, TriangleAlert } from "lucide-react";
import type { TicketType } from "@/generated/prisma/enums";
import { AttachmentPicker } from "@/components/tickets/attachment-picker";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { createTicketAction, type FormState } from "../actions";

// Abertura de chamado.
//
// Quatro campos, nesta ordem: o que é, o assunto, o detalhe e o anexo.
//
// Ficaram de fora, de propósito:
//   - Setor responsável — é sempre a TI, e o setor de quem pede já está no
//     cadastro. Perguntar seria pedir que a pessoa adivinhasse a estrutura.
//   - Prioridade — perguntada ao solicitante, vira sempre "urgente" e deixa de
//     ordenar qualquer coisa. Nasce média e a triagem ajusta.
//   - Projeto e categoria — classificação, decidida por quem atende.
//
// Esta tela é o oposto das telas de operação: quem abre um chamado entra aqui
// uma vez por mês, então cabe respiro e texto explicativo, e não densidade.

interface Opcao {
  value: TicketType;
  icone: typeof LifeBuoy;
  titulo: string;
  descricao: string;
}

const OPCOES: Opcao[] = [
  {
    value: "INCIDENT",
    icone: TriangleAlert,
    titulo: "Algo parou de funcionar",
    descricao: "Impressora, sistema, internet, telefone — algo que funcionava e parou.",
  },
  {
    value: "SUPPORT",
    icone: LifeBuoy,
    titulo: "Preciso de ajuda ou acesso",
    descricao: "Liberar uma pasta, criar usuário, instalar programa, tirar uma dúvida.",
  },
  {
    value: "IMPROVEMENT",
    icone: Lightbulb,
    titulo: "Tenho uma ideia ou pedido",
    descricao: "Uma melhoria num sistema, um relatório novo, uma mudança de processo.",
  },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="min-w-40">
      {pending ? "Enviando…" : "Abrir chamado"}
      {!pending && <ArrowRight />}
    </Button>
  );
}

export function TicketForm({ setorDoUsuario }: { setorDoUsuario: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(createTicketAction, {});
  const [tipo, setTipo] = useState<TicketType>("INCIDENT");

  return (
    <form action={action} className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-[13px] font-medium text-foreground">
          Do que você precisa?
        </legend>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {OPCOES.map((opcao) => {
            const Icone = opcao.icone;
            const ativo = tipo === opcao.value;
            return (
              <label
                key={opcao.value}
                className={cn(
                  "flex cursor-pointer flex-col rounded-lg border p-3.5 transition-colors",
                  ativo
                    ? "border-primary bg-primary-subtle"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={opcao.value}
                  checked={ativo}
                  onChange={() => setTipo(opcao.value)}
                  className="sr-only"
                />
                <Icone
                  className={cn(
                    "mb-2 size-5",
                    ativo ? "text-primary-subtle-foreground" : "text-subtle-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    ativo ? "text-primary-subtle-foreground" : "text-foreground",
                  )}
                >
                  {opcao.titulo}
                </span>
                <span className="mt-1 text-[12px] leading-snug text-muted-foreground">
                  {opcao.descricao}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="title" className="text-[13px] font-medium text-foreground">
          Assunto
        </Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          className="h-10"
          placeholder={
            tipo === "INCIDENT"
              ? "Ex.: Impressora da recepção não imprime"
              : tipo === "SUPPORT"
                ? "Ex.: Liberar acesso à pasta de resultados"
                : "Ex.: Incluir o número do lote no laudo"
          }
        />
        {state.fieldErrors?.title && (
          <p className="text-xs text-danger">{state.fieldErrors.title}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-[13px] font-medium text-foreground">
          Conte o que está acontecendo
        </Label>
        <p className="text-[12px] text-muted-foreground">
          Quanto mais detalhe, menos idas e vindas. Se possível: desde quando
          acontece, em qual computador, e o que você já tentou.
        </p>
        <Textarea
          id="description"
          name="description"
          required
          rows={6}
          className="leading-relaxed"
          placeholder="Descreva com suas palavras…"
        />
        {state.fieldErrors?.description && (
          <p className="text-xs text-danger">{state.fieldErrors.description}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] font-medium text-foreground">
          Anexos <span className="font-normal text-subtle-foreground">(opcional)</span>
        </Label>
        <AttachmentPicker />
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state.rejected && state.rejected.length > 0 && (
        <div className="rounded-md bg-warning-subtle px-3 py-2 text-[12px] text-warning">
          <p className="font-medium">Alguns arquivos não foram enviados:</p>
          <ul className="mt-1 space-y-0.5">
            {state.rejected.map((r, i) => (
              <li key={i}>
                {r.filename} — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-[12px] text-muted-foreground">
          {setorDoUsuario ? (
            <>
              Será registrado em nome do setor{" "}
              <span className="text-foreground">{setorDoUsuario}</span> e enviado para a TI.
            </>
          ) : (
            <>O chamado será enviado para a TI.</>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/meus-chamados">Cancelar</Link>
          </Button>
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}

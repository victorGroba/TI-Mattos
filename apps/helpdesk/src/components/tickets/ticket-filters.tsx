"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { Input, Select } from "@/components/ui/field";
import {
  priorityLabels,
  priorityOrder,
  statusLabels,
  statusOrder,
  typeLabels,
  typeOrder,
} from "@/lib/labels";

export interface FilterOptions {
  teams: Array<{ id: number; name: string }>;
  agents: Array<{ id: number; name: string }>;
}

export interface ActiveFilters {
  status?: string;
  setor?: string;
  tipo?: string;
  prioridade?: string;
  responsavel?: string;
  q?: string;
  atraso?: string;
}

/**
 * Filtros como formulário GET: o estado vive na URL, então a lista filtrada é
 * um link que a pessoa pode mandar para o colega, e o botão voltar funciona.
 * Nada aqui guarda estado em React.
 */
export function TicketFilters({
  options,
  active,
  showAssignee = true,
}: {
  options: FilterOptions;
  active: ActiveFilters;
  showAssignee?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  // Mudar um <select> aplica o filtro na hora; a busca por texto espera o
  // Enter, para não recarregar a cada letra digitada.
  const submit = () => formRef.current?.requestSubmit();

  const hasAny = Object.entries(active).some(([, v]) => v);

  return (
    <form
      ref={formRef}
      action="/chamados"
      method="get"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input
          name="q"
          defaultValue={active.q ?? ""}
          placeholder="Buscar por título, descrição ou número"
          className="pl-8"
          aria-label="Buscar chamados"
        />
      </div>

      <Select
        name="status"
        defaultValue={active.status ?? ""}
        onChange={submit}
        aria-label="Status"
        className="w-auto min-w-[9rem]"
      >
        <option value="">Todos os status</option>
        <option value="abertos">Somente em aberto</option>
        {statusOrder.map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </Select>

      <Select
        name="setor"
        defaultValue={active.setor ?? ""}
        onChange={submit}
        aria-label="Setor"
        className="w-auto min-w-[8rem]"
      >
        <option value="">Todos os setores</option>
        {options.teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </Select>

      <Select
        name="tipo"
        defaultValue={active.tipo ?? ""}
        onChange={submit}
        aria-label="Tipo"
        className="w-auto min-w-[8rem]"
      >
        <option value="">Todos os tipos</option>
        {typeOrder.map((type) => (
          <option key={type} value={type}>
            {typeLabels[type]}
          </option>
        ))}
      </Select>

      <Select
        name="prioridade"
        defaultValue={active.prioridade ?? ""}
        onChange={submit}
        aria-label="Prioridade"
        className="w-auto min-w-[7rem]"
      >
        <option value="">Prioridade</option>
        {priorityOrder.map((priority) => (
          <option key={priority} value={priority}>
            {priorityLabels[priority]}
          </option>
        ))}
      </Select>

      {showAssignee && (
        <Select
          name="responsavel"
          defaultValue={active.responsavel ?? ""}
          onChange={submit}
          aria-label="Responsável"
          className="w-auto min-w-[9rem]"
        >
          <option value="">Qualquer responsável</option>
          <option value="ninguem">Sem responsável</option>
          {options.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
      )}

      {active.atraso && <input type="hidden" name="atraso" value={active.atraso} />}

      {hasAny && (
        <Link
          href="/chamados"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <X className="size-3.5" />
          Limpar
        </Link>
      )}
    </form>
  );
}

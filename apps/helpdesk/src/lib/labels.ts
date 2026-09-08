import type {
  Priority,
  ProjectStatus,
  Role,
  TicketSource,
  TicketStatus,
  TicketType,
} from "@/generated/prisma/enums";

// Tradução e cor de cada enum, num lugar só. Os enums ficam em inglês no banco
// (padrão do Prisma, e o que a API entrega para o n8n); a tela é toda em
// português. Manter as duas coisas separadas evita ter que migrar dado quando
// alguém quiser renomear um rótulo.

/** Chaves das cores semânticas definidas em globals.css. */
export type Tone = "neutral" | "info" | "primary" | "warning" | "danger" | "success" | "accent";

export const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-subtle text-neutral",
  info: "bg-info-subtle text-info",
  primary: "bg-primary-subtle text-primary-subtle-foreground",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  success: "bg-success-subtle text-success",
  accent: "bg-accent-subtle text-accent",
};

// ---------- Status ----------

export const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Aberto",
  TRIAGED: "Triado",
  IN_PROGRESS: "Em andamento",
  WAITING_REQUESTER: "Aguardando solicitante",
  WAITING_THIRD_PARTY: "Aguardando terceiro",
  IN_REVIEW: "Em validação",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
};

export const statusTones: Record<TicketStatus, Tone> = {
  OPEN: "info",
  TRIAGED: "info",
  IN_PROGRESS: "primary",
  WAITING_REQUESTER: "warning",
  WAITING_THIRD_PARTY: "warning",
  IN_REVIEW: "accent",
  RESOLVED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

/** Ordem de exibição em filtros e quadros — segue o ciclo de vida real. */
export const statusOrder: TicketStatus[] = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING_REQUESTER",
  "WAITING_THIRD_PARTY",
  "IN_REVIEW",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
];

/** Status considerados "em aberto" nos contadores do painel. */
export const activeStatuses: TicketStatus[] = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING_REQUESTER",
  "WAITING_THIRD_PARTY",
  "IN_REVIEW",
];

// ---------- Prioridade ----------

export const priorityLabels: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const priorityTones: Record<Priority, Tone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export const priorityOrder: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

// ---------- Tipo ----------

export const typeLabels: Record<TicketType, string> = {
  SUPPORT: "Suporte",
  INCIDENT: "Incidente",
  CHANGE_REQUEST: "Demanda de projeto",
  IMPROVEMENT: "Melhoria",
  TASK: "Tarefa",
};

export const typeTones: Record<TicketType, Tone> = {
  SUPPORT: "info",
  INCIDENT: "danger",
  CHANGE_REQUEST: "accent",
  IMPROVEMENT: "primary",
  TASK: "neutral",
};

export const typeOrder: TicketType[] = [
  "SUPPORT",
  "INCIDENT",
  "CHANGE_REQUEST",
  "IMPROVEMENT",
  "TASK",
];

/** Tipos que representam trabalho de projeto, não atendimento de suporte. */
export const projectTypes: TicketType[] = ["CHANGE_REQUEST", "IMPROVEMENT", "TASK"];

// ---------- Papel ----------

export const roleLabels: Record<Role, string> = {
  ADMIN: "Administrador",
  USER: "Usuário",
};

export const roleDescriptions: Record<Role, string> = {
  ADMIN: "Atende os chamados de todos os setores e configura o sistema",
  USER: "Abre e acompanha apenas os próprios chamados",
};

// ---------- Origem ----------

export const sourceLabels: Record<TicketSource, string> = {
  WEB: "Site",
  API: "API",
  EMAIL: "E-mail",
  N8N: "n8n",
  IMPORT: "Importação",
};

// ---------- Projeto ----------

export const projectStatusLabels: Record<ProjectStatus, string> = {
  PLANNING: "Planejamento",
  ACTIVE: "Em andamento",
  ON_HOLD: "Pausado",
  DONE: "Concluído",
  ARCHIVED: "Arquivado",
};

export const projectStatusTones: Record<ProjectStatus, Tone> = {
  PLANNING: "info",
  ACTIVE: "primary",
  ON_HOLD: "warning",
  DONE: "success",
  ARCHIVED: "neutral",
};

// ---------- SLA ----------

export const slaLabels = {
  ok: "No prazo",
  warning: "Perto do prazo",
  breached: "Fora do prazo",
  none: "Sem SLA",
} as const;

export const slaTones = {
  ok: "success",
  warning: "warning",
  breached: "danger",
  none: "neutral",
} as const satisfies Record<string, Tone>;

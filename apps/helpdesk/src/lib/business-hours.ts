// Cálculo de tempo em horário útil.
//
// É a base das métricas: "chamado aberto sexta 17h e resolvido segunda 9h"
// deve contar 2 horas, não 64. Todo o raciocínio acontece no fuso do
// calendário (America/Sao_Paulo por padrão), não no fuso do servidor — o
// container roda em UTC e não queremos que isso mude o resultado.

export type TimeWindow = [string, string]; // ["08:00", "12:00"]

/** Chaves são o dia ISO da semana: "1" = segunda ... "7" = domingo. */
export type BusinessHoursMap = Record<string, TimeWindow[]>;

export interface BusinessCalendar {
  businessHours: BusinessHoursMap;
  /** Datas "YYYY-MM-DD" no fuso do calendário. */
  holidays: string[];
  timezone: string;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursMap = {
  "1": [["08:00", "12:00"], ["13:00", "18:00"]],
  "2": [["08:00", "12:00"], ["13:00", "18:00"]],
  "3": [["08:00", "12:00"], ["13:00", "18:00"]],
  "4": [["08:00", "12:00"], ["13:00", "18:00"]],
  "5": [["08:00", "12:00"], ["13:00", "17:00"]],
};

export const DEFAULT_CALENDAR: BusinessCalendar = {
  businessHours: DEFAULT_BUSINESS_HOURS,
  holidays: [],
  timezone: "America/Sao_Paulo",
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

// Trava de segurança: um intervalo absurdo (data corrompida, ano 9999) não
// pode travar o processo num laço de milhões de dias.
const MAX_DAYS_SCANNED = 4000;

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number; // 1 = segunda ... 7 = domingo
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timezone, fmt);
  }
  return fmt;
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Quebra um instante nas partes de calendário do fuso informado. */
export function toZonedParts(date: Date, timezone: string): ZonedParts {
  const parts = formatterFor(timezone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    isoWeekday: WEEKDAY_TO_ISO[get("weekday")] ?? 1,
  };
}

/**
 * Deslocamento do fuso, em ms, no instante dado. Positivo a leste de
 * Greenwich. Derivado do próprio Intl para não embutir uma tabela de DST.
 */
function timezoneOffsetMs(date: Date, timezone: string): number {
  const p = toZonedParts(date, timezone);
  const seconds = Number(
    formatterFor(timezone)
      .formatToParts(date)
      .find((x) => x.type === "second")?.value ?? "0",
  );
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, seconds);
  // Descarta os milissegundos dos dois lados para a diferença ser só o offset.
  return asUtc - (Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * Converte uma data/hora local do fuso para o instante UTC correspondente.
 * A segunda passada corrige as bordas de horário de verão, onde o offset do
 * palpite inicial difere do offset real do resultado.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = new Date(naive - timezoneOffsetMs(new Date(naive), timezone));
  const refinedOffset = timezoneOffsetMs(firstGuess, timezone);
  return new Date(naive - refinedOffset);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function parseHhMm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Janelas de expediente de um dia, já como instantes UTC. Retorna vazio em
 * feriados e em dias sem expediente configurado.
 */
function windowsForDay(
  p: { year: number; month: number; day: number; isoWeekday: number },
  calendar: BusinessCalendar,
): Array<[number, number]> {
  if (calendar.holidays.includes(dateKey(p))) return [];

  const windows = calendar.businessHours[String(p.isoWeekday)];
  if (!windows?.length) return [];

  return windows
    .map(([from, to]): [number, number] => {
      const startMin = parseHhMm(from);
      const endMin = parseHhMm(to);
      const start = zonedTimeToUtc(
        p.year,
        p.month,
        p.day,
        Math.floor(startMin / 60),
        startMin % 60,
        calendar.timezone,
      ).getTime();
      const end = zonedTimeToUtc(
        p.year,
        p.month,
        p.day,
        Math.floor(endMin / 60),
        endMin % 60,
        calendar.timezone,
      ).getTime();
      return [start, end];
    })
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
}

/** Avança as partes de calendário em um dia, sem passar por instantes UTC. */
function nextDay(p: ZonedParts, timezone: string): ZonedParts {
  const noon = zonedTimeToUtc(p.year, p.month, p.day, 12, 0, timezone);
  return toZonedParts(new Date(noon.getTime() + DAY_MS), timezone);
}

/** Minutos de expediente entre dois instantes. Zero se `end` <= `start`. */
export function businessMinutesBetween(
  start: Date,
  end: Date,
  calendar: BusinessCalendar = DEFAULT_CALENDAR,
): number {
  const from = start.getTime();
  const to = end.getTime();
  if (to <= from) return 0;

  let total = 0;
  let cursor = toZonedParts(start, calendar.timezone);
  let daysScanned = 0;

  while (daysScanned < MAX_DAYS_SCANNED) {
    const windows = windowsForDay(cursor, calendar);

    for (const [winStart, winEnd] of windows) {
      const overlapStart = Math.max(winStart, from);
      const overlapEnd = Math.min(winEnd, to);
      if (overlapEnd > overlapStart) {
        total += (overlapEnd - overlapStart) / MINUTE_MS;
      }
    }

    // Passou do fim: nenhuma janela posterior pode contribuir.
    const dayStart = zonedTimeToUtc(
      cursor.year,
      cursor.month,
      cursor.day,
      0,
      0,
      calendar.timezone,
    ).getTime();
    if (dayStart > to) break;

    cursor = nextDay(cursor, calendar.timezone);
    daysScanned += 1;
  }

  return Math.round(total);
}

/**
 * Instante em que se completam `minutes` de expediente a partir de `start`.
 * É assim que o prazo de SLA é calculado na criação do chamado.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  calendar: BusinessCalendar = DEFAULT_CALENDAR,
): Date {
  if (minutes <= 0) return new Date(start.getTime());

  let remaining = minutes;
  const from = start.getTime();
  let cursor = toZonedParts(start, calendar.timezone);
  let daysScanned = 0;

  while (daysScanned < MAX_DAYS_SCANNED) {
    for (const [winStart, winEnd] of windowsForDay(cursor, calendar)) {
      const usableStart = Math.max(winStart, from);
      if (winEnd <= usableStart) continue;

      const available = (winEnd - usableStart) / MINUTE_MS;
      if (available >= remaining) {
        return new Date(usableStart + remaining * MINUTE_MS);
      }
      remaining -= available;
    }

    cursor = nextDay(cursor, calendar.timezone);
    daysScanned += 1;
  }

  // Calendário sem nenhum expediente configurado: não há prazo possível.
  throw new Error(
    "Não foi possível calcular o prazo: o calendário não tem horário útil suficiente.",
  );
}

/** Normaliza o que vem do banco (colunas Json) para um calendário utilizável. */
export function calendarFromPolicy(policy: {
  businessHours: unknown;
  holidays: unknown;
  timezone: string;
}): BusinessCalendar {
  const hours =
    policy.businessHours && typeof policy.businessHours === "object"
      ? (policy.businessHours as BusinessHoursMap)
      : DEFAULT_BUSINESS_HOURS;

  return {
    businessHours: hours,
    holidays: Array.isArray(policy.holidays) ? (policy.holidays as string[]) : [],
    timezone: policy.timezone || "America/Sao_Paulo",
  };
}

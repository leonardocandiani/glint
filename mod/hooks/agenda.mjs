// The Apple calendar, read from the Central's database (read only). The Central syncs
// iCloud over CalDAV; glint never talks to Apple itself, and on a machine without the
// Central the block simply does not show.

export const AGENDA_DB = "central/data/central.db";
// Only the Leo's own calendars: the Central also syncs other people's, and a new one of
// theirs stays out without anyone listing it.
export const CALENDARS_DEFAULT = ["Agenda Léo", "Leonardo Candiani - Gmail"];
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const pad2 = (n) => String(n).padStart(2, "0");
const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

export function startOfDay(ms, plusDays = 0) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays).getTime();
}

export const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export function dayTitle(ms) {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]}, ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

// "8min", "1h04", "2h"
export function untilMs(ms) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h${pad2(m % 60)}` : `${h}h`;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function monthBounds(ms) {
  const d = new Date(ms);
  return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()];
}

// The sqlite3 command that reads the month (and tomorrow, when it falls in the next one).
export function agendaArgv(db, nowMs) {
  const [first, next] = monthBounds(nowMs);
  const from = Math.min(first, startOfDay(nowMs));
  const to = Math.max(next, startOfDay(nowMs, 2));
  const sql =
    "select id, inicio, fim, titulo, calendario, calendario_cor as cor, link, dia_inteiro as diaInteiro " +
    `from agenda where inicio < ${to} and coalesce(fim, inicio) >= ${from} order by inicio`;
  return ["sqlite3", "-readonly", "-json", db, sql];
}

export function parseAgenda(stdout, calendars = CALENDARS_DEFAULT) {
  const rows = stdout.trim() ? JSON.parse(stdout) : [];
  const mine = new Set(calendars.map(norm));
  return rows
    .filter((e) => mine.has(norm(e.calendario)))
    .map((e) => ({ id: e.id, start: e.inicio, end: e.fim ?? e.inicio, title: e.titulo, color: e.cor || null, link: e.link || null, allDay: Boolean(e.diaInteiro) }));
}

// What the pill and the card need: what is on now, what comes next today, the whole
// day and tomorrow.
export function agendaView(events, nowMs) {
  const today = startOfDay(nowMs);
  const tomorrow = startOfDay(nowMs, 1);
  const after = startOfDay(nowMs, 2);
  const timed = events.filter((e) => !e.allDay);
  return {
    now: timed.find((e) => e.start <= nowMs && nowMs < e.end) ?? null,
    next: timed.find((e) => e.start > nowMs) ?? null,
    tomorrowStart: tomorrow,
    today: events.filter((e) => e.start < tomorrow && e.end > today),
    tomorrow: events.filter((e) => e.start < after && e.end > tomorrow),
  };
}

// The month as a calendar, weeks from Sunday: today on the accent, a day with something
// of the Leo's in the colour of its first event, past days dim.
export function monthGrid(nowMs, events, ink) {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = d.getMonth();
  const today = d.getDate();
  const days = new Date(year, month + 1, 0).getDate();
  const busy = new Map();
  for (const e of events) {
    const s = new Date(e.start);
    if (s.getFullYear() === year && s.getMonth() === month && !busy.has(s.getDate())) busy.set(s.getDate(), e.color ?? ink.busy);
  }
  const lines = [[{ text: `${MONTHS[month]} ${year}`, fg: ink.head, bold: true }], [{ text: "D  S  T  Q  Q  S  S", fg: ink.past }]];
  let row = [{ text: "   ".repeat(new Date(year, month, 1).getDay()) }];
  for (let day = 1; day <= days; day++) {
    const label = String(day).padStart(2, " ");
    const cell = day === today ? { text: label, fg: "#ffffff", bg: ink.today, bold: true } : busy.has(day) ? { text: label, fg: busy.get(day), bold: true } : { text: label, fg: day < today ? ink.past : ink.free };
    row.push(cell);
    if (new Date(year, month, day).getDay() === 6 || day === days) {
      lines.push(row);
      row = [];
    } else row.push({ text: " " });
  }
  return lines;
}

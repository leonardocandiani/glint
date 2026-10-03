// The Apple calendar, read from the Central's database (read only). The Central syncs
// iCloud over CalDAV; glint never talks to Apple itself, and on a machine without the
// Central the block simply does not show.

export const AGENDA_DB = "central/data/central.db";
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const pad2 = (n) => String(n).padStart(2, "0");
export const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

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

// The month, plus tomorrow when it falls in the next one: what the pill and the card read.
export function agendaWindow(nowMs) {
  const [first, next] = monthBounds(nowMs);
  return [Math.min(first, startOfDay(nowMs)), Math.max(next, startOfDay(nowMs, 2))];
}

// The sqlite3 command that reads that window from the Central.
export function agendaArgv(db, nowMs) {
  const [from, to] = agendaWindow(nowMs);
  const sql =
    "select id, inicio, fim, titulo, calendario, calendario_cor as cor, link, dia_inteiro as diaInteiro " +
    `from agenda where inicio < ${to} and coalesce(fim, inicio) >= ${from} order by inicio`;
  return ["sqlite3", "-readonly", "-json", db, sql];
}

// Only the Leonardo's own calendars: the Central and iCloud also carry other people's
// (Helô's, for one), and a calendar nobody listed stays out until /glint agenda show.
export const CALENDARS_DEFAULT = ["Agenda Léo", "Leonardo Candiani - Gmail", "Rotina", "Faculdade", "Pagamentos", "Trabalho", "Freelas"];

// Which calendars show. `chosen` is the list saved with /glint agenda show|hide; without
// one, the default list above.
export const wanted = (name, chosen) => (chosen ?? CALENDARS_DEFAULT).map(norm).includes(norm(name));

// `seen`, when given, collects every calendar name in the rows, shown or not.
export function parseAgenda(stdout, chosen = null, seen = null) {
  const rows = stdout.trim() ? JSON.parse(stdout) : [];
  for (const e of rows) if (seen && e.calendario) seen.add(e.calendario);
  return rows
    .filter((e) => wanted(e.calendario, chosen))
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

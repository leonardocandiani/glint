// The calendar of this Mac read through icalBuddy (macOS EventKit): every account added
// to Calendar.app, iCloud and Google alike, with recurrences, time zones and colours
// already resolved by the system. No password and no feed address. Pure: the commands
// are described here, the $ calls that run them live in glint.mjs.

import { meetingLink } from "./caldav.mjs";

export const BUDDY = "icalBuddy";
const EVENT = "@@EV@@";
const PROP = "@@P@@";

export const calendarsArgv = () => [BUDDY, "-nc", "calendars"];

const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// One record per event, properties after the date and the title labelled ("uid: ...").
// Calendars are named so a calendar nobody listed never reaches the pill.
export function eventsArgv(names, fromMs, toMs) {
  const props = "datetime,title,location,url,notes,uid";
  return [BUDDY, "-nc", "-nrd", "-uid", "-b", EVENT, "-ps", `|${PROP}|`, "-iep", props, "-po", props, "-df", "%Y-%m-%d", "-tf", "%H:%M", "-ic", names.join(","), `eventsFrom:${ymd(fromMs)}`, `to:${ymd(toMs)}`];
}

// "• Agenda Léo\n  type: CalDAV\n  UID: ..." gives the names; subscriptions and birthdays
// carry no events of his own.
export function parseBuddyCalendars(stdout) {
  const names = [];
  for (const block of String(stdout).split(/^• /m).slice(1)) {
    const [name, ...rest] = block.split("\n");
    if (!/type:\s*(Subscription|Birthday)/i.test(rest.join("\n"))) names.push(name.replace(/\r$/, ""));
  }
  return names;
}

const day = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const at = (s, t) => {
  const d = day(s);
  const [h, mi] = t.split(":").map(Number);
  d.setHours(h, mi);
  return d.getTime();
};

// "2026-10-03 at 09:00 - 12:00", "2026-10-01 at 22:00 - 2026-10-02 at 01:00", "2026-10-05"
// or "2026-10-05 - 2026-10-07": read by the date and time tokens in order, so the words
// between them (any language) do not matter.
export function parseSpan(text) {
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const times = text.match(/\d{2}:\d{2}/g) ?? [];
  if (!dates.length) return null;
  if (!times.length) {
    const last = day(dates[dates.length - 1]);
    return { start: day(dates[0]).getTime(), end: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime(), allDay: true };
  }
  const start = at(dates[0], times[0]);
  const end = at(dates[dates.length - 1], times[times.length - 1]);
  return { start, end: Math.max(start, end), allDay: false };
}

function labelled(props) {
  const out = {};
  for (const p of props) {
    const i = p.indexOf(": ");
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 2).trim();
  }
  return out;
}

export function parseBuddyEvents(stdout) {
  const rows = [];
  for (const record of String(stdout).split(EVENT).slice(1)) {
    const [when, title = "", ...props] = record.split(PROP);
    const span = parseSpan(when);
    if (!span) continue;
    const p = labelled(props);
    rows.push({ id: `buddy:${p.uid || title}:${span.start}`, start: span.start, end: span.end, title: title.trim() || "(sem título)", color: null, link: p.url || meetingLink(p.location, p.notes), allDay: span.allDay });
  }
  return rows;
}

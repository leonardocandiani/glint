// The Apple calendar read straight from iCloud over CalDAV, for a machine without the
// Central. Pure: requests are described here, the $ calls that send them live in
// glint.mjs. Credentials are an Apple ID and an app-specific password (appleid.apple.com,
// Sign-In and Security, App-Specific Passwords), the same pair the Central uses.
//
// Flow (RFC 4791): PROPFIND on the base finds the principal, PROPFIND on the principal
// finds the calendar home (another host, pNN-caldav.icloud.com), PROPFIND depth 1 on the
// home lists the calendars, REPORT calendar-query brings each one's events with
// <c:expand>, which makes the server unroll recurrences. Rows come out in the shape
// agenda.mjs already uses.

export const CALDAV_BASE = "https://caldav.icloud.com/";
// The password only ever travels to icloud.com over https.
export const TRUSTED_SUFFIX = "icloud.com";

const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"';
const HEAD = '<?xml version="1.0" encoding="utf-8"?>';
export const BODY_PRINCIPAL = `${HEAD}<d:propfind ${NS}><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
export const BODY_HOME = `${HEAD}<d:propfind ${NS}><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
export const BODY_CALENDARS = `${HEAD}<d:propfind ${NS}><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

export function trusted(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === TRUSTED_SUFFIX || u.hostname.endsWith(`.${TRUSTED_SUFFIX}`));
  } catch {
    return false;
  }
}

// The module has no btoa guarantee, so the base64 is done here, over the UTF-8 bytes.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(binary) {
  let out = "";
  for (let i = 0; i < binary.length; i += 3) {
    const n = (binary.charCodeAt(i) << 16) | ((binary.charCodeAt(i + 1) || 0) << 8) | (binary.charCodeAt(i + 2) || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < binary.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < binary.length ? B64[n & 63] : "=");
  }
  return out;
}

export function authHeader(email, password) {
  const bytes = unescape(encodeURIComponent(email + ":" + password));
  return "Basic " + base64(bytes);
}

const unquote = (v) => (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0] ? v.slice(1, -1) : v);

// KEY=VALUE lines, # for comments, optional quotes: the format of ~/.config/glint/caldav.env.
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text ?? "").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m || m[1] === undefined) continue;
    out[m[1]] = unquote(m[2]);
  }
  return out;
}

// 20260928T030000Z
export const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function eventsBody(fromMs, toMs, expand = true) {
  const a = utcStamp(fromMs);
  const b = utcStamp(toMs);
  const data = expand ? `<c:calendar-data><c:expand start="${a}" end="${b}"/></c:calendar-data>` : "<c:calendar-data/>";
  return `${HEAD}<c:calendar-query ${NS}><d:prop><d:getetag/>${data}</d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${a}" end="${b}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

/* ---------- minimal XML ---------- */

const ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'" };
const decode = (t) =>
  t.replace(/&(?:lt|gt|amp|quot|apos);|&#x([0-9a-f]+);|&#(\d+);/gi, (m, hex, dec) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : (ENTITIES[m.toLowerCase()] ?? m)));
const TOKEN = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/)?([\w.-]+(?::[\w.-]+)?)((?:\s+[^>]*?)?)(\/)?>|([^<]+)/g;
const bare = (name) => name.slice(name.indexOf(":") + 1);

export function parseXml(xml) {
  const root = { name: "#root", kids: [], text: "" };
  const stack = [root];
  for (const t of String(xml).matchAll(TOKEN)) {
    const top = stack[stack.length - 1];
    if (t[1] !== undefined) top.text += t[1];
    else if (t[6] !== undefined) top.text += decode(t[6]);
    else if (t[3] && t[2]) {
      if (stack.length > 1) stack.pop();
    } else if (t[3]) {
      const node = { name: bare(t[3]), attrs: attrs(t[4] ?? ""), kids: [], text: "" };
      top.kids.push(node);
      if (!t[5]) stack.push(node);
    }
  }
  return root;
}

function attrs(raw) {
  const out = {};
  for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[bare(m[1])] = decode(m[2] ?? m[3] ?? "");
  return out;
}

function all(node, name, out = []) {
  for (const k of node.kids) {
    if (k.name === name) out.push(k);
    all(k, name, out);
  }
  return out;
}
const first = (node, name) => all(node, name)[0];
const textOf = (node) => node?.text.trim() ?? "";

export function hrefOf(xml, container) {
  const c = first(parseXml(xml), container);
  return c ? textOf(first(c, "href")) : "";
}

// #RRGGBBAA from iCloud becomes #rrggbb.
function color(raw) {
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(raw.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function parseCalendars(xml, base) {
  const out = [];
  for (const r of all(parseXml(xml), "response")) {
    const href = textOf(first(r, "href"));
    const type = first(r, "resourcetype");
    if (!href || !type || !first(type, "calendar")) continue;
    const comps = all(r, "comp").map((c) => (c.attrs.name ?? "").toUpperCase());
    if (comps.length && !comps.includes("VEVENT")) continue;
    out.push({ url: new URL(href, base).toString(), name: textOf(first(r, "displayname")) || "Calendário", color: color(textOf(first(r, "calendar-color"))) });
  }
  return out;
}

export const calendarData = (xml) =>
  all(parseXml(xml), "calendar-data")
    .map((n) => n.text)
    .filter((t) => t.includes("BEGIN:VCALENDAR"));

/* ---------- iCalendar ---------- */

const unfold = (text) => text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
const unescape_ = (v) => v.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

function readLine(line) {
  let i = 0;
  while (i < line.length && line[i] !== ";" && line[i] !== ":") i++;
  const name = line.slice(0, i).toUpperCase();
  const params = {};
  while (line[i] === ";") {
    let j = i + 1;
    while (j < line.length && !"=;:".includes(line[j])) j++;
    if (line[j] !== "=") {
      i = j;
      continue;
    }
    let value;
    let k = j + 1;
    if (line[k] === '"') {
      const end = line.indexOf('"', k + 1);
      value = line.slice(k + 1, end < 0 ? line.length : end);
      k = (end < 0 ? line.length : end) + 1;
    } else {
      while (k < line.length && !";:".includes(line[k])) k++;
      value = line.slice(j + 1, k);
    }
    params[line.slice(i + 1, j).toUpperCase()] = value;
    i = k;
  }
  return line[i] === ":" && name ? { name, params, value: line.slice(i + 1) } : null;
}

const zoneFormats = new Map();
function zoneOffset(tz, epoch) {
  let f = zoneFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    zoneFormats.set(tz, f);
  }
  const p = {};
  for (const part of f.formatToParts(new Date(epoch))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000;
}

// Wall clock in a zone to epoch ms; a zone Intl does not know reads as the machine's.
function wallToEpoch(y, mo, d, h, mi, s, tz) {
  if (!tz) return new Date(y, mo - 1, d, h, mi, s).getTime();
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off = zoneOffset(tz, guess);
    const t = guess - off;
    const off2 = zoneOffset(tz, t);
    return off2 === off ? t : guess - off2;
  } catch {
    return new Date(y, mo - 1, d, h, mi, s).getTime();
  }
}

// DTSTART/DTEND in its three forms: 20261002 (all day, local midnight), 20261002T150000Z
// (UTC) and 20261002T120000 with or without TZID.
export function parseMoment(prop) {
  if (!prop) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(prop.value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] === undefined) return { ms: new Date(y, mo - 1, d).getTime(), allDay: true };
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  return { ms: wallToEpoch(y, mo, d, h, mi, s, prop.params.TZID), allDay: false };
}

const MEETING = /https?:\/\/(?:[\w-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|granola\.ai|whereby\.com|webex\.com)\/[^\s<>"')\\]*/i;

// Every VEVENT of an iCalendar text as a row. A cancelled one is dropped; with <c:expand>
// each occurrence of a series is already its own VEVENT.
export function parseIcs(text, cal) {
  const rows = [];
  let ev = null;
  for (const line of unfold(text)) {
    const p = readLine(line);
    if (!p) continue;
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") ev = { props: {} };
    else if (p.name === "END" && p.value.toUpperCase() === "VEVENT") {
      if (ev) rows.push(...fromEvent(ev.props, cal));
      ev = null;
    } else if (ev && !(p.name in ev.props)) ev.props[p.name] = p;
  }
  return rows;
}

function fromEvent(props, cal) {
  if ((props.STATUS?.value ?? "").toUpperCase() === "CANCELLED") return [];
  const start = parseMoment(props.DTSTART);
  if (!start) return [];
  const endMoment = parseMoment(props.DTEND);
  const end = endMoment ? endMoment.ms : start.allDay ? start.ms + 86_400_000 : start.ms;
  const text = (name) => (props[name] ? unescape_(props[name].value).trim() : "");
  const link = text("URL") || (MEETING.exec(text("LOCATION"))?.[0] ?? MEETING.exec(text("DESCRIPTION"))?.[0]) || null;
  const uid = text("UID");
  const stamp = props["RECURRENCE-ID"]?.value ?? props.DTSTART.value;
  return [{ id: `${cal.name}:${uid || text("SUMMARY")}:${stamp}`, start: start.ms, end, title: text("SUMMARY") || "(sem título)", color: cal.color, link, allDay: start.allDay }];
}

// Only the calendars the Leo wants are fetched, matched like agenda.mjs does.
export function pickCalendars(calendars, wanted, norm) {
  const mine = new Set(wanted.map(norm));
  return calendars.filter((c) => mine.has(norm(c.name)));
}

export const dedupeSort = (rows) => {
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).sort((a, b) => a.start - b.start);
};

// What the status of a CalDAV answer means to the person.
export function failureOf(status) {
  if (status === 401 || status === 403) return "credencial";
  return status ? `servidor ${status}` : "rede";
}

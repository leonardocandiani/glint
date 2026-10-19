// The Central's laws, one short row under the pills so they are always in sight. The
// source is `central leis --curto`; until that command exists, the fixed list below,
// MARCAR. The "## Lei" headings of the Central's rule file only lend the card their full
// titles. Each law has a name, a keyword and an acronym letter, so the row can shrink to
// the width of the terminal and still show every law whole.

import { textWidth } from "./pill.mjs";

export const LEIS_FILE = "projetos/central/.claude/rules/00-leis-dois-p.md";
export const LEIS_ARGV = ["central", "leis", "--curto"];
export const LEIS_TTL_MS = 10 * 60_000;

export const LEIS_FALLBACK = [
  { n: "1", short: "Mastigado", key: "Mastigado", sigla: "M", title: "Mastigado" },
  { n: "2", short: "Antes", key: "Antes", sigla: "A", title: "Antes" },
  { n: "3", short: "Refina", key: "Refina", sigla: "R", title: "Refina" },
  { n: "4", short: "Contexto", key: "Contexto", sigla: "C", title: "Contexto" },
  { n: "5", short: "Aval", key: "Aval", sigla: "A", title: "Aval" },
  { n: "6", short: "Respaldo", key: "Respaldo", sigla: "R", title: "Respaldo" },
];

const firstWord = (t) => t.split(/\s+/)[0];
// The rule file still numbers the first two laws P1 and P2.
const lawNumber = (n) => n.toUpperCase().replace(/^P/, "");

// One law per line, "<n> <name> | <keyword> | <acronym>", the last two optional:
// "1 Mastigado | Mastigado | M", "Lei 3: Refina", "4 - Contexto", "2,Antes".
export function parseLeisCurto(stdout) {
  const out = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const m = line.match(/^\s*(?:lei\s+)?(P?\d+)(?:\s*[,.:)\-]\s*|\s+)(.+?)\s*$/i);
    if (!m) continue;
    const [name, key, sigla] = m[2].split("|").map((f) => f.trim());
    if (!name) continue;
    out.push({ n: lawNumber(m[1]), short: name, key: key || firstWord(name), sigla: sigla || undefined, title: name });
  }
  return out;
}

// "## Lei P1, Leonardo, produtividade" -> law 1, title "Leonardo, produtividade".
export function parseLeisMd(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^##\s+Lei\s+(P?\d+)\s*,\s*(.+?)\s*$/i);
    if (m) out.push({ n: lawNumber(m[1]), title: m[2] });
  }
  return out;
}

export function withTitles(list, fromFile) {
  const titles = new Map(fromFile.map((l) => [l.n, l.title]));
  return list.map((l) => ({ ...l, title: titles.get(l.n) ?? l.title }));
}

// The forms the row can take, widest first: name, keyword, acronym letter (or the keyword
// cut to five letters), and the acronym word alone ("MARCAR"), or the numbers when a law
// has no letter. The row takes the first that fits, so every law shows whole.
export function leisSegments(leis, ink, max = Infinity) {
  const sep = (i) => (i ? [{ text: " · ", fg: ink.tert }] : []);
  const cut = (w) => (w.length > 5 ? w.slice(0, 5) : w);
  const labelled = (label) => leis.flatMap((l, i) => [...sep(i), { text: `${l.n} `, fg: ink.accent, bold: true }, { text: label(l), fg: ink.second }]);
  const word = leis.every((l) => l.sigla)
    ? leis.map((l) => ({ text: l.sigla, fg: ink.accent, bold: true }))
    : leis.flatMap((l, i) => [...(i ? [{ text: " " }] : []), { text: l.n, fg: ink.accent, bold: true }]);
  const forms = [labelled((l) => l.short), labelled((l) => l.key ?? firstWord(l.short)), labelled((l) => l.sigla ?? cut(l.key ?? firstWord(l.short))), word];
  return forms.find((f) => textWidth(f) <= max) ?? word;
}

// The full card lists one law per row with its title; the compact one, for a short band,
// puts the names in two columns under the same header.
export function leisCard(leis, origin, ink) {
  const head = [{ text: "Leis da Central", fg: ink.primary, bold: true }, { text: `   ${origin}`, fg: ink.tert }];
  const law = (l, withTitle) => [
    { text: `${l.n.padEnd(3)}`, fg: ink.accent, bold: true },
    { text: l.short, fg: ink.primary, bold: true },
    ...(withTitle && l.title !== l.short ? [{ text: `   ${l.title}`, fg: ink.second }] : []),
  ];
  const half = Math.ceil(leis.length / 2);
  const left = leis.slice(0, half).map((l) => law(l, false));
  const width = Math.max(...left.map((r) => textWidth(r)));
  const compact = left.map((r, k) => {
    const right = leis[half + k];
    return right ? [...r, { text: " ".repeat(width - textWidth(r) + 4) }, ...law(right, false)] : r;
  });
  return { lines: [head, ...leis.map((l) => law(l, true))], compact: [head, ...compact] };
}

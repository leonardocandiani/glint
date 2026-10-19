// The Central's laws, one short row under the pills so they are always in sight. The
// source is `central leis --curto`; until that command exists, the fixed list below.
// The "## Lei" headings of the Central's rule file only lend the card their full titles.
// Each law has a name, a keyword and an acronym, so the row can shrink to the width of
// the terminal and still show every law whole.

import { textWidth } from "./pill.mjs";

export const LEIS_FILE = "projetos/central/.claude/rules/00-leis-dois-p.md";
export const LEIS_ARGV = ["central", "leis", "--curto"];
export const LEIS_TTL_MS = 10 * 60_000;

export const LEIS_FALLBACK = [
  { n: "1", short: "Tudo Ordenado e Pronto", key: "pronto", sigla: "TOP", title: "Tudo Ordenado e Pronto" },
  { n: "2", short: "Jamais Aguarde o pedido", key: "já", sigla: "JÁ", title: "Jamais Aguarde o pedido" },
  { n: "3", short: "Troque, Remova o Obsoleto, Consolide e Atualize", key: "troca", sigla: "TROCA", title: "Troque, Remova o Obsoleto, Consolide e Atualize" },
  { n: "4", short: "Leia Inteiro, Depois Aja", key: "lida", sigla: "LIDA", title: "Leia Inteiro, Depois Aja" },
  { n: "5", short: "Sem Insistir no Mesmo", key: "sim", sigla: "SIM", title: "Sem Insistir no Mesmo" },
  { n: "6", short: "Antes de Violar Alguma Lei", key: "aval", sigla: "AVAL", title: "Antes de Violar Alguma Lei" },
];

const firstWord = (t) => t.split(/\s+/)[0];
// The rule file still numbers the first two laws P1 and P2.
const lawNumber = (n) => n.toUpperCase().replace(/^P/, "");

// One law per line, "<n> <name> | <keyword> | <acronym>", the last two optional:
// "1 Tudo Ordenado e Pronto | pronto | TOP", "Lei 3: Refina", "4 - Contexto", "2,Antes".
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

// "## Lei 1, T.O.P., Tudo Ordenado e Pronto (...)" -> law 1, acronym TOP, title without
// the dotted acronym; "## Lei P1, Leonardo, produtividade" -> law 1, no acronym.
export function parseLeisMd(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^##\s+Lei\s+(P?\d+)\s*,\s*(.+?)\s*$/i);
    if (!m) continue;
    const dotted = m[2].match(/^((?:[A-ZÀ-Ý]\.)+),?\s*/u);
    out.push({ n: lawNumber(m[1]), sigla: dotted ? dotted[1].replaceAll(".", "") : undefined, title: dotted ? m[2].slice(dotted[0].length) : m[2] });
  }
  return out;
}

// A file title only counts for the law it names: when the law has an acronym, the
// heading must carry the same one, so a file still on the old laws lends nothing.
export function withTitles(list, fromFile) {
  return list.map((l) => {
    const f = fromFile.find((x) => x.n === l.n && (l.sigla ? x.sigla === l.sigla : true));
    return f ? { ...l, title: f.title } : l;
  });
}

// The forms the row can take, widest first. With acronyms: "1 TCP Tudo Chega Pronto",
// "1 TCP pronto", "1 TCP", "TCP"; without: name, keyword, keyword cut to five letters.
// Then the numbers alone. The row takes the first that fits, so every law shows whole.
export function leisSegments(leis, ink, max = Infinity) {
  const sep = (i) => (i ? [{ text: " · ", fg: ink.tert }] : []);
  const cut = (w) => (w.length > 5 ? w.slice(0, 5) : w);
  const keyOf = (l) => l.key ?? firstWord(l.short);
  const labelled = (label, withSigla) =>
    leis.flatMap((l, i) => [
      ...sep(i),
      { text: `${l.n} `, fg: ink.accent, bold: true },
      ...(withSigla ? [{ text: l.sigla, fg: ink.primary, bold: true }] : []),
      ...(label ? [{ text: `${withSigla ? " " : ""}${label(l)}`, fg: ink.second }] : []),
    ]);
  const bare = (text) => leis.flatMap((l, i) => [...(i ? [{ text: " " }] : []), { text: text(l), fg: ink.accent, bold: true }]);
  const numbers = bare((l) => l.n);
  const forms = leis.every((l) => l.sigla)
    ? [labelled((l) => l.short, true), labelled(keyOf, true), labelled(null, true), bare((l) => l.sigla), numbers]
    : [labelled((l) => l.short, false), labelled(keyOf, false), labelled((l) => cut(keyOf(l)), false), numbers];
  return forms.find((f) => textWidth(f) <= max) ?? numbers;
}

// The full card lists one law per row with its title; the compact one, for a short band,
// puts the names in two columns under the same header.
export function leisCard(leis, origin, ink) {
  const head = [{ text: "Leis da Central", fg: ink.primary, bold: true }, { text: `   ${origin}`, fg: ink.tert }];
  const law = (l, withTitle) => [
    { text: `${l.n.padEnd(3)}`, fg: ink.accent, bold: true },
    ...(l.sigla ? [{ text: `${l.sigla}  `, fg: ink.accent }] : []),
    { text: l.short, fg: ink.primary, bold: true },
    ...(withTitle && l.title !== l.short && !l.title.startsWith(l.short) ? [{ text: `   ${l.title}`, fg: ink.second }] : []),
    ...(withTitle && l.title !== l.short && l.title.startsWith(l.short) ? [{ text: l.title.slice(l.short.length), fg: ink.second }] : []),
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

// The Central's laws, one short row under the pills so they are always in sight. The
// source is `central leis --curto`; until that command exists, the "## Lei" headings of
// the Central's rule file; and when both fail, the list below, so the row never goes blank.

export const LEIS_FILE = "projetos/central/.claude/rules/00-leis-dois-p.md";
export const LEIS_ARGV = ["central", "leis", "--curto"];
export const LEIS_TTL_MS = 10 * 60_000;

export const LEIS_FALLBACK = [
  { n: "P1", short: "produtividade", title: "Leonardo, produtividade" },
  { n: "P2", short: "proatividade", title: "Central, proatividade" },
  { n: "3", short: "aprimoramento", title: "aprimoramento constante" },
  { n: "4", short: "contexto", title: "contexto sobre tudo" },
  { n: "5", short: "aprovação aprendida", title: "aprovação aprendida" },
  { n: "6", short: "palavra dele", title: "lei só se quebra com a palavra dele" },
];

const firstWord = (t) => t.split(/\s+/)[0];

// One law per line: "P1 produtividade", "Lei 3: aprimoramento constante", "4 - contexto", "P2,proatividade".
export function parseLeisCurto(stdout) {
  const out = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const m = line.match(/^\s*(?:lei\s+)?(P?\d+)(?:\s*[,.:)\-]\s*|\s+)(.+?)\s*$/i);
    if (m) out.push({ n: m[1].toUpperCase(), short: m[2], title: m[2] });
  }
  return out;
}

// "## Lei P1, Leonardo, produtividade" -> P1, "produtividade"; the title keeps every part.
export function parseLeisMd(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^##\s+Lei\s+(P?\d+)\s*,\s*(.+?)\s*$/i);
    if (!m) continue;
    const parts = m[2].split(",").map((p) => p.trim()).filter(Boolean);
    out.push({ n: m[1].toUpperCase(), short: firstWord(parts[parts.length - 1]), title: m[2] });
  }
  return out;
}

// The file may still lack the newest laws: its titles win, the fixed list fills the rest.
// A heading's first word is a poor label ("lei só se quebra..." gives "lei"), so a law the
// fixed list knows keeps the list's short label.
export function withFallback(fromFile) {
  const known = new Map(LEIS_FALLBACK.map((l) => [l.n, l.short]));
  const list = fromFile.map((l) => ({ ...l, short: known.get(l.n) ?? l.short }));
  const have = new Set(list.map((l) => l.n));
  const rest = LEIS_FALLBACK.filter((l) => !have.has(l.n));
  const order = (l) => (l.n.startsWith("P") ? Number(l.n.slice(1)) - 10 : Number(l.n));
  return { list: [...list, ...rest].sort((x, y) => order(x) - order(y)), filled: rest.map((l) => l.n) };
}

export function leisSegments(leis, ink) {
  return leis.flatMap((l, i) => [...(i ? [{ text: " · ", fg: ink.tert }] : []), { text: `${l.n} `, fg: ink.accent, bold: true }, { text: l.short, fg: ink.second }]);
}

// The full card lists one law per row; the compact one, for a short band, puts them in
// two columns under the same header.
export function leisCard(leis, origin, ink) {
  const head = [{ text: "Leis da Central", fg: ink.primary, bold: true }, { text: `   ${origin}`, fg: ink.tert }];
  const law = (l, title) => [{ text: l.n.padEnd(3), fg: ink.accent, bold: true }, { text: title, fg: ink.primary }];
  const half = Math.ceil(leis.length / 2);
  const left = leis.slice(0, half).map((l) => law(l, l.short));
  const width = Math.max(...left.map((r) => r.reduce((n, seg) => n + seg.text.length, 0)));
  const compact = left.map((r, k) => {
    const right = leis[half + k];
    const used = r.reduce((n, seg) => n + seg.text.length, 0);
    return right ? [...r, { text: " ".repeat(width - used + 4) }, ...law(right, right.short)] : r;
  });
  return { lines: [head, ...leis.map((l) => law(l, l.title))], compact: [head, ...compact] };
}

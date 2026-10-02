// Pure drawing: segments in, styled cells out. No $ here, so every frame is testable.

export const INK = { primary: "#f2f2f5", second: "#a2a2aa", tert: "#686870", accent: "#0a84ff", amber: "#e8a33d", gold: "#ffc83c" };
export const STATE = { green: "#30d758", yellow: "#ffd60a", orange: "#ff9f0a", red: "#ff453a" };
const BODY = [50, 50, 58];
const RIM = [96, 100, 118];
const SPECULAR = [206, 214, 238];
const EDGE_PEAK = 0.68;
export const CAP_L = "";
export const CAP_R = "";

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

export function stateColor(pct) {
  if (pct >= 90) return STATE.red;
  if (pct >= 75) return STATE.orange;
  if (pct >= 50) return STATE.yellow;
  return STATE.green;
}

// Light across the glass: rim light at both ends, dark body in the middle, a cold tint,
// an optional moving specular highlight (the glint) and a rim tint for alerts.
export function glassAt(k, n, look) {
  const t = n > 1 ? k / (n - 1) : 0.5;
  const d = 2 * t - 1;
  let rim = RIM;
  if (look.tint) rim = mix(rim, rgb(look.tint), look.tintStrength ?? 0.6);
  if (look.flash) rim = mix(rim, rgb(look.flash.color), look.flash.strength);
  let c = mix(BODY, rim, EDGE_PEAK * d * d);
  if (look.glintAt !== undefined) {
    const g = Math.exp(-(((k - look.glintAt) / 5) ** 2)) * 0.32;
    c = mix(c, SPECULAR, g);
  }
  return hex([c[0] - 5, c[1], c[2] + 9]);
}

export function textWidth(segments) {
  return segments.reduce((n, s) => n + [...s.text].length, 0);
}

// Segments are joined, padded, then clipped or padded to the animated width, so the pill
// can grow and shrink like a spring without re-laying its content out.
export function pillCells(segments, width, look) {
  const flat = [];
  for (const s of segments) for (const ch of s.text) flat.push({ ch, fg: s.fg ?? INK.primary, bold: Boolean(s.bold) });
  const inner = Math.max(1, Math.round(width) - 4);
  let body = flat;
  if (flat.length > inner) body = [...flat.slice(0, Math.max(0, inner - 1)), { ch: "…", fg: INK.second, bold: false }];
  const padLeft = Math.floor((inner - body.length) / 2);
  const cells = [];
  const pad = (n) => {
    for (let i = 0; i < n; i++) cells.push({ ch: " ", fg: INK.tert, bold: false });
  };
  pad(2 + Math.max(0, padLeft));
  cells.push(...body);
  pad(2 + Math.max(0, inner - body.length - padLeft));
  const n = cells.length;
  return cells.map((c, k) => ({ ...c, bg: glassAt(k, n, look) }));
}

// Consecutive cells with the same style become one Text span, which keeps the tree small.
export function spans(cells) {
  const out = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold) last.text += c.ch;
    else out.push({ text: c.ch, fg: c.fg, bg: c.bg, bold: c.bold });
  }
  return out;
}

export function capColor(cells, side) {
  return side === "left" ? cells[0]?.bg : cells[cells.length - 1]?.bg;
}

// One spring step toward the target width: fast at first, settles without overshooting much.
export function springStep(current, target) {
  const next = current + (target - current) * 0.35;
  return Math.abs(target - next) < 0.5 ? target : next;
}

export function short(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function contextBar(pct, cells, wave) {
  const filled = Math.max(pct > 0 ? 1 : 0, Math.min(cells, Math.round((pct * cells) / 100)));
  const color = stateColor(pct);
  const out = [];
  for (let i = 1; i <= cells; i++) {
    if (i < filled) out.push({ text: "━", fg: wave !== undefined && (i + wave) % 4 === 0 ? INK.primary : color });
    else if (i === filled) out.push({ text: "●", fg: color });
    else out.push({ text: "─", fg: INK.tert });
  }
  return out;
}

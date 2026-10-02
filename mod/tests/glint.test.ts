import { describe, expect, mock, test } from "claude-code/testing";

const T0 = new Date(2026, 9, 1, 21, 30, 0).getTime();
const NOW_S = Math.floor(T0 / 1000);
const HOME = "/Users/x";
const ABOVE = (bodyColumns = 170, maxRows = 10, isWorking = false) =>
  ({
    component: "AbovePrompt",
    surface: "terminal",
    requestId: "above",
    viewport: { columns: bodyColumns + 2, rows: 40 },
    props: { hasSurvey: false, isWorking, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as any;

function walk(node: any, out: any[] = []): any[] {
  if (node == null || typeof node === "string") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out));
    return out;
  }
  out.push(node);
  for (const c of node.children ?? []) if (typeof c !== "string") walk(c, out);
  return out;
}
const textOf = (node: any) =>
  walk(node)
    .filter((n) => n.type === "Text")
    .map((n) => (n.children ?? []).filter((c: any) => typeof c === "string").join(""))
    .join("");
const bgs = (node: any) => walk(node).filter((n) => n.type === "Text").map((n) => n.props?.backgroundColor).filter(Boolean);
const pillsOf = (node: any) => walk(node).filter((n) => n.type === "Box" && /^pill\d/.test(String(n.props?.key ?? "")));
const pillsText = (tree: any) => pillsOf(tree).map(textOf).join("\n");
async function settled($: any, above: any) {
  for (let i = 0; i < 40; i++) await $.ui.render(above);
  return $.ui.render(above);
}
const links = (node: any) => walk(node).filter((n) => n.type === "Link").map((n) => n.props.href);

type World = { branch?: string; tokens?: number; util5?: number | null; util7?: number | null; rateLimits?: any[]; cjk?: boolean; worktree?: boolean; agenda?: any[] };

function world(on: any, o: World = {}) {
  const clock = mock.clock(on, { now: T0 });
  const w = { clock, tool: (() => ({ result: "ok" })) as any, invalidations: 0, fetches: 0 };
  const files: Record<string, string> = {
    [`${HOME}/.config/claude-account/policy.json`]: JSON.stringify({ preferred: "proteauto" }),
    [`${HOME}/.config/claude-account/profiles/proteauto.json`]: JSON.stringify({ type: "native_archive", name: "proteauto" }),
    [`${HOME}/.config/claude-account/measure.json`]: JSON.stringify({
      measured_at: new Date(T0 - 60_000).toISOString(),
      profiles: { proteauto: { util_5h: o.util5 === undefined ? 41 : o.util5, reset_5h: NOW_S + 3600, util_7d: o.util7 === undefined ? 83 : o.util7, reset_7d: NOW_S + 2 * 86400 } },
      history: { proteauto: [] },
    }),
    [`${HOME}/.claude/.cache/claude-latest-version`]: `2.1.290 ${NOW_S}`,
    [`${HOME}/.claude/.cache/claude-status`]: `none||${NOW_S}`,
    [`${HOME}/.claude/.cache/net-latency`]: `180|${NOW_S}`,
  };
  const branch = o.branch ?? "main";
  on("session.start", ($: any, e: any) => ({ cwd: e.cwd }));
  on("session.model", () => ({ value: "claude-opus-5-5" }));
  on("session.version", () => ({ value: { version: "2.1.284" } }));
  on("session.cwd", () => ({ value: "/Users/x/projetos/central" }));
  on("session.usage", () => ({ value: { context: { tokens: o.tokens ?? 300_000, window: 1_000_000 }, rateLimits: o.rateLimits ?? [] } }));
  on("env.get", ($: any, e: any) => ({ value: { HOME, CLAUDE_CODE_AUTO_COMPACT_WINDOW: "600000", CLAUDE_EFFORT: "xhigh" }[e.name as string] }));
  on("config.list", () => ({ value: [{ key: "thinking", value: true }, { key: "fast", value: false }, { key: "reduceMotion", value: false }] }));
  on("settings.read", () => ({ value: { effortLevel: "xhigh" } }));
  on("fs.exists", ($: any, e: any) => ({ value: e.path.endsWith("/profiles") || e.path in files || (Boolean(o.agenda) && e.path.endsWith("central/data/central.db")) }));
  (w as any).toasts = [] as string[];
  on("ui.toast", ($: any, e: any) => {
    (w as any).toasts.push(e.text);
    return { value: undefined };
  });
  on("fs.list", () => ({ value: [{ name: "proteauto.json", kind: "file" }] }));
  on("fs.read", ($: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: "missing" }));
  on("fs.write", () => ({ value: undefined }));
  const store: Record<string, unknown> = {};
  (w as any).store = store;
  on("store.get", ($: any, e: any) => ({ value: store[e.key] }));
  on("store.set", ($: any, e: any) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("http.fetch", () => {
    w.fetches += 1;
    return { value: { status: 500, ok: false, headers: {}, text: "" } };
  });
  on("process.run", ($: any, e: any) => {
    if (e.argv[0] === "sqlite3") return { value: { exitCode: 0, stdout: JSON.stringify(o.agenda ?? []), stderr: "" } };
    const a = e.argv.join(" ");
    const proj = o.cjk ? "プロジェクト" : "central";
    if (a.startsWith("git rev-parse"))
      return { value: { exitCode: 0, stdout: o.worktree ? `/Users/x/projetos/_wt-${proj}-x\n/Users/x/projetos/${proj}/.git/worktrees/x\n/Users/x/projetos/${proj}/.git\n` : `/Users/x/projetos/${proj}\n.git\n.git\n`, stderr: "" } };
    if (a.startsWith("git status")) return { value: { exitCode: 0, stdout: `## ${branch}...origin/${branch}\n M a.ts\n?? b.ts\n`, stderr: "" } };
    if (a.startsWith("git remote")) return { value: { exitCode: 0, stdout: "git@github.com:leonardocandiani/central.git\n", stderr: "" } };
    return { value: { exitCode: 1, stdout: "", stderr: "" } };
  });
  on("command.register", ($: any, e: any) => ({ value: { command: e.name } }));
  on("ui.invalidate", () => {
    w.invalidations += 1;
    return { value: undefined };
  });
  on("ui.render", ($: any, e: any) => $.ui.resolve(e).Box({ children: [] }));
  on("turn.start", ($: any, e: any) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
  on("tool.call", (...a: any[]) => w.tool(...a));
  return w;
}

const START = { surface: "terminal", isInteractive: true, cwd: "/w" } as any;
const settle = async (w: any) => w.clock.advance(1500);

describe("glint mod", () => {
  test("shows the status line facts Claude Code does not", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const t = textOf(await $.ui.render(ABOVE()));
    for (const fact of ["Opus 5.5", "\u{f04c5}", "\uf0eb", "\uf07b central", "\ue725 main •2", "50%", "300K/600K", "①", "5h 41%", "7d 83% ↻1d 23h", "2.1.284", "●", "01/10 21:30"]) expect(t).toContain(fact);
  });

  test("a measure that failed (null usage) falls back to the session's limits instead of showing 0%", async ($, on) => {
    const iso = (s: number) => new Date(s * 1000).toISOString();
    const w = world(on, {
      util5: null,
      util7: null,
      rateLimits: [
        { kind: "five_hour", percentUsed: 12, resetsAt: iso(NOW_S + 3600) },
        { kind: "seven_day", percentUsed: 79, resetsAt: iso(NOW_S + 2 * 86400) },
      ],
    });
    await $.session.start(START);
    await settle(w);
    const t = textOf(await $.ui.render(ABOVE()));
    expect(t).toContain("5h 12%");
    expect(t).toContain("7d 79%");
    expect(t).not.toContain("5h 0%");
  });

  test("never repeats what Claude Code already prints while it works", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await $.turn.start({ text: "x", turnId: "t" } as any);
    await w.clock.advance(14_000);
    const t = textOf(await $.ui.render(ABOVE(170, 10, true)));
    expect(t).not.toContain("thinking");
    expect(t).not.toContain("14s");
  });

  test("a narrow terminal wraps into a second pill and keeps every fact", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const tree = await $.ui.render(ABOVE(100));
    expect(pillsOf(tree)).toHaveLength(2);
    const t = textOf(tree);
    for (const fact of ["central", "main", "50%", "7d 83%", "2.1.284", "21:30"]) expect(t).toContain(fact);
  });

  test("a phone-width terminal keeps every fact across more pills, with a compact context", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const tree = await $.ui.render(ABOVE(52));
    expect(pillsOf(tree).length).toBeGreaterThan(2);
    const t = textOf(tree);
    for (const fact of ["Opus 5.5", "\u{f04c5}", "central", "main", "50%", "①", "5h 41%", "7d 83%", "2.1.284", "●", "21:30"]) expect(t).toContain(fact);
    expect(t).not.toContain("300K/600K");
  });

  test("one pill, rounded like the status line, when it fits", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const tree = await $.ui.render(ABOVE(220));
    expect(pillsOf(tree)).toHaveLength(1);
    expect(textOf(pillsOf(tree)[0]).startsWith("\ue0b6")).toBe(true);
  });

  test("the glint sweeps the glass while Claude works", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    await $.turn.start({ text: "x", turnId: "t" } as any);
    const a = bgs(await $.ui.render(ABOVE())).join();
    await w.clock.advance(400);
    expect(bgs(await $.ui.render(ABOVE())).join()).not.toBe(a);
  });

  test("a failed tool flashes the rim, then it settles", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const rest = bgs(await $.ui.render(ABOVE()))[0];
    w.tool = () => ({ isError: true, result: "exit 1" });
    await $.tool.call({ tool: "Bash", command: "false" } as any);
    expect(bgs(await $.ui.render(ABOVE()))[0]).not.toBe(rest);
    await w.clock.advance(1000);
    expect(bgs(await $.ui.render(ABOVE()))[0]).toBe(rest);
  });

  test("pressure over 90% keeps frames coming without any other trigger", async ($, on) => {
    const w = world(on, { tokens: 560_000 });
    await $.session.start(START);
    await $.ui.render(ABOVE());
    await w.clock.advance(1500);
    const before = w.invalidations;
    await w.clock.advance(1000);
    expect(w.invalidations - before).toBeGreaterThan(10);
  });

  test("a blank row sits above the pill, and gives way when only one row is free", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const padTop = (tree: any) => walk(tree).find((n) => n.props && "paddingTop" in n.props)?.props.paddingTop;
    expect(padTop(await $.ui.render(ABOVE()))).toBe(1);
    const tight = await $.ui.render(ABOVE(170, 1));
    expect(padTop(tight)).toBe(0);
    expect(pillsOf(tight)).toHaveLength(1);
  });

  test("wide glyphs get two spaces, so the gauges do not touch what follows", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const t = textOf(await $.ui.render(ABOVE()));
    expect(t).toContain("\u{f04c5}  \uf0eb");
    expect(t).toMatch(/①  .  /u);
  });

  test("the context bar carries a knob at the end of its fill", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    for (let i = 0; i < 40; i++) await $.ui.render(ABOVE());
    expect(textOf(await $.ui.render(ABOVE()))).toContain("━━━●────");
  });

  test("every row fits the terminal even if each icon is drawn two cells wide, and no pill is empty", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    for (const cols of [52, 100, 120, 140, 170]) {
      for (let i = 0; i < 30; i++) await $.ui.render(ABOVE(cols));
      const tree = await $.ui.render(ABOVE(cols));
      for (const pill of pillsOf(tree)) {
        const text = textOf(pill);
        const caps = /[\ue0b4\ue0b6]/u;
        const wide = /[\u2460-\u24ff\ue000-\uf8ff\u{f0000}-\u{ffffd}]/u;
        const cells = [...text].reduce((n, ch) => n + (!caps.test(ch) && wide.test(ch) ? 2 : 1), 0);
        // one column of left margin, and the last column stays free so the terminal never wraps
        expect({ cols, row: 1 + cells }).toEqual({ cols, row: Math.min(1 + cells, cols - 1) });
        expect(text.replace(/[\s\ue0b4\ue0b6]/gu, "").length).toBeGreaterThan(0);
      }
    }
  });

  test("the calendar: what is on now with its bar, the next one, and a card that the hover reveals", async ($, on) => {
    const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m).getTime();
    const agenda = [
      { id: "a", inicio: at(20), fim: at(21), titulo: "Terapia", calendario: "Agenda Léo", cor: "#0088ff", dia_inteiro: 0, diaInteiro: 0 },
      { id: "b", inicio: at(21), fim: at(22), titulo: "Aula de inglês", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 },
      { id: "h", inicio: at(21, 15), fim: at(22), titulo: "Dentista Helô", calendario: "Pessoal Helo", cor: "#c0a8d3", diaInteiro: 0 },
      { id: "c", inicio: at(22, 30), fim: at(23), titulo: "Call", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 },
      { id: "d", inicio: at(24 + 9), fim: at(24 + 10), titulo: "Trabalho", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 },
    ];
    const w = world(on, { agenda });
    await $.session.start(START);
    await settle(w);
    const tight = await $.ui.render(ABOVE(170, 5));
    const small = walk(tight).find((n) => n.props?.key === "card-clock");
    expect(walk(small).filter((n) => n.props?.key?.startsWith?.("r")).length).toBeLessThanOrEqual(5 - 1 - pillsOf(tight).length - 2);
    const tree = await settled($, ABOVE(230, 12));
    const pill = pillsText(tree);
    expect(pill).toContain("Aula de inglês");
    expect(pill).toContain("30min");
    expect(pill).toMatch(/Aula de inglês .*30min   01\/10 21:30/u);
    expect(textOf(tree)).not.toContain("Helô");
    const card = walk(tree).find((n) => n.props?.key === "card-clock");
    expect(card.props.display).toBe("none");
    expect(card.hover).toEqual({ display: "flex", scope: "glint-clock" });
    const area = walk(tree).find((n) => n.props?.key === "hv-clock");
    expect(area.hover.scope).toBe("glint-clock");
    const c = textOf(card);
    for (const fact of ["Outubro 2026", "D  S  T  Q  Q  S  S", "Quinta, 01/10", "✓ Terapia", "agora, até 22:00", "em 1h", "amanhã", "09:00", "Trabalho"]) expect(c).toContain(fact);
    const todayCell = walk(card).find((n) => n.type === "Text" && n.props?.backgroundColor && (n.children ?? []).join("").trim() === "1");
    expect(todayCell).toBeTruthy();
  });

  test("ten minutes before an event a toast says so, once", async ($, on) => {
    const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m).getTime();
    const w = world(on, { agenda: [{ id: "x", inicio: at(21, 38), fim: at(22), titulo: "Nutricionista", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 }, { id: "y", inicio: at(21, 38), fim: at(22), titulo: "Dentista", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 }] });
    await $.session.start(START);
    await settle(w);
    await w.clock.advance(31_000);
    await w.clock.advance(31_000);
    expect((w as any).toasts).toEqual(["Nutricionista começa em 8min (21:38)", "Dentista começa em 8min (21:38)"]);
    expect(pillsText(await settled($, ABOVE()))).toContain("Nutricionista em 7min");
  });

  test("with nothing close, the pill shows only date and time and the card holds the day and the month", async ($, on) => {
    const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
    const w = world(on, { agenda: [{ id: "f", inicio: at(2, 8, 30), fim: at(2, 10), titulo: "Grupo de estudos", calendario: "Faculdade", cor: "#b9e632", diaInteiro: 0 },
      { id: "t", inicio: at(2, 9), fim: at(2, 12), titulo: "Trabalho", calendario: "Agenda Leo", cor: "#0088ff", diaInteiro: 0 },
      { id: "g", inicio: at(2, 14), fim: at(2, 15), titulo: "Reunião", calendario: "Leonardo Candiani - Gmail", cor: "#ea4335", diaInteiro: 0 }] });
    await $.session.start(START);
    await settle(w);
    const tree = await settled($, ABOVE(230, 12));
    expect(pillsText(tree)).not.toContain("Trabalho");
    expect(pillsText(tree)).toContain("01/10 21:30");
    const card = textOf(walk(tree).find((n) => n.props?.key === "card-clock"));
    expect(card).toContain("nada na sua agenda hoje");
    for (const fact of ["09:00  ○ Trabalho", "14:00  ○ Reunião"]) expect(card).toContain(fact);
    expect(textOf(tree)).not.toContain("Grupo de estudos");
  });

  test("an event shows on the pill from one hour before, not earlier", async ($, on) => {
    const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m).getTime();
    const near = world(on, { agenda: [{ id: "n", inicio: at(22, 20), fim: at(23), titulo: "Call", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 }, { id: "f", inicio: at(23, 50), fim: at(23, 59), titulo: "Tarde", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 }] });
    await $.session.start(START);
    await settle(near);
    const t = pillsText(await settled($, ABOVE(230, 12)));
    expect(t).toContain("22:20 Call");
    expect(t).not.toContain("Tarde");
  });

  test("an event running past midnight is listed today and tomorrow, and no card row is wider than the band", async ($, on) => {
    const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
    const w = world(on, { agenda: [{ id: "o", inicio: at(1, 23), fim: at(2, 2), titulo: "Plantão com um título bem comprido que não cabe em lugar nenhum", calendario: "Agenda Léo", cor: "#0088ff", diaInteiro: 0 }] });
    await $.session.start(START);
    await settle(w);
    const wide = textOf(walk(await settled($, ABOVE(230, 14))).find((n) => n.props?.key === "card-clock"));
    expect(wide.split("Plantão").length - 1).toBe(2);
    const narrow = walk(await settled($, ABOVE(60, 14))).find((n) => n.props?.key === "card-clock");
    for (const row of walk(narrow).filter((n) => /^r\d/.test(String(n.props?.key ?? "")))) expect([...textOf(row)].length).toBeLessThanOrEqual(60 - 6);
  });

  test("without the Central there is no calendar block and no card for it", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const tree = await $.ui.render(ABOVE());
    expect(walk(tree).some((n) => n.props?.key === "card-clock")).toBe(false);
  });

  test("version, status and repository open their own cards", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    const tree = await settled($, ABOVE(230, 12));
    const card = (id: string) => textOf(walk(tree).find((n) => n.props?.key === `card-${id}`));
    expect(card("version")).toContain("instalada 2.1.284");
    expect(card("git")).toContain("github.com/leonardocandiani/central");
    expect(card("git")).toContain("2 arquivos alterados");
    expect(card("project")).toBe(card("git"));
  });

  test("/glint icons plain swaps every glyph for plain Unicode and holds in the next session", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await $.command.run({ command: "glint", args: "icons plain", origin: { kind: "composer" }, presentation: { isFullscreen: true, columns: 170 } } as any);
    await $.session.start(START);
    await settle(w);
    const t = textOf(await $.ui.render(ABOVE()));
    expect((w as any).store.prefs).toEqual({ on: true, icons: "plain" });
    for (const fact of ["xhigh", "✦", "⎇ main •2"]) expect(t).toContain(fact);
    expect(t).not.toContain("\ue725");
  });

  test("/glint off stops the frame loop even under pressure", async ($, on) => {
    const w = world(on, { tokens: 560_000 });
    await $.session.start(START);
    await $.ui.render(ABOVE());
    await $.command.run({ command: "glint", args: "off", origin: { kind: "composer" }, presentation: { isFullscreen: true, columns: 170 } } as any);
    await w.clock.advance(200);
    const before = w.invalidations;
    await w.clock.advance(2000);
    expect(w.invalidations - before).toBeLessThan(2);
    expect(textOf(await $.ui.render(ABOVE()))).toBe("");
  });

  test("dotted branch names stay whole, worktrees get their icon, links point at GitHub", async ($, on) => {
    const w = world(on, { branch: "release/1.2", worktree: true });
    await $.session.start(START);
    await settle(w);
    const tree = await $.ui.render(ABOVE());
    expect(textOf(tree)).toContain("\uf126 release/1.2");
    expect(links(tree)).toContain("https://github.com/leonardocandiani/central/tree/release/1.2");
  });

  test("wide characters are measured in cells, so the pill still fits", async ($, on) => {
    const w = world(on, { cjk: true });
    await $.session.start(START);
    await settle(w);
    const tree = await $.ui.render(ABOVE(120));
    const mids = walk(tree).filter((n) => n.type === "Box" && String(n.props?.key ?? "").startsWith("pill"));
    for (const m of mids) {
      const line = textOf(m);
      const cells = [...line].reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? 2 : 1), 0);
      expect(cells).toBeLessThanOrEqual(120);
    }
    expect(textOf(tree)).toContain("プロジェクト");
  });

  test("fresh caches are read, not fetched again", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await settle(w);
    expect(w.fetches).toBe(0);
  });
});

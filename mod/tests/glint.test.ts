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
const links = (node: any) => walk(node).filter((n) => n.type === "Link").map((n) => n.props.href);

type World = { branch?: string; tokens?: number; util5?: number; util7?: number; cjk?: boolean; worktree?: boolean };

function world(on: any, o: World = {}) {
  const clock = mock.clock(on, { now: T0 });
  const w = { clock, tool: (() => ({ result: "ok" })) as any, invalidations: 0, fetches: 0 };
  const files: Record<string, string> = {
    [`${HOME}/.config/claude-account/policy.json`]: JSON.stringify({ preferred: "proteauto" }),
    [`${HOME}/.config/claude-account/profiles/proteauto.json`]: JSON.stringify({ type: "native_archive", name: "proteauto" }),
    [`${HOME}/.config/claude-account/measure.json`]: JSON.stringify({
      measured_at: new Date(T0 - 60_000).toISOString(),
      profiles: { proteauto: { util_5h: o.util5 ?? 41, reset_5h: NOW_S + 3600, util_7d: o.util7 ?? 83, reset_7d: NOW_S + 2 * 86400 } },
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
  on("session.usage", () => ({ value: { context: { tokens: o.tokens ?? 300_000, window: 1_000_000 }, rateLimits: [] } }));
  on("env.get", ($: any, e: any) => ({ value: { HOME, CLAUDE_CODE_AUTO_COMPACT_WINDOW: "600000", CLAUDE_EFFORT: "xhigh" }[e.name as string] }));
  on("config.list", () => ({ value: [{ key: "thinking", value: true }, { key: "fast", value: false }, { key: "reduceMotion", value: false }] }));
  on("settings.read", () => ({ value: { effortLevel: "xhigh" } }));
  on("fs.exists", ($: any, e: any) => ({ value: e.path.endsWith("/profiles") || e.path in files }));
  on("fs.list", () => ({ value: [{ name: "proteauto.json", kind: "file" }] }));
  on("fs.read", ($: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: "missing" }));
  on("fs.write", () => ({ value: undefined }));
  on("http.fetch", () => {
    w.fetches += 1;
    return { value: { status: 500, ok: false, headers: {}, text: "" } };
  });
  on("process.run", ($: any, e: any) => {
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
    for (const fact of ["Opus 5.5", "\u{f04c5}", "", "central", "main •2", "50%", "300K/600K", "①", "5h 41%", "7d 83% ↻1d 23h", "2.1.284", "●", "01/10 21:30"]) expect(t).toContain(fact);
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
    expect(textOf(tree).startsWith("\ue0b6")).toBe(true);
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
    expect(textOf(tree)).toContain(" release/1.2");
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

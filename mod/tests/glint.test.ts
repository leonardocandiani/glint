import { describe, expect, mock, test } from "claude-code/testing";

const T0 = new Date(2026, 9, 1, 21, 30, 0).getTime();
const ABOVE = (bodyColumns = 160, isWorking = false) =>
  ({
    component: "AbovePrompt",
    surface: "terminal",
    requestId: "above",
    viewport: { columns: bodyColumns + 2, rows: 40 },
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as any;

function flat(node: any, out: any[] = []): any[] {
  if (node == null || typeof node === "string") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flat(n, out));
    return out;
  }
  const p = node.props ?? {};
  for (const c of node.children ?? []) {
    if (typeof c === "string") out.push({ text: c, color: p.color, bg: p.backgroundColor });
    else flat(c, out);
  }
  return out;
}
const text = (node: any) => flat(node).map((x) => x.text).join("");
const bgs = (node: any) => flat(node).map((x) => x.bg).filter(Boolean);

function world(on: any, o: { tokens?: number; limits?: any[] } = {}) {
  const clock = mock.clock(on, { now: T0 });
  const w = { clock, tool: (($: any, e: any) => ({ result: "ok" })) as any };
  on("session.start", ($: any, e: any) => ({ cwd: e.cwd }));
  on("session.model", () => ({ value: "claude-opus-5-5" }));
  on("session.repo", () => ({ value: { root: "/Users/x/projetos/central", remote: null } }));
  on("session.cwd", () => ({ value: "/Users/x/projetos/central" }));
  on("env.get", ($: any, e: any) => ({ value: e.name === "CLAUDE_CODE_AUTO_COMPACT_WINDOW" ? "600000" : e.name === "CLAUDE_EFFORT" ? "xhigh" : undefined }));
  on("session.usage", () => ({
    value: { context: { tokens: o.tokens ?? 300_000, window: 1_000_000 }, rateLimits: o.limits ?? [{ kind: "five_hour", percentUsed: 11 }, { kind: "seven_day", percentUsed: 41 }] },
  }));
  on("process.run", () => ({ value: { exitCode: 0, stdout: "## main...origin/main\n M a.ts\n?? b.ts\n", stderr: "" } }));
  on("command.register", ($: any, e: any) => ({ value: { command: e.name } }));
  on("tool.call", (...a: any[]) => w.tool(...a));
  on("ui.invalidate", () => ({ value: undefined }));
  on("ui.render", ($: any, e: any) => $.ui.resolve(e).Box({ children: [] }));
  on("turn.start", ($: any, e: any) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
  return w;
}

const START = { surface: "terminal", isInteractive: true, cwd: "/w" } as any;

describe("glint mod", () => {
  test("at rest: model, effort, project, git, context against the compact window, limits, clock", async ($, on) => {
    world(on);
    await $.session.start(START);
    const t = text(await $.ui.render(ABOVE()));
    expect(t).toContain("Opus 5.5 ●");
    expect(t).toContain("central");
    expect(t).toContain("main •2");
    expect(t).toContain("50%  300K/600K");
    expect(t).toContain("5h 11%");
    expect(t).toContain("7d 41%");
    expect(t).toContain("21:30");
    expect(t.startsWith("")).toBe(true);
  });

  test("working: live activity with the running tool and elapsed time", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await $.turn.start({ text: "x", turnId: "t" } as any);
    await w.clock.advance(14_000);
    expect(text(await $.ui.render(ABOVE(160, true)))).toContain("thinking   14s");
    let seen = "";
    w.tool = async () => {
      seen = text(await $.ui.render(ABOVE(160, true)));
      return { result: "ok" };
    };
    await $.tool.call({ tool: "Bash", command: "bun test", description: "Run the tests" } as any);
    expect(seen).toContain("Bash Run the tests");
  });

  test("the glint moves across the glass from frame to frame", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await $.turn.start({ text: "x", turnId: "t" } as any);
    const a = bgs(await $.ui.render(ABOVE(160, true))).join();
    await w.clock.advance(600);
    const b = bgs(await $.ui.render(ABOVE(160, true))).join();
    expect(a).not.toBe(b);
  });

  test("a failed tool and a finished turn pop for a moment, then the pill rests", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await $.turn.start({ text: "x", turnId: "t" } as any);
    w.tool = () => ({ isError: true, result: "exit 1" });
    await $.tool.call({ tool: "Bash", command: "false" } as any);
    const during = text(await $.ui.render(ABOVE(160, true)));
    expect(during).toContain("✕ Bash failed");
    expect(during).toContain("thinking");
    await w.clock.advance(8_000);
    await $.turn.complete({ reason: "answer", answer: "", durationMs: 8_000, isAborted: false, turnId: "t" } as any);
    expect(text(await $.ui.render(ABOVE()))).toContain("✓ done 8s");
    await w.clock.advance(12_000);
    expect(text(await $.ui.render(ABOVE()))).not.toContain("done");
  });

  test("pressure: context over 90% makes the rim breathe red", async ($, on) => {
    const w = world(on, { tokens: 560_000 });
    await $.session.start(START);
    const a = bgs(await $.ui.render(ABOVE()))[0];
    await w.clock.advance(450);
    const b = bgs(await $.ui.render(ABOVE()))[0];
    expect(text(await $.ui.render(ABOVE()))).toContain("93%");
    expect(a).not.toBe(b);
  });

  test("the working pill always fits the band, no clipped text", async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    await $.turn.start({ text: "x", turnId: "t" } as any);
    let t = "";
    w.tool = async () => {
      for (let i = 0; i < 30; i++) await w.clock.advance(50);
      t = text(await $.ui.render(ABOVE(140, true)));
      return { result: "ok" };
    };
    await $.tool.call({ tool: "Bash", command: "x", description: "bun test apps/nucleo packages" } as any);
    expect(t).toContain("Bash bun test apps/nucleo packages");
    expect(t).not.toContain("…");
    expect([...t].length).toBeLessThanOrEqual(140);
  });

  test("narrow terminal keeps context and drops the clock and quiet limits first", async ($, on) => {
    world(on);
    await $.session.start(START);
    const t = text(await $.ui.render(ABOVE(70)));
    expect(t).toContain("50%");
    expect(t).not.toContain("21:30");
    expect(t).not.toContain("5h 11%");
  });

  test("/glint off hides the pill", async ($, on) => {
    world(on);
    await $.session.start(START);
    await $.command.run({ command: "glint", args: "off", origin: { kind: "composer" }, presentation: { isFullscreen: true, columns: 160 } } as any);
    expect(text(await $.ui.render(ABOVE()))).toBe("");
  });
});

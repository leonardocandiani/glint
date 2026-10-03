// Where every fixed fact on the pill comes from. Same sources as the shell status line:
// claude-account for the account and the freshest usage, the shared caches in
// ~/.claude/.cache for version, status and network (refreshed here now that the status
// line may be off), git for project and branch, /config for effort, thinking and fast.

const TTL = { version: 1800, status: 300, net: 60 };
const MEASURE_FRESH_S = 600;

export function parseBranch(header) {
  const h = String(header ?? "").replace(/^## /, "").replace(/^No commits yet on /, "");
  if (h.startsWith("HEAD (no branch)")) return "detached";
  const cut = h.indexOf("...");
  return (cut >= 0 ? h.slice(0, cut) : h.split(" ")[0]).trim();
}

export function githubUrl(remote) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(String(remote ?? ""));
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

// The account this session really runs on: a setup token is matched by fingerprint

// against the cache the status line keeps; no token means the native login.

// Usage from claude-account's 5-minute measure beats the payload of a session that has

// been idle, as long as it is fresh; the history feeds the pace study.

// Reserve in percentage points left above the current pace when the window resets; the

// 5h window also mixes in the last 15 minutes so a recent spike shows up.

export function reserve(pct, resetsAt, winS, nowS, history) {
  if (!Number.isFinite(pct) || !Number.isFinite(resetsAt)) return null;
  const left = Math.min(winS, Math.max(0, resetsAt - nowS));
  const elapsed = winS - left;
  if (elapsed < 900) return null;
  let proj = Math.floor((pct * winS) / elapsed);
  if (history) {
    const recent = history.filter((h) => h[0] > nowS - 1500);
    if (recent.length >= 3) {
      const used = Math.max(0, recent[recent.length - 1][1] - recent[0][1]);
      proj = Math.floor((proj + pct + (used * left) / 900) / 2);
    }
  }
  return Math.max(-99, 100 - proj);
}

export function untilText(resetsAt, nowS) {
  const left = resetsAt - nowS;
  if (left <= 0) return "now";
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}m`;
}

// Reads the three shared caches and refreshes whichever is stale, writing them back in

// the status line's format so its panel keeps reading them.

function base(path) {
  return String(path ?? "").split("/").filter(Boolean).pop() ?? "";
}

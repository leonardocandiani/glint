// Whether the terminal draws OSC 8 hyperlinks. Where it does not, the engine draws a Link
// as its text and then the URL in dim, and glint wraps every cell of the pill in one, so
// the pill fills with repeated URLs. A Link is only drawn where the terminal is known to
// support it; /glint links on|off|auto overrides what is detected here.

const HYPERLINK_PROGRAMS = ["iTerm.app", "WezTerm", "ghostty", "vscode"];
// Variables only these terminals set.
const LINK_MARKERS = ["KITTY_WINDOW_ID", "WEZTERM_EXECUTABLE", "GHOSTTY_RESOURCES_DIR", "WT_SESSION", "KONSOLE_VERSION"];

// `env` is a plain object with the terminal variables (see readTerminal in glint.mjs).
export function supportsLinks(env) {
  const force = env.FORCE_HYPERLINK;
  if (force) return !["0", "false"].includes(force.toLowerCase());
  // tmux drops OSC 8 unless it was set up to pass it on.
  if (env.TMUX) return false;
  return HYPERLINK_PROGRAMS.includes(env.TERM_PROGRAM) || LINK_MARKERS.some((k) => env[k]) || Number(env.VTE_VERSION) >= 5000 || /kitty|ghostty|wezterm/.test(env.TERM ?? "");
}

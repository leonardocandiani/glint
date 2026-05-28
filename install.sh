#!/usr/bin/env bash
#
# glint - installer
# A liquid-glass status line for Claude Code
#
# Installs the "Liquid Glass" statusline for Claude Code:
#   1. ensures ~/.claude exists
#   2. backs up any existing statusline-command.sh and settings.json (timestamped)
#   3. downloads statusline-command.sh from the repo into ~/.claude
#   4. makes it executable
#   5. checks for jq (hard requirement)
#   6. merges settings.json: sets .statusLine (non-destructive, leaves the rest)
#
# Repo:    https://github.com/leonardocandiani/glint
# License: MIT
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/leonardocandiani/glint/main/install.sh | bash
#   # or
#   ./install.sh
#
# Optional env overrides (set before running):
#   CLAUDE_DIR            target dir            (default: $HOME/.claude)
#   STATUSLINE_RAW_URL    override download URL (advanced)

set -euo pipefail

# --- config -----------------------------------------------------------------

REPO="leonardocandiani/glint"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
SCRIPT_NAME="statusline-command.sh"
SCRIPT_PATH="$CLAUDE_DIR/$SCRIPT_NAME"
SETTINGS_PATH="$CLAUDE_DIR/settings.json"
RAW_URL="${STATUSLINE_RAW_URL:-https://raw.githubusercontent.com/$REPO/main/$SCRIPT_NAME}"
TS="$(date +%Y%m%d-%H%M%S)"

# --- helpers ----------------------------------------------------------------

# Color only if stdout is a TTY and the terminal isn't "dumb".
if [ -t 1 ] && [ "${TERM:-dumb}" != "dumb" ]; then
  B="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"; R="$(printf '\033[0m')"
  OK="$(printf '\033[32m')"; WARN="$(printf '\033[33m')"; ERR="$(printf '\033[31m')"
else
  B=""; DIM=""; R=""; OK=""; WARN=""; ERR=""
fi

info()  { printf '%s\n' "${DIM}->${R} $*"; }
good()  { printf '%s\n' "${OK}ok${R} $*"; }
warn()  { printf '%s\n' "${WARN}!!${R} $*" >&2; }
fail()  { printf '%s\n' "${ERR}xx${R} $*" >&2; exit 1; }

have()  { command -v "$1" >/dev/null 2>&1; }

# Pick whatever downloader is present.
download() {
  # download <url> <dest>
  local url="$1" dest="$2"
  if have curl; then
    curl -fsSL "$url" -o "$dest"
  elif have wget; then
    wget -qO "$dest" "$url"
  else
    fail "need curl or wget to download $SCRIPT_NAME"
  fi
}

# --- preflight --------------------------------------------------------------

printf '%s\n' "${B}glint installer${R}"
printf '%s\n' "${DIM}A liquid-glass status line for Claude Code${R}"
echo

# jq is required to render the statusline AND to merge settings.json.
if ! have jq; then
  fail "$(cat <<EOF
jq is required but was not found.

  macOS:        brew install jq
  Debian/Ubu:   sudo apt-get install jq
  Fedora:       sudo dnf install jq
  Arch:         sudo pacman -S jq

Install jq, then re-run this script.
EOF
)"
fi

# zsh is needed to RUN the statusline (settings points at /bin/zsh). We don't
# need it to install, but warn early so it's not a surprise later.
if ! have zsh && [ ! -x /bin/zsh ]; then
  warn "zsh not found. The statusline runs under zsh (Claude Code calls /bin/zsh)."
  warn "Install zsh, e.g. 'brew install zsh' or your distro's package manager."
fi

# --- 1. ensure target dir ---------------------------------------------------

if [ -d "$CLAUDE_DIR" ]; then
  info "using existing $CLAUDE_DIR"
else
  mkdir -p "$CLAUDE_DIR"
  good "created $CLAUDE_DIR"
fi

# --- 2. backup existing files -----------------------------------------------

if [ -f "$SCRIPT_PATH" ]; then
  cp -p "$SCRIPT_PATH" "$SCRIPT_PATH.bak-$TS"
  good "backed up existing $SCRIPT_NAME -> $SCRIPT_NAME.bak-$TS"
fi

if [ -f "$SETTINGS_PATH" ]; then
  cp -p "$SETTINGS_PATH" "$SETTINGS_PATH.bak-$TS"
  good "backed up existing settings.json -> settings.json.bak-$TS"
fi

# --- 3. download statusline -------------------------------------------------

# Download to a temp file first so a failed/partial download never clobbers a
# good existing script. Only move into place on success.
TMP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/statusline.XXXXXX")"
trap 'rm -f "$TMP_SCRIPT" "${TMP_SETTINGS:-}"' EXIT

info "downloading $SCRIPT_NAME"
info "  from $RAW_URL"
if ! download "$RAW_URL" "$TMP_SCRIPT"; then
  fail "download failed. Check your connection or the URL above."
fi

if [ ! -s "$TMP_SCRIPT" ]; then
  fail "downloaded file is empty. Aborting (your existing script is untouched)."
fi

mv "$TMP_SCRIPT" "$SCRIPT_PATH"
good "installed $SCRIPT_PATH"

# --- 4. make executable -----------------------------------------------------

chmod +x "$SCRIPT_PATH"
good "chmod +x $SCRIPT_NAME"

# --- 5. merge settings.json -------------------------------------------------

# Statusline command: Claude Code invokes it via zsh and pipes the JSON payload
# on stdin. We pin /bin/zsh and an absolute path so it works regardless of the
# user's login shell or cwd.
STATUSLINE_CMD="/bin/zsh $HOME/.claude/$SCRIPT_NAME"

TMP_SETTINGS="$(mktemp "${TMPDIR:-/tmp}/settings.XXXXXX")"

if [ -f "$SETTINGS_PATH" ]; then
  # Validate first: never feed a broken settings.json into jq and lose it.
  if ! jq -e . "$SETTINGS_PATH" >/dev/null 2>&1; then
    fail "$SETTINGS_PATH exists but is not valid JSON. Fix or move it, then re-run. (A backup was saved as settings.json.bak-$TS.)"
  fi
  SRC="$SETTINGS_PATH"
else
  # Seed with an empty object so the same merge works for a fresh install.
  printf '{}' > "$TMP_SETTINGS.seed"
  SRC="$TMP_SETTINGS.seed"
fi

# Non-destructive merge:
#   - sets .statusLine (replaced wholesale; it's our config)
#   - leaves all other top-level keys (including .env) untouched
#
# We deliberately do NOT touch CLAUDE_CODE_AUTO_COMPACT_WINDOW: that env var
# changes Claude Code's actual auto-compact behavior, not just this display.
# If you already set it, the bar respects it automatically. If you don't, the
# bar measures against the model's context window. See the README to opt in.
jq \
  --arg cmd "$STATUSLINE_CMD" \
  '.statusLine = { "type": "command", "command": $cmd }' \
  "$SRC" > "$TMP_SETTINGS" || fail "failed to merge settings.json"

# Sanity-check the merged output before swapping it in.
if ! jq -e . "$TMP_SETTINGS" >/dev/null 2>&1; then
  fail "merged settings.json is not valid JSON. Your original is untouched (backup: settings.json.bak-$TS)."
fi

mv "$TMP_SETTINGS" "$SETTINGS_PATH"
rm -f "$TMP_SETTINGS.seed" 2>/dev/null || true
good "updated $SETTINGS_PATH"
info "  .statusLine.command = $STATUSLINE_CMD"

# --- done -------------------------------------------------------------------

echo
good "${B}done${R}"
cat <<EOF

  ${DIM}The context bar measures usage against your auto-compact window when
  CLAUDE_CODE_AUTO_COMPACT_WINDOW is set; otherwise against the model's context
  limit. To opt in, add it under "env" in:${R}
    $SETTINGS_PATH

  ${DIM}Requirements: zsh + jq + a Nerd Font in your terminal (for the pill
  glyphs and icons), with 24-bit truecolor enabled.${R}

  Restart Claude Code (or open a new session) to see the statusline.
EOF


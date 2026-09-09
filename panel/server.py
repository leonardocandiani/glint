#!/usr/bin/env python3
"""glint-panel: a local editor for the status line.

Serves a small page on 127.0.0.1 that edits ~/.config/glint/config.json, which
is what statusline-command.sh reads to decide which parts appear, in which
order and how each one joins the previous.

The preview is not a mockup: every keystroke runs the real script with the
draft config and the panel renders the ANSI it printed. Only the payload is
synthetic, so a scenario can show a full context window or a quota about to
run out without waiting for one to happen.

Nothing leaves the machine: the socket binds to the loopback address, there is
no dependency beyond the standard library, and the only file written outside a
temporary directory is the config itself (with a timestamped backup).
"""
from __future__ import annotations

import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "statusline-command.sh"
CONFIG = Path(os.environ.get("GLINT_CONFIG", Path.home() / ".config/glint/config.json"))
HOST = "127.0.0.1"


def run_script(config: dict | None, payload: dict, columns: int, account_dir: str | None) -> str:
    """Run the real status line and return exactly what it printed."""
    env = dict(os.environ, COLUMNS=str(columns), LC_ALL="en_US.UTF-8", LANG="en_US.UTF-8")
    tmp = None
    if config is not None:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(config, tmp)
        tmp.close()
        env["GLINT_CONFIG"] = tmp.name
    if account_dir:
        env["GLINT_ACCOUNT_DIR"] = account_dir
    try:
        done = subprocess.run(
            ["/bin/zsh", str(SCRIPT)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
            timeout=15,
        )
        return done.stdout or f"(no output) {done.stderr.strip()[:400]}"
    except subprocess.TimeoutExpired:
        return "(preview timed out)"
    finally:
        if tmp:
            os.unlink(tmp.name)


def catalog() -> list[dict]:
    """Part list straight from the script, so the panel never drifts from it."""
    out = subprocess.run(
        ["/bin/zsh", str(SCRIPT), "--parts"],
        capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=15,
    ).stdout
    parts = []
    for line in out.splitlines():
        if not line.strip():
            continue
        pid, label, about, opts = (line.split("|") + ["", "", ""])[:4]
        spec = []
        for raw in filter(None, opts.split(",")):
            key, kind, default = (raw.split(":") + ["", ""])[:3]
            if kind == "bool":
                value: object = default == "true"
            elif kind == "int":
                value = int(default or 0)
            else:
                value = default
            spec.append({"key": key, "kind": kind, "default": value})
        parts.append({"id": pid, "label": label, "about": about, "opts": spec})
    return parts


def default_config() -> dict:
    out = subprocess.run(
        ["/bin/zsh", str(SCRIPT), "--default-config"],
        capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=15,
    ).stdout
    return json.loads(out)


# A grade do terminal e a do navegador so batem se o preview usar a MESMA fonte
# que o terminal: a variante padrao da Nerd Font, onde o glifo de largura dupla
# mede duas celulas. A variante "Mono" espreme todo glifo em uma celula, e foi
# o que o Chrome escolheu sozinho, cortando os icones. Servimos o arquivo pela
# mesma origem (nada de CDN) e o CSS o declara com nome proprio.
FONT_DIRS = [
    Path.home() / "Library/Fonts",
    Path("/Library/Fonts"),
    Path.home() / ".local/share/fonts",
    Path("/usr/share/fonts"),
    Path("/usr/local/share/fonts"),
]
FONT_NAMES = [
    "JetBrainsMonoNerdFont-Regular.ttf",
    "MesloLGSNerdFont-Regular.ttf",
    "HackNerdFont-Regular.ttf",
    "FiraCodeNerdFont-Regular.ttf",
    "SymbolsNerdFont-Regular.ttf",
]


def nerd_font() -> Path | None:
    """The terminal-grade Nerd Font, if this machine has one."""
    for d in FONT_DIRS:
        for name in FONT_NAMES:
            hit = d / name
            if hit.is_file():
                return hit
        if d.is_dir():
            for hit in sorted(d.glob("*NerdFont-Regular.ttf")):
                return hit
    return None


def base_payload() -> dict:
    return {
        "version": "2.1.263",
        "workspace": {"current_dir": str(Path.home() / "tools/glint")},
        "model": {"display_name": "Fable 5.1"},
        "effort": {"level": "high"},
        "context_window": {"context_window_size": 600000, "current_usage": {"input_tokens": 42000}},
        "rate_limits": {},
    }


def scenario_payload(name: str) -> tuple[dict, int, str | None]:
    """A payload, a terminal width and (when the scenario needs one) a forged
    measurement directory, so quota states can be seen before they happen."""
    payload = base_payload()
    if name == "contexto-cheio":
        payload["context_window"]["current_usage"]["input_tokens"] = 505000
        return payload, 135, None
    if name == "tela-estreita":
        return payload, 80, None
    if name == "raciocinio-maximo":
        payload["effort"] = {"level": "max"}
        payload["model"] = {"display_name": "Opus 5"}
        return payload, 135, None
    if name in ("cota-apertada", "cota-estourando"):
        now = int(time.time())
        apertada = name == "cota-apertada"
        forged = Path(tempfile.mkdtemp(prefix="glint-preview-"))
        (forged / "policy.json").write_text(json.dumps({"preferred": "work", "fallback": "personal"}))
        (forged / "active").write_text("work")
        # Um perfil que case com a medição forjada, senão a barra não reconhece a
        # conta e o cenário não mostra o que se propõe a mostrar.
        (forged / "profiles").mkdir()
        (forged / "profiles/work.json").write_text(json.dumps(
            {"name": "work", "type": "native_archive", "keychainService": "glint-preview"}))
        (forged / "measure.json").write_text(json.dumps({
            "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
            "profiles": {
                "work": {
                    "status": "allowed",
                    "util_5h": 62 if apertada else 88,
                    "reset_5h": now + (9000 if apertada else 2400),
                    "util_7d": 40 if apertada else 91,
                    "reset_7d": now + 250000,
                },
                "personal": {"status": "allowed", "util_5h": 4, "reset_5h": now + 18000,
                             "util_7d": 9, "reset_7d": now + 400000},
            },
            "history": {"work": [[now - 300 * (6 - i), (50 if apertada else 70) + i * 2] for i in range(6)]},
        }))
        return payload, 135, str(forged)
    return payload, 135, None


class Panel(http.server.BaseHTTPRequestHandler):
    server_version = "glint-panel"

    def log_message(self, *_args):  # the terminal stays quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str, cache: str = "no-store"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data, code=200):
        self._send(code, json.dumps(data).encode(), "application/json; charset=utf-8")

    def _static(self, name: str, ctype: str):
        path = HERE / name
        if not path.is_file():
            return self._send(404, b"not found", "text/plain; charset=utf-8")
        self._send(200, path.read_bytes(), ctype)

    def do_GET(self):
        route = urllib.parse.urlparse(self.path).path
        if route == "/":
            return self._static("index.html", "text/html; charset=utf-8")
        if route == "/panel.css":
            return self._static("panel.css", "text/css; charset=utf-8")
        if route == "/panel.js":
            return self._static("panel.js", "application/javascript; charset=utf-8")
        if route == "/font.ttf":
            font = nerd_font()
            if not font:
                return self._send(404, b"no nerd font here", "text/plain; charset=utf-8")
            return self._send(200, font.read_bytes(), "font/ttf", "max-age=86400")
        if route == "/api/bootstrap":
            saved = None
            if CONFIG.is_file():
                try:
                    saved = json.loads(CONFIG.read_text())
                except json.JSONDecodeError as err:
                    saved = {"__error": f"invalid config: {err}"}
            return self._json({
                "catalog": catalog(),
                "defaults": default_config(),
                "config": saved,
                "configPath": str(CONFIG),
                "presets": PRESETS,
            })
        return self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_POST(self):
        route = urllib.parse.urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as err:
            return self._json({"error": f"invalid json: {err}"}, 400)
        if route == "/api/preview":
            return self._json(self.preview(body))
        if route == "/api/save":
            return self.save(body)
        return self._send(404, b"not found", "text/plain; charset=utf-8")

    def preview(self, body: dict) -> dict:
        payload, columns, account_dir = scenario_payload(body.get("scenario", "normal"))
        if body.get("columns"):
            columns = int(body["columns"])
        try:
            ansi = run_script(body.get("config"), payload, columns, account_dir)
        finally:
            if account_dir:
                shutil.rmtree(account_dir, ignore_errors=True)
        return {"ansi": ansi, "columns": columns}

    def save(self, body: dict):
        config = body.get("config")
        if not isinstance(config, dict) or not isinstance(config.get("parts"), list):
            return self._json({"error": "config has no parts list"}, 400)
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        backup = None
        if CONFIG.is_file():
            backup = CONFIG.with_suffix(f".json.bak-{time.strftime('%Y%m%d%H%M%S')}")
            shutil.copy2(CONFIG, backup)
        tmp = CONFIG.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
        tmp.replace(CONFIG)
        return self._json({"ok": True, "path": str(CONFIG),
                           "backup": str(backup) if backup else None})


PRESETS = [
    {"id": "completo", "label": "Everything",
     "about": "All parts on, the way it ships",
     "parts": None},
    {"id": "minimo", "label": "Minimal",
     "about": "Model, project and context. No quota, no version",
     "parts": ["model:block", "effort:space", "project:block", "context:block"]},
    {"id": "cota", "label": "Quota first",
     "about": "How much is left, and on which account",
     "parts": ["model:block", "account:block", "pace:pipe", "win5h:pipe", "win7d:pipe", "context:block"]},
    {"id": "trabalho", "label": "Repo work",
     "about": "Project, git and context up front, quota quiet at the end",
     "parts": ["project:block", "git:block", "context:block", "model:block", "effort:space",
               "account:block", "pace:pipe", "version:pipe"]},
]


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def main() -> int:
    if not SCRIPT.is_file():
        print(f"glint-panel: no statusline at {SCRIPT}", file=sys.stderr)
        return 1
    port = int(os.environ.get("GLINT_PANEL_PORT") or free_port())
    server = http.server.ThreadingHTTPServer((HOST, port), Panel)
    url = f"http://{HOST}:{port}/"
    print(f"glint-panel: {url}", flush=True)
    print(f"config: {CONFIG}", flush=True)
    print("ctrl-c to stop", flush=True)
    if "--no-open" not in sys.argv:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

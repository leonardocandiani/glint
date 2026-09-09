#!/bin/zsh
# Statusline "Liquid Glass" - minimalista estilo Apple.
# Card escuro com gradiente de fundo (lente), cantos com rim light e tint frio,
# simulando uma superficie de vidro. Texto claro, 1 acento (azul no modelo).
# Cor so aparece no estado de contexto (enche verde->ambar->laranja->vermelho).
# Performance: jq uma vez, git uma vez, sem loops de render.

# Locale UTF-8 + multibyte: o gradiente char-by-char depende de contar/indexar
# caracteres (code points), nao bytes. Sem isso os glyphs Nerd Font quebram.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
setopt multibyte 2>/dev/null

input=$(cat)

# === PALETA (Apple dark system) ===
C_PRIMARY="\033[38;2;242;242;245m"     # branco-suave  (valores)
C_SECOND="\033[38;2;162;162;170m"      # cinza claro  (labels/icones)
C_TERT="\033[38;2;104;104;112m"        # cinza medio  (trilho da barra)
C_ACCENT="\033[38;2;10;132;255m"       # azul Apple  (modelo)
C_DIRTY="\033[38;2;232;163;61m"        # ambar  (git sujo)
C_GOLD="\033[38;2;255;200;60m"         # dourado/amarelo vivo  (lampada do thinking, "acesa")

RESET="\033[0m"
BOLD="\033[1m"
NB="\033[22m"

# Cantos arredondados (Powerline extra). Se a fonte nao tiver, troque por '' nas 2 linhas.
CAP_L=$''
CAP_R=$''

# Icones (Nerd Font) - discretos, so onde ajudam a identificar
ICON_FOLDER=$''
ICON_GIT=$''
ICON_WORKTREE=$''
ICON_CTX=$''
ICON_THINK=$''
ICON_FAST=$''
ICON_USER=$''
ICON_TAG=$''

# --- Catalogo de partes (fonte unica que o painel consome) ---
# id|rotulo|o que desenha|opcoes (chave:tipo:default, separadas por virgula)
GLINT_CATALOG='model|Model|The session model name|
effort|Effort|Reasoning gauge, coloured by level|
thinking|Lamp|Lights up when extended thinking is on|
fast|Bolt|Shows up in fast mode|
project|Project|Working folder, clickable|
git|Git|Branch or worktree, with a dirty counter|
context|Context|Context window bar, percentage and tokens|bar:int:8,tokens:bool:true
account|Account|Which Claude account is in use: primary or fallback|
pace|Pace|Quota speedometer and reserve in points|
win5h|5h window|The 5-hour window usage and when it resets|
win7d|7d window|The 7-day window usage and when it resets|
version|Version|Claude Code version, clickable, coloured when an update is out|
status|Status|status.claude.com dot, clickable|
net|Network|Internet health to the API, coloured by latency|'
if [ "${1:-}" = "--parts" ]; then printf '%s\n' "$GLINT_CATALOG"; exit 0; fi
if [ "${1:-}" = "--default-config" ]; then
  printf '%s\n' 'model:block effort:space thinking:none fast:none project:block git:block context:block account:block pace:pipe win5h:pipe win7d:pipe version:pipe status:pipe net:pipe' \
  | tr ' ' '\n' | awk -F: 'BEGIN{print "{\n  \"version\": 1,\n  \"parts\": ["} {printf "%s    {\"id\": \"%s\", \"on\": true, \"join\": \"%s\"%s}", (NR>1?",\n":""), $1, $2, ($1=="context" ? ", \"opts\": {\"bar\": 8, \"tokens\": true}" : "")} END{print "\n  ],\n  \"theme\": {\"flat\": false, \"links\": true, \"ascii\": false}\n}"}'
  exit 0
fi

# --- Config: o que aparece, em que ordem e como cada parte se junta a anterior ---
# Sem arquivo, vale o default abaixo, que e exatamente o layout de sempre. O
# painel (`glint-panel`) edita esse arquivo; GLINT_CONFIG aponta pra outro
# (o preview do painel usa isso pra renderizar um rascunho sem salvar).
#   join: block = pode quebrar pra outra pilula | pipe = divisor "|" | space | none
GLINT_PARTS_DEFAULT='model:block effort:space thinking:none fast:none project:block git:block context:block account:block pace:pipe win5h:pipe win7d:pipe version:pipe status:pipe net:pipe'
cfg_file="${GLINT_CONFIG:-$HOME/.config/glint/config.json}"
part_specs=(${=GLINT_PARTS_DEFAULT})
cfg_ctx_bar=8; cfg_ctx_tokens=1; cfg_theme_flat=""; cfg_theme_links=""; cfg_theme_ascii=""
if [ -f "$cfg_file" ] && command -v jq >/dev/null 2>&1; then
  cfg_line=$(jq -r '
    def parts: [.parts[]? | select(.on != false) | "\(.id):\(.join // "space")"] | join(" ");
    def ctx: (.parts[]? | select(.id == "context") | .opts) // {};
    [parts, ((ctx.bar // 8) | tostring), (if (ctx.tokens // true) then "1" else "0" end),
     (.theme.flat // "" | tostring), (.theme.links // "" | tostring), (.theme.ascii // "" | tostring),
     (if (.parts | type) == "array" then "1" else "0" end)]
    | join("\u0001")' "$cfg_file" 2>/dev/null) || cfg_line=""
  if [ -n "$cfg_line" ]; then
    IFS=$'\001' read -r c_parts c_bar c_tok cfg_theme_flat cfg_theme_links cfg_theme_ascii c_has <<< "$cfg_line"
    # Lista vazia e uma escolha ("nao quero nada"), diferente de config sem a chave.
    [ "$c_has" = 1 ] && part_specs=(${=c_parts})
    [[ "$c_bar" = <-> ]] && cfg_ctx_bar=$c_bar
    [ -n "$c_tok" ] && cfg_ctx_tokens=$c_tok
  fi
fi
[ -z "${GLINT_ASCII:-}" ]     && [ "$cfg_theme_ascii" = true ]  && GLINT_ASCII=1
[ -z "${GLINT_NO_LINKS:-}" ]  && [ "$cfg_theme_links" = false ] && GLINT_NO_LINKS=1
[ -z "${GLINT_FLAT_BG:-}" ]   && [ "$cfg_theme_flat" = true ]   && GLINT_FLAT_BG=1

# GLINT_ASCII=1: pra fonte sem glyphs Nerd Font (caps e ícones virariam
# caixas/tofu). Pílula fica reta e os ícones saem; só texto simples.
if [ -n "${GLINT_ASCII:-}" ]; then
  CAP_L="" CAP_R=""
  ICON_FOLDER="" ICON_GIT="" ICON_WORKTREE="" ICON_CTX=""
  ICON_THINK="*" ICON_FAST="»" ICON_USER="@" ICON_TAG="v"
fi

# === HYPERLINKS (OSC 8) ===
# O clique abre uma URL (nao aciona o Claude Code: statusline e um caminho so).
# Ligado por padrao: terminais modernos suportam e os que nao suportam ignoram a
# sequencia (sem lixo na tela). Terminal.app nao suporta hyperlink, entao nem
# emitimos. GLINT_NO_LINKS=1 desliga manualmente.
osc8=1
[ "${TERM_PROGRAM:-}" = "Apple_Terminal" ] && osc8=0
[ -n "${GLINT_NO_LINKS:-}" ] && osc8=0

# === DADOS (jq uma vez) ===
eval $(echo "$input" | jq -r '
  "model_display=" + ((.model.display_name // "") | @sh) + "\n" +
  "model_id=" + ((.model.id // "claude") | @sh) + "\n" +
  "effort=" + ((.effort.level // "") | @sh) + "\n" +
  "fast_mode=" + ((.fast_mode // false) | tostring) + "\n" +
  "thinking=" + ((.thinking.enabled // false) | tostring) + "\n" +
  "current_dir=" + ((.workspace.current_dir // .cwd // ".") | @sh) + "\n" +
  "wt_name=" + ((.worktree.name // "") | @sh) + "\n" +
  "wt_original_cwd=" + ((.worktree.original_cwd // "") | @sh) + "\n" +
  "current_input=" + ((.context_window.current_usage.input_tokens // 0) | tostring) + "\n" +
  "current_output=" + ((.context_window.current_usage.output_tokens // 0) | tostring) + "\n" +
  "cache_creation=" + ((.context_window.current_usage.cache_creation_input_tokens // 0) | tostring) + "\n" +
  "cache_read=" + ((.context_window.current_usage.cache_read_input_tokens // 0) | tostring) + "\n" +
  "context_size=" + ((.context_window.context_window_size // 200000) | tostring) + "\n" +
  "used_pct=" + ((.context_window.used_percentage // 0) | tostring) + "\n" +
  "cc_version=" + ((.version // "") | @sh) + "\n" +
  "rl5=" + ((.rate_limits.five_hour.used_percentage // null) | if type=="number" then (round|tostring) else "" end | @sh) + "\n" +
  "rl7=" + ((.rate_limits.seven_day.used_percentage // null) | if type=="number" then (round|tostring) else "" end | @sh) + "\n" +
  "r5=" + ((.rate_limits.five_hour.resets_at // "") | tostring | @sh) + "\n" +
  "r7=" + ((.rate_limits.seven_day.resets_at // "") | tostring | @sh)
')

# === MODELO (display_name ja vem correto e versionado) ===
if [ -n "$model_display" ]; then
  model="${model_display% \(*}"
else
  case "$model_id" in
    *opus-4-8*)   model="Opus 4.8" ;;
    *opus*)       model="Opus" ;;
    *sonnet-4-6*) model="Sonnet 4.6" ;;
    *sonnet*)     model="Sonnet" ;;
    *haiku-4-5*)  model="Haiku 4.5" ;;
    *haiku*)      model="Haiku" ;;
    *)            model="Claude" ;;
  esac
fi

# === PROJETO (nome da pasta; raiz do projeto quando em worktree) ===
# Nao usamos session_name de proposito: o Claude Code ja mostra a sessao.
if [ -n "$wt_original_cwd" ]; then
  project_name=$(basename "$wt_original_cwd")
else
  project_name=$(basename "$current_dir")
fi

# URL file:// da pasta do projeto (clica e abre no Finder), so com suporte a hyperlink
proj_url=""
if [ $osc8 -eq 1 ]; then
  proj_dir="${wt_original_cwd:-$current_dir}"
  proj_url="file://${proj_dir// /%20}"
fi

# === GIT / WORKTREE (um unico git status) ===
git_icon="$ICON_GIT"
dirty_str=""
git_url=""
if git -C "$current_dir" rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  git_branch=$(git -C "$current_dir" symbolic-ref --short HEAD 2>/dev/null || echo "detached")
  local changes=0
  while IFS= read -r l; do [[ -n "$l" ]] && ((changes++)); done \
    < <(git -C "$current_dir" status --porcelain 2>/dev/null)

  if [ -n "$wt_name" ]; then
    git_icon="$ICON_WORKTREE"; git_label="$wt_name"
  else
    git_label="$git_branch"
  fi
  [ "$changes" -gt 0 ] && dirty_str=" ${C_DIRTY}•${changes}"

  # URL do repo no GitHub (so se o terminal aceita hyperlink) pra clicar e abrir a branch
  if [ $osc8 -eq 1 ]; then
    remote=$(git -C "$current_dir" remote get-url origin 2>/dev/null)
    case "$remote" in
      git@github.com:*)       git_url="https://github.com/${${remote#git@github.com:}%.git}" ;;
      ssh://git@github.com/*) git_url="https://github.com/${${remote#ssh://git@github.com/}%.git}" ;;
      https://github.com/*)   git_url="${remote%.git}" ;;
    esac
    [ -n "$git_url" ] && [ -z "$wt_name" ] && [ "$git_branch" != "detached" ] && git_url="${git_url}/tree/${git_branch}"
  fi
else
  git_label="no-git"
fi

# === CONTEXTO (medido contra a janela de auto-compact, nao o limite do modelo) ===
total_tokens=$((current_input + current_output + cache_creation + cache_read))

compact_window=${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-0}
if [ "${compact_window:-0}" -le 0 ]; then
  compact_window=$(jq -r '.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW // empty' ~/.claude/settings.json 2>/dev/null)
fi
[[ "$compact_window" != <-> ]] && compact_window=0
[ "$compact_window" -le 0 ] && compact_window=$context_size

if [ "$compact_window" -gt 0 ]; then
  context_pct=$((total_tokens * 100 / compact_window))
else
  context_pct=${used_pct:-0}
fi
[ "$context_pct" -gt 100 ] && context_pct=100

# Tokens em formato curto (ex: 473K / 600K). Usa REPLY (sem subshell = sem fork).
fmt_tok() {
  local t=${1:-0}
  if [ "$t" -ge 1000000 ]; then
    local m=$((t/1000000)) r=$((t%1000000/100000))
    [ "$r" -eq 0 ] && REPLY="${m}M" || REPLY="${m}.${r}M"
  elif [ "$t" -ge 1000 ]; then REPLY="$((t/1000))K"
  else REPLY="$t"; fi
}
fmt_tok $total_tokens;   tokens_display=$REPLY
fmt_tok $compact_window; context_display=$REPLY

# Cor unica do estado de contexto
if   [ "$context_pct" -ge 90 ]; then STATE="\033[38;2;255;69;58m"     # vermelho
elif [ "$context_pct" -ge 75 ]; then STATE="\033[38;2;255;159;10m"    # laranja
elif [ "$context_pct" -ge 50 ]; then STATE="\033[38;2;255;214;10m"    # amarelo
else STATE="\033[38;2;48;215;88m"; fi                                 # verde

# A barra do slider e montada no bloco de contexto (build_ctx), adaptando o
# comprimento a largura da tela.

# Cor do effort por nivel (inspirado no menu /effort do CC)
case "$effort" in
  low)    C_EFFORT="\033[38;2;240;190;70m" ;;   # dourado
  medium) C_EFFORT="\033[38;2;48;215;88m" ;;    # verde
  high)   C_EFFORT="\033[38;2;77;158;255m" ;;   # azul
  xhigh)  C_EFFORT="\033[38;2;167;139;250m" ;;  # roxo
  max)    C_EFFORT="\033[38;2;210;110;245m" ;;  # magenta
  ultra)  C_EFFORT="\033[38;2;45;215;255m" ;;   # ciano eletrico (ultracode, topo do /effort)
  *)      C_EFFORT="$C_SECOND" ;;
esac

# === MONTAGEM "liquid glass" + responsividade (quebra inteligente em pilulas) ===
# A linha vira CELULAS (1 fg + 1 char cada) e e reconstruida celula a celula com um
# BG interpolado por uma curva de luz CONTINUA: bordas claras (rim light) -> centro
# escuro (corpo do vidro) -> bordas claras. Tint frio azulado.
# Responsividade: o conteudo e agrupado em BLOCOS logicos atomicos (identidade,
# projeto, git, contexto). Medimos a largura util do terminal e, quando nao cabe
# tudo, abrimos pilulas extras embaixo - cada uma completa e arredondada, sem nunca
# cortar no meio de um bloco (greedy: enche, quebra so quando o proximo nao cabe).
GLASS_BR=50;  GLASS_BG=50;  GLASS_BB=58     # centro (corpo do vidro, mais escuro)
GLASS_SR=96;  GLASS_SG=100; GLASS_SB=118    # bordas (vidro pegando luz, cinza-azul claro)
EDGE_PEAK=680  # quanto as bordas clareiam (0..1000); o centro fica na cor base
sep="   "      # separador entre blocos na mesma pilula

# GLINT_FLAT_BG=1: troca o gradiente por fundo sólido (cor única sobrevive a
# qualquer quantização de cor). O gradiente só liga em terminal onde o Claude
# Code comprovadamente mantém truecolor (allowlist abaixo). Em qualquer outro
# (Zentty, Orca, tmux/screen, Apple_Terminal, terminais futuros) o CC rebaixa
# a statusline pra 256 cores (anthropics/claude-code#59737) e o gradiente
# quantizado vira bandas/borrões: nesses, fundo sólido automático.
# GLINT_FORCE_GRADIENT=1 força o gradiente pra testar um terminal novo.
glass_flat=1
case "${TERM_PROGRAM:-}:${LC_TERMINAL:-}:${TERM:-}" in
  ghostty:*|*:xterm-ghostty)   glass_flat=0 ;;  # Ghostty
  iTerm.app:*|*:iTerm2:*)      glass_flat=0 ;;  # iTerm2 (local e via ssh)
  WezTerm:*)                   glass_flat=0 ;;  # WezTerm
  *:xterm-kitty)               glass_flat=0 ;;  # kitty
  Alacritty:*|*:alacritty)     glass_flat=0 ;;  # Alacritty
  vscode:*)                    glass_flat=0 ;;  # VS Code integrado
esac
[ -n "${GLINT_FORCE_GRADIENT:-}" ] && glass_flat=0
[ -n "${GLINT_FLAT_BG:-}" ] && glass_flat=1

# Largura util: o Claude Code exporta COLUMNS pro statusline; tput cols e o fallback;
# 80 se nada responder. Cada pilula gasta 2 caps + padding (2 de cada lado) + folga.
term_w=${COLUMNS:-0}
[[ "$term_w" = <-> ]] || term_w=0
[ "$term_w" -le 0 ] && term_w=$(tput cols 2>/dev/null || echo 0)
[[ "$term_w" = <-> ]] || term_w=80
[ "$term_w" -le 0 ] && term_w=80
PADW=2; CAPW=2; SEPW=${#sep}; SAFETY=1
cap=$(( term_w - CAPW - 2*PADW - SAFETY ))
[ $cap -lt 12 ] && cap=12

# Trunca textos variaveis pra um bloco nunca estourar sozinho em telas estreitas.
maxtext=$(( cap - 6 )); [ $maxtext -lt 8 ] && maxtext=8
[ ${(m)#project_name} -gt $maxtext ] && project_name="${project_name[1,$((maxtext-1))]}…"
[ ${(m)#git_label} -gt $maxtext ]    && git_label="${git_label[1,$((maxtext-1))]}…"

# Empilha celulas (char + fg) e acumula o texto puro do bloco (pra medir a largura).
_push() { local fg="$1" txt="$2" n=${#2} k=1
  _ptext+="$txt"
  while [ $k -le $n ]; do cells_ch+=("${txt[$k]}"); cells_fg+=("$fg"); k=$((k+1)); done; }

# --- Partes: cada uma so empilha as proprias celulas ---
# Quem decide ordem, visibilidade e junção e o laço no fim do arquivo, lendo a
# config. Parte que nao tem o que desenhar (sem git, sem conta, sem gauge)
# simplesmente nao empilha nada, e o laço desfaz o separador que ja tinha posto.
link_wrap() {  # <indice da primeira celula da parte> <url>: envolve sem mudar largura
  [ -n "$2" ] || return 0
  [ $1 -le ${#cells_ch} ] || return 0
  cells_fg[$1]="\033]8;;${2}\a${cells_fg[$1]}"
  cells_ch[-1]="${cells_ch[-1]}\033]8;;\a"
}

# O effort e so um velocimetro (o mesmo de tres niveis da cota), sem palavra:
# ponteiro baixo em low, meio em medium, no fim de high pra cima; a cor do
# nivel separa high, xhigh, max e ultra.
case "$effort" in
  low)                  ICON_EFFORT=$'\U000F0F86' ;;
  medium)               ICON_EFFORT=$'\U000F0F85' ;;
  high|xhigh|max|ultra) ICON_EFFORT=$'\U000F04C5' ;;
  *)                    ICON_EFFORT="" ;;
esac

part_model()    { _push "${C_ACCENT}${BOLD}" "$model"; }
# Sem espaco proprio: a junção ja poe dois, que e a folga que glifo largo pede.
part_effort()   { [ -n "$ICON_EFFORT" ] && _push "$C_EFFORT" "${ICON_EFFORT} "; }
part_thinking() { [ "$thinking" = "true" ]  && _push "$C_GOLD"   " ${ICON_THINK}"; }
part_fast()     { [ "$fast_mode" = "true" ] && _push "$C_SECOND" " ${ICON_FAST}"; }

part_project() {
  [ -n "$project_name" ] || return 0
  local st=$(( ${#cells_ch} + 1 ))
  _push "${NB}${C_SECOND}" "${ICON_FOLDER} "
  _push "$C_PRIMARY" "$project_name"
  link_wrap $st "$proj_url"
}

part_git() {
  [ -n "$git_label" ] || return 0
  local st=$(( ${#cells_ch} + 1 ))
  _push "$C_SECOND" "${git_icon} "
  _push "$C_PRIMARY" "$git_label"
  [ -n "$dirty_str" ] && _push "$C_DIRTY" " •${changes}"
  link_wrap $st "$git_url"
}

# Contexto: icone, slider, %, tokens. CTX_BAR e CTX_TOKENS sao o que o laço
# reduz quando a pilula nao cabe na tela.
part_context() {
  local bl=$CTX_BAR bf i
  bf=$(( (context_pct * bl + 50) / 100 ))
  [ $bf -gt $bl ] && bf=$bl; [ $bf -lt 0 ] && bf=0
  [ $context_pct -gt 0 ] && [ $bf -eq 0 ] && bf=1
  _push "$C_SECOND" "${ICON_CTX} "
  i=1
  while [ $i -le $bl ]; do
    if   [ $i -lt $bf ]; then _push "$STATE" "━"
    elif [ $i -eq $bf ]; then _push "$STATE" "●"
    else _push "$C_TERT" "─"; fi
    i=$((i+1))
  done
  _push "${STATE}${BOLD}" "  ${context_pct}%"
  if [ "$CTX_TOKENS" = "1" ]; then
    _push "$C_PRIMARY" "  ${tokens_display}"
    _push "$C_SECOND" "/${context_display}"
  fi
}

# --- Bloco 5: conta ativa + limites da conta + versao do Claude Code ---
# Conta: a que ESTA sessao usa de fato (nao o perfil marcado como ativo, que pode
# ter trocado depois que a sessao nasceu). Se o processo carrega
# CLAUDE_CODE_OAUTH_TOKEN, e um perfil de setup-token: casa o fingerprint do token
# com os perfis do claude-account (cache em disco pra nao abrir o Keychain a cada
# segundo). Sem a variavel, e o login nativo.
# GLINT_ACCOUNT_DIR: so o painel usa, pra pre-visualizar cenarios de cota com
# uma medicao forjada sem tocar na de verdade.
CA_DIR="${GLINT_ACCOUNT_DIR:-$HOME/.config/claude-account}"
CACHE_DIR="$HOME/.claude/.cache"; mkdir -p "$CACHE_DIR" 2>/dev/null
account=""
if [ -d "$CA_DIR/profiles" ]; then
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    tok_fp=$(printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" | shasum -a 256 | cut -c1-12)
    fp_cache="$CACHE_DIR/statusline-account-fp"
    account=$(grep "^${tok_fp} " "$fp_cache" 2>/dev/null | head -1 | cut -d' ' -f2)
    if [ -z "$account" ]; then
      for pf in "$CA_DIR"/profiles/*.json(N); do
        [ -f "$pf" ] || continue
        [ "$(jq -r '.type' "$pf")" = "oauth_token" ] || continue
        svc=$(jq -r '.keychainService' "$pf")
        v=$(security find-generic-password -a "$USER" -s "$svc" -w 2>/dev/null) || continue
        if [ "$(printf '%s' "$v" | shasum -a 256 | cut -c1-12)" = "$tok_fp" ]; then
          account=$(jq -r '.name' "$pf")
          printf '%s %s\n' "$tok_fp" "$account" >> "$fp_cache"
          break
        fi
      done
      unset v
      [ -z "$account" ] && account="token?"
    fi
  else
    for pf in "$CA_DIR"/profiles/*.json(N); do
      [ -f "$pf" ] || continue
      [ "$(jq -r '.type' "$pf")" = "native_archive" ] && { account=$(jq -r '.name' "$pf"); break; }
    done
    [ -z "$account" ] && account="nativo"
  fi
fi

# Limites: o payload do Claude Code so muda quando ESTA sessao recebe resposta da
# API, entao numa sessao parada ele envelhece enquanto a conta e gasta por
# outras. A medicao do autoswitch (a cada 5 min, mesma conta, pelos headers)
# tem prioridade quando tem menos de 10 min; o payload fica de reserva.
measure_file="$CA_DIR/measure.json"
if [ -n "$account" ] && [ -f "$measure_file" ]; then
  eval $(jq -r --arg a "$account" '
    def age: (now - (.measured_at | fromdateiso8601? // 0));
    if age < 600 and (.profiles[$a] // null) != null then
      .profiles[$a] | "m5=" + ((.util_5h // "") | tostring) + " mr5=" + ((.reset_5h // "") | tostring)
        + " m7=" + ((.util_7d // "") | tostring) + " mr7=" + ((.reset_7d // "") | tostring)
    else "m5= mr5= m7= mr7=" end' "$measure_file" 2>/dev/null)
  [[ "${m5:-}" = <-> ]] && { rl5=$m5; r5=$mr5; }
  [[ "${m7:-}" = <-> ]] && { rl7=$m7; r7=$mr7; }
fi

# Versao: a que roda (vem no JSON) contra a mais nova publicada no npm, lida de
# um cache de 30 min que e renovado em background (a statusline nunca espera rede).
# Verde = na ultima; amarelo = patch atras; vermelho = minor/major atras.
latest_file="$CACHE_DIR/claude-latest-version"
latest=""
if [ -f "$latest_file" ]; then
  read -r latest latest_ts < "$latest_file"
  [[ "$latest_ts" = <-> ]] || latest_ts=0
fi
now_ts=$(date +%s)
if [ -z "$latest" ] || [ $((now_ts - ${latest_ts:-0})) -gt 1800 ] && [ ! -f "$latest_file.lock" ]; then
  ( touch "$latest_file.lock"
    lv=$(curl -s --max-time 8 https://registry.npmjs.org/@anthropic-ai/claude-code/latest | jq -r '.version // empty' 2>/dev/null)
    [[ "$lv" = <->.<->.<-> ]] && printf '%s %s\n' "$lv" "$(date +%s)" > "$latest_file"
    rm -f "$latest_file.lock" ) >/dev/null 2>&1 </dev/null &!
fi
# Status do Claude (status.claude.com, API do statuspage): indicador geral + os
# componentes que importam aqui (API e Claude Code). Cache de 5 min renovado em
# background; a statusline nunca espera rede.
status_file="$CACHE_DIR/claude-status"
st_ind=""; st_txt=""; st_ts=0
if [ -f "$status_file" ]; then
  IFS='|' read -r st_ind st_txt st_ts < "$status_file"
  [[ "$st_ts" = <-> ]] || st_ts=0
fi
if [ $((now_ts - st_ts)) -gt 300 ] && [ ! -f "$status_file.lock" ]; then
  ( touch "$status_file.lock"
    ind=$(curl -s --max-time 8 https://status.claude.com/api/v2/status.json | jq -r '.status.indicator // empty' 2>/dev/null)
    bad=$(curl -s --max-time 8 https://status.claude.com/api/v2/components.json | jq -r '[.components[] | select(.status != "operational") | (.name | sub(" \\(.*"; "") | sub("^Claude "; ""))] | join(",")' 2>/dev/null)
    [ -n "$ind" ] && printf '%s|%s|%s\n' "$ind" "$bad" "$(date +%s)" > "$status_file"
    rm -f "$status_file.lock" ) >/dev/null 2>&1 </dev/null &!
fi
case "$st_ind" in
  none)     C_ST="\033[38;2;48;215;88m" ;;
  minor)    C_ST="\033[38;2;255;214;10m" ;;
  major)    C_ST="\033[38;2;255;159;10m" ;;
  critical) C_ST="\033[38;2;255;69;58m" ;;
  *)        C_ST="$C_TERT" ;;
esac
st_url=""; [ $osc8 -eq 1 ] && st_url="https://status.claude.com"

# Rede: um HEAD leve na API da Anthropic mede se a internet daqui esta boa,
# cabo ou wifi tanto faz. Cache de 60 s renovado em background, como o status.
# Guarda os milissegundos; a cor e a leitura: verde ate 300 ms, amarelo ate
# 1 s, vermelho sem resposta.
net_file="$CACHE_DIR/net-latency"
net_ms=""; net_ts=0
if [ -f "$net_file" ]; then
  IFS='|' read -r net_ms net_ts < "$net_file"
  [[ "$net_ts" = <-> ]] || net_ts=0
fi
if [ $((now_ts - net_ts)) -gt 60 ] && [ ! -f "$net_file.lock" ]; then
  ( touch "$net_file.lock"
    t=$(curl -sS -o /dev/null --max-time 4 -w '%{time_total}' -I https://api.anthropic.com/ 2>/dev/null) || t=""
    ms=""; [ -n "$t" ] && ms=$(printf '%s' "$t" | awk '{printf "%d", $1*1000}')
    printf '%s|%s\n' "${ms:-down}" "$(date +%s)" > "$net_file"
    rm -f "$net_file.lock" ) >/dev/null 2>&1 </dev/null &!
fi
ICON_NET=$'\U000F05A9'
if [[ "$net_ms" = <-> ]]; then
  if   [ "$net_ms" -le 300 ];  then C_NET="\033[38;2;48;215;88m"
  elif [ "$net_ms" -le 1000 ]; then C_NET="\033[38;2;255;214;10m"
  else                              C_NET="\033[38;2;255;159;10m"; fi
elif [ "$net_ms" = down ]; then C_NET="\033[38;2;255;69;58m"
else C_NET="$C_TERT"; fi

C_VER="$C_SECOND"; ver_url=""
if [ -n "$cc_version" ]; then
  if [ -n "$latest" ]; then
    if [ "$cc_version" = "$latest" ]; then
      C_VER="$C_SECOND"                                  # na ultima: quieta, cinza; cor so quando falta atualizar
      ver_url="https://github.com/anthropics/claude-code/releases/tag/v${cc_version}"
    else
      cur_mm="${cc_version%.*}"; lat_mm="${latest%.*}"
      [ "$cur_mm" = "$lat_mm" ] && C_VER="\033[38;2;255;214;10m" || C_VER="\033[38;2;255;69;58m"
      ver_url="https://github.com/anthropics/claude-code/releases/tag/v${latest}"   # o que falta pegar
    fi
  else
    ver_url="https://github.com/anthropics/claude-code/releases/tag/v${cc_version}"
  fi
fi
[ $osc8 -eq 1 ] || ver_url=""

# Escala da conta: verde ate 54%, amarelo de 55, laranja de 80 (quando o reset
# passa a aparecer), vermelho de 90.
rl_color() {  # <pct> -> REPLY cor
  local p=${1:-0}
  if   [ "$p" -ge 90 ]; then REPLY="\033[38;2;255;69;58m"
  elif [ "$p" -ge 80 ]; then REPLY="\033[38;2;255;159;10m"
  elif [ "$p" -ge 55 ]; then REPLY="\033[38;2;255;214;10m"
  else REPLY="\033[38;2;48;215;88m"; fi
}
# Primaria ou secundaria: compara a conta da sessao com a preferida da politica.
# Sinal unico e discreto no lugar do icone: "1º" (azul) na primaria, "2º" (ambar)
# quando a sessao esta na conta de fallback.
acct_mark="$ICON_USER"; C_MARK="$C_SECOND"
preferred=$(jq -r '.preferred // empty' "$CA_DIR/policy.json" 2>/dev/null)
if [ -n "$account" ] && [ -n "$preferred" ]; then
  if [ "$account" = "$preferred" ]; then
    acct_mark="①"; C_MARK="$C_ACCENT"
  else
    acct_mark="②"; C_MARK="$C_DIRTY"
  fi
fi
# Tempo ate o reset de uma janela (epoch -> "45m", "1h12", "2d 5h"), em REPLY.
fmt_until() {
  local left=$(( ${1:-0} - now_ts ))
  if [ $left -le 0 ]; then REPLY="agora"; return; fi
  local d=$(( left / 86400 )) h=$(( left % 86400 / 3600 )) m=$(( left % 3600 / 60 ))
  if   [ $d -gt 0 ]; then REPLY="${d}d ${h}h"
  elif [ $h -gt 0 ]; then REPLY="${h}h$(printf '%02d' $m)"
  else REPLY="${m}m"; fi
}
# Estudo de ritmo (modelo do pace do quota-axi), sem palavra. Cada janela (5h e
# 7d) ganha uma projecao de uso no reset pelo ritmo medio decorrido; a de 5h
# ainda mistura o ritmo dos ultimos 15 min (history do measure.json) pra reagir
# a pico recente sem ficar nervosa. A reserva e quantos pontos percentuais ainda
# dao pra gastar alem do ritmo atual. O velocimetro (icone Nerd Font em tres
# niveis) mostra a MENOR reserva das duas janelas, porque e a que acaba antes:
#   lento verde   sobra 25 pontos ou mais
#   medio amarelo sobra menos que isso
#   rapido vermelho no ritmo atual estoura antes do reset
# Janela com menos de 15 min decorridos nao tem ritmo e fica de fora.
ICON_WARN=$'\uf071'; GAUGE_SLOW=$'\U000F0F86'; GAUGE_MED=$'\U000F0F85'; GAUGE_FAST=$'\U000F04C5'
recent_5h() {  # -> REPLY pontos consumidos nos ultimos 15 min, ou "" sem historico suficiente
  REPLY=""
  [ -n "$account" ] && [ -f "$measure_file" ] || return
  REPLY=$(jq -r --arg a "$account" --argjson now "$now_ts" '
    (.history[$a] // []) | map(select(.[0] > ($now - 1500))) |
    if length < 3 then "" else ((.[-1][1] - .[0][1]) | if . < 0 then 0 else . end | tostring) end' "$measure_file" 2>/dev/null)
}
reserva_janela() {  # <pct> <resets_at> <win_s> [1=mistura ritmo recente] -> REPLY reserva ou ""
  REPLY=""
  [[ "$1" = <-> ]] && [[ "$2" = <-> ]] || return
  local u=$1 reset=$2 win=$3 left elapsed proj
  left=$(( reset - now_ts )); [ $left -lt 0 ] && left=0; [ $left -gt $win ] && left=$win
  elapsed=$(( win - left ))
  [ $elapsed -lt 900 ] && return
  proj=$(( u * win / elapsed ))
  if [ "${4:-0}" = 1 ]; then
    recent_5h
    [[ "$REPLY" = <-> ]] && proj=$(( (proj + u + REPLY * left / 900) / 2 ))
  fi
  REPLY=$(( 100 - proj )); [ $REPLY -lt -99 ] && REPLY=-99
}
reserva_janela "$rl5" "$r5" 18000 1; res5="$REPLY"
reserva_janela "$rl7" "$r7" 604800; res7="$REPLY"
reserva=""; risco=""
if [ -n "$res5" ]; then reserva=$res5; risco=5h; fi
if [ -n "$res7" ] && { [ -z "$reserva" ] || [ "$res7" -lt "$reserva" ]; }; then reserva=$res7; risco=7d; fi
GAUGE=""; GAUGE_C=""
if [ -n "$reserva" ]; then
  if   [ $reserva -ge 25 ]; then GAUGE="$GAUGE_SLOW"; GAUGE_C="\033[38;2;48;215;88m"
  elif [ $reserva -ge 0 ];  then GAUGE="$GAUGE_MED";  GAUGE_C="\033[38;2;255;214;10m"
  else                          GAUGE="$GAUGE_FAST"; GAUGE_C="\033[38;2;255;69;58m"; fi
fi
# Uma janela: "5h 84% ↻1h12". O reset aparece de 80% pra cima ou quando a
# reserva daquela janela e negativa (vai estourar antes de voltar).
# O rotulo da janela em risco (a que define o velocimetro, quando ele sai do
# verde) sai na cor do ponteiro, em negrito: e assim que se sabe qual das duas.
push_window() {  # <label> <pct> <resets_at> <reserva>
  [[ "$2" = <-> ]] || return 0
  rl_color "$2"; local c="$REPLY"
  if [ "$1" = "$risco" ] && [ -n "$reserva" ] && [ "$reserva" -lt 25 ]; then
    [ "$reserva" -lt 0 ] && _push "$GAUGE_C" "${ICON_WARN} "
    _push "${GAUGE_C}${BOLD}" "$1 "; _push "$NB" ""
  else _push "$C_SECOND" "$1 "; fi
  _push "$c" "$2%"
  if [[ "$3" = <-> ]] && { [ "$2" -ge 80 ] || { [ -n "$4" ] && [ "$4" -lt 0 ]; }; }; then
    fmt_until "$3"; _push "$c" " ↻${REPLY}"
  fi
}
# So a marca (① primaria, ② reserva): o nome da conta vive em `claude-account status`.
# Espaco duplo depois de glifo largo: ①, velocimetro e tag ocupam mais que a
# celula em alguns terminais e engolem o espaco seguinte.
part_account() { [ -n "$account" ] && { _push "${C_MARK}${BOLD}" "${acct_mark} "; _push "$NB" ""; } }

part_pace() {
  [ -n "$GAUGE" ] || return 0
  if [ "$reserva" -ge 0 ]; then _push "$GAUGE_C" "${GAUGE}  +${reserva}%"
  else _push "$GAUGE_C" "${GAUGE}  −${reserva#-}%"; fi
}

part_win5h() { push_window 5h "$rl5" "$r5" "$res5"; }
part_win7d() { push_window 7d "$rl7" "$r7" "$res7"; }

part_version() {
  [ -n "$cc_version" ] || return 0
  local st=$(( ${#cells_ch} + 1 ))
  _push "$C_SECOND" "${ICON_TAG}  "
  _push "${C_VER}${BOLD}" "$cc_version"
  _push "$NB" ""
  link_wrap $st "$ver_url"
}

# Status do Claude: um ponto na cor do indicador; degradado ganha o nome do
# componente afetado. Clique abre status.claude.com.
part_status() {
  [ -n "$st_ind" ] || return 0
  local st=$(( ${#cells_ch} + 1 ))
  _push "$C_ST" "●"
  [ "$st_ind" != none ] && [ -n "$st_txt" ] && _push "$C_ST" " ${st_txt}"
  link_wrap $st "$st_url"
}

part_net() { [ -n "$net_ms" ] && _push "$C_NET" "${ICON_NET}"; }

# --- Monta os blocos na ordem da config ---
# Bloco e a unidade que o empacotador pode jogar pra outra pilula; dentro dele
# as partes se juntam por espaco ou por divisor.
flush_block() {
  [ ${#cells_ch} -gt 0 ] || return 0
  nblocks=$((nblocks + 1))
  set -A "g${nblocks}_ch" "${cells_ch[@]}"
  set -A "g${nblocks}_fg" "${cells_fg[@]}"
  typeset -g "g${nblocks}_w"=${(m)#_ptext}
  cells_ch=(); cells_fg=(); _ptext=""
}

typeset -gA part_block
add_part() {  # <id> <join>
  whence -w "part_$1" >/dev/null 2>&1 || return 0
  local n0=${#cells_ch} t0="$_ptext"
  if [ $n0 -gt 0 ]; then
    case "$2" in
      pipe)  _push "$C_TERT" " │ " ;;
      space) _push "$C_SECOND" "  " ;;
    esac
  fi
  local n1=${#cells_ch}
  "part_$1"
  if [ ${#cells_ch} -eq $n1 ]; then   # a parte nao desenhou nada: desfaz o separador
    [ ${#cells_ch} -gt $n0 ] && { cells_ch[$((n0+1)),-1]=(); cells_fg[$((n0+1)),-1]=(); }
    _ptext="$t0"
    part_block[$1]=0
  else
    part_block[$1]=$((nblocks + 1))
  fi
}

# Largura da pilula que abriga uma parte (0 quando a parte nao desenhou).
block_w() {
  local b=${part_block[$1]:-0} vn
  [ "$b" -gt 0 ] || { print 0; return 0; }
  vn="g${b}_w"; print ${(P)vn}
}

render_parts() {  # <barra do contexto> <1=com tokens | 0=sem> <1=com estudo de cota | 0=sem>
  CTX_BAR=$1; CTX_TOKENS=$2; PACE_ON=$3
  nblocks=0; cells_ch=(); cells_fg=(); _ptext=""; part_block=()
  local spec id join vn
  for spec in "${part_specs[@]}"; do
    id="${spec%%:*}"; join="${spec#*:}"; [ "$join" = "$spec" ] && join=space
    [ "$PACE_ON" = 0 ] && [[ "$id" == (pace|win5h|win7d) ]] && continue
    [ "$join" = block ] && flush_block
    add_part "$id" "$join"
  done
  flush_block
  WIDEST=0
  # Laço explicito: {1..0} em zsh conta pra tras e quebra com zero bloco.
  local gi=1
  while [ $gi -le $nblocks ]; do
    vn="g${gi}_w"; [ ${(P)vn} -gt $WIDEST ] && WIDEST=${(P)vn}
    gi=$((gi + 1))
  done
}

# Adapta a tela, bloco a bloco: o contexto larga os tokens e depois encurta a
# barra; se o bloco da conta ainda nao couber, o estudo de cota sai e sobram a
# marca da conta, a versao e o status.
render_parts $cfg_ctx_bar $cfg_ctx_tokens 1
[ $(block_w context) -gt $cap ] && render_parts $cfg_ctx_bar 0 $PACE_ON
[ $(block_w context) -gt $cap ] && render_parts 4 0 $PACE_ON
[ $(block_w account) -gt $cap ] && render_parts $CTX_BAR $CTX_TOKENS 0

# --- Greedy: enche cada pilula ate o limite, abre nova quando o proximo bloco nao cabe ---
avail=(); vn=""
gi=1
while [ $gi -le $nblocks ]; do
  vn="g${gi}_w"; [ "${(P)vn}" -gt 0 ] && avail+=($gi)
  gi=$((gi + 1))
done
lines=(); cur=""; curw=0
for gi in "${avail[@]}"; do
  vn="g${gi}_w"; gw=${(P)vn}
  if [ -z "$cur" ]; then
    cur="$gi"; curw=$gw
  elif [ $((curw + SEPW + gw)) -le $cap ]; then
    cur="$cur $gi"; curw=$((curw + SEPW + gw))
  else
    lines+=("$cur"); cur="$gi"; curw=$gw
  fi
done
[ -n "$cur" ] && lines+=("$cur")

# --- Cor das pontas (caps): mesma luz da borda do gradiente (pilula coesa) ---
LE=$EDGE_PEAK; [ $LE -gt 1000 ] && LE=1000
ER=$(( GLASS_BR + (GLASS_SR-GLASS_BR)*LE/1000 - 5 )); [ $ER -lt 0 ] && ER=0
EG=$(( GLASS_BG + (GLASS_SG-GLASS_BG)*LE/1000 ))
EB=$(( GLASS_BB + (GLASS_SB-GLASS_BB)*LE/1000 + 9 )); [ $EB -gt 255 ] && EB=255
# No flat, as pontas usam a MESMA cor do corpo sólido (sem o realce de borda, que num
# renderer com cor desviada destoa e puxa cor): pílula uniforme de ponta a ponta.
if [ "$glass_flat" = "1" ]; then
  ER=$(( GLASS_BR - 5 )); [ $ER -lt 0 ] && ER=0
  EG=$GLASS_BG
  EB=$(( GLASS_BB + 9 )); [ $EB -gt 255 ] && EB=255
fi
FCAP="\033[38;2;${ER};${EG};${EB}m"

# Renderiza uma pilula a partir de pcells_ch/pcells_fg -> REPLY (gradiente + caps).
render_pill() {
  local N=${#pcells_ch}; [ $N -lt 1 ] && N=1
  local line="${FCAP}${CAP_L}" k=0 t d d2 L r g bch
  if [ "$glass_flat" = "1" ]; then   # fundo solido (cor central), imune ao color mgmt do terminal
    r=$(( GLASS_BR - 5 )); [ $r -lt 0 ] && r=0
    g=$GLASS_BG
    bch=$(( GLASS_BB + 9 )); [ $bch -gt 255 ] && bch=255
  fi
  while [ $k -lt $N ]; do
    if [ "$glass_flat" != "1" ]; then
      [ $N -gt 1 ] && t=$(( k * 1000 / (N - 1) )) || t=500
      d=$(( 2*t - 1000 )); d2=$(( d * d / 1000 ))   # 0 no centro, 1000 nas pontas
      L=$(( EDGE_PEAK * d2 / 1000 )); [ $L -gt 1000 ] && L=1000
      r=$(( GLASS_BR + (GLASS_SR - GLASS_BR) * L / 1000 ))
      g=$(( GLASS_BG + (GLASS_SG - GLASS_BG) * L / 1000 ))
      bch=$(( GLASS_BB + (GLASS_SB - GLASS_BB) * L / 1000 ))
      r=$(( r - 5 )); [ $r -lt 0 ] && r=0
      bch=$(( bch + 9 )); [ $bch -gt 255 ] && bch=255
    fi
    line="${line}\033[48;2;${r};${g};${bch}m${pcells_fg[$((k+1))]}${pcells_ch[$((k+1))]}"
    k=$((k+1))
  done
  REPLY="${line}${RESET}${FCAP}${CAP_R}${RESET}"
}

# Monta as celulas de uma pilula (padding + blocos + separadores) e renderiza.
render_line() {  # args: indices de bloco (ex: render_line 1 2 3)
  pcells_ch=(); pcells_fg=()
  pcells_ch+=(" " " "); pcells_fg+=("$C_TERT" "$C_TERT")
  local first=1 gi s chname fgname
  for gi in "$@"; do
    if [ $first -eq 0 ]; then
      s=1; while [ $s -le $SEPW ]; do pcells_ch+=(" "); pcells_fg+=("$C_TERT"); s=$((s+1)); done
    fi
    first=0
    chname="g${gi}_ch"; fgname="g${gi}_fg"
    pcells_ch+=("${(@P)chname}"); pcells_fg+=("${(@P)fgname}")
  done
  pcells_ch+=(" " " "); pcells_fg+=("$C_TERT" "$C_TERT")
  render_pill
}

out=""
for ln in "${lines[@]}"; do
  render_line ${=ln}
  if [ -n "$out" ]; then out="${out}"$'\n'"${REPLY}"; else out="$REPLY"; fi
done
printf "%b" "$out"

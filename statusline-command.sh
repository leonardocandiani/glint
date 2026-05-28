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
  "used_pct=" + ((.context_window.used_percentage // 0) | tostring)
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

# --- Bloco 1: identidade (modelo, effort, lampada do thinking, raio do fast) ---
# Em tela apertada o texto do effort sai; modelo, lampada e raio sempre ficam.
build_id() {  # <1=com texto do effort | 0=sem>
  cells_ch=(); cells_fg=(); _ptext=""
  _push "${C_ACCENT}${BOLD}" "$model"
  [ "$1" = "1" ] && [ -n "$effort" ] && _push "${C_EFFORT}${BOLD}" "  ${effort}"
  [ "$thinking" = "true" ]  && _push "$C_GOLD"   " ${ICON_THINK}"
  [ "$fast_mode" = "true" ] && _push "$C_SECOND" " ${ICON_FAST}"
}
build_id 1
[ ${(m)#_ptext} -gt $cap ] && build_id 0
g1_ch=("${cells_ch[@]}"); g1_fg=("${cells_fg[@]}"); g1_w=${(m)#_ptext}

# --- Bloco 2: projeto ---
cells_ch=(); cells_fg=(); _ptext=""
_push "${NB}${C_SECOND}" "${ICON_FOLDER} "
_push "$C_PRIMARY" "$project_name"
g2_ch=("${cells_ch[@]}"); g2_fg=("${cells_fg[@]}"); g2_w=${(m)#_ptext}
if [ -n "$proj_url" ]; then            # envolve o bloco num hyperlink (largura nao muda)
  g2_fg[1]="\033]8;;${proj_url}\a${g2_fg[1]}"
  g2_ch[-1]="${g2_ch[-1]}\033]8;;\a"
fi

# --- Bloco 3: git / worktree ---
cells_ch=(); cells_fg=(); _ptext=""
_push "$C_SECOND" "${git_icon} "
_push "$C_PRIMARY" "$git_label"
[ -n "$dirty_str" ] && _push "$C_DIRTY" " •${changes}"
g3_ch=("${cells_ch[@]}"); g3_fg=("${cells_fg[@]}"); g3_w=${(m)#_ptext}
if [ -n "$git_url" ]; then             # envolve o bloco num hyperlink (largura nao muda)
  g3_fg[1]="\033]8;;${git_url}\a${g3_fg[1]}"
  g3_ch[-1]="${g3_ch[-1]}\033]8;;\a"
fi

# --- Bloco 4: contexto (icone, slider, %, tokens) ---
# Adapta a tela: completo (barra 8 + % + tokens) -> sem tokens -> barra curta sem
# tokens. Escolhe a versao mais rica que cabe numa pilula.
build_ctx() {  # <bar_len> <1=mostra tokens | 0=nao>
  cells_ch=(); cells_fg=(); _ptext=""
  local bl=$1 bf i
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
  if [ "$2" = "1" ]; then
    _push "$C_PRIMARY" "  ${tokens_display}"
    _push "$C_SECOND" "/${context_display}"
  fi
}
build_ctx 8 1
[ ${(m)#_ptext} -gt $cap ] && build_ctx 8 0
[ ${(m)#_ptext} -gt $cap ] && build_ctx 4 0
g4_ch=("${cells_ch[@]}"); g4_fg=("${cells_fg[@]}"); g4_w=${(m)#_ptext}

# --- Greedy: enche cada pilula ate o limite, abre nova quando o proximo bloco nao cabe ---
avail=(); vn=""
for gi in 1 2 3 4; do
  vn="g${gi}_w"; [ "${(P)vn}" -gt 0 ] && avail+=($gi)
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
FCAP="\033[38;2;${ER};${EG};${EB}m"

# Renderiza uma pilula a partir de pcells_ch/pcells_fg -> REPLY (gradiente + caps).
render_pill() {
  local N=${#pcells_ch}; [ $N -lt 1 ] && N=1
  local line="${FCAP}${CAP_L}" k=0 t d d2 L r g bch
  while [ $k -lt $N ]; do
    [ $N -gt 1 ] && t=$(( k * 1000 / (N - 1) )) || t=500
    d=$(( 2*t - 1000 )); d2=$(( d * d / 1000 ))   # 0 no centro, 1000 nas pontas
    L=$(( EDGE_PEAK * d2 / 1000 )); [ $L -gt 1000 ] && L=1000
    r=$(( GLASS_BR + (GLASS_SR - GLASS_BR) * L / 1000 ))
    g=$(( GLASS_BG + (GLASS_SG - GLASS_BG) * L / 1000 ))
    bch=$(( GLASS_BB + (GLASS_SB - GLASS_BB) * L / 1000 ))
    r=$(( r - 5 )); [ $r -lt 0 ] && r=0
    bch=$(( bch + 9 )); [ $bch -gt 255 ] && bch=255
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

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

# === GIT / WORKTREE (um unico git status) ===
git_icon="$ICON_GIT"
dirty_str=""
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

# Barra slider fina (altura menor que o card), knob redondo destacando o final
bar_total=8
bar_fill=$(( (context_pct * bar_total + 50) / 100 ))
[ $bar_fill -gt $bar_total ] && bar_fill=$bar_total
[ $bar_fill -lt 0 ] && bar_fill=0
[ $context_pct -gt 0 ] && [ $bar_fill -eq 0 ] && bar_fill=1

bar=""
i=1
while [ $i -le $bar_total ]; do
  if   [ $i -lt $bar_fill ]; then bar="${bar}${STATE}━"
  elif [ $i -eq $bar_fill ]; then bar="${bar}${STATE}●"
  else bar="${bar}${C_TERT}─"
  fi
  i=$((i+1))
done

# Cor do effort por nivel (inspirado no menu /effort do CC)
case "$effort" in
  low)    C_EFFORT="\033[38;2;240;190;70m" ;;   # dourado
  medium) C_EFFORT="\033[38;2;48;215;88m" ;;    # verde
  high)   C_EFFORT="\033[38;2;77;158;255m" ;;   # azul
  xhigh)  C_EFFORT="\033[38;2;167;139;250m" ;;  # roxo
  max)    C_EFFORT="\033[38;2;210;110;245m" ;;  # magenta
  *)      C_EFFORT="$C_SECOND" ;;
esac

# === MONTAGEM "liquid glass" - gradiente horizontal char-by-char (alta resolucao) ===
# Quebramos a linha em CELULAS (cada uma = 1 fg + 1 char) e reconstruimos celula a
# celula com um BG interpolado por uma curva de luz CONTINUA (sem degraus/ilhas):
# bordas claras (rim light, o vidro pega luz nas pontas) -> centro mais escuro
# (corpo translucido) -> bordas claras de novo. Tint frio azulado.
GLASS_BR=50;  GLASS_BG=50;  GLASS_BB=58     # centro (corpo do vidro, mais escuro)
GLASS_SR=96;  GLASS_SG=100; GLASS_SB=118    # bordas (vidro pegando luz, cinza-azul claro)
EDGE_PEAK=680  # quanto as bordas clareiam (0..1000); o centro fica na cor base
sp="   "

# Empilha celulas (char + fg), sem BG. Caps ficam FORA do loop pra formar a pilula.
cells_ch=(); cells_fg=()
_push() { local fg="$1" txt="$2" n=${#2} k=1
  while [ $k -le $n ]; do cells_ch+=("${txt[$k]}"); cells_fg+=("$fg"); k=$((k+1)); done; }

_push "$C_TERT" "  "
_push "${C_ACCENT}${BOLD}" "$model"
[ -n "$effort" ]          && _push "${C_EFFORT}${BOLD}" "  ${effort}"
[ "$thinking" = "true" ]  && _push "$C_GOLD"   " ${ICON_THINK}"
[ "$fast_mode" = "true" ] && _push "$C_SECOND" " ${ICON_FAST}"
_push "${NB}${C_SECOND}" "${sp}${ICON_FOLDER} "
_push "$C_PRIMARY" "$project_name"
_push "$C_SECOND" "${sp}${git_icon} "
_push "$C_PRIMARY" "$git_label"
[ -n "$dirty_str" ] && _push "$C_DIRTY" " •${changes}"
_push "$C_SECOND" "${sp}${ICON_CTX} "
i=1
while [ $i -le $bar_total ]; do
  if   [ $i -lt $bar_fill ]; then _push "$STATE" "━"
  elif [ $i -eq $bar_fill ]; then _push "$STATE" "●"
  else _push "$C_TERT" "─"; fi
  i=$((i+1))
done
_push "${STATE}${BOLD}" "  ${context_pct}%"
_push "$C_PRIMARY" "  ${tokens_display}"
_push "$C_SECOND" "/${context_display}"
_push "$C_TERT" "  "

N=${#cells_ch}; [ $N -lt 1 ] && N=1

# Cor das pontas (L=EDGE_PEAK, mais claras) com tint frio = cor dos caps (pilula coesa).
LE=$EDGE_PEAK; [ $LE -gt 1000 ] && LE=1000
ER=$(( GLASS_BR + (GLASS_SR-GLASS_BR)*LE/1000 - 5 )); [ $ER -lt 0 ] && ER=0
EG=$(( GLASS_BG + (GLASS_SG-GLASS_BG)*LE/1000 ))
EB=$(( GLASS_BB + (GLASS_SB-GLASS_BB)*LE/1000 + 9 )); [ $EB -gt 255 ] && EB=255
FCAP="\033[38;2;${ER};${EG};${EB}m"

line="${FCAP}${CAP_L}"
k=0
while [ $k -lt $N ]; do
  [ $N -gt 1 ] && t=$(( k * 1000 / (N - 1) )) || t=500
  d=$(( 2*t - 1000 )); d2=$(( d * d / 1000 ))   # 0 no centro, 1000 nas pontas
  L=$(( EDGE_PEAK * d2 / 1000 )); [ $L -gt 1000 ] && L=1000
  r=$(( GLASS_BR + (GLASS_SR - GLASS_BR) * L / 1000 ))
  g=$(( GLASS_BG + (GLASS_SG - GLASS_BG) * L / 1000 ))
  bch=$(( GLASS_BB + (GLASS_SB - GLASS_BB) * L / 1000 ))
  r=$(( r - 5 )); [ $r -lt 0 ] && r=0
  bch=$(( bch + 9 )); [ $bch -gt 255 ] && bch=255
  line="${line}\033[48;2;${r};${g};${bch}m${cells_fg[$((k+1))]}${cells_ch[$((k+1))]}"
  k=$((k+1))
done
line="${line}${RESET}${FCAP}${CAP_R}${RESET}"

printf "%b" "$line"

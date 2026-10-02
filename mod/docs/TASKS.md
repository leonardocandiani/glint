# glint mod: recriação com cartões

Estado em 02/10/2026, 09:47. Branch `feat/mod`, worktree `~/tools/_wt-glint-mod`, nada commitado.

## Feito e verificado

- Cartões no hover: cada bloco com `card` vira uma área `hover` com `scope` `glint-<id>`, e o cartão fica escondido acima das pílulas, dentro da faixa. Provado no Claude Code real (tmux, 150 colunas, mouse simulado por SGR): abre com o mouse no bloco e some quando o mouse sai.
- Limite medido: `position: "absolute"` acima da faixa NÃO aparece, a engine recorta pela região da faixa. O cartão tem que estar dentro das linhas da faixa (ela cresce para cima).
- Agenda da Apple lida do banco da Central (`sqlite3 -readonly`), sem "Pessoal Helo". Compromisso de agora com barra até o fim, próximo de hoje, ou o primeiro de amanhã quando o dia está livre. Cartão com o dia e amanhã.
- Toast 10 minutos antes de cada compromisso, uma vez.
- Cartão da cota: 5h e 7d com barra, quando volta e reserva.
- Agenda dentro do bloco do relógio (02/10, 10:3x): a pílula só nomeia o compromisso em andamento ou que começa em até 1 hora; fora disso mostra só data e hora. O cartão do relógio tem o calendário do mês (hoje no acento, dia com compromisso na cor dele) ao lado da lista do dia e de amanhã; em faixa baixa cai para só a lista.
- Cartões de versão (instalada, nova, `claude update`), status (status.claude.com e latência da API, também no ícone de rede) e repositório (GitHub, branch, à frente/atrás, último commit em PT, arquivos alterados; no projeto e na branch). Todos provados no Claude Code real no tmux.
- 23 testes passando, validate ok.

## Etapa 2 (depois do reset da cota semanal, 18:00)

1. Central e WhatsApp: bloco com aprovações pendentes e conversas sem tratar, cartão com as últimas mensagens que pedem resposta. Fonte: CLI `central` (só leitura) ou o banco dela. Nada é enviado.
2. Painel "Hoje" (`/glint hoje`): linha do tempo do dia em `Raster`, compromissos, Central, cota, botões (entrar na reunião, abrir Central).
3. Ferramenta para o Claude (`$.tool.register`): agenda e Central consultáveis pelo modelo.
4. Cartões de contexto e modelo.
5. Tecla para abrir o link da reunião quando faltar pouco.

## Pendências e dúvidas

- Calendários: só "Agenda Léo" e "Leonardo Candiani - Gmail" (lista do que mostrar, sem acento na comparação). O Gmail ainda não chega: a Central só sincroniza o iCloud; falta o feed ICS do Google em `AGENDA_ICS_URLS` da Central, com o nome "Leonardo Candiani - Gmail".
- Título longo do compromisso empurra o relógio para a segunda pílula em 150 colunas; avaliar corte em ~22 caracteres.
- A lista de calendários é `CALENDARS_DEFAULT` no código; virar opção salva em `$.store` (`/glint agenda <calendário>`).

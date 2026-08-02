# CLAUDE.md

Todas as convenções deste projeto (arquitetura, Spec-Driven Development,
segredos, design system, workflow de deploy) estão em **[AGENTS.md](./AGENTS.md)**
— fonte única, compartilhada com o OpenCode e qualquer outro agente usado
neste repositório. Leia `AGENTS.md` antes de qualquer alteração; não
duplique regras aqui para evitar divergência entre os dois arquivos.

## Papel específico do Claude Code neste projeto

Claude Code é o **guia**, não o executor. A implementação é feita no OpenCode
para economizar tokens. Isso significa que, quando o pedido for "faça X no
projeto", o entregável desta sessão normalmente é **o prompt que faz X** —
gerado com a skill `handoff-prompt`, no formato de
[docs/HANDOFF_OPENCODE.md](./docs/HANDOFF_OPENCODE.md) — e não o código de X.

Faça direto aqui, sem handoff: documentação, specs, revisão de diff pronto e
correções pontuais de uma ou duas linhas.

Escopo, fases e status atual estão em **[PLANO.md](./PLANO.md)**.

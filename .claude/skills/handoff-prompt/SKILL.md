---
name: handoff-prompt
description: Use quando o usuário pedir um prompt, uma tarefa ou um pacote de execução para o OpenCode neste projeto — monta o prompt no formato padrão (contexto, skill, tarefa, restrições, aceite) em vez de implementar direto aqui.
---

# handoff-prompt

Neste projeto o Claude Code é **guia**, não executor: a implementação é feita
no OpenCode para economizar tokens (ver `PLANO.md`, seção 2). Quando a tarefa
for "faça X no projeto", o entregável desta sessão é **o prompt que faz X**,
não o código de X.

## Quando NÃO usar

Continue implementando direto aqui quando for:
- edição de documentação, spec ou do próprio `AGENTS.md`;
- revisão de diff pronto;
- uma correção pontual de uma ou duas linhas, onde escrever o prompt custaria
  mais que fazer.

## Formato obrigatório do prompt gerado

Cinco blocos, nessa ordem, dentro de um bloco de código para o usuário copiar:

```
CONTEXTO   → fase do PLANO.md, domínio, o que já existe no repositório
SKILL      → qual(is) /comando(s) o OpenCode deve ativar antes de começar
TAREFA     → passos numerados, cada um verificável por conta própria
RESTRIÇÕES → o que não pode mudar, com o motivo quando não for óbvio
ACEITE     → como saber que terminou, em termos observáveis
```

## Regras de qualidade

1. **Passos verificáveis.** "Implemente o serviço" é ruim; "implemente
   `applySuggestedPrice` reusando `PricingService.calculateSuggestedPrice` e
   confirme o preço por releitura" é bom.
2. **Aceite observável.** Nada de "funcionando bem" — use número, log ou
   comportamento de tela concreto.
3. **Restrições vêm do `AGENTS.md`,** não da sua imaginação. Repita só as que
   importam para essa tarefa; o OpenCode já lê o `AGENTS.md` inteiro sozinho.
4. **Aponte a spec pelo caminho** (`specs/<dominio>.md`) em vez de colar o
   conteúdo dela — o OpenCode lê o arquivo.
5. **Nunca coloque segredo no prompt.** Se a tarefa depende da API key,
   instrua a lê-la de Script Properties.
6. **Uma fase por prompt.** Se a tarefa cruzar duas fases, gere dois prompts
   e diga em que ordem rodar.

## Depois de gerar

Diga em uma linha o que esperar de volta do OpenCode (diff, log, valor de
tela) para que a revisão da fase possa acontecer aqui. Prompts recorrentes,
já estabilizados, moram em `docs/HANDOFF_OPENCODE.md` — se o que você acabou
de gerar for reutilizável, proponha adicioná-lo lá.

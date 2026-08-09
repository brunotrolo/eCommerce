# docs/historico — planejamento superado

⚠️ **Não siga estes documentos.** Eles descrevem uma versão anterior do
projeto, anterior à decisão de arquitetura atual, e contradizem o plano em
vigor em vários pontos (MVP baseado em planilha em vez de Web App, integração
com Bling, fases de 8 semanas, cálculo de preço com imposto e ads embutidos).

Ficam aqui só como registro de como o projeto foi pensado no começo.

**O plano em vigor é [`../../PLANO.md`](../../PLANO.md).**

| Arquivo | Por que foi superado |
|---|---|
| `ROADMAP_Executivo.md` | Propunha 4 fases centradas em Google Sheet + Bling; o projeto virou Web App em GAS com 5 domínios via Tiops |
| `Phase1_Implementation_Guide.md` | Guia de implementação do MVP em planilha, com código que não corresponde à arquitetura atual em camadas |

## Specs de features removidas

Diferente da tabela acima (planejamento inicial nunca implementado), estas
são specs de features que **foram implementadas e depois removidas** do
projeto. Cada arquivo tem seu próprio `## Status: Removed` no topo
explicando o motivo — consulte `PLANO.md`, seção "Escopo funcional v1",
para o contexto de cada remoção.

| Arquivo | Feature removida | Substituída por |
|---|---|---|
| `specs-listings.md` | Página "Anúncios" (listar/pausar/reativar anúncios dos 2 canais) | Domínio "Anúncios Shopee" (`specs/anuncios-shopee.md`) |
| `specs-estoque-preco-update.md` | Edição de preço em lote no Estoque via widget dedicado (`EstoquePrecoBulkView.html`/`EstoquePrecoService.js`) — nunca funcionou (widget fantasma, nunca montado no Shell) | `estoque.updateItem` (`specs/estoque.md`) |

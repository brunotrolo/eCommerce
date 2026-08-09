# Spec: Estoque (otimização de getItems)

## Status
Implemented

## Objetivo
Resolver o P3 do diagnóstico (`docs/DIAGNOSTICO_ARQUITETURA.md`): `estoque.getItems`
lê a aba ESTOQUE **inteira** (`EstoqueRepository.getRows` sem filtro) a cada
chamada, sem cache server-side e sem limite. No preload do Shell (que chama
`estoque.getItems` sem filtros) e a cada "Atualizar", o custo é O(N) read da
planilha + sort em memória — escala mal com milhares de unidades. A mudança
adiciona **cache server-side TTL curto** e **limite de retorno** sem quebrar o
contrato existente da UI.

Este domínio existe e está implementado (contrato completo = `describe()` do
`EstoqueService.js`). Esta spec documenta apenas o delta da otimização.

## Contrato da API Interna (delta sobre o existente)

### `estoque.getItems` — mudanças propostas
- Params (novos, opcionais):
  | nome | tipo | obrigatório | default | descrição |
  |---|---|---|---|---|
  | `codigoProduto` | string | não | — | filtro por código (atual) |
  | `status` | string | não | — | filtro por status (atual) |
  | `sortBy` | string | não | `data_entrada` | `data_entrada` \| `preco_custo` \| `preco_venda` \| `margem` (atual) |
  | `sortOrder` | string | não | `asc` | `asc` \| `desc` (atual) |
  | `limit` | number | não | sem limite (comportamento atual) | máx. de itens retornados; quando presente, `total` é devolvido |
- Retorno (delta):
  - `items`: array de itens (como hoje).
  - `total` (novo): número total de itens que casam com o filtro, antes do
    corte (sempre presente; sem `limit` é igual a `items.length`).
  - `fromCache` (novo, só quando `true`): resposta veio do cache server
    (transparência para a UI/diagnóstico).
- Erros esperados: os mesmos de hoje (`Sheet ID não configurado`).

### Cache server-side (interno, sem nova action)
- Chave: `estoque_items_<sortBy>_<sortOrder>` (apenas leitura sem filtro —
  filtros não cacheiam; padrão `invalidateByPattern('estoque_')` cobre).
- TTL: **60s** (curto — estoque muda por escritas próprias; um TTL longo
  faria a tela mostrar dado stale após importar NF).
- Invalidação: qualquer fluxo de escrita do próprio domínio que já chama
  `invalidateCachesFluxo_()` derruba a chave (padrão `estoque_` — corrigido
  na implementação, ver Notas).
- Cache só se aplica a chamadas **sem filtro** (o caso do preload e da tela).
  Chamadas com `codigoProduto`/`status` continuam lendo da planilha (são
  buscas localizadas e de volume menor).

## Regras de Negócio
- O cache é **leitura apenas**: nunca cachear resultado de ação de escrita.
- `limit` é otimização de payload, não de negócio: quando presente, o
  retorno traz `total` para a UI paginar/avisar "mostrando X de Y".
- Ordem de aplicação: filtros → sort → `limit` (corte no final).
- `fromCache` não deve ser usado para decisão de negócio na UI; é só
  transparência/diagnóstico.

## Casos de Borda
- Filtro com `limit`: total reflete o filtro, não o corte.
- Escrita logo após leitura cacheada: TTL de 60s + invalidação por padrão
  `estoque_` limita a janela de staleness.
- `limit` sem filtro: retorna os N mais recentes/melhor ordenados
  (conforme `sortBy`/`sortOrder`).
- Limit inválido (não-número, 0, negativo): ignorado (comportamento atual
  permanece — sem erro).

## Critérios de Aceite (Given/When/Then)
- Given o preload do app chamando `estoque.getItems` sem filtro, When roda
  2x em menos de 60s, Then a 2ª resposta vem de cache (`fromCache: true`)
  e não há leitura da planilha (verificável por `trace_`/logs).
- Given `limit=100` com 1.000 itens, When chamado, Then `items.length ===
  100` e `total === 1000`.
- Given um import de NF (escrita do domínio), When `getItems` é chamado
  depois, Then responde com dados frescos (cache invalidado).
- Given o contrato anterior da UI (sem `limit`), When chamado sem os novos
  params, Then retorno continua idêntico ao de hoje (sem `total`, sem
  `fromCache` obrigatório — ou com `fromCache` apenas informativo).

## Fora de Escopo
- Paginação por página/offset (a UI atual consome lista completa; `limit`
+`total` já cobre o caso de payload).
- Cache para chamadas filtradas.
- Mudança no esquema da aba ESTOQUE ou no sort.

## Dependências
- Services usados: `PricingService` (não muda), `CatalogService` (não muda).
- Repositories usados: `EstoqueRepository`, `CacheRepository` (novo uso).
- Ações Tiops: nenhuma.

## Notas de Implementação
- Corrigido bug de invalidação: os 4 call-sites usavam
  `invalidateByPattern('estoque.')` (ponto), que nunca casava com chaves
  `estoque_*` — agora usam `'estoque_'` (mesmo tratamento para
  `frontend.` → `frontend_` e `dashboard.` → `dashboard_` onde existiam).
- TTL de 60s escolhido para equilibrar boot rápido vs. staleness pós-
  escrita; revisar se a tela reclamar.
# Spec: Ferramenta de Pareamento de SKU (Anúncio Shopee ↔ Produto de Estoque)

## Status
Implemented

> Implementado em 10/08/2026: `ProdutoSkuMapService`, `ProdutoSkuMapView`,
> action `updateSku` (contrato `shopee_update_item` confirmado por sondagem
> real no mesmo dia — no-op no item 58264575830, shopId 1880105398) e guard
> `SEM_ESTOQUE` nos 2 caminhos de baixa.
> Consolidado em 12/08/2026: domínio `anunciosShopee` absorvido —
> `syncListings`/`updateSku` passam a viver em `ProdutoSkuMapService` e o
> `AnunciosShopeeRepository` vira `ProdutoSkuMapRepository` (leituras sem
> criar aba); `src/03_services/anunciosShopee/` removido.
> **Página removida 12/08/2026** (`ui/produtoSkuMap/ProdutoSkuMapView.html`
> deletada + rota/dropdown/include/preFetch do Shell removidos): o
> pareamento manual sai do frontend por decisão do usuário — `getSugestoes`
> e `updateSku` seguem como ações do backend (úteis via API/script e smoke
> tests). O passo `produtoSkuMap.syncListings` é **garantido** na cadeia
> "Sincronizar Tudo" por `DashboardService.getSyncOrder()` (insere após
> `estoque.sincronizarPrecosCatalogo` mesmo se a aba CONFIG não o listar).

## Objetivo

Acelerar o pareamento entre os anúncios da Shopee (`ANUNCIOS_SHOPEE`) e os
produtos do estoque (`ESTOQUE`), usando o campo nativo `item_sku` da Shopee
como chave única — sem tabela de mapeamento interna paralela (que exigiria
lógica própria de sincronização e poderia divergir do dado real na Shopee).

O `item_sku` nasce vazio nos anúncios e o usuário precisa decidir, uma vez,
qual `CODIGO_PRODUTO` cada anúncio representa (ou declarar que o anúncio não
tem controle de estoque unitário — ex. itens de casa/cozinha sem NFe
correspondente). Esta spec cobria **a ferramenta de apoio a essa decisão**
(sugestão por similaridade de texto + tela de confirmação + escrita via
`produtoSkuMap.updateSku`) e **o guard de sentinela na baixa de estoque**
(`SEM_ESTOQUE`), sem o qual pedidos de itens sem estoque gerariam
pendências eternas. **A UI foi removida em 12/08/2026** — `getSugestoes` e
`updateSku` seguem como ações de backend (via API/script e smoke tests); o
`syncListings` continua rodando automaticamente na cadeia "Sincronizar
Tudo". O usuário pode parear diretamente na Shopee (`item_sku` na própria
plataforma) ou via chamada direta à ação.

## Fatos confirmados (10/08/2026) — corrigem as premissas da versão Draft

| Premissa antiga (09/08) | Realidade |
|---|---|
| `item_sku` vazio em **todos** os 41 anúncios | Loja tem **43** itens `NORMAL` (`shopee_list_items` total_count). Pelo menos 1 já tem `item_sku` preenchido manualmente (`PERF-DEL-001` no item 58264575830) — o usuário pode parear direto na Shopee; a ferramenta cobre só o que sobrar |
| Coluna `ITEM_SKU` na aba | A aba usa coluna **`SKU`** (somente-leitura, reescrita a cada `syncListings` a partir do `item_sku` real — ver `getSellerSku_`) |
| Existe `produtoSkuMap.updateSku` (ex-`anunciosShopee.updateSku`) | **Não existia** — criado em 10/08, migrado para `ProdutoSkuMapService` em 12/08 |
| Existe sentinela `SEM_ESTOQUE` | **Não existia** — criada nesta entrega, com guard nos 2 caminhos de baixa (`OrdersImportService.processBaixaForOrder_` e `EstoqueBaixaService.backfillExistingOrders`) |
| Sem tabela de mapeamento própria | Mantida (a sentinela é só um `item_sku` literal na Shopee) |

### Contrato Tiops confirmado por sondagem (no-op, item PERF-DEL-001)

- `shopee_update_item` com `{ shopId, item_id: <uint64 NUMBER>, item_sku: <string> }`
  → `status 200`, resposta ecoa o item com `item_sku` atualizado.
- ⚠️ **`item_id` deve ser number (uint64)** — string é rejeitado:
  `cannot unmarshal string into Go struct field UpdateItemRequest.item_id of type uint64`.
  (Diferente de `shopee_update_price`/`shopee_update_stock`, que aceitam string.)
- Warning informativo: `gtin is a mandatory field for some category` (não
  bloqueia o update de `item_sku`).
- Releitura (fonte da verdade, nunca confiar na resposta do update):
  `shopee_get_item` → `response.item_list[0].item_sku`.

## Contrato da API Interna

### `produtoSkuMap.getSugestoes`
- **Descrição:** lista os anúncios de `ANUNCIOS_SHOPEE` com `SKU` vazio (não
  pareados) e, para cada um, sugere até 3 candidatos de `CODIGO_PRODUTO` por
  similaridade de texto contra os produtos de `ESTOQUE`. Também devolve a
  lista completa de produtos (para busca manual na UI).
- **Params:** nenhum.
- **Retorno:**
  ```javascript
  {
    pendentes: [
      {
        itemId: string,
        nomeAnuncio: string,
        imagemUrl: string,
        candidatos: [
          { codigoProduto: string, descricaoProduto: string, score: number } // 0-100
        ]
      }
    ],
    produtos: [ { codigoProduto: string, descricaoProduto: string } ], // p/ busca manual
    total: number
  }
  ```
- **Erros esperados:** nenhum — `{ pendentes: [], produtos: [], total: 0 }` se
  a aba estiver vazia ou sem pendências.

### `produtoSkuMap.updateSku` (ação absorvida do domínio `anunciosShopee` em 12/08/2026)
- **Descrição:** grava o `item_sku` de um anúncio na Shopee e confirma por
  releitura antes de tocar o Sheets.
- **Params:** `{ itemId: string (requerido), sku: string (requerido) }`.
- **Fluxo:** `shopee_update_item` (com `item_id` como **number**) → sleep 500ms
  → `shopee_get_item` → confirma `item_list[0].item_sku === sku` → senão falha
  sem meio-termo → `patchMain({ SKU, DADOS_JSON, DATA_SINCRONIZACAO })`.
- **Retorno:** `{ success, itemId, sku }` ou `{ success: false, motivo }`.

## Regras de Negócio

1. **Sem tabela de mapeamento própria.** Todo vínculo mora na Shopee
   (`item_sku` → coluna `SKU` da aba via sync). Esta ferramenta só lê
   `ANUNCIOS_SHOPEE` e `ESTOQUE` e escreve via `produtoSkuMap.updateSku`.
2. **Sentinela `SEM_ESTOQUE`:** `item_sku = 'SEM_ESTOQUE'` marca um anúncio
   como intencionalmente sem controle de estoque unitário. Efeitos:
   - some de `getSugestoes()` (deixa de ter SKU vazio);
   - **guard nos 2 caminhos de baixa** (`processBaixaForOrder_` no
     `OrdersImportService` e `backfillExistingOrders` no `EstoqueBaixaService`):
     pedidos desse item são ignorados silenciosamente na baixa — sem pendência,
     sem custo. Modificação mínima (um `continue` por arquivo), o motor FIFO
     (`EstoqueBaixaService.baixarPorProduto`) não é alterado.
3. **Algoritmo de similaridade (lógica pura exportada para smoke test):**
   - `normalizarTexto(texto)`: lowercase → remover acentuação (NFD) → remover
     stopwords de baixo sinal (`perfume`, `original`, `eau`, `de`, `parfum`,
     `toilette`, `ml`, `edp`, `feminino`, `masculino`, `árabes`, `100ml`, etc.)
     → tokenizar em palavras únicas.
   - `scoreSimilaridade(tituloNormalizado, descricaoNormalizada)`: percentual
     de tokens do lado mais curto (tipicamente a descrição de estoque)
     presentes no lado mais longo (título de marketing). 0-100.
   - Ordenar candidatos por score decrescente, retornar top-3 (só score > 0).
4. **`getSugestoes()` é sempre recalculado, nunca cacheado de forma
   persistente** — uso esporádico sob demanda; cada chamada lê as abas frescas.
5. **Fonte de candidatos é `ESTOQUE`** (`CODIGO_PRODUTO`/`DESCRICAO_PRODUTO`),
   não o modelo paralelo do Catálogo — a baixa consulta exatamente `ESTOQUE`.
   Campos confirmados: `EstoqueRepository.HEADERS` usa `DESCRICAO_PRODUTO`.

## Casos de Borda

- **Anúncio sem candidato razoável** (score 0 em todos — típico dos itens
  "Art House"/"Casita") → `candidatos` vazio; sem UI desde 12/08/2026, o
  usuário pode marcar `SEM_ESTOQUE` diretamente na Shopee ou via chamada à
  ação `produtoSkuMap.updateSku`.
- **Mesmo `CODIGO_PRODUTO` sugerido para dois anúncios** → permitido (vários
  anúncios podem apontar para o mesmo produto físico).
- **Aba `ANUNCIOS_SHOPEE` nunca sincronizada** → `{ pendentes: [], total: 0 }`,
  não erro. O `syncListings` é garantido na cadeia "Sincronizar Tudo" e
  traz o `item_sku` real antes de qualquer consulta.
- **`item_sku` preenchido diretamente na Shopee pelo usuário** (caso real:
  `PERF-DEL-001`) → some da lista após o próximo `syncListings`; a ação
  nunca sobrescreve um SKU existente (só lista pendentes).
- **`updateSku` falha na releitura** → `{ success: false, motivo }`; sem
  meio-termo — o item continua pendente na próxima chamada.

## Critérios de Aceite (Given/When/Then)

1. **Sugestão por similaridade acerta caso real**
   - Given anúncio `ITEM_ID=58264575830`, `NOME="Perfume Árabe Delilah Maison
     Alhambra Feminino 100ml Eau de Parfum EDP Original"`, `SKU=''`, e produto
     de estoque `CODIGO_PRODUTO=6231`,
     `DESCRICAO_PRODUTO="MAISON DELILAH"`
   - When `getSugestoes()` é chamado
   - Then `6231` aparece entre os candidatos desse `ITEM_ID` com score alto
     (coberto por smoke test em `runSmokeTests_`, dado puro).
2. **Confirmar grava o SKU na Shopee e sai da lista de pendentes**
   - Given um anúncio pendente
   - When a ação `produtoSkuMap.updateSku({itemId, sku:'6231'})` é chamada
     (via API/script) e a releitura confirma
   - Then `ANUNCIOS_SHOPEE.SKU='6231'` e `getSugestoes()` não inclui mais o item
3. **Marcar sem estoque sai da lista e pedidos não geram pendência**
   - Given um anúncio sem candidato
   - When a ação `produtoSkuMap.updateSku({itemId, sku:'SEM_ESTOQUE'})` é chamada
   - Then `SKU='SEM_ESTOQUE'`, o item não aparece mais em `getSugestoes()`, e um
     pedido com esse item não cria pendência de baixa (guards
     `processBaixaForOrder_` + `backfillExistingOrders`)
4. **Base real pareável de ponta a ponta**
   - Given a loja real (43 itens NORMAL em 10/08/2026)
   - When o usuário pareia direto na Shopee (ou via chamada à ação
     `produtoSkuMap.updateSku`) e roda "Sincronizar Tudo"
   - Then `getSugestoes()` retorna `{ pendentes: [], total: 0 }` ao final

## Fora de Escopo (v1)

- Reversão em massa (desfazer vários pareamentos de uma vez).
- Kit/combo (1 anúncio = N produtos com quantidades diferentes) — o
  `item_sku` é 1:1 com `CODIGO_PRODUTO`; precisa de spec própria se aparecer.
- Variações/modelos (`model_sku` por variação) — todos os anúncios reais são
  `sem_variacao` hoje; fica para quando o caso aparecer.
- Importação/exportação em lote (CSV) do pareamento.
- Alteração do motor FIFO de baixa — o guard `SEM_ESTOQUE` é externo ao motor.

## Dependências

- **Tiops:** `shopee_update_item` (grava `item_sku`) e `shopee_get_item`
  (releitura) — confirmados por sondagem real em 10/08/2026, registrados em
  `docs/referencia/CONTRATOS_CONFIRMADOS.md` no mesmo commit desta spec.
- **Services/Repository existentes:**
  - `ProdutoSkuMapRepository.getAll()` (fonte dos pendentes; campos
    `ITEM_ID`, `SKU`, `NOME`, `IMAGEM_URL` conforme `MAIN_HEADERS`).
  - `ProdutoSkuMapRepository.patchMain()` (escrita pós-confirmação).
  - `EstoqueRepository.getRows()` (fonte dos candidatos;
    `CODIGO_PRODUTO`/`DESCRICAO_PRODUTO`).
- **Services alterados nesta entrega:**
  - `ProdutoSkuMapService` (ações `syncListings`/`updateSku` — domínio
    `anunciosShopee` absorvido em 12/08/2026).
  - `OrdersImportService.processBaixaForOrder_` (guard `SEM_ESTOQUE`).
  - `EstoqueBaixaService.backfillExistingOrders` (guard `SEM_ESTOQUE`).

## Notas de Implementação

1. **Estrutura de arquivos (após consolidação de 12/08/2026):**
   ```
   src/03_services/produtoSkuMap/ProdutoSkuMapRepository.js (ex-AnunciosShopeeRepository;
                               leituras nunca criam aba; escritas usam getOrCreateSheet)
   src/03_services/produtoSkuMap/ProdutoSkuMapService.js    (getSugestoes + syncListings + updateSku)
   ```
   O domínio `anunciosShopee` (service + repository) foi removido; a view
   `ui/produtoSkuMap/ProdutoSkuMapView.html` foi removida em 12/08/2026 (sem
   UI no frontend). O inventário master de anúncios Shopee continua na aba
   `ANUNCIOS_SHOPEE`, escrita por `ProdutoSkuMapRepository` (mesmos headers;
   consumidores: baixa de estoque via `item_sku`, `OrdersImportService`
   restore de `ITEM_SKUS` e `CatalogService` vendas por SKU).
2. **`filePushOrder`:** `ProdutoSkuMapRepository.js` entra antes de
   `CatalogService.js` e de `OrdersImportService.js` (dependentes);
   `ProdutoSkuMapService.js` depois de `EstoqueRepository.js` e de
   `ProdutoSkuMapRepository.js` (dependências), antes de `ServiceRegistry.js`.
3. **Registro em `ServiceRegistry.js`:** padrão defensivo `safeRef_`.
4. **UI removida (12/08/2026):** a `ProdutoSkuMapView.html` foi deletada e a
   rota/dropdown/include/preFetch do `Shell.html` removidos. O pareamento
   manual sai do frontend — `getSugestoes` e `updateSku` seguem como ações
   de backend (via API/script). Histórico: era um Web Component com Shadow
   DOM, cards de anúncios pendentes, candidatos por score, busca manual e
   botão "Marcar sem estoque"; escritas via
   `mutateData('produtoSkuMap.updateSku')`.
5. **Rota em `Shell.html`:** **removida** em 12/08/2026 (não há mais entrada
   "Parear SKU" no dropdown "Produtos").
6. **Smoke tests:** `runSmokeTests_` ganha casos para `normalizarTexto` e
   `scoreSimilaridade` (cenário Delilah/6231 — critério de aceite 1), usando
   os métodos públicos exportados pelo serviço.
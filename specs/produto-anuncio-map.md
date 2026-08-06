# Spec: Mapeamento Anúncio Shopee ↔ Produto de Estoque (MAPA_PRODUTO_ANUNCIO)

## Status
Draft

## Objetivo

Resolver o elo que **não é automatizável** na cadeia "pedido Shopee → unidade de
estoque": ligar o `ITEM_ID` de um anúncio (`ANUNCIOS_SHOPEE`) ao `CODIGO_PRODUTO`
correspondente em `ESTOQUE`/`NFE_ENTRADA_PRODUTOS`.

Investigação nos dados reais do usuário confirmou que essa ligação não pode ser
inferida automaticamente:
- `ANUNCIOS_SHOPEE.item_sku` está **vazio em todos os 41 anúncios reais** da loja
  (campo `item_sku` do payload Shopee, `""` em 100% da amostra verificada) — não há
  SKU cadastrado no lado Shopee para casar com `CODIGO_PRODUTO`.
- Os nomes não batem literalmente: título de anúncio (marketing) ex. `"Perfume
  Árabe Delilah Maison Alhambra Feminino 100ml Eau de Parfum EDP Original"` vs.
  descrição de estoque (nome de ERP/nota fiscal) ex. `"MAISON DELILAH"` — palavras
  presentes mas fora de ordem e cercadas de texto de marketing.
- `CODIGO_PRODUTO` (ex. `6231`) e `ITEM_ID` (ex. `58265432428`) são dois sistemas
  de identificação numérica completamente diferentes, sem relação estrutural.
- A loja vende produtos mistos — perfumes (com entrada via NFe/estoque) e itens de
  casa/cozinha (marcas "Art House"/"Casita") que hoje não têm correspondência em
  `NFE_ENTRADA_PRODUTOS`. Nem todo anúncio deve necessariamente ter um
  `CODIGO_PRODUTO` — é preciso um jeito explícito de dizer "este anúncio não tem
  controle de estoque unitário".

A solução é uma tabela de mapeamento mantida por humano (41 anúncios hoje é
gerenciável), com sugestão automática por similaridade de texto para acelerar o
cadastro inicial e o cadastro de novos anúncios no futuro.

## Contrato da API Interna

### `produtoAnuncioMap.getSugestoes`
- **Descrição:** para cada `ITEM_ID` de `ANUNCIOS_SHOPEE` que ainda não tem entrada
  `CONFIRMADO` ou `IGNORADO` em `MAPA_PRODUTO_ANUNCIO`, calcula até 3 candidatos de
  `CODIGO_PRODUTO` por similaridade de texto contra a lista de produtos do catálogo
  (`CatalogService.getProducts()` ou leitura direta de `ESTOQUE` — ver Notas).
- **Params:** nenhum.
- **Retorno:**
  ```javascript
  {
    pendentes: [
      {
        itemId: string,
        modelId: string,        // '' se o anúncio não tem variação
        nomeAnuncio: string,
        candidatos: [
          { codigoProduto: string, descricaoProduto: string, score: number } // score 0-100
        ]
      }
    ],
    total: number
  }
  ```

### `produtoAnuncioMap.confirmar`
- **Descrição:** grava a decisão humana de que um `ITEM_ID` (+ `MODEL_ID`
  opcional) corresponde a um `CODIGO_PRODUTO`.
- **Params:**
  | Nome | Tipo | Obrigatório | Descrição |
  |------|------|-------------|-----------|
  | `itemId` | string | sim | ID do anúncio na Shopee |
  | `modelId` | string | não | ID da variação, se houver (default `''`) |
  | `codigoProduto` | string | sim | Código do produto em `ESTOQUE`/catálogo |
- **Retorno:** `{ success: boolean }`.
- **Erros esperados:** `codigoProduto` que não existe em nenhum produto conhecido
  do catálogo → aviso não-bloqueante (permite mapear mesmo assim; produto pode
  ainda não ter entrada de NFe registrada).

### `produtoAnuncioMap.ignorar`
- **Descrição:** marca um `ITEM_ID` como sem controle de estoque unitário (ex.
  produtos "Art House"/"Casita" sem NFe correspondente).
- **Params:** `{ itemId: string, modelId?: string }`
- **Retorno:** `{ success: boolean }`.

### `produtoAnuncioMap.getMap`
- **Descrição:** retorna o dicionário `item_id(+model_id) → codigoProduto` pronto
  para consumo por `EstoqueBaixaService`/`estoque-baixa-shopee`. Cacheado (ver
  Regras de Negócio).
- **Params:** nenhum.
- **Retorno:** `{ map: { "<itemId>" : { codigoProduto: string } , "<itemId>:<modelId>": {...} }, atualizadoEm: string }`.

### `produtoAnuncioMap.listMapeados`
- **Descrição:** lista todos os mapeamentos já confirmados ou ignorados, para
  auditoria/edição na UI.
- **Params:** `{ status?: 'CONFIRMADO' | 'IGNORADO' | 'PENDENTE' }`
- **Retorno:** `{ items: array }` — todas as colunas de `MAPA_PRODUTO_ANUNCIO`.

## Formato da Aba MAPA_PRODUTO_ANUNCIO

```
ITEM_ID | MODEL_ID | NOME_ANUNCIO_SHOPEE | CODIGO_PRODUTO | DESCRICAO_PRODUTO_ESTOQUE | SUGESTAO_SIMILARIDADE | STATUS | CONFIRMADO_POR | CONFIRMADO_EM | LOG_ID
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| ITEM_ID | string | ID do anúncio Shopee (chave, junto com MODEL_ID) |
| MODEL_ID | string | ID da variação, `''` se o anúncio não tem variação |
| NOME_ANUNCIO_SHOPEE | string | Snapshot do título no momento do mapeamento (auditoria — título pode mudar depois) |
| CODIGO_PRODUTO | string | Código em `ESTOQUE`/catálogo — vazio se `STATUS='IGNORADO'` |
| DESCRICAO_PRODUTO_ESTOQUE | string | Snapshot da descrição do produto mapeado |
| SUGESTAO_SIMILARIDADE | number | Score (0-100) da sugestão que originou a confirmação, `''` se mapeado manualmente sem sugestão |
| STATUS | string | `'CONFIRMADO'` \| `'IGNORADO'` |
| CONFIRMADO_POR | string | `'Manual'` (v1 não distingue usuários — projeto é single-user) |
| CONFIRMADO_EM | dd/MM/yyyy HH:mm:ss | Timestamp BR |
| LOG_ID | string | `YYYYMMDDHHMMSS-<nonce8>` |

**Nota:** não existe linha `STATUS='PENDENTE'` persistida — pendência é a
*ausência* de linha para aquele `ITEM_ID(+MODEL_ID)`. `getSugestoes` calcula
pendentes comparando `ANUNCIOS_SHOPEE` contra o que já existe na aba.

## Regras de Negócio

1. **Chave é `ITEM_ID` + `MODEL_ID`.** Anúncio sem variação usa `MODEL_ID=''`. Um
   mapeamento é 1:1 — um `ITEM_ID(+MODEL_ID)` mapeia para exatamente um
   `CODIGO_PRODUTO` (ver Fora de Escopo para o caso de kit/combo).
2. **Sugestão nunca grava sozinha.** `getSugestoes` só calcula e retorna
   candidatos; toda linha em `MAPA_PRODUTO_ANUNCIO` exige `confirmar`/`ignorar`
   explícito.
3. **Algoritmo de similaridade (v1, sem dependência externa):**
   - Normalizar ambos os textos: lowercase, remover acentuação, remover palavras
     genéricas de baixo sinal (`"perfume"`, `"original"`, `"eau"`, `"de"`,
     `"parfum"`, `"toilette"`, `"ml"`, números isolados de volume como `"100ml"`).
   - Tokenizar em palavras, calcular sobreposição (quantos tokens do nome do
     produto de estoque aparecem no título do anúncio, e vice-versa).
   - Score = percentual de tokens do lado mais curto (tipicamente a descrição de
     estoque, mais enxuta) encontrados no lado mais longo (título de marketing).
   - Ordenar candidatos por score decrescente, retornar top-3.
4. **`STATUS='IGNORADO'` é permanente até o usuário reverter manualmente** (não há
   ação de "designorar" nesta v1 — se precisar, editar a linha direto na planilha;
   ação de reversão fica fora de escopo v1 dado o baixo volume de dados).
5. **Cache do `getMap`:** via `CacheRepository`, TTL curto (5 min, mesmo padrão de
   `DashboardService`), invalidado explicitamente (`CacheRepository.
  invalidateByPattern('produtoAnuncioMap.')`) sempre que `confirmar`/`ignorar`
   grava uma linha nova — o motor de baixa (`estoque-baixa-shopee`) não pode operar
   com mapeamento desatualizado depois de o usuário acabar de confirmar algo.
6. **Reprocessamento de pendências:** ao confirmar um mapeamento que tinha itens de
   pedido esperando (`ESTOQUE_BAIXAS.STATUS='PENDENTE_MAPEAMENTO'`, ver
   `specs/estoque-baixa.md`), a UI de confirmação deve, na sequência, chamar
   `estoqueBaixa.reprocessarPendentes()` — não é responsabilidade deste serviço
   disparar isso sozinho (evita acoplar `produtoAnuncioMap` a `estoqueBaixa`), mas a
   spec de `estoque-baixa-shopee.md` deve amarrar esse fluxo na UI.

## Casos de Borda

- **Anúncio sem nenhum candidato de similaridade razoável** (score muito baixo em
  todos, ex. produtos "Art House"/"Casita" sem NFe correspondente) → `candidatos`
  vem vazio ou com scores baixos; UI deixa claro que a melhor ação provável é
  "Ignorar".
- **Mesmo `CODIGO_PRODUTO` sugerido para dois `ITEM_ID` diferentes** (ex. o mesmo
  perfume anunciado em dois anúncios distintos, situação plausível) → permitido,
  não é erro. Um `codigoProduto` pode ser destino de múltiplos `item_id`.
- **Anúncio novo criado depois da primeira rodada de mapeamento** → aparece
  automaticamente em `getSugestoes` na próxima chamada (é sempre "o que não tem
  linha ainda em `MAPA_PRODUTO_ANUNCIO`", não uma lista fixa).
- **`ANUNCIOS_SHOPEE` vazia (nunca sincronizada)** → `getSugestoes` retorna
  `{ pendentes: [], total: 0 }`, não erro.
- **Confirmar um `codigoProduto` que não existe em `ESTOQUE` nem no catálogo** →
  aceito com aviso (não bloqueia — o produto pode ter uma NFe pendente de
  sincronização; a spec de `estoque-baixa-shopee.md` trata a ausência de estoque
  real como `faltantes > 0`, não como erro de mapeamento).

## Critérios de Aceite (Given/When/Then)

1. **Sugestão por similaridade acerta caso óbvio**
   - Given anúncio `ITEM_ID=58264575830`, `NOME="Perfume Árabe Delilah Maison
     Alhambra Feminino 100ml Eau de Parfum EDP Original"`, e produto de estoque
     `CODIGO_PRODUTO=6231`, `DESCRICAO="MAISON DELILAH"`
   - When `getSugestoes()` é chamado
   - Then `6231` aparece entre os candidatos desse `ITEM_ID` com score alto
     (validar com os dados reais do usuário, não sintéticos).

2. **Confirmação grava e sai da lista de pendentes**
   - Given um `ITEM_ID` pendente
   - When `confirmar({itemId, codigoProduto})`
   - Then uma linha `STATUS='CONFIRMADO'` é gravada em `MAPA_PRODUTO_ANUNCIO`, e uma
     chamada seguinte a `getSugestoes()` não inclui mais esse `ITEM_ID`.

3. **Ignorar remove da lista de pendentes sem CODIGO_PRODUTO**
   - Given um `ITEM_ID` de um produto sem controle de estoque (ex. "Art House")
   - When `ignorar({itemId})`
   - Then uma linha `STATUS='IGNORADO'` é gravada com `CODIGO_PRODUTO=''`, e não
     aparece mais em `getSugestoes()`.

4. **getMap retorna só confirmados**
   - Given 2 `ITEM_ID` confirmados e 1 ignorado
   - When `getMap()`
   - Then o dict retornado tem exatamente 2 entradas (o ignorado não aparece).

5. **Cache invalidado após confirmação**
   - Given `getMap()` chamado e cacheado
   - When `confirmar(...)` é chamado logo em seguida
   - Then a próxima chamada a `getMap()` já reflete o novo mapeamento (não serve
     cache stale).

6. **41 anúncios reais mapeáveis de ponta a ponta**
   - Given a base real de anúncios do usuário (41 itens)
   - When o usuário percorre a tela de mapeamento confirmando/ignorando todos
   - Then `listMapeados({status:'PENDENTE'})` (calculado via diferença, não
     armazenado) fica vazio — nenhum anúncio sem decisão.

## Fora de Escopo (v1)

- Kit/combo (1 `ITEM_ID` mapeando para N `CODIGO_PRODUTO` com quantidades
  diferentes) — sem evidência disso nos 41 anúncios reais hoje; se aparecer no
  futuro, precisa de spec própria (mapa deixa de ser 1:1).
- Reversão de `STATUS='IGNORADO'` de volta para pendente via API (editar direto na
  planilha por enquanto).
- Reconciliação automática quando um `ITEM_ID` muda de produto ao longo do tempo
  (SKU reciclado) — documentado como risco conhecido, não tratado.
- Importação/exportação em lote (CSV) do mapeamento.

## Dependências

- **Services:**
  - `CatalogService.getProducts()` ou leitura direta de `ESTOQUE`/
    `NFeEntradaProdutosRepository` para a lista de candidatos (decisão de
    implementação: preferir `ESTOQUE` como fonte, já que é o alvo real da baixa —
    ver Notas de Implementação).
  - `CacheRepository` (cache do `getMap`, TTL 5 min).
- **Repositories:**
  - `ProdutoAnuncioMapRepository` (novo) — I/O da aba `MAPA_PRODUTO_ANUNCIO`.
  - Leitura de `ANUNCIOS_SHOPEE` via `AnunciosShopeeRepository.getAll()` (já
    existe).
- **Nenhuma chamada Tiops** — este serviço opera inteiramente sobre dados já
  sincronizados em Sheets.

## Notas de Implementação

1. **Estrutura de arquivos:**
   ```
   src/03_services/produtoAnuncioMap/ProdutoAnuncioMapService.js
   src/03_services/produtoAnuncioMap/ProdutoAnuncioMapRepository.js
   ui/produtoAnuncioMap/ProdutoAnuncioMapView.html
   ```
2. **`filePushOrder`:** `ProdutoAnuncioMapRepository.js` no bloco de repositories
   (depende só de `SheetsRepository`/`ConfigService`); `ProdutoAnuncioMapService.js`
   em `03_services`, depois de `AnunciosShopeeRepository.js` (lê anúncios) e antes
   de `ServiceRegistry.js`.
3. **Registro em `ServiceRegistry.js`:** padrão defensivo
   `produtoAnuncioMap: safeRef_('produtoAnuncioMap', function () { return typeof
   ProdutoAnuncioMapService !== 'undefined' ? ProdutoAnuncioMapService : undefined;
   })`.
4. **Fonte de candidatos para similaridade:** usar `EstoqueRepository.getRows()`
   agregado por `CODIGO_PRODUTO` único (não `CatalogService`, que hoje calcula um
   agregado paralelo e desconectado de `ESTOQUE` — ver achado de arquitetura em
   `PLANO.md`/análise do projeto; não vale a pena acoplar esta spec nova a um
   cálculo que já está sinalizado para ser substituído).
5. **UI (`ProdutoAnuncioMapView.html`):** Web Component com Shadow DOM, padrão do
   projeto. Lista cada `ITEM_ID` pendente com: imagem/nome do anúncio, candidatos
   sugeridos como botões rápidos (score visível), e um campo de busca/picklist
   manual (reaproveitar o padrão de picklist com filtro já usado em
   `ManualSaidaListView.html` para "produtos disponíveis") para os casos sem boa
   sugestão. Botão "Ignorar" sempre visível. Usa `withLoading`/`showError` de
   `UiHelpers.html` (padrão único de erro do projeto, `specs/error-handling-ui.md`).
6. **Rota em `Shell.html`:** adicionar `data-route="produtoAnuncioMap"` no grupo
   "Produtos" do dropdown de navegação (mesmo grupo de "Preço e Estoque" e
   "Catálogo" — é uma tela de configuração/manutenção de produto, não de
   operação diária).

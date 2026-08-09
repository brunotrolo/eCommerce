# Spec: Ferramenta de Pareamento Inicial de SKU (Anúncio Shopee ↔ Produto de Estoque)

## Status
Draft

> Nota (09/08/2026): as specs de domínio já implementadas
> (`anuncios-shopee.md`, `estoque.md`) foram consolidadas/removidas — ver
> `specs/ARQUITETURA.md`. As referências de "amendment" abaixo foram
> atualizadas para apontar ao serviço real; o texto original do amendment
> (se precisar) está no histórico do git.

## Objetivo

Acelerar o pareamento único entre os anúncios da Shopee (`ANUNCIOS_SHOPEE`) e os
produtos do estoque (`ESTOQUE`), usando o campo nativo `item_sku` da Shopee como
chave (ver amendment em `src/03_services/anunciosShopee/AnunciosShopeeService.js`) — em vez de manter uma tabela de
mapeamento interna paralela, que exigiria lógica própria de sincronização e poderia
divergir do dado real na Shopee.

Como o `item_sku` está vazio em todos os anúncios reais da loja hoje (41 itens),
alguém precisa decidir, uma vez, qual `CODIGO_PRODUTO` cada anúncio representa (ou
declarar que o anúncio não tem controle de estoque unitário — ex. os itens de
casa/cozinha "Art House"/"Casita" sem NFe correspondente). Esta spec cobre **só a
ferramenta de apoio a essa decisão** (sugestão por similaridade de texto + tela de
confirmação) — a escrita em si do SKU na Shopee é `anunciosShopee.updateSku`
(já especificada no amendment de `src/03_services/anunciosShopee/AnunciosShopeeService.js`); esta spec não
reimplementa isso.

Depois do pareamento inicial, o fluxo deixa de precisar desta ferramenta para os
mesmos itens — só reaparece quando um anúncio novo é criado sem `item_sku` definido.

## Contrato da API Interna

### `produtoSkuMap.getSugestoes`
- **Descrição:** lista os anúncios de `ANUNCIOS_SHOPEE` com `ITEM_SKU` vazio (ainda
  não pareados) e, para cada um, sugere até 3 candidatos de `CODIGO_PRODUTO` por
  similaridade de texto contra os produtos conhecidos em `ESTOQUE`.
- **Params:** nenhum.
- **Retorno:**
  ```javascript
  {
    pendentes: [
      {
        itemId: string,
        nomeAnuncio: string,
        candidatos: [
          { codigoProduto: string, descricaoProduto: string, score: number } // 0-100
        ]
      }
    ],
    total: number
  }
  ```
- **Erros esperados:** nenhum — lista vazia se `ANUNCIOS_SHOPEE` estiver vazia ou
  se não houver pendências.

Não há ações de escrita nesta spec. Confirmar um candidato ou marcar "sem estoque"
é uma chamada direta a `anunciosShopee.updateSku({itemId, sku})` — a UI desta spec
chama essa ação existente com `sku = codigoProduto` (pareamento) ou `sku =
'SEM_ESTOQUE'` (item sem controle de estoque unitário), sem ação intermediária
própria.

## Regras de Negócio

1. **Sem tabela de mapeamento própria.** Toda a informação de vínculo mora em
   `ANUNCIOS_SHOPEE.ITEM_SKU` (Shopee é a fonte única de verdade). Esta spec só lê
   `ANUNCIOS_SHOPEE` e `ESTOQUE` para calcular sugestões — não persiste nada.
2. **Convenção do SKU sentinela:** `ITEM_SKU = 'SEM_ESTOQUE'` (literal, definida no
   amendment de `src/03_services/anunciosShopee/AnunciosShopeeService.js`) marca um anúncio como intencionalmente
   sem controle de estoque unitário. Uma vez marcado assim, o item some da lista de
   `getSugestoes()` (deixa de ter `ITEM_SKU` vazio) e a baixa automática por
   pedido Shopee (`OrdersImportService.processBaixaForOrder_`, já implementada
   — ver nota abaixo) ignora silenciosamente pedidos desse item — sem gerar
   pendência, porque a ausência de estoque ali é deliberada, não um
   esquecimento.

   **⚠️ Atenção ao retomar esta spec:** a baixa automática já foi implementada
   (09/08/2026) por um caminho diferente do assumido acima —
   `OrdersImportService` resolve os SKUs via `AnunciosShopeeRepository.getItemSkuMap`
   num campo `ITEM_SKUS` por pedido, e `ANUNCIOS_SHOPEE` usa uma coluna `SKU`
   somente-leitura (reescrita a cada `syncListings` a partir do `item_sku` real
   da Shopee, sem write-back). Não existe hoje sentinela `SEM_ESTOQUE` nem
   `anunciosShopee.updateSku`. Confirme o mecanismo real antes de implementar
   esta ferramenta — as premissas acima podem estar desatualizadas.
3. **Algoritmo de similaridade (mesmo da versão anterior desta spec, reaproveitado
   sem mudança):**
   - Normalizar ambos os textos: lowercase, remover acentuação, remover palavras
     genéricas de baixo sinal (`"perfume"`, `"original"`, `"eau"`, `"de"`,
     `"parfum"`, `"toilette"`, `"ml"`, números isolados de volume como `"100ml"`).
   - Tokenizar em palavras, calcular sobreposição de tokens entre o nome do produto
     de estoque e o título do anúncio.
   - Score = percentual de tokens do lado mais curto (tipicamente a descrição de
     estoque) encontrados no lado mais longo (título de marketing da Shopee).
   - Ordenar candidatos por score decrescente, retornar top-3.
4. **`getSugestoes()` é sempre recalculado, nunca cacheado de forma persistente** —
   como só roda sob demanda (tela de pareamento, uso esporádico), não há TTL de
   cache aqui; cada chamada lê `ANUNCIOS_SHOPEE`/`ESTOQUE` frescos.
5. **Fonte de candidatos é `ESTOQUE`, não o cálculo agregado do Catálogo** — mesmo
   motivo já documentado no projeto: `CatalogService` calcula estoque num modelo
   paralelo e desconectado de `ESTOQUE`; esta ferramenta sugere produtos que
   realmente existem na fonte que a baixa automática vai consultar.

## Casos de Borda

- **Anúncio sem nenhum candidato de similaridade razoável** (score baixo em todos —
  típico dos itens "Art House"/"Casita" sem NFe) → `candidatos` vem vazio ou com
  scores baixos; a UI deixa claro que a ação provável é "Marcar sem estoque".
- **Mesmo `CODIGO_PRODUTO` sugerido para dois anúncios diferentes** (o mesmo
  perfume anunciado em dois `item_id` distintos, situação plausível) → permitido,
  não é erro — vários anúncios podem apontar para o mesmo produto físico.
- **`ANUNCIOS_SHOPEE` vazia (nunca sincronizada)** → `getSugestoes()` retorna
  `{ pendentes: [], total: 0 }`, não erro.
- **Usuário reverte um `'SEM_ESTOQUE'` para pareamento real depois** — chama
  `anunciosShopee.updateSku({itemId, sku: codigoProduto})` diretamente (a UI desta
  ferramenta pode oferecer isso mostrando também os já marcados `'SEM_ESTOQUE'` com
  opção de re-parear, mas o essencial já está coberto pela ação existente, sem
  necessidade de ação nova).
- **`anunciosShopee.updateSku` falha na releitura** (ver `src/03_services/anunciosShopee/AnunciosShopeeService.js`)
  → a UI exibe o erro (`withLoading`/`showError`, padrão único do projeto) e o item
  continua aparecendo em `getSugestoes()` na próxima chamada, sem meio-termo
  (SKU só muda de fato se a releitura confirmar).

## Critérios de Aceite (Given/When/Then)

1. **Sugestão por similaridade acerta caso real**
   - Given anúncio `ITEM_ID=58264575830`, `NOME="Perfume Árabe Delilah Maison
     Alhambra Feminino 100ml Eau de Parfum EDP Original"`, `ITEM_SKU=''`, e produto
     de estoque `CODIGO_PRODUTO=6231`, `DESCRICAO="MAISON DELILAH"`
   - When `getSugestoes()` é chamado
   - Then `6231` aparece entre os candidatos desse `ITEM_ID` com score alto
     (validado com os dados reais do usuário).

2. **Confirmar grava o SKU na Shopee e sai da lista de pendentes**
   - Given um anúncio pendente com candidato `6231`
   - When a UI chama `anunciosShopee.updateSku({itemId, sku:'6231'})` e a releitura
     confirma
   - Then `ANUNCIOS_SHOPEE.ITEM_SKU='6231'`, e uma chamada seguinte a
     `getSugestoes()` não inclui mais esse `itemId`.

3. **Marcar sem estoque sai da lista sem exigir candidato**
   - Given um anúncio sem candidato razoável (ex. item "Art House")
   - When a UI chama `anunciosShopee.updateSku({itemId, sku:'SEM_ESTOQUE'})`
   - Then `ANUNCIOS_SHOPEE.ITEM_SKU='SEM_ESTOQUE'`, e o item não aparece mais em
     `getSugestoes()`.

4. **41 anúncios reais pareáveis de ponta a ponta**
   - Given a base real de anúncios do usuário
   - When o usuário percorre a tela confirmando ou marcando "sem estoque" todos
   - Then `getSugestoes()` retorna `{ pendentes: [], total: 0 }` ao final.

## Fora de Escopo (v1)

- Reversão em massa (desfazer vários pareamentos de uma vez).
- Kit/combo (1 anúncio representando N produtos com quantidades diferentes) — o SKU
  é 1:1 com `CODIGO_PRODUTO`; se aparecer esse caso, precisa de spec própria.
- Variações/modelos (`model_sku` por variação) — todos os anúncios reais hoje são
  `TIPO_VARIACAO='sem_variacao'`; SKU por variação fica para quando o caso aparecer.
- Importação/exportação em lote (CSV) do pareamento.

## Dependências

- **Services:**
  - `anunciosShopee.updateSku` (amendment em `src/03_services/anunciosShopee/AnunciosShopeeService.js`) — única
    ação de escrita usada por esta ferramenta.
  - `AnunciosShopeeRepository.getAll()` (já existe) — fonte dos anúncios pendentes.
  - `EstoqueRepository.getRows()` (já existe) — fonte dos candidatos por
    similaridade.
- **Nenhuma chamada Tiops direta nesta spec** — toda escrita passa por
  `anunciosShopee.updateSku`, que já encapsula a chamada e a releitura.

## Notas de Implementação

1. **Estrutura de arquivos:**
   ```
   src/03_services/produtoSkuMap/ProdutoSkuMapService.js
   ui/produtoSkuMap/ProdutoSkuMapView.html
   ```
   Sem repository próprio — `ProdutoSkuMapService` só lê via
   `AnunciosShopeeRepository`/`EstoqueRepository` já existentes, e escreve
   chamando `AnunciosShopeeService.updateSku` diretamente (mesma camada de
   serviço, chamada direta é aceitável dado que ambos vivem em `03_services` — não
   é uma dependência de repository cruzando camada).
2. **`filePushOrder`:** `ProdutoSkuMapService.js` entra depois de
   `AnunciosShopeeService.js`/`AnunciosShopeeRepository.js` e depois de
   `EstoqueRepository.js` (ambos dos quais depende), antes de `ServiceRegistry.js`.
3. **Registro em `ServiceRegistry.js`:** padrão defensivo
   `produtoSkuMap: safeRef_('produtoSkuMap', function () { return typeof
   ProdutoSkuMapService !== 'undefined' ? ProdutoSkuMapService : undefined; })`.
4. **UI (`ProdutoSkuMapView.html`):** Web Component com Shadow DOM, padrão do
   projeto. Lista cada anúncio pendente com imagem/nome, candidatos sugeridos como
   botões rápidos (score visível) que chamam `anunciosShopee.updateSku` direto, um
   campo de busca/picklist manual para os casos sem boa sugestão (reaproveitar o
   padrão de picklist com filtro já usado em `ManualSaidaListView.html`), e um
   botão "Marcar sem estoque" sempre visível. Usa `withLoading`/`showError` de
   `UiHelpers.html` (padrão único de erro do projeto).
5. **Rota em `Shell.html`:** grupo "Produtos" do dropdown de navegação (mesmo grupo
   de "Preço e Estoque" e "Catálogo" — é tela de configuração/manutenção, não de
   operação diária).
6. **Depende do amendment de `src/03_services/anunciosShopee/AnunciosShopeeService.js` estar implementado
   primeiro** (`ITEM_SKU` na aba + ação `updateSku`) — sem isso, não há nada para
   esta ferramenta ler nem escrever.

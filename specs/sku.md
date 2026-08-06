# Spec: Sistema de SKU

## Status
Approved

## Objetivo
Criar um sistema de SKU único que identifique cada produto em todas as abas do sistema (NFE_ENTRADA_PRODUTOS, MANUAL_ENTRADA_PRODUTOS, MANUAL_SAIDA_PRODUTOS, ESTOQUE, PEDIDOS, ANUNCIOS_SHOPEE) e sirva como ponte entre nosso controle no Google Sheets e o cadastro na Shopee.

## Formato do SKU

### Padrão: `CATEGORIA-MARCA-SEQUENCIAL`

| Parte | Exemplo | Regra |
|---|---|---|
| CATEGORIA | `PERF` | 3-4 letras, sem acentos |
| MARCA | `LAT` | 2-4 letras, sem acentos |
| SEQUENCIAL | `001` | 3 dígitos, zero à esquerda |

**Exemplos:**
- `PERF-LAT-001` → Perfume Lattafa (primeiro item)
- `PERF-LAT-002` → Perfume Lattafa (segundo item)
- `UTI-ISS-001` → Utilidade (Itens Essencia) primeiro item
- `COZ-POT-001` → Cozinha (Pote) primeiro item

### Regras de Formato (Shopee)
1. **Sem acentos ou caracteres especiais** — apenas letras, hífens e números
2. **Unicidade** — cada produto/variação tem SKU único
3. **Variações** — SKU base + sufixo: `PERF-LAT-001-VD` (variante Verde)

## Mapeamento de Categorias

| Código | Categoria | Produtos Típicos |
|---|---|---|
| `PERF` | Perfumaria | Eau de Parfum, Eau de Toilette, colônia |
| `UTI` | Utilidade | Mop, vassoura, balde, sacola |
| `COZ` | Cozinha | Pote, panela, utensílios |
| `LIM` | Limpeza | Detergente, desinfetante, sabão |
| `DEC` | Decoração | Quadro, vaso, luminária |
| `OUT` | Outros | Itens que não se encaixam acima |

**Detecção automática (heurística):**
- Se `DESCRICAO_PRODUTO` contém "PERFUME", "EAU DE", "EDT", "EDP", "COLÔNIA" → `PERF`
- Se contém "MOP", "VASSOURA", "BALDE", "SACOLA", "KIT" → `UTI`
- Se contém "POTE", "PANELA", "COPO", "COLHER" → `COZ`
- Se contém "DETERGENTE", "DESINFETANTE", "SABÃO" → `LIM`
- Caso contrário → `OUT`

## Mapeamento de Marcas

O NF-e **não** traz campo de marca. A marca será:

1. **Extraída da descrição** (heurística): primeira palavra significativa do `xProd`
   - "PERFUME LATTAFA ASAD" → marca = "LATTAFA" → sigla "LAT"
   - "MAISON DELILAH" → marca = "MAISON" → sigla "MAI"
   - "POTE DE VIDRO QUADRADO" → marca = "GEN" (genérico)

2. **Tabela de marcas conhecidas** (lookup):
   - LATTAFA → LAT
   - MAISON ALHAMBRA → MAL
   - ARMAF → ARM
   - ASAAF → ASA
   - AL WATANIAH → ALW
   - RAYHAAN → RAY
   - OUTROS → 3 primeiras letras da marca

3. **Fallback:** Se não conseguir determinar marca, usa "GEN" (genérico)

## Contrato da API Interna

### `SkuService.describe()`
- Retorna: `{ actions: [...] }`

### `SkuService.generate(params)`
- Descrição: Gera um SKU único para um produto
- Params:
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |---|---|---|---|---|
  | `descricaoProduto` | string | sim | - | Descrição do produto (para detectar categoria/marca) |
  | `ncm` | string | não | - | Código NCM (ajuda a detectar categoria) |
  | `categoria` | string | não | auto | Forçar categoria específica |
  | `marca` | string | não | auto | Forçar marca específica |
- Retorno: `{ sku: "PERF-LAT-001" }`
- Erros: `SKU_GENERATION_FAILED`

### `SkuService.batchGenerate(params)`
- Descrição: Gera SKUs para múltiplos produtos
- Params:
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |---|---|---|---|---|
  | `items` | array | sim | - | Array de `{ descricaoProduto, ncm?, categoria?, marca? }` |
- Retorno: `{ skus: ["PERF-LAT-001", "UTI-ISS-001", ...] }`

### `SkuService.resolve(description, ncm)`
- Descrição: Detecta categoria e marca a partir de dados do produto
- Params:
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |---|---|---|---|---|
  | `description` | string | sim | - | Descrição do produto |
  | `ncm` | string | não | - | Código NCM |
- Retorno: `{ category: "PERF", brand: "LAT" }`

### `SkuService.backfill(params)`
- Descrição: Gera SKUs para todos os itens existentes que não possuem SKU
- Params:
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |---|---|---|---|---|
  | `dryRun` | boolean | não | `false` | Se true, apenas mostra o que seria feito |
- Retorno: `{ processed: 150, generated: 120, skipped: 30 }`

## Regras de Negócio

### Geração de SKU
1. **Único** — sempre verificar unicidade antes de retornar SKU
2. **Sequencial** — buscar próximo número disponível para a combinação CATEGORIA+MARCA
3. **Imutável** — uma vez gerado, o SKU não muda (a menos que o produto seja removido)
4. **Auto-populate** — ao importar NF-e ou cadastrar entrada manual, SKU é gerado automaticamente

### Detecção Automática
1. **Categoria** — heurística sobre `DESCRICAO_PRODUTO` + `NCM`
2. **Marca** — heurística sobre `DESCRICAO_PRODUTO` + tabela de marcas conhecidas
3. **Fallback** — se não detectar, usar `OUT` para categoria e `GEN` para marca

### Propagação do SKU
O SKU deve ser inserido/actualizado em:
- `NFE_ENTRADA_PRODUTOS` → nova coluna `SKU`
- `MANUAL_ENTRADA_PRODUTOS` → nova coluna `SKU`
- `MANUAL_SAIDA_PRODUTOS` → nova coluna `SKU`
- `ESTOQUE` → nova coluna `SKU`
- `PEDIDOS` → `ITEM_SKUS` já existe (formato `SKU:QTD`)
- `ANUNCIOS_SHOPEE` → nova coluna `SKU`

### Vinculação com Shopee
- Ao cadastrar anúncio na Shopee, usar o SKU gerado como `seller_sku`
- Ao importar pedidos, o `ITEM_SKUS` já vem com o SKU do Shopee
- Matching: comparar SKU do pedido com SKU da aba ESTOQUE

### Backfill
1. Ler todos os itens de NFE_ENTRADA_PRODUTOS que não têm SKU
2. Para cada item, gerar SKU usando `resolve()` + `generate()`
3. Atualizar a planilha com o SKU gerado
4. Repetir para MANUAL_ENTRADA_PRODUTOS, MANUAL_SAIDA_PRODUTOS, ESTOQUE
5. Para PEDIDOS: extrair SKU de `ITEM_SKUS` e preencher se vazio
6. Para ANUNCIOS_SHOPEE: quando sincronizar, extrair `seller_sku` do DADOS_JSON

## Casos de Borda

1. **Produto com mesma descrição, fornecedores diferentes** — SKU único por produto, não por fornecedor
2. **Produto com descrição muito curta** ("MOP") — usar descrição completa quando disponível
3. **Produto sem NCM** — categoria detectada apenas pela descrição
4. **Marca não conhecida** — usar 3 primeiras letras da primeira palavra significativa
5. **SKU já existe na Shopee** — usar o SKU existente, não gerar novo
6. **Múltiplas variações** — SKU base + sufixo (`-VD`, `-AZ`, etc.)
7. **Produto genérico sem marca** — usar "GEN"

## Critérios de Aceite (Given/When/Then)

### Geração Automática
- **Given** uma descrição "PERFUME LATTAFA ASAD 100ML" **When** gero SKU **Then** resultado = `PERF-LAT-NNN`

- **Given** uma descrição "MOP SPRAY ZEIN GIRATORIO" **When** gero SKU **Then** resultado = `UTI-GEN-NNN`

- **Given** uma descrição "POTE DE VIDRO QUADRADO" **When** gero SKU **Then** resultado = `COZ-GEN-NNN`

### Unicidade
- **Given** que `PERF-LAT-001` já existe **When** gero novo SKU para marca LATTAFA **Then** resultado = `PERF-LAT-002`

### Propagação
- **Given** um item novo na NF-e **When** importo a nota **Then** SKU é gerado e inserido em NFE_ENTRADA_PRODUTOS

- **Given** uma entrada manual **When** cadastro o item **Then** SKU é gerado e inserido em MANUAL_ENTRADA_PRODUTOS

### Backfill
- **Given** 100 itens sem SKU **When** rodo backfill **Then** 100 SKUs são gerados e atualizados

### Vinculação Shopee
- **Given** um produto com SKU `PERF-LAT-001` **When** cadastro na Shopee **Then** `seller_sku` = `PERF-LAT-001`

## Fora de Escopo
- Integração com Bling/UpSeller (futuro)
- Varições de produto (SKU + sufixo) — será implementado quando necessário
- Regras de precificação baseadas em SKU
- Categorias de marketplace (Shopee/ML) — são independentes do SKU interno

## Dependências
- `NFeEntradaProdutosRepository` — adicionar coluna SKU
- `ManualEntradaProdutosRepository` — adicionar coluna SKU
- `ManualSaidaProdutosRepository` — adicionar coluna SKU
- `EstoqueRepository` — adicionar coluna SKU
- `OrdersRepository` — ITEM_SKUS já existe
- `AnunciosShopeeRepository` — adicionar coluna SKU
- `NFeEntradaProdutosService` — gerar SKU ao processar NF-e
- `ManualEntradaService` — gerar SKU ao cadastrar entrada
- `ManualSaidaService` — incluir SKU na saída
- `EstoqueService` — propagar SKU ao sincronizar
- `OrdersImportService` — extrair SKU de ITEM_SKUS
- `AnunciosShopeeService` — extrair seller_sku do DADOS_JSON
- `CatalogService` — incluir SKU na listagem de produtos

## Notas de Implementação
- SKU é sempre UPPERCASED (consistente com descrições)
- Separador é hífens (`-`), sem espaços
- Sequencial começa em 001 para cada combinação CATEGORIA+MARCA
- Tabela de marcas conhecidas deve ser fácil de expandir
- Backfill pode ser rodado múltiplas vezes sem duplicar (só gera para itens sem SKU)

# Spec: Controle de Estoque (ESTOQUE)

## Status
Approved

## Objetivo

**Aba unitária de controle de estoque** que rastreia cada unidade de produto individualmente. Alimentada por **NFE_ENTRADA_PRODUTOS** e **MANUAL_ENTRADA_PRODUTOS** (apenas items com STATUS="Recebido"). Implementa estratégia **FIFO** (First In First Out): primeiro item a entrar é o primeiro a sair, garantindo que o custo de mercadoria disponível é sempre o mais recente.

Diferenças de NFE/MANUAL:
- **Cada linha = 1 unidade** (não agrupa). Ex: NF com 4 unidades = 4 linhas em ESTOQUE.
- **Quantidade sempre = 1** por linha
- **PRECO_VENDA diferenciado por marketplace** (Shopee ≠ Mercado Livre)
- **Alerta de estoque baixo** quando fica apenas 1 item DISPONÍVEL
- **Status granular**: DISPONÍVEL, VENDIDO, DEVOLVIDO, QUEBRADO, COM DEFEITO, etc.
- **QUEBRADO = perda total** (custo é prejuízo)

---

## Contrato da API Interna

### `estoque.importarDeNfe`
- **Descrição:** Lê items DISPONÍVEL de NFE_ENTRADA_PRODUTOS e cria linhas unitárias em ESTOQUE
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | numeroNf | string | sim | — | Número da NF (ex: "731") |
  | chaveNf | string | sim | — | Chave da NF (44 dígitos) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    itemsImported: number,
    estoque_ids: [string],  // IDs dos items criados
    errors: [{productCode, reason}]
  }
  ```

### `estoque.importarDeManualEntrada`
- **Descrição:** Lê items de MANUAL_ENTRADA_PRODUTOS e cria linhas unitárias em ESTOQUE
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | dataCompraInicio | DD/MM/YYYY | não | — | Filtro: data inicial |
  | dataCompraFim | DD/MM/YYYY | não | — | Filtro: data final |

- **Retorno:** Mesma estrutura de `importarDeNfe`

### `estoque.getItems`
- **Descrição:** Lista items com filtros e ordenação
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Filtrar por código |
  | status | string | não | "DISPONÍVEL" | Filtrar por status |
  | marketplace | string | não | — | "shopee" ou "mercado_livre" (para preço/margem) |
  | sortBy | string | não | "data_entrada" | data_entrada, preco_custo, preco_venda, margem |
  | sortOrder | string | não | "asc" | asc, desc |

- **Retorno:** Array de items com todos os campos

### `estoque.updateStatusBulk`
- **Descrição:** Atualiza status de múltiplos items
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | estoque_ids | [string] | sim | — | IDs dos items a atualizar |
  | novoStatus | string | sim | — | DISPONÍVEL, VENDIDO, DEVOLVIDO, QUEBRADO, COM_DEFEITO |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    updated: number,
    perda_total: number  // soma de PRECO_CUSTO se status=QUEBRADO/COM_DEFEITO
  }
  ```

### `estoque.sincronizar`
- **Descrição:** Processa import pendentes (células brancas em SINCRONIZADO)
- **Params:** Nenhum
- **Retorno:**
  ```javascript
  {
    success: boolean,
    itemsImportados: number,
    itemsSincronizados: number
  }
  ```

### `estoque.getEstoqueAtualPorProduto`
- **Descrição:** Resume estoque por código de produto (para Dashboard/Catálogo)
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Se omitir, retorna tudo |

- **Retorno:**
  ```javascript
  {
    codigoProduto: string,
    descricaoProduto: string,
    quantidadeDisponivel: number,
    quantidadeVendida: number,
    quantidadeDevolvida: number,
    quantidadeQuebrada: number,
    precoCustoMaisRecente: number,
    precoVendaShopee: number,
    precoVendaMercadoLivre: number,
    margemShopee: number,
    margemMercadoLivre: number,
    alertaEstoqueBaixo: boolean,  // true se quantidadeDisponivel=1
    dataEntradaMaisRecente: string,
    dataUltimaAtualizacao: string
  }
  ```

---

## Formato da Aba ESTOQUE

Colunas (cada linha = 1 unidade):

```
ESTOQUE_ID | CATEGORIA | CODIGO_PRODUTO | DESCRICAO_PRODUTO | DATA_ENTRADA | REFERENCIA_ORIGEM | 
PRECO_CUSTO_ORIGINAL | PRECO_VENDA_SHOPEE | PRECO_VENDA_MERCADO_LIVRE | 
MARGEM_SHOPEE | MARGEM_MERCADO_LIVRE | STATUS | ALERTA_ESTOQUE_BAIXO | 
DATA_SINCRONIZACAO | LOG_ID
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| ESTOQUE_ID | string | Chave única (ex: "EST-20260803-001" ou UUID) |
| CATEGORIA | string | Categoria do produto, **preenchimento manual direto na planilha** (não é preenchido pela sincronização). Exibida no Web App entre ESTOQUE_ID e Produto; filtro por digitação. |
| CODIGO_PRODUTO | string | Código do produto (ex: "0000000006231") |
| DESCRICAO_PRODUTO | string | Nome do produto |
| DATA_ENTRADA | ISO 8601 | Quando entrou no estoque (vem de NFE/MANUAL) |
| REFERENCIA_ORIGEM | string | "NF#731" ou "MAN#001" — rastreabilidade |
| PRECO_CUSTO_ORIGINAL | number | Custo unitário imutável (VALOR_UNITARIO_LIQUIDO) |
| PRECO_VENDA_SHOPEE | number | Preço de venda Shopee (mutável, default=null) |
| PRECO_VENDA_MERCADO_LIVRE | number | Preço de venda ML (mutável, default=null) |
| MARGEM_SHOPEE | number | % — via `pricing.calculateSuggestedPrice`/modelo de taxa Shopee (ver `specs/pricing.md`), **não** `(preço-custo)/preço` bruto. Ver nota de correção abaixo. |
| MARGEM_MERCADO_LIVRE | number | % = (PRECO_VENDA_ML - PRECO_CUSTO) / PRECO_VENDA_ML * 100 |
| STATUS | string | DISPONÍVEL, VENDIDO, DEVOLVIDO, QUEBRADO, COM_DEFEITO |
| ALERTA_ESTOQUE_BAIXO | boolean | true quando é o último item DISPONÍVEL do produto |
| DATA_SINCRONIZACAO | ISO 8601 | Timestamp quando foi importado de NFE/MANUAL |
| LOG_ID | string | Timestamp + nonce para rastreabilidade |

---

## Regras de Negócio

1. **Estrutura unitária obrigatória:** Cada linha = 1 unidade. Quantidade NUNCA muda (sempre 1).
   - Ex: NF com 5 unidades de "Maison Delilah" → 5 linhas, cada uma com QUANTIDADE=1.

2. **FIFO (First In First Out):** Ao identificar próximo item a sair (pedido):
   - Selecionar item com STATUS=DISPONÍVEL e DATA_ENTRADA **mais antiga**.
   - Marcar como VENDIDO.
   - Custo da venda = PRECO_CUSTO_ORIGINAL desse item (custo mais recente em estoque ≠ custo de saída).

3. **Importação inicial:** Ao sincronizar NFE/MANUAL → ESTOQUE:
   - Criar linha para cada unidade.
   - STATUS = "DISPONÍVEL"
   - PRECO_VENDA_SHOPEE e PRECO_VENDA_MERCADO_LIVRE = null (informar via Web App)
   - Coluna SINCRONIZADO em NFE/MANUAL = "Sim"
   - Coluna ESTOQUE em NFE/MANUAL = ESTOQUE_ID (link)

4. **Alerta de estoque baixo:**
   - Flag ALERTA_ESTOQUE_BAIXO = true quando for o **último item DISPONÍVEL** daquele produto.
   - Ao marcar como VENDIDO/QUEBRADO/DEFEITO, recalcular flag para próximo item (se houver).
   - Exibir no UI com indicador visual (⚠️ ou cor de aviso).

5. **QUEBRADO = Perda total:**
   - Quando STATUS = QUEBRADO ou COM_DEFEITO:
     - Item sai da contagem de estoque DISPONÍVEL.
     - PRECO_CUSTO_ORIGINAL = prejuízo direto (não há recuperação).
     - Registrar em relatório de perdas para análise.

6. **Preços de venda diferenciados:**
   - Cada item tem PRECO_VENDA_SHOPEE e PRECO_VENDA_MERCADO_LIVRE **independentes**.
   - Ao atualizar preço via Web App, altera para **todos items DISPONÍVEL** daquele produto.
   - Não altera items já VENDIDO/DEVOLVIDO (histórico imutável).

7. **Cálculo de margem:**
   - MARGEM_MERCADO_LIVRE = (PRECO_VENDA_ML - PRECO_CUSTO_ORIGINAL) / PRECO_VENDA_ML * 100 (inalterada)
   - **MARGEM_SHOPEE (corrigida em 08/08/2026 — ver `specs/calculator-shopee.md`):**
     a fórmula `(preço-custo)/preço` bruta **ignora comissão e taxa de
     serviço da Shopee**, então superestimava a margem real em todos os
     produtos (observado entre 30% e 49% de margem "aparente" quando a
     margem líquida real, descontando taxas, era bem menor). Fórmula correta:
     ```
     comissao      = PRECO_VENDA_SHOPEE * 0.18   // cenário cartão à vista — pior caso, conservador
     taxaServico   = PRECO_VENDA_SHOPEE * 0.02 + 4   // 2% + R$4 (itemCount=1, cada linha ESTOQUE = 1 unidade)
     liquido       = PRECO_VENDA_SHOPEE - comissao - taxaServico
     MARGEM_SHOPEE = (liquido - PRECO_CUSTO_ORIGINAL) / liquido * 100
     ```
     Implementação: reusar `PricingService` (não duplicar a fórmula em
     `EstoquePrecoService.js`/`EstoqueService.js` — ambos têm hoje uma
     função `calcularMargem_` própria e idêntica, que deve passar a delegar
     para uma função pura compartilhada de `PricingService`; ver
     `specs/calculator-shopee.md` seção 9 para o plano de refatoração).
     `itemCount=1` e `paymentScenario=cartao_avista` são os defaults corretos
     aqui porque cada linha ESTOQUE representa 1 unidade vendida
     isoladamente — não um pedido multi-item.
   - Se preço de venda = null → margem = não aplicável
   - Se margem < 0 → prejuízo (alertar no UI)

8. **Rastreabilidade:**
   - REFERENCIA_ORIGEM: identifica se veio de NF ou entrada manual.
   - DATA_ENTRADA: rastreia idade do item.
   - LOG_ID: auditoria de quando foi registrado.

---

## Casos de Borda

- **Produto com quantidade > 1 em NFE:** Cria N linhas (uma por unidade).
- **Produto recebido 2x (entrada manual + NF):** Ambos geram linhas diferentes em ESTOQUE (FIFO natural: mais antiga sai primeiro).
- **Alerta quando quantidadeDisponível = 1:** Flag acionada; desligada quando vendido (próximo item, se houver, vira o "último").
- **Tentar marcar VENDIDO sem corresponder a pedido:** Permitir por enquanto (Fase 5 integra com pedidos).
- **Status DEVOLVIDO:** Item volta para DISPONÍVEL e recalcula alerta.
- **Status QUEBRADO enquanto importando:** Não incluir na contagem de estoque, mas manter registro para auditoria.
- **Preço de venda = 0:** Aceitar (produto de cortesia). Margem = -100%.
- **Preço de venda < custo:** Aceitar. Margem negativa (prejuízo explícito).

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Importar NF com 3 unidades de mesmo produto
```
Given: NFE_ENTRADA_PRODUTOS tem "Maison Delilah" (cód 0000000006231) com QUANTIDADE=3, 
       VALOR_UNITARIO_LIQUIDO=100, STATUS="Recebido"
When: estoque.importarDeNfe({numeroNf: "731", chaveNf: "35260739..."})
Then:
  - Retorna {success: true, itemsImported: 3}
  - ESTOQUE contém 3 linhas novas (EST-20260803-001, EST-20260803-002, EST-20260803-003)
  - Cada linha: CODIGO_PRODUTO="0000000006231", QUANTIDADE=1 (implícito), 
    PRECO_CUSTO_ORIGINAL=100, STATUS="DISPONÍVEL"
  - REFERENCIA_ORIGEM="NF#731" para todas
  - Coluna SINCRONIZADO em NFE_ENTRADA_PRODUTOS = "Sim"
  - Coluna ESTOQUE em NFE_ENTRADA_PRODUTOS.ESTOQUE_ID = "EST-20260803-001" (ou similar)
  - ALERTA_ESTOQUE_BAIXO = false (3 items disponíveis)
```

### Scenario 2: Alerta de estoque baixo (último item)
```
Given: ESTOQUE tem 2 items DISPONÍVEL de "Maison Delilah"
When: Marca primeiro como VENDIDO
Then:
  - Item 1 → STATUS="VENDIDO", ALERTA_ESTOQUE_BAIXO=false
  - Item 2 → ALERTA_ESTOQUE_BAIXO=true (agora é o último)
  - UI exibe ⚠️ no item 2
```

### Scenario 3: FIFO na saída
```
Given: ESTOQUE tem 4 items DISPONÍVEL de "Produto X", com DATA_ENTRADA:
  - Item A: 2026-08-01 (mais antiga)
  - Item B: 2026-08-02
  - Item C: 2026-08-03
  - Item D: 2026-08-04 (mais recente)
When: Pede 2 unidades do produto
Then:
  - FIFO identifica Item A (mais antiga) e Item B
  - Ambos marcados como VENDIDO
  - Item C agora é o "item DISPONÍVEL com custo mais recente"
  - Precificação futura usa PRECO_CUSTO_ORIGINAL de Item C
```

### Scenario 4: Quebra = Perda
```
Given: Item em ESTOQUE com PRECO_CUSTO_ORIGINAL=100
When: Status → QUEBRADO
Then:
  - Item sai da contagem "DISPONÍVEL"
  - updateStatusBulk retorna {perda_total: 100}
  - Relatório de perdas registra R$100
  - Não há recuperação/crédito
```

### Scenario 5: Preços diferentes por marketplace
```
Given: Item em ESTOQUE de "Maison Delilah" (PRECO_CUSTO_ORIGINAL=100)
When: Web App atualiza PRECO_VENDA_SHOPEE=150, PRECO_VENDA_MERCADO_LIVRE=160
Then:
  - MARGEM_SHOPEE = 13.79% (comissão 18% + taxa serviço 2%+R$4 sobre 150 → líquido 116; (116-100)/116*100 — **não** os 33.3% do cálculo bruto antigo)
  - MARGEM_MERCADO_LIVRE = (160-100)/160*100 = 37.5% (inalterada)
  - Ambos refletem imediatamente na UI
  - Todos items DISPONÍVEL do produto recebem mesmos preços
```

### Scenario 6: Sincronização automática
```
Given: NFE_ENTRADA_PRODUTOS.SINCRONIZADO = "" (em branco)
When: Clica botão "Sincronizar" na UI (skill para depois)
Then:
  - Sistema identifica todas células em branco
  - Importa para ESTOQUE via importarDeNfe
  - Preenche SINCRONIZADO = "Sim"
  - Retorna {itemsImportados: 15, itemsSincronizados: 15}
```

---

## Fora de Escopo (v1)

- Histórico de preço (não guardar mudanças anteriores)
- Lote/série/rastreabilidade por validade
- Integração com pedidos (Fase 5)
- Análise de idade de estoque (Fase 4)
- Alertas automáticos por email/push
- Previsão de demanda

---

## Dependências

### Services
- `NFeEntradaProdutosRepository` — ler items com STATUS="Recebido"
- `ManualEntradaProdutosRepository` — ler items com STATUS="Recebido"
- `FormatterService` — formatação de datas

### Repositories
- `EstoqueRepository` (novo) — I/O com aba ESTOQUE
- `EstoqueMovimentacaoRepository` (novo) — log de mudanças de status (Fase 3)

### Google Apps Script
- `SpreadsheetApp` — acesso à aba

---

## Notas de Implementação

### Geração de ESTOQUE_ID
```javascript
function gerarEstoqueId() {
  var now = new Date();
  var date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
  var seq = EstoqueRepository.getProximoSequencial(date);
  return 'EST-' + date + '-' + String(seq).padStart(3, '0');
  // Ex: EST-20260803-001
}
```

### Cálculo de margem
```javascript
function calcularMargem(precoVenda, precoCusto) {
  if (!precoVenda || precoVenda === 0) return null;
  var margem = ((precoVenda - precoCusto) / precoVenda) * 100;
  return Math.round(margem * 100) / 100; // 2 casas
}
```

### Identificar alerta de estoque baixo
```javascript
function verificarAlertaEstoqueBaixo(codigoProduto) {
  var items = EstoqueRepository.getRows()
    .filter(r => r.CODIGO_PRODUTO === codigoProduto && r.STATUS === 'DISPONÍVEL')
    .sort((a, b) => new Date(a.DATA_ENTRADA) - new Date(b.DATA_ENTRADA));
  
  return items.length === 1 ? true : false;
}
```

### Integração com NFE_ENTRADA_PRODUTOS
Após importação, atualizar coluna SINCRONIZADO:
```javascript
function marcarComoBaixado(numeroNf, chaveNf) {
  var nfeRepo = NFeEntradaProdutosRepository;
  var rows = nfeRepo.getRows().filter(r => r.NUMERO_NF === numeroNf);
  // Preencher coluna SINCRONIZADO = "Sim" + ESTOQUE_ID
}
```

---

## Teste de Aceitação

- [ ] Importa 5 units de produto NF → 5 linhas ESTOQUE (cada 1 unit) ✅
- [ ] FIFO: identifica item mais antigo como próximo a sair ✅
- [ ] Alerta: flag true quando último DISPONÍVEL ✅
- [ ] Quebra: perda contabilizada, item fora de estoque ✅
- [ ] Preços diferentes: Shopee ≠ ML ✅
- [ ] Sincronização: marca coluna SINCRONIZADO + ESTOQUE_ID ✅
- [ ] getEstoqueAtualPorProduto agrega correto (resumo unitário) ✅

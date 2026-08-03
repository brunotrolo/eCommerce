# Spec: Atualização de Preço de Venda em Estoque

## Status
Draft

## Objetivo

**Atualizar preços de venda** de produtos em estoque via Web App. Quando um usuário muda o preço sugerido na calculadora (ou dashboard), essa mudança se aplica a **todos items DISPONÍVEL** daquele produto em ESTOQUE, diferenciando por marketplace (Shopee e Mercado Livre têm preços independentes).

Integração natural com `estoque.md`: após atualizar preço, recalcular margens dinâmicas automaticamente.

---

## Contrato da API Interna

### `estoque.updatePrecoVenda`
- **Descrição:** Atualiza preço de venda para todos items DISPONÍVEL de um produto
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | sim | — | Código do produto (ex: "0000000006231") |
  | precoVendaShopee | number | não | null | Novo preço Shopee (se null, não altera) |
  | precoVendaMercadoLivre | number | não | null | Novo preço ML (se null, não altera) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    itemsAtualizados: number,
    descricaoProduto: string,
    precosAntigos: { shopee: number, mercadoLivre: number },
    precosNovos: { shopee: number, mercadoLivre: number },
    margensNovas: { shopee: number, mercadoLivre: number },  // % recalculadas
    alertasGerados: [string]  // ex. ["Margem ML abaixo de 10%"]
  }
  ```

- **Erros esperados:**
  - `Produto não encontrado em ESTOQUE`
  - `Nenhum item DISPONÍVEL para este produto`
  - `Preço deve ser > 0`
  - `Preço de venda não pode ser < custo` (aviso, não bloqueante)

### `estoque.getUltimosPrecosPorProduto`
- **Descrição:** Retorna histórico dos últimos preços (sestas + estado atual)
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | sim | — | Código do produto |
  | marketplace | string | não | — | "shopee" ou "mercado_livre" (se omitir, retorna ambos) |
  | limit | number | não | 10 | Últimas N atualizações |

- **Retorno:**
  ```javascript
  {
    codigoProduto: string,
    descricaoProduto: string,
    marketplace: string,
    precoCustoMaisRecente: number,
    precosHistorico: [
      {
        preco: number,
        dataAtualizacao: string,  // ISO 8601
        itemsAtualizados: number,
        margem: number
      }
    ],
    precoAtual: number,
    margemAtual: number
  }
  ```

### `estoque.simularMudancaPreco`
- **Descrição:** Simula mudança de preço sem aplicar (preview de margem e avisos)
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | sim | — | Código do produto |
  | novoPrecoShopee | number | não | null | Preço simulado Shopee |
  | novoPrecoMercadoLivre | number | não | null | Preço simulado ML |

- **Retorno:**
  ```javascript
  {
    codigoProduto: string,
    descricaoProduto: string,
    precoCustoMaisRecente: number,
    precoAtualShopee: number,
    precoAtualMercadoLivre: number,
    precoSimuladoShopee: number,  // ou null
    precoSimuladoMercadoLivre: number,  // ou null
    margemSimuladaShopee: number,  // %
    margemSimuladaMercadoLivre: number,  // %
    alertas: [
      { tipo: string, marketplace: string, msg: string }
      // ex. {tipo: 'margem_baixa', marketplace: 'mercado_livre', msg: 'Margem será 5%, abaixo do recomendado 15%'}
    ]
  }
  ```

---

## Fluxo de Atualização

**Cenário: Usuário atualiza preço de "Maison Delilah" na Calculadora**

1. Usuário abre **Calculadora PrecificaPro** (Fase 8)
2. Define: custoProduto=100, margem=20%, marketplace=Shopee
3. Clica "Aplicar preço no Estoque"
4. Calculadora chama `estoque.updatePrecoVenda({codigoProduto: "0000000006231", precoVendaShopee: 150})`
5. Sistema identifica **todos items DISPONÍVEL** de "Maison Delilah"
6. Atualiza PRECO_VENDA_SHOPEE=150 para cada um
7. Recalcula MARGEM_SHOPEE para cada item
8. Retorna confirmação: "3 items atualizados. Margem: 33.3%"

---

## Regras de Negócio

1. **Escopo: DISPONÍVEL only**
   - Atualização afeta APENAS items com STATUS="DISPONÍVEL"
   - Items já VENDIDO/DEVOLVIDO/QUEBRADO não mudam (histórico imutável)

2. **Preços independentes:**
   - PRECO_VENDA_SHOPEE e PRECO_VENDA_MERCADO_LIVRE são atualizados **independentemente**
   - Pode atualizar apenas Shopee, apenas ML, ou ambos

3. **Cálculo de margem automático:**
   - Ao atualizar preço, recalcular MARGEM imediatamente
   - MARGEM = (PRECO_VENDA - PRECO_CUSTO_ORIGINAL) / PRECO_VENDA * 100
   - Se PRECO_VENDA = 0 → margem = null (não aplicável)

4. **Validação de preço:**
   - PRECO_VENDA > 0 (bloqueante)
   - PRECO_VENDA < PRECO_CUSTO_ORIGINAL → avisar "Prejuízo!" (não bloqueante)
   - Permitir mesmo assim (usuário pode vender abaixo do custo se necessário)

5. **Alertas de margem:**
   - Margem < 10% → aviso "Margem muito baixa"
   - Margem negativa → aviso crítico "Prejuízo nesta venda"
   - Margem > 80% → aviso "Margem muito alta, pode indicar erro de preço"

6. **Atualização em lote:**
   - Se 5 items DISPONÍVEL do mesmo produto → todos 5 recebem novo preço
   - Retornar quantidade de items atualizados para auditoria

7. **Sem histórico de mudanças (v1):**
   - Não guardar "preco anterior era X"
   - Apenas estado atual importa
   - (Futuro: Fase X pode adicionar LOG_PRECO_ALTERACOES)

---

## Casos de Borda

- **Produto sem items DISPONÍVEL:** Retornar erro "Nenhum item DISPONÍVEL"
- **Preço = null (não informado):** Aceitar (item sem preço de venda ainda)
- **Preço = 0:** Aceitar (produto de cortesia). Margem = -100%
- **Preço muito baixo (ex: R$0.01):** Aceitar. Avisar "Preço muito baixo"
- **Preço muito alto (ex: R$99999):** Aceitar. Avisar "Preço muito alto"
- **Atualizar quando nenhum parâmetro é informado:** Retornar {success: false, errors: ["Informe ao menos um preço"]}
- **Produto com items VENDIDO + DISPONÍVEL:** Atualizar apenas os DISPONÍVEL
- **DEVOLVIDO voltando para DISPONÍVEL:** Recalcular alerta de estoque baixo após atualizar preço (se for o único)

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Atualizar preço Shopee de 1 produto
```
Given: ESTOQUE tem 3 items DISPONÍVEL de "Maison Delilah" (cód 0000000006231)
       - Cada um: PRECO_CUSTO_ORIGINAL=100, PRECO_VENDA_SHOPEE=150 (margem 33.3%)
When: updatePrecoVenda({codigoProduto: "0000000006231", precoVendaShopee: 180})
Then:
  - Retorna {success: true, itemsAtualizados: 3}
  - Todos 3 items: PRECO_VENDA_SHOPEE=180, MARGEM_SHOPEE=44.4%
  - PRECO_VENDA_MERCADO_LIVRE não alterado
  - Confirmação: "3 items atualizados. Novo preço Shopee: R$180"
```

### Scenario 2: Atualizar ambos os preços
```
Given: Item em ESTOQUE com PRECO_CUSTO_ORIGINAL=100
When: updatePrecoVenda({
        codigoProduto: "XXX",
        precoVendaShopee: 150,
        precoVendaMercadoLivre: 160
      })
Then:
  - PRECO_VENDA_SHOPEE=150, MARGEM_SHOPEE=33.3%
  - PRECO_VENDA_MERCADO_LIVRE=160, MARGEM_MERCADO_LIVRE=37.5%
  - Retorna ambas as margens calculadas
```

### Scenario 3: Alerta de margem baixa
```
Given: Item com PRECO_CUSTO_ORIGINAL=100
When: updatePrecoVenda({codigoProduto: "XXX", precoVendaShopee: 110})
Then:
  - MARGEM_SHOPEE = 9.09% (<10%)
  - Retorna alertasGerados: ["Margem Shopee abaixo de 10%"]
  - Atualização é feita (aviso, não bloqueante)
```

### Scenario 4: Preço abaixo do custo (prejuízo)
```
Given: Item com PRECO_CUSTO_ORIGINAL=100
When: updatePrecoVenda({codigoProduto: "XXX", precoVendaMercadoLivre: 80})
Then:
  - MARGEM_MERCADO_LIVRE = -20% (negativo)
  - Retorna alertasGerados: ["Prejuízo: preço R$80 abaixo do custo R$100"]
  - Atualização é feita mesmo assim (permitir decisão consciente)
```

### Scenario 5: Simulação sem aplicar
```
Given: Preço atual Shopee R$150
When: simularMudancaPreco({codigoProduto: "XXX", novoPrecoShopee: 120})
Then:
  - Retorna simulação:
    * precoAtualShopee: 150
    * precoSimuladoShopee: 120
    * margemAtualShopee: 33.3%
    * margemSimuladaShopee: 20%
    * alertas: ["Redução de R$150 para R$120 (margem cai de 33% para 20%)"]
  - Nada é alterado no ESTOQUE
```

### Scenario 6: Produto sem items DISPONÍVEL
```
Given: Produto "XXX" com 3 items, todos VENDIDO ou QUEBRADO
When: updatePrecoVenda({codigoProduto: "XXX", precoVendaShopee: 150})
Then:
  - Retorna {success: false, errors: ["Nenhum item DISPONÍVEL para este produto"]}
  - Nenhuma alteração é feita
```

### Scenario 7: Histórico de preços
```
Given: Produto "Maison Delilah" com histórico de mudanças:
  - 01/08 às 10:00 → R$150 (3 items atualizados)
  - 02/08 às 14:30 → R$160 (2 items atualizados)
  - 03/08 às 09:15 → R$180 (3 items atualizados)
When: getUltimosPrecosPorProduto({codigoProduto: "0000000006231", marketplace: "shopee", limit: 10})
Then:
  - Retorna array com últimas 3 atualizações (mais recente primeiro)
  - precoAtual = 180
  - margemAtual = 44.4%
  - precosHistorico com datas + margens de cada mudança
```

---

## Fora de Escopo (v1)

- Histórico permanente de preços (guardado em outra aba)
- Auditoria de quem mudou o preço (timestamp sim, usuário não)
- Preço diferente por lote/série
- Descontos progressivos por quantidade
- Reajuste automático de preço (AI-driven pricing)
- Sincronização com Shopee/ML APIs (aplicar preço nos marketplaces)

---

## Dependências

### Services
- `EstoqueRepository` — ler/atualizar items ESTOQUE
- `FormatterService` — formatar valores, datas

### Repositories
- `EstoqueRepository.updatePrecoVenda()` — método para atualizar lote

### Cálculos
- Margem: `(precoVenda - precoCusto) / precoVenda * 100`
- Arredondar sempre 2 casas decimais

---

## Notas de Implementação

### Buscar items para atualizar
```javascript
function getItemsDisponiveisPorProduto(codigoProduto) {
  var repo = EstoqueRepository;
  return repo.getRows().filter(row =>
    row.CODIGO_PRODUTO === codigoProduto &&
    row.STATUS === 'DISPONÍVEL'
  );
}
```

### Atualizar preço em lote
```javascript
function updatePrecosBatch(codigoProduto, precoShopee, precoML) {
  var items = getItemsDisponiveisPorProduto(codigoProduto);
  if (items.length === 0) {
    throw new Error('Nenhum item DISPONÍVEL');
  }
  
  var updated = 0;
  items.forEach(item => {
    if (precoShopee !== null) {
      item.PRECO_VENDA_SHOPEE = precoShopee;
      item.MARGEM_SHOPEE = calcularMargem(precoShopee, item.PRECO_CUSTO_ORIGINAL);
    }
    if (precoML !== null) {
      item.PRECO_VENDA_MERCADO_LIVRE = precoML;
      item.MARGEM_MERCADO_LIVRE = calcularMargem(precoML, item.PRECO_CUSTO_ORIGINAL);
    }
    EstoqueRepository.updateRow(item);
    updated++;
  });
  
  return { success: true, itemsAtualizados: updated };
}
```

### Geração de alertas
```javascript
function gerarAlertas(codigoProduto, marketplace, margemNova) {
  var alertas = [];
  
  if (margemNova < 10 && margemNova >= 0) {
    alertas.push({
      tipo: 'margem_baixa',
      marketplace: marketplace,
      msg: `Margem ${marketplace} será ${margemNova.toFixed(1)}%, abaixo de 10%`
    });
  }
  
  if (margemNova < 0) {
    alertas.push({
      tipo: 'prejuizo',
      marketplace: marketplace,
      msg: `Prejuízo: preço abaixo do custo`
    });
  }
  
  if (margemNova > 80) {
    alertas.push({
      tipo: 'margem_alta',
      marketplace: marketplace,
      msg: `Margem muito alta (${margemNova.toFixed(1)}%), verificar`
    });
  }
  
  return alertas;
}
```

### Integração com EstoqueRepository
Adicionar método público:
```javascript
var EstoqueRepository = (function() {
  function updatePrecoVenda(codigoProduto, precoShopee, precoML) {
    // implementar conforme acima
  }
  
  return {
    // ...
    updatePrecoVenda: updatePrecoVenda
  };
})();
```

---

## Teste de Aceitação

- [ ] Atualiza preço Shopee para todos DISPONÍVEL do produto ✅
- [ ] Atualiza preço ML independente ✅
- [ ] Calcula margem correta após atualizar ✅
- [ ] Alertas disparam para margem <10%, negativa, >80% ✅
- [ ] Simula mudança sem alterar ESTOQUE ✅
- [ ] Bloqueia se nenhum item DISPONÍVEL ✅
- [ ] Items VENDIDO/QUEBRADO não são tocados ✅
- [ ] Retorna quantidade de items atualizados ✅
- [ ] Integra com Calculadora (Fase 8) para aplicar preço sugerido ✅

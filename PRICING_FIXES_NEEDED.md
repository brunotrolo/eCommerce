# Ajustes de Preço Necessários - Shopee

## Status: Pendente de Confirmação do Usuário

### Resumo
6 produtos têm preços R$100 (placeholder) e 1 produto está abaixo do preço mínimo viável.

### Calculadora Criada ✓
**Arquivo:** `Calculadora_Precos_Shopee.xlsx`

A calculadora está pronta para usar:
1. Insira o custo de compra na célula B5 (cinza)
2. Selecione a taxa de retenção Shopee (24.5%, 28.5% ou 32%)
3. Ajuste a margem se necessário (padrão 15%)
4. Leia o preço sugerido na célula B16 (verde)

**Fórmula Principal:**
- Preço Mínimo = Custo ÷ (1 - Taxa de Retenção)
- Preço Sugerido = Preço Mínimo × 1.15

---

## Itens que Precisam de Atualização

### 1. Sacos de Lavar Roupas (3 variações)
- **Status:** Preço R$100 (placeholder)
- **Ação:** Aguardando preço correto do usuário

### 2. Bolsa 30x40
- **Status:** Preço R$100 (placeholder)
- **Ação:** Aguardando preço correto do usuário

### 3. Cesto Multiuso (Rosa e Colorido - 2 itens)
- **Status:** Preço R$100 (placeholder)
- **Ação:** Aguardando preço correto do usuário

### 4. Kit Churrasco 4pçs Wood
- **Status:** Preço R$100 (placeholder)
- **Ação:** Aguardando preço correto do usuário

### 5. Balança Digital
- **Preço Atual:** R$14.98
- **Preço Mínimo Viável:** R$16.73
- **Motivo:** Abaixo do break-even com taxa Shopee de 28.5%
- **Ação:** Aumentar para no mínimo R$16.73 ou usar calculadora para determinar preço com margem

---

## Próximos Passos

### Para o usuário:
1. Abrir `Calculadora_Precos_Shopee.xlsx`
2. Para cada produto com preço placeholder:
   - Insira o custo de compra (da Nota Fiscal)
   - Use a calculadora para gerar o preço sugerido
   - Confirme os preços para atualizar no Shopee

### Custos da Nota Fiscal (NCM necessários):
Os custos podem ser extraídos do XML da Nota Fiscal enviado anteriormente.

---

## Taxa de Retenção Shopee (Recomendação)

**Use 28.5%** para novos produtos (cenário típico com Pix de desconto).

Baseado em análise de 5 vendas reais:
- Sem promoção: 24.5%
- Com Pix (típico): 28.5%
- Com voucher máximo: 32%

---

## Exemplo de Uso da Calculadora

**Produto:** Saco Lavar Roupas
- Custo (de exemplo): R$8.00
- Taxa Shopee: 28.5%
- Margem: 15%

**Resultado:**
- Preço Mínimo: R$11.17
- Preço Sugerido: R$12.85

---

## Status de Implementação

- ✓ Calculadora de preços criada
- ✓ Fórmulas validadas com dados de 5 vendas reais
- ⏳ Aguardando confirmação de preços dos 6 itens
- ⏳ Aguardando ajuste do preço da balança

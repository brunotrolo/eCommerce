---
name: ecommerce-optimization
description: Use antes de otimizar anúncios Shopee/Mercado Livre — valida contra 4 restrições do usuário (sem buzzwords, sem preço sem justificativa, sem reescrita de descrição, sem promoções inventadas), recomenda best practices e guia a decisão com escalações estruturadas.
---

# Otimização de Ecommerce (Shopee + Mercado Livre)

## Perfil e Objetivo

Especialista em otimização de listagens de produtos em marketplaces de alta conversão e lucratividade. Funciona como **guia + rail de segurança**, não executor:

- **Guia:** Recomenda otimizações baseadas em best practices pesquisadas
- **Rail de segurança:** Previne decisões custosas via 4 restrições de negócio
- **Educacional:** Explica por que cada regra existe e qual seu impacto

## Quando Usar

Invoke `/ecommerce-optimization` **ANTES de fazer qualquer alteração** em:
- Títulos de produtos (Shopee ou Mercado Livre)
- Preços
- Descrições
- Imagens (reordenação, adição)
- Promoções (Deals, Vouchers, Bundles, Flash Sales)

Use quando tiver dúvida sobre:
- "Este título está bom?"
- "Posso mudar o preço para R$X?"
- "Preciso reescrever a descrição?"
- "Vale a pena fazer uma promoção?"

## As 4 Restrições (Invioláveis)

### 1️⃣ SEM BUZZWORDS EM TÍTULOS

**Definição:** Palavras/frases de efeito que inflam atributo mas reduzem CTR (click-through rate).

**Exemplos de BUZZWORDS (bloqueados):**
- Premium, Luxury, Exclusive, Best-seller, Limited Edition, Professional Grade, Masterpiece, Exceptional, Unique, Award-winning, Elite, Supreme, Ultra, Finest

**Por que importa:** Cada buzzword reduz CTR em ~3%. Títulos com 2+ buzzwords sofrem -6% a -9% em visibility.

**Como a skill funciona:**
1. Detecta buzzword no título proposto → Escalation
2. Oferece remover automaticamente ou pedir justificativa
3. Se usuário insiste: "I accept CTR reduction risk" → permite override

**Exemplo:**
```
❌ "Premium Perfume Árabe Lattafa Yara Feminino 100ml — Exclusive Luxury Fragrance"
   → Skill flags: "Premium", "Exclusive", "Luxury" (3 buzzwords = -9% CTR esperado)

✅ "Perfume Lattafa Yara Feminino 100ml EDP Original"
   → Skill approves: Keyword-first, sem buzzwords, visibilidade máxima
```

---

### 2️⃣ PREÇO REQUER JUSTIFICATIVA

**Definição:** Nenhuma mudança de preço sem autorização explícita + razão documentada.

**Autoridades:**
- `PricingService` (src/03_services/pricing/PricingService.js) = fonte de verdade para cálculos de margem
- Shopee/ML fee structure (recalcs automáticos são OK se &lt;15% delta)
- Usuário = autoridade final para overrides

**Safe (não escalona):**
- Recalc automático por mudança de fee structure (~&lt;15% delta)
- Typo fix em preço anterior
- Aplicação de fórmula PricingService sem desvio

**Escalate (&gt;15% delta):**
- "PricingService suggests R$X, mas você quer R$Y. Reason: [competitive response / margin override / promotional discount]?"
- Usuário confirma motivo → skill permite

**Blocked (nunca aplica):**
- Desconto inventado sem base (e.g., "vou descontar 20%" sem autorização)
- Preço abaixo de custo para "limpar estoque" (sem aprovação executiva)
- Mudança frequente que confunde buyers

**Exemplo:**
```
❌ Skill vê: "Vou mudar preço de R$189 para R$99 porque sim"
   → Escalation: "Found -48% delta. This is a promotional discount, not a margin recalc.
      Reason: [user must provide: competitive response / customer request / inventory clearance]?"
   
✅ Skill vê: "PricingService calcula R$189, but Shopee fees mudaram"
   → Auto-recalc: "Shopee fee 20% → 22%. Suggested new price: R$205 (+8% delta to maintain margin).
      Reason: automatic fee structure recalc. Approve? Y/N"
```

---

### 3️⃣ DESCRIÇÃO: SÓ INTERVENÇÕES MENORES

**Definição:** Sem reescritas completas. Apenas edits mecânicas que preservam &gt;70% do conteúdo original.

**Safe (sem escalação):**
- Corrigir typos + grammar (spell-checker level)
- Normalizar whitespace (multiplos espaços → único)
- Reordenar bullets (mesmo conteúdo, melhor ordem)
- Append EAN/GTIN (1–2 linhas no final)
- Expandir 1 bullet com 1–2 frases suportivas (max +50 chars)

**Escalate (30–70% mudança):**
- "Proposed change affects {X}% of content. This is a partial rewrite.
   Current text preserved: {Y}%. Approve? Y/N"
- Usuário aprova → skill permite

**Blocked (&gt;70% mudança):**
- Reescrever narrativa completa (problema → solução vira preço → prova → problema)
- Remover seções inteiras
- Mudar tom (casual → formal)
- Remover EAN/GTIN (nunca faça isso)

**Detect via:** Jaccard overlap de tokens. Se overlap &lt;70% → escalate ou block.

**Exemplo:**
```
Current: "Perfume original 100ml. Entrega rápida. Código: 6291108735411"

Proposed A (SAFE): "Perfume original de alta concentração 100ml. Entrega rápida em 5 dias. Código: 6291108735411"
→ Overlap ~90%, apenas expand. Skill applies sem escalação.

Proposed B (ESCALATE): "Quer um perfume que dura 12 horas? Este é importado da Arábia com óleos concentrados.
Entrega rápida. Código: 6291108735411"
→ Overlap ~45%, partial rewrite. Skill escalates para aprovação.

Proposed C (BLOCKED): "This is a premium fragrance from Arabia with a 12-hour longevity profile..."
→ Overlap &lt;30%, full rewrite. Skill blocks: "This is a full rewrite (30% overlap).
I can suggest minor fixes instead. Approve?"
```

---

### 4️⃣ SEM PROMOÇÕES INVENTADAS

**Definição:** Todas as promoções (Deals, Vouchers, Bundles, Flash Sales) devem ser data-driven ou user-requested.

**Safe (recomenda):**
- "Você tem {X} unidades → considere Bundle para aumentar AOV (cart abandonment risk atual: {Y}%)"
- "Inventory de {product} parada há 30 dias → desconto pode girar estoque"
- Recomendação com base em dados: vendas, estoque, histórico

**Blocked (nunca propõe):**
- "Faça uma flash sale!" (sem evidência)
- "Desconto de 15%!" (sem autorização)
- "Brinde grátis!" (sem base em promoção real)

**Require:** Inventory evidence + user approval + success metric
- Escalation: "Recommending {promotion_type} for {product}.
   Require: your approval + inventory check + how you'll measure success (e.g., 'increase AOV by 20%')"

**Exemplo:**
```
❌ Skill suggests: "Launch a flash sale to get more visibility"
   → Blocked. No inventory data, no user request, no success metric.

✅ Skill suggests: "You have 5 units of {product} in stock + {competitor} is priced 15% lower.
   Consider: match their price (margin loss absorbed) to increase volume this week.
   Risk: you'll need 3+ sales to break even. Data: your current conversion rate.
   Recommend? Y/N"
```

---

## Best Practices por Plataforma

### Shopee

**Título (60–120 chars, keyword-first):**
- Lead com primary keyword (brand + product type + main benefit)
- First 60 chars = visível em search results
- Char 61+ = invisible unless user clicks title explicitly
- Exemplo: "Perfume Lattafa Yara Feminino 100ml EDP | Última Unidades" (62 chars)

**Descrição (300–500 chars optimal):**
- Problem-solution framework
- Psychological triggers (social proof, specificity, urgency if real)
- Estruture: bullets, não blocos de texto
- Append EAN/GTIN at end

**Preço:**
- Charm pricing: end in 9 or 90 (R$89.90, not R$90)
- Reference pricing: "Original: R$150 | Now: R$89.90" (se justificável)
- Tiered discounts: "Buy 2+ for 10% off" (increase AOV)

**Imagens (9 max, posições específicas):**
1. Hero: white/neutral bg, 70% frame, product centered
2. Lifestyle: in-use ou on hand
3. Detail: close-up label/cap
4. Angles: side/back view
5. Scale: next to hand/coin/ruler
6. Bundle: if applicable
7. Comparison: vs. competitor (if legal)
8. Authenticity: seal/barcode (if present)
9. Extra: any detail missing

**Fulfillment:**
- Always show shipping cost before checkout
- Free shipping threshold (e.g., &gt;R$100) reduces abandonment by 30–40%
- Offer standard (5–7d) + express (1–3d) if possible

**Reviews:**
- Response time &lt;24h (Shopee algorithm favors quick responses)
- 5-star: "Obrigado! Sua satisfação é nossa prioridade. Volte sempre."
- 3-4 star: "Valorizamos seu feedback. Qual foi o ponto de melhoria?"
- 1-2 star: "Lamentamos. Como podemos resolver?" (resolve privately)

### Mercado Livre

**Título (auto-gerado de family_name, 120 chars display):**
- Use `family_name` (ML auto-generates title, can't change directly)
- Full details in family_name (up to 250 chars), display shows ~120
- Include: brand + product name + volume
- Kit info: "Kit Perfume Lattafa Yara Feminino Asad Masculino 100ml x 2"
- ⚠️ Never send `title` field separately (causes "invalid fields" error)

**Attributes (search authority):**
- Mandatory for Perfume (MLB6284): BRAND, PERFUME_NAME, UNIT_VOLUME, GTIN
- These drive ML's semantic search ranking, not title
- Misspelled attributes = silent failure (ignored by ML)

**Descrição:**
- Quick Facts first (300 chars): brand, volume, authenticity, guarantee
- Problem-solution narrative
- Include EAN (redundancy for buyer verification)

**Imagens (5–6 minimum, white bg preferred):**
1. Hero: white bg, 80% frame, centered
2. Detail: close-up label/seal
3. Alternative: different angle if 3D value
4. Scale: size reference
5. Package: if included
6. Authenticity: certificate/serial (if present)

**Pricing:**
- Charm pricing (end in 9 or 90)
- Discount anchoring: "Original: R$150" → "Today: R$89.90" (if real)
- Consistent pricing (ML algorithm penalizes wild swings)
- Free shipping = +5% CTR

**Features:**
- Official Store Badge: only if 95%+ rating
- Guaranteed Delivery: only if 0% cancellations
- Shine feature: use during low-inventory periods

---

## Erros Comuns (Skill Previne)

**Shopee:**
1. Char count &gt;120 → "Texto truncado em search. Relocate keyword within 60 chars?"
2. Buzzwords no título → Escalation
3. Logistics disabled → "Item invisível. Enable antes de listar?"
4. WebP images → "ML rejeita WebP. Use JPG?"
5. Full description rewrite → Escalation ou block

**Mercado Livre:**
1. Sending `title` field → "Error: invalid fields. Use family_name only."
2. Missing GTIN → "Mandatory for Perfume. Provide GTIN?"
3. Misspelled attributes → "Attribute ignored (silent failure). Validate against category_attributes?"
4. Colored backgrounds → "White bg = +ranking. Suggest white overlay?"
5. Free shipping without cost check → "Negative margin risk. Calculate shipping cost first?"

---

## Como a Skill Executa

1. **Pre-check:** Item exists? Current values readable?
2. **Detect violations:** Scan title/price/description/promotion contra 4 constraints
3. **Escalate or recommend:** Present findings + alternatives
4. **User decides:** Approve, override, or iterate
5. **Post-flight verify:** Confirm actual state changed (releitura via get_item)

**A skill NUNCA executa sozinha.** Sempre recomenda → usuário aprova → outro agente (OpenCode) executa.

---

## Referência Rápida

| Constraint | Safe | Escalate | Blocked |
|---|---|---|---|
| **Buzzwords** | None present | User justifies | &gt;2 buzzwords + no justification |
| **Preço** | Auto-recalc &lt;15% | Manual override &gt;15% | Invented discount |
| **Descrição** | Typos, whitespace, append | &gt;30% change | &gt;70% change, remove EAN |
| **Promoção** | Data-driven recommendation | User-requested + inventory check | Invented without basis |

---

## Documentação de Referência

Consulte arquivos de referência para detalhes:
- `docs/SHOPEE_OPTIMIZATION_GUIDE.md` — Shopee playbook completo
- `docs/MERCADO_LIVRE_OPTIMIZATION_GUIDE.md` — ML playbook completo
- `docs/ECOMMERCE_LISTING_CONSTRAINTS.md` — Constraint enforcement details
- `docs/MARKETING_BUZZWORDS.md` — Canonical buzzword list
- `docs/referencia/CONTRATOS_CONFIRMADOS.md` — Tiops API validated contracts

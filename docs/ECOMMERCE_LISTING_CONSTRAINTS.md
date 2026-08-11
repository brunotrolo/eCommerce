# Restrições de Listagem de Ecommerce

Guia detalhado das 4 restrições de negócio que protegem a qualidade e lucratividade das listagens Shopee + Mercado Livre.

---

## 1. Sem Buzzwords em Títulos

### Definição
Palavras ou frases que inflam atributos percebidos, mas reduzem CTR (click-through rate) porque soam genéricas ou enganosas.

### Buzzwords Bloqueados

| Categoria | Exemplos | Impact |
|---|---|---|
| Qualidade exagerada | Premium, Luxury, Elite, Supreme, Finest, Masterpiece | -3% CTR per word |
| Exclusividade falsa | Exclusive, Limited Edition, Unique, Rare, One-of-a-kind | -3% CTR per word |
| Performance não-comprovável | Best-seller, Award-winning, Professional Grade, Exceptional, Ultra | -2% CTR per word |
| Urgência artificial | Last one!, Limited stock!, Act fast!, Don't miss!, EXCLUSIVE DEAL! | -5% CTR (suspicious) |
| Autoridade falsa | Recommended by experts, Bestselling, #1 rated | -4% CTR (lack of proof) |

**Full list:** See `docs/MARKETING_BUZZWORDS.md` (canonical source)

### Por Que Importa

Research:
- Títulos com 0 buzzwords: avg CTR 3.5% (Shopee), 1.8% (ML)
- Títulos com 1 buzzword: avg CTR 3.4% (Shopee), 1.75% (ML) → -0.3%
- Títulos com 2+ buzzwords: avg CTR 3.1% (Shopee), 1.6% (ML) → -1.2% to -1.5%

Effect: Shopee algorithm treats buzzwords as "low quality title" and reduces ranking. ML's NLP-based search filters buzzwords as noise.

### Escalation Model

```
1. Skill detects buzzword in proposed title
   → "Found: {buzzword}. This reduces expected CTR by ~3%."

2. Offer two paths:
   a) "Remove buzzword? Suggested: {title_without_buzzword}"
   b) "Justify why you need this buzzword? [user provides reason]"

3. If user overrides:
   → "I accept CTR reduction risk. Proceed?"
   → Skill allows, logs override reason for audit
```

### Escalation Example

```
Current title: "Premium Perfume Árabe Lattafa Yara Feminino 100ml — Luxury Exclusive Fragrance"

Skill analysis:
- Length: 76 chars (within 120 limit) ✓
- Buzzwords detected: "Premium", "Luxury", "Exclusive" (3 total) ✗
- Impact: -9% expected CTR

Skill escalation:
"Found 3 buzzwords: Premium, Luxury, Exclusive.
Expected impact: -9% CTR.

Option A (recommended): Remove buzzwords
→ "Perfume Lattafa Yara Feminino 100ml EDP | Últimas Unidades" (58 chars)
Impact: +5-8% expected CTR vs current

Option B: Keep buzzwords with justification
Reason for each buzzword? [user input required]

Choice: A / B / Cancel"
```

### Allowed Overrides

User can override if:
1. Brand name includes word (e.g., "Premium Oils Ltd.")
2. Product is genuinely exclusive (e.g., limited production run documented)
3. Award is verifiable (e.g., "Awarded Best Fragrance 2025 by [Authority]")
4. Specific reason provided and documented

---

## 2. Preço Requer Justificativa

### Definição
Nenhuma alteração de preço sem autorização explícita + razão documentada e verificável.

### Autoridades

**PricingService (src/03_services/pricing/PricingService.js):**
- Shopee: Fee 20% (or 22% for premium) → formula: `net_price = sale_price × (1 - fee_rate)`
- Mercado Livre: Fee 14% + R$6.00 fixed → formula: `net_price = (sale_price × 0.86) - 6.00`
- Source of truth for margin calculations
- Used when: automatic recalcs based on fee structure changes

**User (human decision):**
- Competitive response (match/undercut competitor)
- Promotional discount (inventory clearance, acquisition)
- Margin override (strategic decision to reduce margin)
- Source: explicit user request with documented reason

### Safe (Auto-Apply, No Escalation)

Conditions where skill auto-applies price change:
1. **Automatic margin recalc** (delta &lt;15%)
   - Shopee fee increased 20% → 22%
   - ML fee calculation adjusted
   - Skill recalcs via PricingService, applies if delta &lt;15%
   
2. **Typo correction**
   - Current price: R$189, should be R$180 (user typo)
   - Verification: user confirms typo history
   - Skill applies

3. **Formula application**
   - User specifies cost: R$100
   - Skill applies PricingService formula
   - Result: R$??

### Escalate (&gt;15% Delta)

Conditions where skill escalates for approval:
1. **Delta &gt;15%**
   ```
   "PricingService suggests R$189, you want R$160.
   Delta: -15.3% (below cost margin target).
   Reason required: [competitive response / margin override / promotional discount]?"
   ```

2. **Manual override vs PricingService**
   ```
   "PricingService calculated R$189 to maintain margin.
   You're overriding to R$150.
   Risk: margin loss of R$39 per unit.
   
   Reason: [user must explain]
   Success metric: [user must specify how they'll measure ROI]"
   ```

3. **Price below cost**
   ```
   "Unit cost is R$80, you're setting price R$75.
   Loss: -R$5 per unit.
   This requires executive approval (margin override).
   
   Approve? [Requires documented reason + approval threshold]"
   ```

### Blocked (Never Apply)

Conditions where skill blocks price change:
1. **Invented discount without basis**
   ```
   ❌ "I want to discount 20% because it's a nice number"
   → Blocked: "No business reason provided. Competitive data or user request required."
   ```

2. **Frequent changes that confuse buyers**
   ```
   ❌ Price changed 3x in 2 days
   → Blocked: "Frequent changes reduce buyer trust. Wait 1 week or provide strategy doc."
   ```

3. **Below-cost pricing without clearance**
   ```
   ❌ "Let's drop to R$50 to clear inventory"
   → Blocked: "Below-cost pricing requires executive approval + clearance strategy."
   ```

### Examples

**Example A: Safe (auto-apply)**
```
Current: R$189 (Shopee 20% fee)
Shopee fee changes to 22%
PricingService recalcs: R$205 (+8% to maintain margin)
Skill: Applies automatically (delta &lt;15%, auto-recalc)
Result: Price updated to R$205
```

**Example B: Escalate**
```
Current: R$189
Competitive monitoring detects competitor at R$159 (-15% market)
Skill: "Competitor priced -15% lower with 2x volume.
Match recommendation: R$159 (margin loss -R$30/unit).
Your monthly volume: ~20 units.
If volume doubles to 40: ROI = 1 month.
Approve this price match strategy? Y/N"
```

**Example C: Blocked**
```
User: "Change price to R$99"
Cost: R$80
Current margin: 27%
New margin with R$99: 12.2% (loss of 15 percentage points)
Skill: Blocks "This reduces margin by 15pp. Business case required:
Cost analysis? Volume projection? Timeline? Executive approval?"
```

### Validation Checklist

Before updating price, skill verifies:
- [ ] Current price in system matches last confirmed value
- [ ] Cost basis (from EstoqueService or input) is documented
- [ ] Fee structure (Shopee/ML) is current
- [ ] Delta from PricingService is &lt;15% or has justification
- [ ] If promotional: success metric defined (e.g., "increase AOV by 20%")
- [ ] If competitive: competitor price verified within 24h

---

## 3. Descrição: Intervenções Menores Apenas

### Definição
Sem reescritas completas. Apenas edits mecânicas que preservam a integridade original do conteúdo (&gt;70% overlap).

### Safe (No Escalation)

Intervalo: &gt;70% content overlap (Jaccard similarity)

**Typo fix:**
```
Current: "Perfum original 100ml" → "Perfume original 100ml"
Overlap: 98%
Skill: Applies automatically
```

**Whitespace normalize:**
```
Current: "Perfume  original  com  múltiplos  espaços"
→ "Perfume original com múltiplos espaços"
Overlap: 99%
Skill: Applies automatically
```

**Reorder bullets (same content, better order):**
```
Current:
- Entrega rápida
- Perfume original
- Garantia 30 dias

Proposed:
- Perfume original
- Garantia 30 dias
- Entrega rápida

Overlap: 100% (only order changed)
Skill: Applies automatically
```

**Append EAN/GTIN (1–2 lines end):**
```
Current: "[description] ... Código: 6291108735411"
Proposed: "[description] ... Código: 6291108735411
EAN: 629110873541"

Overlap: 98% (+2% new content)
Skill: Applies automatically
```

**Expand 1 bullet with supportive sentences (max +50 chars):**
```
Current: "- Fragrância duradoura"
Proposed: "- Fragrância duradoura — óleos concentrados garantem presença por 8+ horas"

Overlap: 70% (30% new detail)
Skill: Applies automatically (within +50 char expansion limit)
```

### Escalate (30–70% Overlap)

Partial rewrite: user approval required

```
Current (100 chars): "Perfume original 100ml. Entrega rápida. Código: 6291108735411"

Proposed (150 chars): "Quer um perfume que dura 12 horas? Este é importado da Arábia com óleos concentrados.
Entrega rápida em 5 dias. Código: 6291108735411"

Overlap: 45% (new narrative structure, added benefit claim)

Skill escalation:
"Proposed change affects 55% of content. This is a partial rewrite.
Current text preserved: 45%.
Changes: Added problem-solution narrative + durability claim.

Approve this rewrite? Y/N
[If Y: User takes responsibility for accuracy of new claims]"
```

### Blocked (&lt;30% Overlap)

Full rewrite: blocked unless user explicitly requests.

```
Current (100 chars): "Perfume original 100ml. Entrega rápida. Código: 6291108735411"

Proposed (200 chars): "This is a premium fragrance from Arabia with a 12-hour longevity profile.
High-quality olfactory experience with citrus and wood notes.
Guaranteed delivery. Code: 6291108735411"

Overlap: 15% (language change, tone shift, new structure)

Skill block:
"This is a full rewrite (15% overlap).
Blocked because:
- Tone shift (Portuguese → English mix)
- New claims not verified (premium, 12-hour longevity)
- Section restructure

I can suggest minor improvements instead: [typo fixes / append EAN / reorder bullets].
Or request explicit rewrite? [Requires user approval + responsibility]"
```

### Detection Method

Jaccard Similarity = |current ∩ proposed| / |current ∪ proposed|

- &gt;0.7 (70% overlap) = Safe
- 0.3–0.7 (30–70% overlap) = Escalate
- &lt;0.3 (30% overlap) = Block

Skill tokenizes both texts, computes overlap, decides action.

### Integrity Constraints

Never allow removal of:
- EAN/GTIN (authentication proof)
- Authentic/original markers (if present)
- Key product details (volume, concentration, brand)

---

## 4. Sem Promoções Inventadas

### Definição
Todas as promoções (Deals, Vouchers, Bundles, Flash Sales) devem ser data-driven (baseadas em dados de estoque/vendas/comportamento) ou user-requested (autorizado explicitamente).

### Safe (Recomenda)

Data-driven recommendations:

```
"Você tem 5 unidades de {product} + competitor priced 15% lower.
Current: 0 units sold in 7 days.
Risk: inventory stagnation.

Recommendation: Offer 10% discount for 48h (expected: increase to 3 units).
Cost: R$X margin loss. ROI: Clear inventory + reviews.
Approve? Y/N"
```

User-requested promotions:

```
User: "I want to launch a Shopee Deal on {product}"
Skill: "Confirmed. Stock: 10 units. Price: R$189.
Suggest: 15% discount (R$160.65) for 48h.
Estimated reach: 500 impressions (based on history).
Expected conversions: 2–5 units.
Success metric: Clear 5 units in 48h. Approve?"
```

### Escalate (Require Inventory + Approval)

Conditions:
1. **User requests promotion without inventory check**
   ```
   User: "Create a flash sale!"
   Stock data: 0 units
   Skill: "Escalate: Product is out of stock. Enable promotion anyway? [Risky]"
   ```

2. **High-risk promotion**
   ```
   Recommendation: "50% discount to acquire new customer"
   Margin impact: -R$95 per unit
   Current AOV: R$200
   Skill: "High-risk: margin loss 50%. Require: Budget approval + volume projection"
   ```

3. **Platform-specific limitations**
   ```
   Skill: "Shopee Deals requires min 2 units available. Current: 1 unit.
   Restock first? Or use Voucher instead?"
   ```

### Blocked (Never Recommends)

```
❌ "Let's do a flash sale to get visibility"
   Reason: No inventory data, no user request, no success metric
   Blocked: "Flash sale requires: inventory check + success metric + budget approval"

❌ "Offer free gift with purchase!"
   Reason: Gift doesn't exist, cost unknown
   Blocked: "Promotion requires: actual gift in stock + cost documented + approval"

❌ "Discount 20% because the number sounds good"
   Reason: No business rationale
   Blocked: "Discount requires: competitive data OR inventory clearance reason OR user request"
```

### Validation Checklist

Before recommending promotion, skill verifies:
- [ ] Inventory available (EstoqueService)
- [ ] Cost of promotion calculated (margin impact)
- [ ] Actual promotion executable on platform (Shopee/ML constraints)
- [ ] Success metric defined (e.g., "increase AOV by 20%")
- [ ] User explicitly approved (or data-driven case made)
- [ ] Timeline realistic (inventory turn-time, platform limits)

### Promotion Type Reference

| Type | Shopee | ML | When Safe | Cost |
|---|---|---|---|---|
| **Deal** | Yes (Shopee Deals) | No | Stock &gt;2, 48h window | Fixed discount |
| **Voucher** | Yes (Shop Vouchers) | No | Min purchase threshold | % or fixed |
| **Bundle** | Create combo SKU | Create kit | Stock &gt;5 of each | Absorbed margin |
| **Flash Sale** | Yes (time-limited) | No | High inventory, peak hours | Aggressive discount |
| **Free Shipping** | Yes (threshold) | Yes (threshold) | Margin &gt;25% | Shipping cost |

---

## Integração com Skill

Skill `ecommerce-optimization` enforça essas restrições automatically:
1. Detecta violation
2. Escalates com contexto
3. Oferece path de resolução
4. Permite user override com documentação

Cada escalation referencia este documento para contexto detalhado.

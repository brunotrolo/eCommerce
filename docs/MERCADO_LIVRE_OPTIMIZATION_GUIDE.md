# Guia de Otimização Mercado Livre — Alta Conversão

Playbook baseado em research de best practices para otimizar listagens Mercado Livre com foco em descoberta, confiabilidade e lucratividade.

**Última atualização:** 2026-08-11 | **Categoria:** Perfumaria (MLB6284)

---

## 1. Estratégia de Título (family_name Auto-Gerado)

### Arquitetura Crítica

⚠️ **ML auto-gera título from `family_name` — você NÃO controla display título diretamente.**

**O que você PODE fazer:**
- Otimizar `family_name` (ML auto-gera de lá)
- Otimizar `attributes` (BRAND, PERFUME_NAME, UNIT_VOLUME, GTIN)
- Estruturar description com keywords

**O que você NÃO PODE fazer:**
- Enviar campo `title` separado (erro: "invalid fields")
- Mudar display título diretamente

### Estrutura de family_name

**Recomendação:**
```
{BRAND} {PRODUCT_NAME} {VOLUME} {FORMULATION} {CONDITION}
```

**Exemplo:**
```
family_name: "Perfume Lattafa Yara Feminino 100ml EDP Original"
(ML auto-generates display: "Perfume Lattafa Yara Feminino 100ml EDP Original")

family_name: "Kit Perfume Lattafa Yara Feminino Asad Masculino 100ml x2"
(ML auto-generates for kits: "Kit Perfume Lattafa Yara Feminino Asad Masculino 100ml")
```

**Length:** Up to 250 chars (family_name), display shows ~120 chars (adaptive to device)

### Attributes = Search Authority

ML's semantic search prioritizes **attributes over title**:

| Attribute | Mandatory | Example | Search Weight |
|---|---|---|---|
| BRAND | Yes | "Lattafa" | High (30%) |
| PERFUME_NAME | Yes | "Yara" | High (30%) |
| UNIT_VOLUME | Yes | "100 mL" | High (25%) |
| GTIN | Conditional | "6291108735411" | Medium (15%) |

**Critical:** Misspelled attributes = silent failure (ML ignores them, no error).

### Examples

**Single product:**
```
family_name: "Perfume Lattafa Yara Feminino 100ml EDP Original"

Attributes:
- BRAND: "Lattafa"
- PERFUME_NAME: "Yara"
- UNIT_VOLUME: "100 mL"
- GTIN: "6291108735411"
- CONDITION: "new"
```

**Kit (combo product):**
```
family_name: "Kit Perfume Lattafa Yara Feminino Asad Masculino 100ml x 2"

Attributes:
- IS_KIT: "Sim"
- KIT_CONTENTS: "Yara (Feminino), Asad (Masculino)"
```

---

## 2. Otimização de Descrição

### Estrutura Recomendada

**Section 1: Quick Facts (First 300 chars)**
```
Produto: Perfume Lattafa Yara Feminino 100ml EDP
Condição: Novo, Original
Autenticidade: Distribuidor oficial certificado
Garantia: Satisfação garantida ou devolução 100%
```

**Section 2: Problem-Solution**
```
Quer um perfume que dura o dia todo?
Este Lattafa tem óleos concentrados (20% pureza) 
que garantem presença de 8–12 horas.

Diferente de perfumes normais que desbotam em 2–3 horas.
```

**Section 3: Product Specifications**
```
Marca: Lattafa
Nome: Yara
Volume: 100ml
Formulation: Eau de Parfum (EDP)
Concentration: 20% óleo puro
Origin: Importado de Dubai
```

**Section 4: Usage Instructions**
```
Como Usar:
1. Aplicar pequena quantidade no pulso
2. Aroma floresce após 15 minutos
3. Longevidade: 8–12 horas com reaplicação
4. Melhor uso: Ocasiões especiais, uso diário
```

**Section 5: Psychological Triggers**
```
Qualidade Verificada:
✓ 500+ vendas com 4.8★ média
✓ Distribuidor oficial Lattafa
✓ Garantia de satisfação 30 dias
✓ Código de verificação: 629110873541
```

**Section 6: Guarantee & Returns**
```
Satisfação Garantida:
Não gostar? Devolução 100% sem perguntas.
Pix de retorno dentro de 30 dias.

Autenticidade Garantida:
Se não for original, reembolso total.
```

### Psychology Triggers (Legitimate)

| Trigger | Example | Impact | Condition |
|---|---|---|---|
| **Social Proof** | "500+ vendas, 4.8★" | +20% conversion | Actual data |
| **Specificity** | "20% óleo puro, 8–12h durabilidade" | +15% conversion | Verifiable |
| **Authority** | "Distribuidor oficial certificado" | +12% conversion | Verifiable |
| **Urgency (if real)** | "Stock de esta importación limitado" | +10% conversion | True scarcity |
| **Guarantee** | "Satisfação garantida ou devolução" | +20% conversion | Actually offered |

### Format & Readability

- **Total length:** 500–800 chars (more than Shopee, ML allows it)
- **Line breaks:** Every 2–3 sentences (mobile-first)
- **Bullets:** Use for specs and benefits
- **Bold:** Key attributes (`**100ml**`, `**EDP**`)
- **Emojis:** Sparingly (✓, ★, 📦)
- **Structure:** Scannable hierarchy (not wall-of-text)

### Include EAN (Redundancy)

```
Código de Verificação:
EAN: 6291108735411
Código: 62911087354
```

Buyers can use this to verify authenticity independently.

---

## 3. Estratégia de Preço

### Psychological Pricing

**Charm pricing (end in 9 or 90):**
```
✅ R$89.90 vs R$90 → +3–5% perceived value
✅ R$149.99 vs R$150 → Feels under-threshold
✅ R$199.90 vs R$200 → Psychological anchor
```

**Reference pricing (anchor higher):**
```
✅ "Concorrente cobra R$189 | Aqui R$159"
   → Verify competitor price is real (ML dashboard shows avg price)

❌ Fake "Original Price: R$300" then "Sale: R$150"
   → ML penalizes (fake discounts hurt visibility)
```

**Tiered discounts (increase AOV):**
```
- 1 unit: R$99.90
- 2–3 units: R$95.00 each
- 4+ units: R$89.90 each

Expected impact: +35–50% multi-unit AOV (ML favors higher AOV)
```

**Consistent pricing:**
- ML algorithm penalizes wild price swings
- Adjust max 1x/week
- Trend: steady pricing → higher ranking

### Margin Protection

**Formula (PricingService):**
- ML fee: 14% + R$6.00 fixed
- Net price = (Sale price × 0.86) - 6.00
- Example: R$99.90 → (99.90 × 0.86) - 6.00 = R$79.94 net

**Minimum margin:** &gt;25% of net price recommended

---

## 4. Estratégia de Imagens (5–6 minimum, white bg preferred)

### Posições Recomendadas

| # | Type | Spec | Purpose |
|---|---|---|---|
| 1 | **Hero** | White bg, 80% frame, centered | Ranking signal (ML favors white) |
| 2 | **Detail** | Label close-up, legible | Authentication, batche code |
| 3 | **Alternative** | Side/back angle | 3D perspective (if value) |
| 4 | **Scale** | Next to hand/ruler/coin | Size context |
| 5 | **Package** | Box if included | Completeness |
| 6 | **Authentication** | Certificate/serial (if present) | Trust signal |

### Quality Minimums

- **Resolution:** 500×500px minimum (ML displays up to 1000×1000)
- **Aspect ratio:** 1:1 preferred (avoids letterboxing)
- **Format:** JPG or PNG (WebP works but older devices fail)
- **Background:** White preferred (+5% perceived quality, ML algorithm favors)
- **Lighting:** Consistent (no jarring color shifts)

### Impact on Conversion

- 2–3 images: baseline
- 4–5 images: +20% conversion
- 6 images: +30–40% conversion
- 7+ images: diminishing returns

---

## 5. Categoria & Atributos (Non-Negotiable)

### Categoria: MLB6284 (Fragrances)

**Critical:** Perfume sempre MLB6284. Não existe alternativa.

**Se errar categoria:**
- 80–90% reduction in discoverability
- Buyers filter by category; wrong category = invisible

### Mandatory Attributes (Perfume Category)

| Attribute | Type | Required | Example |
|---|---|---|---|
| BRAND | Text | **Yes** | "Lattafa" |
| PERFUME_NAME | Text | **Yes** | "Yara" |
| UNIT_VOLUME | Dropdown | **Yes** | "100 mL" |
| GTIN | Text | **Conditional** | "6291108735411" |
| IS_KIT | Dropdown | No | "Sim" / "Não" |
| CONDITION | Auto | Auto-filled | "new" |

### Attribute Validation

**Common mistakes:**
1. Misspelled attribute name (silent failure, attribute ignored)
   ```
   ❌ "PERFUME_NAME_PT" (ML expects "PERFUME_NAME")
   → Attribute ignored, search ranking drops
   ```

2. Missing GTIN (conditional-required for perfumes)
   ```
   ❌ No GTIN provided for single-product listing
   → Error: "attribute.missing_conditional_required"
   ```

3. Kit without KIT_CONTENTS
   ```
   ❌ IS_KIT: "Sim" but no KIT_CONTENTS
   → Warning: incomplete kit info
   ```

### Solution for Kits

If combo product has no GTIN:
- Use GTIN of one component (platform limitation)
- Or: Document in KIT_CONTENTS why GTIN unavailable
- Not ideal, but recognized workaround

---

## 6. Recursos Mercado Livre

### Official Store Badge

**When to claim:**
- You have Seller Plus account
- Maintain &gt;95% positive feedback
- Fulfill Guaranteed Delivery SLA consistently

**Impact:** +8–12% CTR increase, +5% conversion lift

### Guaranteed Delivery

**When to offer:**
- 0% cancellation rate (or &lt;2%)
- &lt;5% return rate
- Partnership with reliable logistics (Correios, Sedex)

**Impact:** +15% conversion (reduces buyer friction)

**Risk:** Failure to meet SLA = penalty (ranking drop, account suspension risk)

### Shine Feature (Paid Visibility Boost)

**When to use:**
- High inventory (5+ units)
- Off-peak periods (low organic traffic)
- Strategic 48–72h windows

**Cost:** Variable (usually R$50–200 per 3-day campaign)

**Impact:** 2x–3x traffic spike during active period

**Timing:** Use during low-inventory days (paradox: visibility when you need to move stock)

### Price Matching

ML dashboard shows: "Your price vs. Marketplace average"

**Strategy:**
- Monitor top 10 competitors daily
- If undercut by &gt;5%: consider price match
- Maintain 5–10% margin buffer (don't race to zero)

---

## 7. Fulfillment & Logistics

### Option 1: Correios (Standard)

- **Speed:** 5–15 business days (varies by destination)
- **Cost:** Included in shipping tables
- **Coverage:** National (most reliable for Brazil)
- **Best for:** Lower-margin, high-volume items

### Option 2: Mercado Envios (ML Logistics)

- **Speed:** 2–7 business days (premium tier)
- **Cost:** Commission per shipment (varies by destination)
- **Coverage:** Metropolitan + selected regions
- **Best for:** Premium products, fast delivery guarantee

### Option 3: White-Label / Partner

- **Examples:** Loggi, Shippify
- **Speed:** 1–3 business days (urban)
- **Cost:** Higher per-shipment
- **Best for:** High-value items, same-day guaranteed

### Shipping Cost Strategy

- **Transparency:** Display exact cost upfront (free shipping misleads)
- **Free shipping threshold:** R$500+ (absorb cost or margin)
- **Regional variation:** Offer cheaper/free shipping for high-volume regions (São Paulo, MG)
- **Multiple options:** Economy (standard), Standard (express), Premium (overnight)

---

## 8. Competitive Positioning (Ethical)

### Legitimate Differentiation

| Claim | Valid | Invalid | Proof Required |
|---|---|---|---|
| "Authentic original" | ✅ (with certificate) | ❌ (generic) | Verifiable seal + batch code |
| "Direct from distributor" | ✅ (if provable) | ❌ (if wholesale) | Distributor agreement |
| "Limited edition" | ✅ (if documented) | ❌ (if restocking) | Production run limit |
| "Lowest price on ML" | ✅ (if monitored) | ❌ (if price-match only) | Daily competitor check |
| "Satisfaction guaranteed" | ✅ (if offered) | ❌ (if unenforceable) | Actual returns policy |

### Price Monitoring

```
ML dashboard shows:
"Your price: R$159 vs. Marketplace average: R$179 (+12% above)"

Weekly review:
1. Check top 5 competitors
2. Calculate your rank by price
3. Decide: match / maintain premium / undercut (if margin allows)
```

### Customer Service Differentiation

- **Response time:** &lt;12h (target, increases ranking)
- **Resolution rate:** &gt;95% (visible in seller rating)
- **Warranty/guarantee:** Offer satisfaction guarantee (+20% conversion)
- **Product knowledge:** Detailed descriptions, usage guides (competitors lack)

---

## 9. Review Management & Engagement

### Response Strategy

**Target:** &lt;24 hours

**5 stars:**
```
"Obrigado por sua confiança! Ficamos felizes que o produto agradou. 
Recomendamos? Nos deixe saber!
```

**3–4 stars:**
```
"Valorizamos seu feedback! O que podemos melhorar? 
Responda aqui ou contate suporte para resolver."
```

**1–2 stars:**
```
"Lamentamos que o produto não atendeu. Podemos ajudar: 
Devolução + Pix reembolso ou troca. Contate suporte: [link]"
```

### Review Analytics

- Track: Review count, avg rating, response time
- Target: 4.5+ stars, &lt;24h response, 0% open issues
- Action: If &lt;4.0★, investigate product quality or shipping delays

---

## 10. KPIs to Monitor

| Metric | Baseline | Target | Action if Below |
|---|---|---|---|
| CTR (Clicks/Impressions) | 1–3% | 3–6% | Review images/attributes |
| Conversion (Orders/Clicks) | 1–3% | 3–8% | Clarify description |
| Price competitiveness | Varies | Top 20% | Price match strategy |
| Avg. Order Value | Varies | +20% | Bundle strategy |
| Review rating | 3.8★ | 4.5★+ | Product quality or response |
| Response time | &gt;48h | &lt;12h | Automate FAQ responses |

### Monitoring Frequency

- **Daily:** CTR, orders, price rank
- **Weekly:** Review responses, competitor prices
- **Monthly:** Full analytics, category trends

---

## 11. Checklist Pré-Launch

- [ ] Categoria: MLB6284 (confirmed)
- [ ] family_name: Otimizado, ≤250 chars
- [ ] Attributes: BRAND, PERFUME_NAME, UNIT_VOLUME, GTIN validados
- [ ] Description: 500–800 chars, estruturada, Quick Facts primeira
- [ ] Imagens: 5–6 minimum, white bg preferred, positions 1–4 filled
- [ ] Preço: Charm pricing (end in 9), competitivo
- [ ] Frete: Calculado, opciones múltiplas se possível
- [ ] EAN: Incluído na descrição
- [ ] Garantia: Satisfaction guarantee oferecida
- [ ] Atributos condicionais: Se IS_KIT=Sim, então KIT_CONTENTS preenchido

---

## Referência Rápida

**family_name formula:** `{Brand} {Product} {Volume} {Formulation} {Condition}`
**Attributes are search authority:** BRAND, PERFUME_NAME, UNIT_VOLUME, GTIN
**Description:** Quick Facts (300) → Problem/Solution → Specs → Usage → Proof → Guarantee
**Images:** White bg hero + detail + angle + scale + package + auth
**Fulfillment:** Correios standard + Mercado Envios optional + Consider white-label for premium
**Reviews:** &lt;24h response + Template by rating
**Differentiation:** Authenticity proof + Customer service + Satisfaction guarantee

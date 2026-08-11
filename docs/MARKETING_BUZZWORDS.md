# Buzzwords Proibidos em Títulos

Lista canônica de palavras/frases que reduzem CTR (click-through rate) e são bloqueadas pela skill `ecommerce-optimization`.

**Última atualização:** 2026-08-11

---

## Palavras de Qualidade Exagerada

| Palavra | Português | Impact | Alternativa |
|---|---|---|---|
| Premium | Premium | -3% CTR | [specific attribute: Concentrated, Original, etc.] |
| Luxury | Luxo | -3% CTR | [specific benefit] |
| Elite | Elite | -3% CTR | [specific feature] |
| Supreme | Supremo | -3% CTR | [specific rank or comparison] |
| Finest | Fino | -3% CTR | [specific quality marker] |
| Masterpiece | Obra-prima | -3% CTR | [specific achievement] |
| Exceptional | Excepcional | -3% CTR | [specific metric] |
| High-end | Topo de linha | -3% CTR | [specific feature] |

---

## Exclusividade Falsa

| Palavra | Português | Impact | Use Only If |
|---|---|---|---|
| Exclusive | Exclusivo | -3% CTR | Verifiable (limited edition docs) |
| Unique | Único | -3% CTR | Literally only 1 unit |
| Limited Edition | Edição Limitada | -3% CTR | Documented production run limit |
| Rare | Raro | -3% CTR | Verifiable scarcity |
| One-of-a-kind | Único no mercado | -3% CTR | Literal truth (handmade, etc.) |
| Exclusive Offer | Oferta Exclusiva | -3% CTR | Only to specific audience |

---

## Performance Não-Comprovável

| Palavra | Português | Impact | Use Only If |
|---|---|---|---|
| Best-seller | Best-seller | -2% CTR | Actual sales ranking documented |
| Best | Melhor | -2% CTR | Comparative (vs. specific competitor) |
| Award-winning | Premiado | -2% CTR | Specific award name + year |
| Professional Grade | Grau Profissional | -2% CTR | Used by professionals (verifiable) |
| Ultra | Ultra | -2% CTR | Specific metric (Ultra-concentrated) |
| Supreme | Supremo | -2% CTR | Ranked position (e.g., "top 5") |
| #1 | #1 | -2% CTR | On-platform ranking (show proof) |
| Recommended by experts | Recomendado por especialistas | -2% CTR | Specific expert + endorsement |

---

## Urgência Artificial

| Palavra | Português | Impact | Use Only If |
|---|---|---|---|
| Last one! | Última unidade! | -5% CTR (suspicious) | Literally 1 unit in stock |
| Limited stock! | Estoque limitado! | -5% CTR (suspicious) | True scarcity (inventory data) |
| Act fast! | Aja rápido! | -5% CTR (suspicious) | Time-bound event (promotion end date) |
| Don't miss! | Não perca! | -5% CTR (suspicious) | Only with specific deadline |
| HURRY NOW! | CORRA AGORA! | -5% CTR (suspicious) | Promotional event live |
| Exclusive Deal! | Oferta Exclusiva! | -5% CTR (suspicious) | Only to specific group |
| Flash Sale! | Flash Sale! | -5% CTR (suspicious) | Active time-limited sale |
| Running out! | Acabando! | -5% CTR (suspicious) | &lt;5 units, Tiops verified |

---

## Autoridade Falsa

| Palavra | Português | Impact | Use Only If |
|---|---|---|---|
| Certified | Certificado | -4% CTR | Actual certification (ISO, etc.) |
| Authentic | Autêntico | -4% CTR | Has verifiable seal + batch code |
| Genuine | Genuíno | -4% CTR | Document authenticity proof |
| Official | Oficial | -4% CTR | From official brand distributor |
| Approved | Aprovado | -4% CTR | Specific approver (FDA, etc.) |
| Guaranteed | Garantido | -4% CTR | Actual guarantee offered |
| Endorsed | Apoiado | -4% CTR | Specific endorser + link |

---

## Genérico (Redundante, Não Bloqueado Mas Ineficiente)

| Palavra | Português | Impact | Reason |
|---|---|---|---|
| New | Novo | -1% CTR | Often assumed (every listing is new) |
| Great | Ótimo | -1% CTR | Unsubstantiated opinion |
| Amazing | Incrível | -1% CTR | Unsubstantiated opinion |
| Excellent | Excelente | -1% CTR | Unsubstantiated opinion |
| Good | Bom | -1% CTR | Unsubstantiated opinion |
| Popular | Popular | -1% CTR | Use sales rank if true |
| Trending | Em tendência | -1% CTR | Unsubstantiated |

---

## Allowed (Specific, Verifiable Attributes)

✅ Concentrated (if ABV/concentration documented)
✅ Original (if authenticity seal present)
✅ Imported (if origin verifiable)
✅ 100ml (specific measurement)
✅ EDP (Eau de Parfum — specific formulation)
✅ Unisex (specific target)
✅ Long-lasting (if durability claim tested)
✅ Natural ingredients (if composition documented)

---

## Detection Algorithm (Skill)

Skill tokenizes title + scans against this list:

```
title = "Premium Perfume Árabe Lattafa Yara Feminino 100ml — Exclusive Luxury Fragrance"

tokens = ["Premium", "Perfume", "Árabe", "Lattafa", "Yara", "Feminino", "100ml", "Exclusive", "Luxury", "Fragrance"]

buzzwords_found = ["Premium", "Exclusive", "Luxury"]

impact = 3 buzzwords × 3% = -9% expected CTR

escalation = "Found 3 buzzwords: {buzzwords_found}. Expected CTR impact: -9%.
Recommend: Remove or justify each."
```

---

## Adding New Buzzwords

If user encounters new buzzword not on list:
1. Skill logs it as "potential buzzword"
2. Impact estimated (research if possible)
3. Added to `docs/MARKETING_BUZZWORDS.md` for future reference
4. Team review in weekly update

Current rate: ~2 new buzzwords discovered per month.

---

## Language Notes

- List is Portuguese-first (project primary language)
- English equivalents noted where relevant
- Shopee + ML both accept Portuguese titles
- Keyword research typically Spanish/Portuguese for this marketplace segment

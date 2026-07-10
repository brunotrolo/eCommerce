# Mercado Livre — Criar Anúncio (Receita Pronta)

> **Para um novo chat:** Receita **testada** para criar anúncios no Mercado Livre via MCP Tiops. O fluxo do ML é bem diferente do Shopee (título automático, GTIN obrigatório, imagens por URL direta). Siga na ordem e evite o retrabalho de tentativa-e-erro.

Conta ML: `meliUserId = 3520412809`

---

## Fluxo Completo

```
1. list_accounts            → confirmar meliUserId
2. search_categories (q=..) → descobrir category_id pelo nome do produto
3. category_attributes      → ver atributos obrigatórios da categoria
4. create_item              → criar o anúncio (payload abaixo)
5. (opcional) update_description → adicionar descrição
6. permalink na resposta    → conferir o anúncio
```

> Diferente do Shopee, o ML **aceita imagens por URL direto** — não precisa fazer upload antes.

---

## Payload que FUNCIONA (create_item)

```json
{
  "meliUserId": "3520412809",
  "family_name": "Kit Perfume Lattafa Yara Feminino Asad Masculino 100ml",
  "category_id": "MLB6284",
  "price": 320,
  "currency_id": "BRL",
  "available_quantity": 1,
  "buying_mode": "buy_it_now",
  "condition": "new",
  "listing_type_id": "gold_special",
  "pictures": [
    { "source": "https://http2.mlstatic.com/....-O.jpg" }
  ],
  "attributes": [
    { "id": "BRAND", "value_name": "Lattafa" },
    { "id": "PERFUME_NAME", "value_name": "..." },
    { "id": "UNIT_VOLUME", "value_name": "100 mL" },
    { "id": "GTIN", "value_name": "6291108735411" }
  ]
}
```

### Pegadinhas críticas (descobertas na marra)
| Campo | Regra |
|-------|-------|
| **`title`** | ❌ **NÃO envie `title`** — dá erro `The fields [title] are invalid`. O ML **gera o título automaticamente** a partir do `family_name` |
| **`family_name`** | ✅ Obrigatório. É o que vira o título do anúncio |
| **`pictures`** | Formato `[{ "source": "URL" }]` — URL pública direta (o ML baixa). Sem upload prévio |
| **`listing_type_id`** | `gold_special` (grátis/clássico) ou `gold_pro` (premium) |
| **`currency_id`** | `BRL` · **`buying_mode`** `buy_it_now` · **`condition`** `new` |
| **atributos** | Cada categoria tem obrigatórios próprios — descubra com `category_attributes` |

---

## Descobrir categoria e atributos

- **Categoria:** `search_categories` com params `{ "meliUserId": "...", "q": "kit perfume masculino feminino" }` (o parâmetro é **`q`**, não `query`). Retorna `category_id` + `domain_id`. Perfumes caem em **`MLB6284`**.
- **Atributos obrigatórios:** `category_attributes` com `{ "meliUserId": "...", "category_id": "MLB6284" }`. A resposta é grande (73 atributos p/ perfume) — delegue a um subagente pra extrair só os que têm tag `required` / `catalog_required` / `conditional_required`.

### Obrigatórios da categoria Perfumes (MLB6284)
| Atributo | id | Formato |
|----------|-----|---------|
| Marca | `BRAND` | texto (idealmente da lista de marcas da categoria) |
| Nome do perfume | `PERFUME_NAME` | texto livre |
| Volume da unidade | `UNIT_VOLUME` | `number_unit` — ex: `"100 mL"` (unidade `mL`) |
| Código universal | `GTIN` | **obrigatório** (ver abaixo) |

> O ML preenche sozinho, no momento da criação, atributos de embalagem (`SELLER_PACKAGE_WIDTH/LENGTH/HEIGHT/WEIGHT`), `HAZMAT_TRANSPORTABILITY` e `ITEM_CONDITION` — não precisa enviar.

---

## GTIN é obrigatório em MLB6284 ⚠️

- Na categoria Perfumes o **GTIN é `conditional_required` e forçado**: sem ele, erro `item.attribute.missing_conditional_required`.
- O mecanismo "sem código universal" (`EMPTY_GTIN_REASON`, valores `17055159` kit/pack, `17055160` sem código) **NÃO foi aceito via API** nesta categoria — o ML continuou exigindo o GTIN. Um `GTIN` com valor nulo é **descartado** (`Attribute GTIN was dropped because its values is empty`).
- **Solução prática:** informe um **GTIN real** em `attributes`. Para um **kit** (que não tem código próprio), o único caminho que funcionou foi "emprestar" o EAN de um dos produtos. Não é ideal semanticamente, mas foi o que o ML aceitou.

---

## Kit de produtos

- Marque `{ "id": "IS_KIT", "value_name": "Sim" }` (atributo booleano, o ML resolve pro value_id `242085`).
- Preço do kit = **soma dos produtos**.
- Imagens: dá pra combinar fotos dos dois produtos (ex: metade de cada) no mesmo `pictures`.

---

## Tabela de Erros → Correção (já resolvidos)

| Erro | Causa | Correção |
|------|-------|----------|
| `body.required_fields ... [family_name]` | faltou `family_name` | adicionar `family_name` |
| `The fields [title] are invalid` | enviou `title` junto de `family_name` | **remover** `title` (título é automático) |
| `item.attribute.missing_catalog_required` ("Nome do perfume"/"Volume") | faltou atributo obrigatório | adicionar `PERFUME_NAME`, `UNIT_VOLUME` |
| `The attributes [GTIN] are required` | GTIN ausente/vazio | informar um GTIN real (ver seção GTIN) |
| `Site ID or Query is empty` (search_categories) | usou `query` | usar **`q`** |

---

## Pausar / reativar anúncio

- **Pausar:** `pause_item` com `{ "meliUserId": "...", "itemId": "MLB..." }`.
- **Reativar:** `activate_item` com os mesmos params.
- ⚠️ **Atenção ao nome do parâmetro:** aqui é **`itemId`** (camelCase), **não** `item_id`. Passar `item_id` dá `itemId obrigatório`. (Inconsistente com `create_item`, que usa `category_id`/`available_quantity` em snake_case.)

---

## title da API ≠ título de exibição

Ao **ler** anúncios existentes (`get_item`), o campo `title` retornado pela API **pode não ser** o título que aparece no anúncio pro comprador. Não confie no `title` da API como fonte do título de exibição — confirme abrindo o `permalink`.

---

## Checklist rápido antes de criar

- [ ] `meliUserId` correto (`list_accounts`)
- [ ] `category_id` via `search_categories` (`q=...`)
- [ ] atributos obrigatórios da categoria (`category_attributes`)
- [ ] **NÃO** enviar `title` — usar `family_name`
- [ ] `pictures: [{ source: URL }]` (URL pública direta)
- [ ] `BRAND` + `PERFUME_NAME` + `UNIT_VOLUME` + **GTIN real**
- [ ] `currency_id`, `buying_mode`, `condition`, `listing_type_id`
- [ ] conferir pelo `permalink` da resposta

---

**Última atualização:** 2026-07-10 — receita validada criando um kit (Yara + Asad) no ML.

# Shopee — Criar Anúncio (Receita Pronta)

> **Para um novo chat:** Este guia tem a **receita testada e funcionando** para criar anúncios na Shopee via MCP Tiops, incluindo o payload exato, os campos obrigatórios e como reaproveitar imagens pelo EAN. Siga na ordem e evite todo o retrabalho de tentativa-e-erro.

Loja Shopee: `shopId = 1880105398`

---

## Fluxo Completo (5 passos)

```
1. list_accounts              → confirmar shopId
2. shopee_recommend_category  → descobrir category_id pelo nome do produto
3. shopee_upload_image        → subir cada imagem, coletar image_id
4. shopee_create_item         → criar o anúncio (payload abaixo)
5. conferir data.mac.public_url
```

---

## Payload que FUNCIONA (shopee_create_item)

Copie e substitua os valores. **Todos estes campos são necessários** — foram descobertos na marra:

```json
{
  "shopId": "1880105398",
  "item_name": "Nome do Produto Original Árabe 100ml",
  "description": "Descrição...\n\nEAN: 0000000000000\n\nProduto 100% original.",
  "price": 221,
  "original_price": 221,
  "stock": 1,
  "seller_stock": [{ "stock": 1 }],
  "category_id": 100661,
  "images": ["sg-11134201-xxxx", "sg-11134201-yyyy"],
  "weight": 0.5,
  "logistic_info": [{ "logistic_id": 90006, "enabled": true }],
  "dimension": { "package_length": 15, "package_width": 10, "package_height": 8 },
  "brand": { "brand_id": 0, "original_brand_name": "" }
}
```

### Campos que NÃO podem faltar (senão a Shopee rejeita)
| Campo | Observação |
|-------|-----------|
| `original_price` | além de `price` — a Shopee valida `original_price`, não `price` |
| `seller_stock` | array `[{ "stock": N }]` — além de `stock`. É o estoque no formato novo |
| `logistic_info[].logistic_id` | **é `logistic_id`, NÃO `logistics_channel_id`** |
| `brand` | obrigatório na categoria de perfume. Use `{ "brand_id": 0, "original_brand_name": "" }` = "Sem marca" |
| `weight` + `dimension` | Correios exige peso e dimensões |

---

## Tabela de Erros → Correção (já resolvidos)

| Erro retornado | Causa | Correção |
|----------------|-------|----------|
| `LogisticId is required` | usou `logistics_channel_id` | trocar por `logistic_id` |
| `error_invalid_brand` / "Brand information required" | categoria exige marca | adicionar `brand: { "brand_id": 0, "original_brand_name": "" }` |
| `invalid field seller_stock, value must Not Null` | faltou estoque no formato novo | adicionar `seller_stock: [{ "stock": N }]` |
| `invalid field original_price, value must Not Null` | faltou preço no campo certo | adicionar `original_price` |
| warning `gtin is a mandatory field...` | só um aviso, não bloqueia | opcional; o anúncio é criado mesmo assim |

---

## Logística (Correios)

`shopee_get_logistics_channels` retorna o canal habilitado. Na loja atual:
- **Correios** → `logistic_id: 90006`, habilitado, cobrança por tamanho/peso, até 30kg.

Use sempre `logistic_info: [{ "logistic_id": 90006, "enabled": true }]`.

---

## Marca (brand) — obrigatória em perfume

- `shopee_get_brand_list` **exige `offset`** (ex: `{ "category_id": 100661, "status": 1, "page_size": 100, "offset": 0 }`).
- A lista é enorme e paginada (`has_next_page`, `next_offset`). Marcas árabes de nicho (Lattafa, Al Wataniah, Asdaaf, Maison Alhambra) **não estão no registro** → use **Sem marca** (`brand_id: 0`).
- Marcas conhecidas encontradas: **Armaf → `brand_id 1146270`**.
- Regra prática: se a marca não aparecer, use `brand_id: 0`. Não vale a pena paginar milhares de marcas.

---

## Imagens — reaproveitar pelo EAN (o truque que economiza tudo)

A nota fiscal **não tem fotos**, e a Shopee exige no mínimo 1 imagem. Solução usada:

1. A NF traz o **EAN** de cada produto.
2. Liste os anúncios do **Mercado Livre** (`list_items` com `meliUserId`) e case cada EAN com o GTIN do anúncio ML.
3. Reaproveite as **URLs de imagem** do anúncio ML (`pictures[].url` / `secure_url`).
4. Suba cada URL na Shopee com `shopee_upload_image` (`{ "shopId": "...", "image_url": "<URL_do_ML>" }`).
5. Cada upload retorna `response.image_info.image_id` → junte numa lista e passe em `images`.

> `shopee_upload_image` aceita `image_url` (URL pública) **ou** `image_base64`.
> `shopee_search_items` busca **só na sua própria loja** — não serve pra achar imagens de outros vendedores.

### Se `list_items` do ML estourar o limite de tokens
O retorno é grande. Delegue a leitura a um subagente pedindo para extrair, por produto: título, MLB id, preço, **GTIN/EAN** e **todas as URLs de imagem**.

---

## Dica de escala: paralelize com subagentes

Ao criar vários anúncios de uma vez, **um subagente por produto** (Agent tool) mantém as respostas gigantes de upload fora do contexto principal e roda tudo em paralelo. Dê a cada subagente:
- o payload-receita acima com os valores do produto;
- a lista de URLs de imagem;
- instrução de rodar `shopee_recommend_category`, subir imagens, criar o item e retornar só `item_id` + `public_url`.

Isso economiza tokens e tempo (6 anúncios criados em ~1 minuto).

---

## Categoria

- `shopee_recommend_category` com `{ "shopId": "...", "item_name": "..." }` retorna `response.category_id` (lista) — use o **primeiro**.
- Perfumes (masc. e fem.) caíram em **`100661`**.
- `shopee_get_attributes` está **suspensa (403)** no momento — não dá pra listar atributos obrigatórios; crie o item e trate os erros pela tabela acima.

## GTIN / EAN — limitação atual ⚠️

- O anúncio é criado com **GTIN vazio** (aparece só um *warning*, não bloqueia venda).
- Na Shopee o GTIN é um **atributo da categoria** (`attribute_list`), não um campo simples. Passar `gtin` no topo do `shopee_update_item` **não persiste** (não há confirmação nem leitura de volta).
- Para gravar via API seria preciso o `attribute_id` do GTIN, obtido por `shopee_get_attributes` — que está **suspensa (403)**. O `shopee_recommend_attributes` **não** retorna o atributo de GTIN.
- Nenhum endpoint de leitura (`get_item`, `get_extra_info`) devolve o GTIN → **não dá nem pra verificar** se foi gravado.
- **Solução prática:** (1) sempre incluir o **EAN na descrição** (feito no payload) e (2) preencher o **GTIN manualmente no Seller Center** (Produtos → Editar → Especificações → GTIN). Reavaliar quando `shopee_get_attributes` voltar do ar.

---

## Checklist rápido antes de criar

- [ ] `shopId` correto (`list_accounts`)
- [ ] `category_id` via `recommend_category`
- [ ] pelo menos 1 `image_id` (via `upload_image`)
- [ ] `price` **e** `original_price`
- [ ] `stock` **e** `seller_stock`
- [ ] `logistic_info` com `logistic_id: 90006`
- [ ] `weight` + `dimension`
- [ ] `brand` (0 = sem marca)
- [ ] EAN na descrição

---

**Última atualização:** 2026-07-10 — receita validada criando 6 anúncios de perfume árabe.

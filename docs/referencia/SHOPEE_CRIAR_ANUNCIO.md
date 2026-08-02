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
| warning `gtin is a mandatory field...` | aviso fixo que sempre aparece | não bloqueia; grave o GTIN depois via `update_item` (ver seção GTIN) |

---

## Logística (Correios)

`shopee_get_logistics_channels` retorna o canal habilitado. Na loja atual:
- **Correios** → `logistic_id: 90006`, habilitado, cobrança por tamanho/peso, até 30kg.

Use sempre `logistic_info: [{ "logistic_id": 90006, "enabled": true }]`.

---

## Atualizar preço (shopee_update_price)

Use a ação dedicada `shopee_update_price` — **não** passe `price` solto (dá erro `PriceList is required`). O formato é `price_list`:

```json
{ "shopId": "1880105398", "item_id": 58264007947, "price_list": [{ "original_price": 135 }] }
```

- A resposta é **confiável** (diferente do `update_item`): traz `success_list` (com o novo preço) e `failure_list`. Não precisa reler com `get_item`.
- Para itens com variações, cada entrada do `price_list` leva também `model_id`.

---

## Marca (brand) — obrigatória em perfume

- `shopee_get_brand_list` **exige `offset`** (ex: `{ "category_id": 100661, "status": 1, "page_size": 100, "offset": 0 }`). Pagine com `offset = response.next_offset` até `has_next_page == false`.
- A lista tem **milhares** de marcas: uma seção alfabética inicial + vários lotes ad-hoc no fim (é lá que ficam as marcas de perfumaria árabe, com `brand_id` na faixa de milhões). **Vale paginar fundo** — as marcas de nicho existem, só estão longe.
- Passar `brand_id: 0` com `original_brand_name: "Lattafa"` **NÃO registra a marca** — fica "Sem marca". É obrigatório usar o `brand_id` real do catálogo.
- **Dica:** delegue a paginação a um subagente que percorre até achar as marcas-alvo e retorna só os `brand_id` (as respostas são grandes; mantenha fora do contexto principal).

### brand_id já mapeados (categoria 100661 — perfume)
| Marca | brand_id |
|-------|----------|
| Lattafa | `6132242` |
| Al Wataniah | `2798766` |
| Asdaaf | `4461717` |
| Maison Alhambra | `3857860` |
| Armaf | `1146270` |

> ⚠️ Cuidado com grafias erradas/compostas no catálogo: existe "Lataffa" (errado) e "Asad Lattafa" / "Lattafa Perfumes" (compostas). Prefira a entrada exata `lattafa` = `6132242`.

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
> A Shopee aceita **até 9 imagens** por anúncio. A primeira da lista é a principal.

> ⚠️ **A Shopee rejeita `.webp`** (`product.error_param: image is invalid or not supported`). O Mercado Livre serve muitas imagens em `.webp`. **Solução:** troque a extensão `.webp` por `.jpg` na URL do ML (`http2.mlstatic.com/...-O.webp` → `...-O.jpg`) — o CDN serve o mesmo arquivo em JPG e a Shopee aceita.

### ⚠️ CRIAR vs. ATUALIZAR imagens usam campos DIFERENTES
- **Criar** (`shopee_create_item`): use `images: [ "image_id1", "image_id2", ... ]` (array simples).
- **Atualizar** (`shopee_update_item`): use `image: { "image_id_list": [ "image_id1", ... ] }` (objeto).
- Se usar `images: [...]` no `update_item`, ele **não dá erro mas não aplica nada** (o `get_item` continua mostrando as imagens antigas). Sempre confirme a contagem pelo `get_item`.

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

## GTIN / EAN — como gravar (FUNCIONA via API) ✅

- O `shopee_create_item` cria o anúncio com **GTIN vazio** (só gera um *warning*).
- Para preencher, chame `shopee_update_item` com o campo **`gtin`** no topo:
  ```json
  { "shopId": "1880105398", "item_id": 58264007947, "gtin": "5055810012786" }
  ```
- O valor é salvo no campo **`gtin_code`** do produto.
- ⚠️ **Pegadinha:** a resposta do `update_item` **não** confirma o GTIN, e a warning continua aparecendo. **Só o `shopee_get_item` (relido depois) mostra o `gtin_code` real.** Sempre valide pelo `get_item`, não pela resposta do update.
- Mantenha também o **EAN na descrição** (redundância útil pro comprador).

## Regra de ouro do update: valide pelo GET, não pela resposta

Tanto para **GTIN** quanto para **marca**, a resposta do `shopee_update_item` costuma vir com o valor **desatualizado** (ex: `brand_id: 0` mesmo após gravar). Isso é normal. **A fonte da verdade é o `shopee_get_item`** — releia o item pra confirmar. Ao atualizar vários itens, delegue a verificação a um subagente que lê cada um e retorna só `brand_id` + `gtin_code`.

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

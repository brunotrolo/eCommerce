# docs/referencia — conhecimento validado, não redescobrir

Material de consulta cujo conteúdo já foi confirmado na prática. Leia antes de
escrever qualquer chamada nova à Tiops.

| Arquivo | Conteúdo |
|---|---|
| `MCP_TIOPS_QUICK_START.md` | Como falar com a API Tiops: endpoint, autenticação, formato `{action, params}` |
| `SHOPEE_CRIAR_ANUNCIO.md` | Payloads e regras validadas para anúncios Shopee |
| `MERCADO_LIVRE_CRIAR_ANUNCIO.md` | Payloads e regras validadas para anúncios Mercado Livre |
| `TIOPS_MCP_Analysis.md` | Catálogo das ações disponíveis, por categoria, com limitações mapeadas |
| `catalogo_mercado_livre.md` | Levantamento de oportunidades de produto (insumo de negócio, não técnico) |

Regras extraídas daqui que viraram lei do projeto estão resumidas em
`AGENTS.md` e detalhadas em `specs/listings.md` e
`specs/inventory-pricing.md`. Se encontrar divergência entre um documento
daqui e uma spec, **a spec vence** — e a divergência deve ser corrigida no
mesmo commit.

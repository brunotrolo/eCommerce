# docs/referencia — conhecimento validado, não redescobrir

Material de consulta cujo conteúdo já foi confirmado na prática. Leia antes de
escrever qualquer chamada nova à Tiops.

| Arquivo | Conteúdo |
|---|---|
| `MCP_TIOPS_QUICK_START.md` | Como falar com a API Tiops: endpoint, autenticação, formato `{action, params}` |
| `SHOPEE_CRIAR_ANUNCIO.md` | Payloads e regras validadas para anúncios Shopee |
| `MERCADO_LIVRE_CRIAR_ANUNCIO.md` | Payloads e regras validadas para anúncios Mercado Livre |
| `TIOPS_MCP_Analysis.md` | Catálogo das ações disponíveis, por categoria, com limitações mapeadas |
| `CONTRATOS_CONFIRMADOS.md` | Registro do que já foi verificado contra a API real (contas, tokens, ações confirmadas x pendentes) |

Regras extraídas daqui que viraram lei do projeto estão resumidas em
`AGENTS.md`; o domínio Anúncios/Listings/Preço&Estoque que essas regras
originalmente serviam foi removido (ver `PLANO.md`, seção "Removidos").
Se encontrar divergência entre um documento daqui e o código do serviço
real, **o código vence** — e a divergência deve ser corrigida no mesmo commit.

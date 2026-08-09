# docs/referencia — conhecimento validado, não redescobrir

Material de consulta técnico. `SHOPEE_CRIAR_ANUNCIO.md`,
`MERCADO_LIVRE_CRIAR_ANUNCIO.md` e `CONTRATOS_CONFIRMADOS.md` têm conteúdo
testado/confirmado contra a API real. `MCP_TIOPS_QUICK_START.md` tem a
mecânica de chamada (endpoint, auth, formato) confirmada, mas a tabela de
nomes de ação **não** — ver aviso no próprio arquivo. Leia antes de escrever
qualquer chamada nova à Tiops, e sempre rode `list_actions`/`describe_action`
para confirmar um nome antes de usá-lo em código.

| Arquivo | Conteúdo |
|---|---|
| `MCP_TIOPS_QUICK_START.md` | Como falar com a API Tiops: endpoint, autenticação, formato `{action, params}` |
| `SHOPEE_CRIAR_ANUNCIO.md` | Payloads e regras validadas para anúncios Shopee |
| `MERCADO_LIVRE_CRIAR_ANUNCIO.md` | Payloads e regras validadas para anúncios Mercado Livre |
| `CONTRATOS_CONFIRMADOS.md` | Registro do que já foi verificado contra a API real (contas, tokens, ações confirmadas x pendentes) |

Regras extraídas daqui que viraram lei do projeto estão resumidas em
`AGENTS.md`; o domínio Anúncios/Listings/Preço&Estoque que essas regras
originalmente serviam foi removido (ver `PLANO.md`, seção "Removidos").
Se encontrar divergência entre um documento daqui e o código do serviço
real, **o código vence** — e a divergência deve ser corrigida no mesmo commit.

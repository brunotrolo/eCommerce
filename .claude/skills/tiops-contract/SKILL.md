---
name: tiops-contract
description: Use antes de escrever, alterar ou depurar qualquer chamada à API Tiops neste projeto — confirma nome de ação e schema de params contra o catálogo real (list_actions/describe_action) em vez de assumir de memória.
---

# tiops-contract

A maior fonte de erro silencioso neste projeto é **inventar nome de ação ou
nome de parâmetro da Tiops**. O agente escreve algo plausível, a API devolve
200 com um corpo vazio ou um erro genérico, e o bug só aparece depois — em
produção, com dado real. Esta skill existe para tornar isso impossível.

## Regra

Antes de escrever ou alterar qualquer `TiopsClient.call(action, params)`:

1. **Confirme que a ação existe.** Consulte o catálogo (`list_actions`, ou
   `describe_action` direto se você já tem o nome candidato). Não confie na
   memória nem em analogia com outro canal — Shopee e Mercado Livre usam
   nomes e casing diferentes para a mesma operação.
2. **Confirme o schema dos params.** Copie os nomes exatamente como o
   `describe_action` devolver, incluindo `snake_case` vs `camelCase`. Casos
   já conhecidos que quebram por casing/nome:
   - Shopee: `logistic_id` (não `logistics_channel_id`); `shopee_update_price`
     recebe `price_list`, nunca `price` solto; `original_price` e
     `seller_stock` são obrigatórios em cenários onde `price`/`stock` sozinhos
     parecem bastar.
   - Mercado Livre: `pause_item`/`activate_item` recebem `itemId` (camelCase);
     nunca envie `title` (o campo é `family_name`); `search_categories` usa `q`.
3. **Consulte e alimente o registro.**
   `docs/referencia/CONTRATOS_CONFIRMADOS.md` lista o que já foi verificado
   contra a API real, com data — olhe lá primeiro, para não repetir a
   consulta. Ao confirmar algo novo, acrescente a linha no mesmo commit. Toda
   ação usada por um serviço também deve constar na seção *Dependências* da
   spec do domínio.
4. **Passe o ID da conta explicitamente.** Há mais de uma conta conectada, e o
   servidor não infere qual usar: ML exige `meliUserId`, Shopee exige
   `shopId`, sempre via `ConfigService.getAccountId(<canal>)`.
5. **Toda escrita é seguida de releitura.** Depois de qualquer
   update/pause/activate, releia o item (`get_item` / `shopee_get_item`) e só
   então reporte sucesso. A resposta do update **não** é confirmação de que o
   estado mudou — essa é uma regra de projeto, não uma sugestão.

## Ao encontrar divergência

Se o catálogo não bater com o que o código faz, **pare e reporte** o nome
esperado × encontrado antes de alterar qualquer coisa. Não "conserte" a
chamada adivinhando o nome mais próximo.

## Quem consegue verificar o quê

A sessão do **Claude Code** tem o MCP da Tiops conectado e consegue rodar
`list_actions`/`describe_action` direto, sem custo de deploy. A sessão do
**OpenCode** pode não ter — se o catálogo não estiver acessível aí, **não
adivinhe**: peça a confirmação do contrato ao Claude Code e só então
implemente. Um contrato confirmado deve ser anotado na spec do domínio, para
que a próxima sessão não precise consultar de novo.

## Onde procurar antes de perguntar

Payloads já validados na prática estão em
`docs/referencia/SHOPEE_CRIAR_ANUNCIO.md` e
`docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md`. O catálogo geral e as
limitações mapeadas estão em `docs/referencia/TIOPS_MCP_Analysis.md`. Leia
antes de redescobrir na marra.

# Spec: Hardening — Teste de contrato Tiops (ações usadas × catálogo real)

## Status
Implemented (executado em 2026-08-10 — resultado em
`docs/referencia/CONTRATOS_CONFIRMADOS.md`, seção "Teste de contrato global")

## Objetivo
Item 2 da Fase 7 (Endurecimento): para **cada ação Tiops usada no código**,
confirmar via `list_actions`/`describe_action` que o nome da ação e o schema
de params ainda batem com o catálogo real — eliminando o risco nº 1 do
PLANO.md (agente inventar nome/params, ou a Tiops mudar o contrato sem aviso).
O resultado é registrado no repositório (`docs/referencia/`) e discrepâncias
viram correção de código ou ajuste de params imediato.

## Contrato da API Interna
Sem nova action pública. É um procedimento de verificação (read-only) +
artefato de resultado. Catálogo de referência = `list_actions` (nomes) e
`describe_action` (schema de params) via `TiopsClient`/MCP.

### Escopo da verificação (ações usadas — 30 únicas)
| Serviço | Ações |
|---|---|
| AnunciosShopee | `shopee_list_items`, `shopee_get_items_batch`, `shopee_sales_by_item`, `shopee_get_models`, `shopee_get_item`, `shopee_update_price`, `shopee_update_stock`, `shopee_unlist_item`, `shopee_delete_item` |
| CarteiraShopee | `shopee_get_wallet_transactions`, `shopee_get_escrow_list`, `shopee_get_income_overview` |
| OrdersImport | `shopee_list_orders`, `shopee_get_order_detail`, `shopee_get_escrow_detail_batch`, `shopee_get_order` |
| ShopeeAds | `shopee_ads_balance`, `shopee_ads_campaigns`, `shopee_ads_campaign_daily`, `shopee_ads_hourly_performance`, `shopee_ads_pause_campaign`, `shopee_ads_resume_campaign`, `shopee_ads_recommended_keywords`, `shopee_ads_edit_keywords`, `shopee_ads_delete_keywords`, `shopee_ads_gms_items`, `shopee_ads_recommended_items`, `shopee_ads_roi_target`, `list_items` |

Removida na execução: `shopee_ads_terminate_campaign` (AUSENTE — 404 na API
real; feature "Encerrar campanha" removida de `ShopeeAdsService` e
`ShopeeAdsView` em 10/08/2026 por decisão do usuário). `get_visits` e
`search_orders_by_item` NÃO são usadas no código atual (spec antiga estava
divergente) — só foram verificadas por via das dúvidas.

## Regras de Negócio
1. **Nome da ação**: deve existir literalmente no catálogo (`list_actions`).
2. **Params**: cada param usado deve constar no `describe_action` da ação
   (nomes exatos; tipos compatíveis; obrigatórios presentes).
3. Classificação por ação:
   - `OK` — nome e params batem.
   - `REVER` — nome existe, param(s) divergem → ajustar o código (ou a
     spec), nunca assumir.
   - `AUSENTE` — ação não existe mais → avaliar impacto no fluxo e
     substituir/remover com decisão do usuário se houver alternativa.
4. Resultado registrado em `docs/referencia/CONTRATOS_CONFIRMADOS.md`
   (tabela por ação com classificação, data e notas) — artefato permanente.

## Casos de Borda
- Ação existente mas com params opcionais que sobram (o código envia campos
  não listados no schema): `REVER` só se o param for desconhecido pelo
  catálogo; extras aceitos pela Tiops não quebram — registrar nota.
- `describe_action` impossível para ação legada (ex.: `list_items` do ML):
  validar por `list_actions` + contrato já confirmado em docs existentes.
- Erro de rede/timeout na verificação: re-tentar 1x; se persistir, marcar
  `REVER` com nota "indeterminado (timeout)" — não bloquear o resto.

## Critérios de Aceite (Given/When/Then)
- Given o catálogo real via `list_actions`, When verifico as ações usadas,
  Then todas estão classificadas (OK/REVER/AUSENTE) e a tabela está
  atualizada em `docs/referencia/CONTRATOS_CONFIRMADOS.md`.
- Given uma ação com param divergente, When detecto, Then o código é
  corrigido no mesmo fluxo (com releitura de confirmação) e a tabela
  registra a correção.
- Given o smoke test do projeto, When roda, Then continua passando (nada de
  ação Tiops foi criada/renomeada sem atualizar a spec do domínio).

## Fora de Escopo
- Testes de execução real de escrita (pausar/reativar anúncio real etc.) —
  isso é critério de aceite das fases de domínio, não deste endurecimento.
- Ações da Tiops não usadas pelo código (catálogo sem uso não é verificado).

## Dependências
- Services usados: nenhum (verificação externa via MCP/Echo).
- Repositories usados: nenhum.
- Ações Tiops usadas: as 30 da tabela acima (29 confirmadas + 1 removida) +
  `list_actions`/`describe_action`.

## Notas de Implementação
- Executar a verificação com as ferramentas MCP reais da Tiops (não com
  mock) para que o resultado seja fato, não suposição.
- A tabela final tem formato fixo: `ação | serviço(s) | classificação |
  params verificados | data | nota`.
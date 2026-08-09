# Spec: Shopee Ads — Gestão de Eficiência de Anúncios Pagos

## Status
Approved

## Objetivo
Página de gestão de eficiência de Shopee Ads para o vendedor controlar ROI de
campanhas pagas, monitorar métricas de impressão/clique/conversão, gerenciar
saldo de créditos e tomar ações (pausar/retomar/encerrar) diretamente no app.
Inclui toggle para métricas de visita/conversão por item.

## Contrato da API Interna

### `shopeeAds.getBalance`
- Descrição: Retorna saldo atual de créditos Shopee Ads.
- Params: nenhum
- Retorno: `{ saldo: number, moeda: string, atualizadoEm: string }`

### `shopeeAds.syncCampaigns`
- Descrição: Sincroniza lista de campanhas via Tiops, grava em SHOPEE_ADS e invalida cache.
- Params: `{ forceFresh: boolean }`
- Retorno: `{ success: boolean, synced: number, errors: array }`

### `shopeeAds.getCampaigns`
- Descrição: Lista campanhas (cache 5min ou lê do Sheets).
- Params: `{ fromCache: boolean, status: string }`
- Retorno: `{ campanhas: array, resumo: object, atualizadoEm: string }`

### `shopeeAds.getDailyPerformance`
- Descrição: Performance diária de uma campanha ou todas (período).
- Params: `{ campaignId: string, dateFrom: string, dateTo: string }`
- Retorno: `{ dados: array, resumo: object }`

### `shopeeAds.getHourlyPerformance`
- Descrição: Performance horária de uma campanha num dia específico.
- Params: `{ campaignId: string, date: string }`
- Retorno: `{ dados: array }`

### `shopeeAds.pauseCampaign`
- Descrição: Pausa uma campanha ativa.
- Params: `{ campaignId: string }`
- Retorno: `{ success: boolean, status: string }`

### `shopeeAds.resumeCampaign`
- Descrição: Retoma uma campanha pausada.
- Params: `{ campaignId: string }`
- Retorno: `{ success: boolean, status: string }`

### `shopeeAds.terminateCampaign`
- Descrição: Encerra uma campanha permanentemente.
- Params: `{ campaignId: string }`
- Retorno: `{ success: boolean }`

### `shopeeAds.getKeywords`
- Descrição: Keywords recomendadas para uma campanha.
- Params: `{ campaignId: string }`
- Retorno: `{ keywords: array }`

### `shopeeAds.updateKeywords`
- Descrição: Edita keywords de uma campanha.
- Params: `{ campaignId: string, keywords: array }`
- Retorno: `{ success: boolean, updated: number }`

### `shopeeAds.deleteKeywords`
- Descrição: Remove keywords de uma campanha.
- Params: `{ campaignId: string, keywords: array }`
- Retorno: `{ success: boolean, removed: number }`

### `shopeeAds.getItems`
- Descrição: Itens anunciados numa campanha (GMS items).
- Params: `{ campaignId: string }`
- Retorno: `{ itens: array }`

### `shopeeAds.getRecommendedItems`
- Descrição: Itens sugeridos para anunciar.
- Params: nenhum
- Retorno: `{ itens: array }`

### `shopeeAds.setRoiTarget`
- Descrição: Define meta de ROAS para campanha automatizada.
- Params: `{ campaignId: string, roasTarget: number }`
- Retorno: `{ success: boolean }`

### `shopeeAds.getVisitMetrics`
- Descrição: Métricas de visita/conversão por item (via Shopee Ads ou ML visits).
- Params: `{ itemId: string, days: number }`
- Retorno: `{ visitas: number, conversao: number, dados: array }`

## Regras de Negócio
- Saldo de créditos: exibe alerta visual quando < R$ 50
- ROAS < 1.0: campanha está perdendo dinheiro (destaque vermelho)
- ROAS 1.0-2.0: alerta amarelo
- ROAS > 2.0: verde
- Pausar/ativar: confirmação obrigatória antes da ação
- Cache TTL: 5 min para campanhas, 15 min para performance
- Datas Shopee Ads: formato DD-MM-YYYY
- Deduplicação por campaign_id

## Casos de Borda
- Loja sem campanhas: exibe state vazio com CTA para criar
- Saldo zero: bloqueia ações de criação, exibe aviso
- Tiops indisponível: mostra erro com timestamp da última sync
- Campanha encerrada: não permite pausar/retomar

## Critérios de Aceite
- Given loja com campanhas, When abre a página, Then lista campanhas com métricas
- Given campanha ativa, When pausa, Then status muda para PAUSED na Shopee
- Given saldo insuficiente, When tenta criar campanha, Then exibe aviso
- Given período selecionado, When filtra, Then métricas refletem o período
- Given toggle métricas, When ativa, Then exibe visitas/conversão por item

## Fora de Escopo
- Criação de campanhas (complexidade alta, futura v2)
- Gestão de keywords avançada (bidding automático)
- Integração com Shopee Ads API diretamente (usa Tiops)
- Multi-loja (hardcoded shop_id atual)

## Dependências
- Services: TiopsClient, CacheRepository, SheetsRepository, LoggingService
- Ações Tiops: shopee_ads_balance, shopee_ads_campaigns, shopee_ads_pause_campaign,
  shopee_ads_resume_campaign, shopee_ads_terminate_campaign, shopee_ads_daily_performance,
  shopee_ads_hourly_performance, shopee_ads_campaign_daily, shopee_ads_recommended_keywords,
  shopee_ads_edit_keywords, shopee_ads_delete_keywords, shopee_ads_recommended_items,
  shopee_ads_gms_items, shopee_ads_roi_target, shopee_ads_budget_suggestion,
  shopee_get_visits (item visits), shopee_ads_create_auto, shopee_ads_edit_auto

## Aba Google Sheets
- `SHOPEE_ADS` — já criada pelo usuário

/**
 * PushNotificationService — recebe pushes de status de pedido da Shopee
 * (webhook/push mechanism) e sincroniza a aba PEDIDOS em tempo real.
 *
 * Formato do push: POST com corpo JSON contendo order_sn + status (a Shopee
 * manda no topo ou aninhado em `data`). O push NÃO traz dados completos —
 * o serviço busca detail + escrow via OrdersImportService.syncOrderBySn.
 *
 * Segurança: GAS doPost(e) não expõe headers de requisição, então a
 * assinatura Authorization da Shopee não pode ser verificada aqui. A
 * mitigação é um secret em query param da callback URL (?secret=...),
 * comparado com SHOPEE_WEBHOOK_SECRET em Script Properties. Ver
 * specs/push-notification.md.
 */
var PushNotificationService = (function () {
  var SECRET_KEY = 'SHOPEE_WEBHOOK_SECRET';

  function describe() {
    return {
      name: 'pushNotification',
      actions: {
        handlePush: {
          description: 'Processa push de status de pedido da Shopee (validado por secret) e sincroniza a planilha.',
          params: {
            body: { type: 'object', required: true, description: 'Corpo do push (JSON parseado)' },
            secret: { type: 'string', required: false, default: '', description: 'Secret da callback URL (?secret=)' }
          },
          returns: {
            success: 'boolean', orderSn: 'string', pushStatus: 'string',
            syncStatus: 'string', inserted: 'number', updated: 'number'
          }
        },
        setWebhookSecret: {
          description: 'Define o secret do webhook (SHOPEE_WEBHOOK_SECRET em Script Properties). Use o mesmo valor em ?secret= na callback URL.',
          params: {
            secret: { type: 'string', required: true, description: 'Mínimo 8 caracteres' }
          },
          returns: { success: 'boolean' }
        },
        getWebhookConfig: {
          description: 'Informa se o webhook está configurado e a callback URL a usar (não expõe o secret).',
          params: {},
          returns: { configured: 'boolean', callbackUrl: 'string' }
        }
      }
    };
  }

  function getWebhookSecret_() {
    return PropertiesRepository.getScriptProperty(SECRET_KEY) || '';
  }

  function extractPushFields_(body) {
    if (!body || typeof body !== 'object') return null;
    var data = (typeof body.data === 'object' && body.data !== null) ? body.data : {};
    var orderSn = body.order_sn || data.order_sn || '';
    var status = body.status || data.status || body.order_status || data.order_status || '';
    if (!orderSn) return null;
    return { orderSn: String(orderSn), status: String(status) };
  }

  function handlePush(params) {
    params = params || {};
    var body = params.body || {};
    var secret = params.secret || '';

    var expected = getWebhookSecret_();
    if (!expected) {
      throw new Error('WEBHOOK_SECRET_NOT_CONFIGURED');
    }
    if (secret !== expected) {
      LoggingService.log({
        service: 'Push', action: 'handlePush', status: 'WARN',
        caller: 'Shopee',
        summary: 'Push rejeitado: secret inválido (sem alteração na planilha)',
        durationMs: 0,
        context: { body: body, secretReceived: secret ? '***' : '(vazio)' }
      });
      throw new Error('INVALID_WEBHOOK_SECRET');
    }

    var push = extractPushFields_(body);
    if (!push) {
      throw new Error('PUSH_WITHOUT_ORDER_SN');
    }

    LoggingService.log({
      service: 'Push', action: 'handlePush', status: 'OK',
      caller: 'Shopee',
      summary: 'Push recebido: ' + push.orderSn + ' -> ' + (push.status || '(sem status)'),
      durationMs: 0,
      context: { orderSn: push.orderSn, pushStatus: push.status }
    });

    var sync = OrdersImportService.syncOrderBySn(push.orderSn);

    return {
      success: !!sync.success,
      orderSn: push.orderSn,
      pushStatus: push.status,
      syncStatus: sync.status || '',
      inserted: sync.inserted || 0,
      updated: sync.updated || 0,
      error: sync.error || undefined
    };
  }

  function setWebhookSecret(params) {
    var secret = params && params.secret ? String(params.secret).trim() : '';
    if (secret.length < 8) {
      return { error: 'Secret deve ter pelo menos 8 caracteres.' };
    }
    PropertiesRepository.setScriptProperty(SECRET_KEY, secret);
    LoggingService.log({
      service: 'Push', action: 'setWebhookSecret', status: 'OK',
      caller: 'Config', summary: 'Webhook secret atualizado (não loga o valor)',
      durationMs: 0, context: { length: secret.length }
    });
    return { success: true };
  }

  function getWebhookConfig() {
    var hasSecret = !!getWebhookSecret_();
    return {
      configured: hasSecret,
      callbackUrl:
        'https://script.google.com/macros/s/<DEPLOY_ID>/exec' +
        (hasSecret ? '?secret=<SEU_SECRET>' : '')
    };
  }

  return {
    describe: describe,
    handlePush: handlePush,
    setWebhookSecret: setWebhookSecret,
    getWebhookConfig: getWebhookConfig,
    extractPushFields: extractPushFields_
  };
})();

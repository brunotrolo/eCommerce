# Spec: Debug Console (Instrumentação do Web App)

## Status
Approved

## Objetivo
Dar visibilidade, em tempo real, de tudo o que acontece no front-end e no
back-end do Web App, para que bugs sejam diagnosticados sem depender de
screenshot. O componente é um painel deslizante (drawer) aberto com
Ctrl+Shift+D ou botão fixo, que mostra:

- **Front-end:** erros capturados do browser (`window.onerror`,
  `unhandledrejection`) e chamadas `google.script.run` observáveis.
- **Back-end:** logs persistidos na aba `LOGS` (via `logging.getLogs`),
  incluindo action, params, duração e erro — gravados automaticamente por
  `ServiceRegistry.dispatch`.

## Posição na arquitetura
- Arquivo único em `ui/shared/DebugConsole.html`, Web Component
  `debug-console-widget`, com Shadow DOM próprio
  (`shadow.adoptedStyleSheets = [window.__DESIGN_SHEET__]`).
- Não interfere com o runtime do Apps Script: **não** wrapeia/substitui
  `google.script.run` globalmente (o Proxy de interceptação quebrou a
  serialização das chamadas e foi descartado). A leitura de backend usa a
  API oficial `apiDispatch('logging.getLogs', ...)`.
- Registrado em `ui/shell/Shell.html`.

## Contrato da API Interna
### `logging.getLogs` (reutilizado)
- Descrição: retorna os logs persistidos na aba LOGS.
- Params: `{ service?, status?, limit? }`
- Retorno: `{ logs: [{ UPDATED_AT, SERVICE, ACTION, STATUS, SUMMARY, DURATION_MS, ERROR_MESSAGE, CONTEXT, ENVIRONMENT }] }`

## Regras de Negócio
1. O Debug Console é **append-only** na sessão: captura erros do window;
   nada é enviado automaticamente ao backend sem ação do usuário.
2. O dump JSON exportado DEVE mascarar segredos (`apiKey`, `secret`,
   `password`, `token`, `key`, `accessToken`) antes de qualquer saída.
3. Rótulos e cores usam apenas tokens de `Styles.html`. Nada hard-coded.
4. Nenhuma credencial de configuração é exposta no painel.

## Casos de Borda
- `google.script.run` não serializa Date: corrigido na origem em
  `ServiceRegistry.sanitizeForClient_` (Date → ISO, undefined → '').
- Erro de script na página: `window.onerror` + `unhandledrejection`
  capturam e exibem no painel.
- Drawer aberto em rota diferente: permanece fixo, overlay permite fechar.
- Logs ausentes (aba vazia): painel mostra mensagem "sem logs", sem quebra.

## Critérios de Aceite
- Dado o app aberto, quando Clico no botão "Debug" (ou Ctrl+Shift+D),
  Então um drawer abre com os logs de backend recentes e sessão do erro.
- Quando o widget `nfeEntrada.getRecent` falha, Então a página mostra
  mensagem visível de erro (não fica em branco) e o drawer exibe o log.
- Quando um Date sai do Sheets, Então o cliente recebe string ISO (nunca null).

## Fora de Escopo
- Interceptação de rede por Proxy (redigida neste projeto por quebrar a
  chamada).
- Envio automático de logs para servidor.

## Dependências
- `logging.getLogs` (LoggingService)
- `ServiceRegistry.sanitizeForClient_` (serialização segura)
- Tokens: `ui/shared/Styles.html` via `__DESIGN_SHEET__`
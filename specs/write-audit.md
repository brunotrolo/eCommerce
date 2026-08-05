# Spec: Audit de Operações de Escrita (Write Audit)

## Status
Draft

## Objetivo
Criar trilha de auditoria de **todas as operações de escrita** nas planilhas
dos repositórios de domínio (abas ESTOQUE, ANUNCIOS_SHOPEE, NFE_ENTRADA, etc.).
Hoje cada repository decidirá isoladamente se registra o que mudou, quando e com
que resultado — o comportamento é inconsistente e sem rastreio histórico de
gravações. O Write Audit grava em uma aba dedicada `AUDIT_LOG` o que foi
alterado, quando (formato BR), as contagens de linhas, o resultado e o tempo de
execução — independe de serviço. Serve para debug, recuperação e como evidência
de que uma gravação ocorreu e terminou.

## Contrato da API Interna

### `SheetsRepository.logWrite(params)`
- **Descrição:** faz append de uma entrada de auditoria na aba `AUDIT_LOG`
  para uma operação de escrita já concluída. Não lança exceção — em caso de
  falha, apenas `console.warn`.
- **Params:**
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |------|------|-------------|---------|-----------|
  | sheet | string | sim | — | Aba onde a escrita ocorreu (ex.: 'ESTOQUE', 'ANUNCIOS_SHOPEE') |
  | operation | string | sim | — | 'APPEND' \| 'UPDATE' \| 'UPSERT' \| 'DELETE' \| 'TRUNCATE' \| 'CREATE_SHEET' |
  | stats | object | não | {} | `{ rows, inserted, updated, deleted }` |
  | detail | string | não | '' | Texto resumido para a coluna DETAIL (ex.: 'importação de NFe' ou erro), máx 5000 chars |
  | caller | string | não | 'system' | Quem disparou (ex.: 'service', 'trigger', 'manual') |
  | rowId | string | não | '' | Identificador da linha/fonte (ex.: order_sn, código do produto, REFERENCIA) |
  | status | string | não | 'OK' | 'OK' \| 'ERROR' |
- **Retorno:** `{ success: true, auditId: string }` ou `{ success: false, error: string }`

### Colunas da aba `AUDIT_LOG`
```
AUDIT_ID | SHEET | OPERATION | STATUS | ROWS | INSERTED | UPDATED | DELETED | CALLER | ROW_ID | DETAIL | CREATED_AT
```

- **AUDIT_ID:** `YYYYMMDDHHMMSS-<nonce8>` (mesma regra do LOG_ID em LoggingService).
- **CREATED_AT:** data BR `dd/MM/yyyy HH:mm:ss`.
- **DETAIL:** texto truncado a 5000 chars quando aplicável.

## Regras de Negócio
1. **Chamado pelo repositório de dados**, nunca pelo serviço — o repositório é
   quem conhece a aba, as counts reais e o momento exato da escrita.
2. **Disparado após a operação principal**, nunca antes. Se a operação
   principal falhar, registra `status: 'ERROR'` com a mensagem em `detail`.
3. **Nunca bloqueia:** falha da própria auditoria vira `console.warn`, não cai
   o processo usado pelo serviço.
4. **Formato BR** em `CREATED_AT` (`dd/MM/yyyy HH:mm:ss`) — regra geral do
   projeto (sem ISO).
5. **Sem granularidade por linha:** chamar uma vez por operação batch (ex.:
   um `syncMain` que grava 50 linhas = 1 linha de audit com `inserted: 50`),
   nunca em loop dentro da gravação.

## Casos de Borda
- `AUDIT_LOG` não existe → `getOrCreateSheet` cria com cabeçalho na primeira chamada.
- Operação com 0 linhas alteradas → ainda grava com `ROWS=0` e `STATUS='OK'` (ou seja: executada, nada a mudar).
- Falha na planilha principal → registra `status: 'ERROR'` e o erro no `detail`; não grava como sucesso.
- Volume grande (ex.: grid NFe) → uma auditoria por operação/REFERENCIA, nunca por linha.

## Critérios de Aceite (Given/When/Then)
1. **Importação grande:** Dado `EstoqueRepository.syncFromNFe` importando 50 unidades, Quando executa, Então `AUDIT_LOG` recebe 1 linha com `SHEET='ESTOQUE'`, `INSERTED=50`, `CREATED_AT` em `dd/MM/yyyy HH:mm:ss`.
2. **Sem repetição:** Dado um sync que já gravou, Quando roda de novo com 0 mudanças, Então grava 1 linha extra com `ROWS=0` (nunca o mesmo AUDIT_ID).
3. **Falha da escrita de dados:** Quando a gravação principal lança erro, Então a auditoria registra `STATUS='ERROR'` e o erro no `detail`, sem que a auditoria lance exceção.
4. **Criação de aba:** Dado `AUDIT_LOG` inexistente, Quando `logWriteAudit` é chamado, Então cria a aba com cabeçalho antes do append.

## Fora de Escopo
- Tela de auditoria (apenas a aba — leitura direta no Sheets).
- Auditoria fiscal — é trilha operacional, não nota fiscal (não substitui NFe).
- Cleanup/rotação automática de `AUDIT_LOG` nesta spec (fica para spec própria se necessário).
- Audit de leituras (`getRows`, `getItem`, etc.).

## Dependências
- **Services/Adapters:**
  - `ConfigService.getSheetId()` — planilha âncora
- **Google Apps Script:**
  - `SpreadsheetApp` — acesso às abas
  - `Utilities` (formatDate) e `Session.getScriptTimeZone()` — data BR

## Notas de Implementação
1. Extensão de `SheetsRepository` com método `logWriteAudit(...)` — repositório
   base reaproveitado pelos repos de domínio sem criar serviço novo.
2. Repos de domínio passam a chamar `SheetsRepository.logWriteAudit` após suas
   escritas principais (ESTOQUE, NFE, ANUNCIOS_SHOPEE, MANUAL_*).
3. Nenhum arquivo novo no projeto → `filePushOrder` não muda.
4. Reaproveita helpers de `LoggingService.generateLogId_` apenas se já estiver
   exposto; caso contrário, helper local no SheetsRepository.
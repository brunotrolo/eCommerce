# Spec: Status Online + Speed Meter (Carregamento)

## Status
Draft

## Objetivo

Indicador visual global que mostra:
1. **Status Online**: quando o GAS terminou de ler o Google Sheet e está pronto (online)
2. **Speed Meter**: tempo total de carregamento da página (GAS + CPU), atualizado com data/hora

Sempre visível no topo/canto da aplicação. Exemplo:
```
🟢 Online | Atualizado: 03/08/2026, 01:09:11
        4.63s (GAS: 4.61s | CPU: 0.03s)
```

---

## Contrato da API Interna

### `system.getStatus`
- Descrição: Retorna status de carregamento e timing
- Params: nenhum
- Retorno:

```javascript
{
  success: true,
  data: {
    isOnline: boolean,              // true quando GAS finalizou init
    timestamp: string,              // ISO 8601, ex. "2026-08-03T01:09:11Z"
    timing: {
      gasTimeMs: number,            // tempo GAS (UrlFetchApp, Sheets, etc)
      cpuTimeMs: number,            // tempo CPU (cálculos locais)
      totalTimeMs: number           // total = gasTimeMs + cpuTimeMs
    },
    lastUpdate: string              // data formatada: "03/08/2026, 01:09:11"
  }
}
```

---

## Regras de Negócio

### Rastreamento de Timing

- **Start**: quando Router.js / doGet() é chamado (`performance.now()` no browser OU `Date.now()` no GAS)
- **GAS Time**: tempo até terminar leitura de Sheets e cálculos de serviços (medir desde início até `ServiceRegistry.dispatch()` retornar)
- **CPU Time**: tempo de renderização HTML no browser (desde `DOMContentLoaded` até componentes renderizarem)
- **Total**: gasTimeMs + cpuTimeMs

### Status Online

- `isOnline: true` quando:
  - Todos os dados críticos foram carregados do Sheets
  - Shell renderizou completamente
  - Primeiras ações (ping, listActions) responderam
- Mostrar indicador 🟢 (verde) quando true, 🔴 (vermelho) quando false
- Não bloquear a UI por dados (lazy load de dados depois)

### Atualização de Timestamp

- Capturar data/hora local do browser quando carregamento terminar
- Formatar: "DD/MM/YYYY, HH:MM:SS" (local do usuário)
- Atualizar a cada novo carregamento de página ou refresh de dados

### Precisão de Timing

- GAS Time: medir em milissegundos
- CPU Time: medir em milissegundos
- Exibir com 2 casas decimais (ex. 4.63s, 0.03s)
- Se < 100ms, arredondar para 0.0s

---

## Casos de Borda

- **Carregamento muito rápido (<100ms)**: exibir como "0.1s"
- **Carregamento muito lento (>30s)**: avisar em vermelho, pode indicar falha de conexão
- **Offline**: se UrlFetchApp falhar, isOnline = false
- **Cache ativo**: se dados vêm do CacheService, isOnline = true mesmo assim (dados já prontos)
- **Timezone local**: respeitar timezone do browser, não UTC

---

## Critérios de Aceite

**Cenário 1: Carregamento normal**
- Given: Shell carrega com dados do Sheets
- When: página renderiza
- Then: 
  - isOnline = true
  - timing mostra GAS ~3–5s, CPU ~0.5–1s
  - timestamp atualizado com hora local

**Cenário 2: Carregamento com cache**
- Given: segunda visita (dados em CacheService)
- When: página renderiza
- Then:
  - isOnline = true
  - timing mostra GAS ~0.2s, CPU ~0.5s (muito mais rápido)
  - timestamp atualizado

**Cenário 3: Offline / falha de conexão**
- Given: UrlFetchApp falha (sem internet)
- When: página tenta carregar
- Then:
  - isOnline = false
  - indicador vermelho 🔴
  - mensagem "Offline" exibida

**Cenário 4: Refresh de dados**
- Given: usuário clica botão "Atualizar" em Dashboard
- When: API é chamada novamente
- Then:
  - Timing é recalculado
  - Timestamp atualizado
  - isOnline reflete novo estado

---

## Fora de Escopo (v1)

- Histórico de timing (gráfico de performance ao longo do tempo)
- Alertas automáticos se performance degrada
- Medição por serviço individual (ex. quanto Dashboard levou)
- Profiling detalhado com flame graph
- Sincronização com Google Analytics

---

## Implementação

### StatusService.js

```javascript
var StatusService = (function () {
  var pageStartTime = Date.now();           // início da página
  var gasStartTime = Date.now();            // início do dispatch
  var gasEndTime = null;                    // fim do dispatch
  var cpuStartTime = null;                  // início de renderização browser
  var cpuEndTime = null;                    // fim de renderização

  function startGasTimer() {
    gasStartTime = Date.now();
  }

  function endGasTimer() {
    gasEndTime = Date.now();
    cpuStartTime = Date.now();             // CPU começa logo após GAS
  }

  function endCpuTimer() {
    cpuEndTime = Date.now();
  }

  function getStatus() {
    var gasTimeMs = (gasEndTime - gasStartTime) || 0;
    var cpuTimeMs = (cpuEndTime - cpuStartTime) || 0;
    var totalTimeMs = gasTimeMs + cpuTimeMs;

    return {
      isOnline: true,                       // set by browser quando tudo carregar
      timestamp: new Date().toISOString(),
      timing: {
        gasTimeMs: gasTimeMs,
        cpuTimeMs: cpuTimeMs,
        totalTimeMs: totalTimeMs
      },
      lastUpdate: formatarDataHora(new Date())
    };
  }

  function formatarDataHora(date) {
    var d = String(date.getDate()).padStart(2, '0');
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var y = date.getFullYear();
    var h = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    var s = String(date.getSeconds()).padStart(2, '0');
    return d + '/' + m + '/' + y + ', ' + h + ':' + min + ':' + s;
  }

  function describe() {
    return {
      name: 'system',
      actions: {
        getStatus: {
          params: {},
          returns: { isOnline: 'boolean', timing: {gasTimeMs: 'number', cpuTimeMs: 'number'}, lastUpdate: 'string' }
        }
      }
    };
  }

  return {
    describe: describe,
    getStatus: getStatus,
    startGasTimer: startGasTimer,
    endGasTimer: endGasTimer,
    endCpuTimer: endCpuTimer
  };
})();
```

### StatusView.html

Web Component que exibe:
```
🟢 Online | Atualizado: 03/08/2026, 01:09:11
        4.63s (GAS: 4.61s | CPU: 0.03s)
```

- Posição: topo direito ou rodapé (sticky)
- Chamar `google.script.run.apiDispatch('system.getStatus', {})` a cada refresh
- Indicador de cor: 🟢 online, 🔴 offline, 🟡 loading
- Atualizar a cada 5-10 segundos ou ao mudar de tela

---

## Integração

1. **Router.js**: chamar `StatusService.startGasTimer()` no início, `endGasTimer()` ao terminar
2. **Shell.html**: incluir `<status-view></status-view>` no topo
3. **ServiceRegistry.js**: registrar StatusService com padrão defensivo

---

## Teste de Aceitação

No browser:
- Status indicador aparece (verde para online) ✅
- Timing mostra "X.XXs (GAS: X.XXs | CPU: X.XXs)" ✅
- Data/hora formatada correta (DD/MM/YYYY, HH:MM:SS) ✅
- Refresh → timing recalculado ✅
- Offline → indicador vermelho ✅

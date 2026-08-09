# Arquitetura de Carregamento — Ordem de Arquivos GAS

## Problema

Google Apps Script (GAS/V8) não tem ES modules. Todo arquivo `.js`/`.gs` cai no mesmo
escopo global. Sem uma ordem de carregamento definida, GAS carrega **alfabeticamente**,
o que quebra dependências entre namespaces.

**Exemplo do erro:** Se `CatalogService.js` tenta chamar `NFeEntradaProdutosRepository`
mas o arquivo é carregado ANTES, dá erro `ReferenceError: NFeEntradaProdutosRepository is not defined`.

## Solução

`appsscript.json` define `filePushOrder` — ordem exata em que os arquivos são
carregados via `clasp push`. Essa ordem está em **dependência topológica**: A
depende de B? B carrega antes de A.

## Ordem de Carregamento Definida

```
┌─ Camada 0: Config (global, sem dependências)
│  └─ ConfigService.js
│
├─ Camada 1: Adapters (só ConfigService)
│  ├─ DriveAdapter.js
│  └─ TiopsClient.js
│
├─ Camada 2: Repositories (ConfigService + Adapters)
│  ├─ PropertiesRepository.js
│  ├─ CacheRepository.js
│  └─ SheetsRepository.js
│
├─ Camada 3: Services (Repositories + Adapters + Config)
│  │ Logging primeiro (usado por todos)
│  ├─ LoggingRepository.js
│  ├─ LoggingService.js
│  │
│  │ Entrada de NFe (independente)
│  ├─ NFeEntradaRepository.js
│  ├─ NFeEntradaService.js
│  ├─ NFeEntradaProdutosRepository.js
│  ├─ NFeEntradaProdutosService.js
│  │
│  │ Negócio (dependem de entrada, pricing)
│  ├─ PricingService.js
│  ├─ OrdersService.js
│  ├─ DashboardService.js
│  ├─ CatalogService.js
│  └─ ... (Estoque, ManualEntrada/Saída, CarteiraShopee, AnunciosShopee,
│      ShopeeAds e demais — mesma regra, ver ordem real completa em
│      .clasp.json → filePushOrder)
│
├─ Camada 4: Gateway (todos os serviços)
│  ├─ ServiceRegistry.js (valida + dispatcha)
│  └─ Router.js (doGet/doPost)
│
└─ Camada 5: Entrypoint
   └─ Main.js (init + testes)
```

## Regras de Dependência

### Por Camada

| Camada | Pode depender de | NÃO pode depender de |
|--------|------------------|---------------------|
| 0: Config | nada | tudo |
| 1: Adapters | Config | Repositories, Services, Gateway |
| 2: Repositories | Config, Adapters | Services, Gateway |
| 3a: Logging | Config, Adapters, Repositories | Outros serviços |
| 3b: Services (negócio) | Config, Adapters, Repositories, Logging | Gateway, Main |
| 4: Gateway | tudo (menos Main) | Main |
| 5: Main | tudo | nada |

### Quando Adicionar um Novo Serviço

Se você criar `NovoDominio/NovoService.js`:

1. Identifique suas dependências (quais arquivos ele `//chamaService.method()`?)
2. Insira em `filePushOrder` **após** todas as dependências
3. Atualize esta documentação
4. Commit + push

**Exemplo:** Se `NovoService` usa `PricingService` e `NFeEntradaProdutosRepository`:
- Coloque APÓS `NFeEntradaProdutosRepository.js`
- Coloque APÓS `PricingService.js`
- Ordem correta:
  ```
  src/03_services/nfeEntradaProdutos/NFeEntradaProdutosRepository.js
  src/03_services/nfeEntradaProdutos/NFeEntradaProdutosService.js
  src/03_services/pricing/PricingService.js
  src/03_services/novo/NovoService.js  ← aqui (depois de tudo)
  ```

## Validação

A skill `gas-ops` verifica automaticamente que `filePushOrder` existe no `appsscript.json`
e contém todos os arquivos `.js` no projeto **antes de cada `clasp push`**.

Se um arquivo novo é criado mas não adicionado a `filePushOrder`, o push é bloqueado.

## Histórico de Quebras

| Data | Serviço | Causa | Solução |
|------|---------|-------|----------|
| 2025-08-03 | NFeEntrada, NFeEntradaProdutos | Falta filePushOrder, CatalogService adicionado sem ordem | Adicionado filePushOrder completo |

---

## Para Desenvolvedores

Ao abrir uma PR ou criar um novo arquivo:

```bash
# Antes de fazer commit
clasp push  # Verifica filePushOrder via gas-ops

# Se falhar com erro de namespace
# 1. Confirme a dependência (qual serviço é chamado?)
# 2. Coloque seu arquivo APÓS o arquivo que depende
# 3. Teste localmente: clasp push
```

Consulte `AGENTS.md` seção "Convenção de namespace (importante em GAS)" para
detalhes adicionais.

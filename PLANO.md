# PLANO.md — plano vivo do projeto

> Documento **vivo**: é a única fonte de verdade sobre escopo, fases e status.
> Substitui o roadmap antigo (arquivado em `docs/historico/`).
> Regras de código e convenções ficam em [AGENTS.md](./AGENTS.md).
> Prompts prontos para executar cada fase ficam em
> [docs/HANDOFF_OPENCODE.md](./docs/HANDOFF_OPENCODE.md).

---

## 1. Objetivo do produto

Um Web App em Google Apps Script, de uso pessoal, que centraliza a operação da
loja na **Shopee** e no **Mercado Livre** — substituindo a rotina hoje feita
manualmente nos apps oficiais + planilha. Toda integração com marketplace
passa pela API Tiops (`POST https://mcp.tiops.com.br`).

**Não-objetivos (v1):** multiusuário, multi-loja, Amazon/Shein/Bling,
automação por trigger sem supervisão, app mobile nativo.

---

## 2. Modelo de trabalho: dois agentes, papéis distintos

| | Claude Code (aqui) | OpenCode |
|---|---|---|
| Papel | **Guia / arquiteto** | **Executor** |
| Faz | revisa plano e specs, decide arquitetura, escreve os prompts de execução, revisa o diff pronto | cria e edita arquivos em `src/`, `ui/`, roda `clasp`, commita |
| Não faz | escrever código de implementação em massa | decidir arquitetura ou mudar spec por conta própria |

O motivo é econômico: o raciocínio de arquitetura é caro em tokens e acontece
uma vez; a digitação de código é barata e repetitiva. Claude Code produz o
**pacote de execução** (prompt + skill + critério de aceite), OpenCode executa.

Ciclo padrão de uma fase:

```
1. Claude Code  → confere/ajusta specs/<dominio>.md   (Status: Approved)
2. Claude Code  → gera o prompt da fase                (skill handoff-prompt)
3. Você         → cola o prompt no OpenCode
4. OpenCode     → implementa, roda skills, commita
5. Você         → valida pelos critérios de aceite da fase (seção 4)
6. Claude Code  → revisa o diff, marca a fase como Validada aqui
```

---

## 3. Escopo funcional v1 — 6 domínios

| # | Domínio | Spec | O que entrega |
|---|---|---|---|
| 1 | **Precificação** | `specs/pricing.md` | Preço sugerido por canal a partir de custo + margem, descontando taxa. Comparativo Shopee × ML lado a lado. |
| 2 | **Dashboard** | `specs/dashboard.md` | Visão única: pedidos recentes, receita, estoque baixo. Cache de 5 min. |
| 3 | **Pedidos** | `specs/orders.md` | Lista unificada dos dois canais em shape normalizado + detalhe do pedido. |
| 4 | **Catálogo** | `specs/catalog.md` | Produtos recebidos (NFe) agrupados por código, com custo mais recente e preços sugeridos para ambos canais. Consultável antes de criar/editar anúncios. |
| 5 | **Anúncios** | `specs/listings.md` | Listar, ver detalhe, pausar e reativar anúncios, com releitura obrigatória de confirmação. |
| 6 | **Preço & Estoque** | `specs/inventory-pricing.md` | Liga Precificação + Anúncios: calcula, aplica no canal, confirma relendo. |
| 8 | **Calculadora PrecificaPro** | `specs/calculator.md` | Calculadora interativa de precificação Mercado Livre com widget flutuante (modal). Simula custos, taxas, imposto, margem em tempo real. |

---

## 4. Fases e status

Duas colunas de status, porque **código escrito ≠ funcionando**:

- **Código** — os arquivos existem no repositório e passam na revisão.
- **Validado** — rodou no Apps Script real, com dado real, e bateu com o
  critério de aceite abaixo.

| Fase | Escopo | Código | Validado |
|---|---|:---:|:---:|
| 0 | Fundação + pipeline de deploy | ✅ | ⬜ |
| 1 | Precificação | ✅ | ⬜ |
| 2 | Dashboard | ✅ | ⬜ |
| 3 | Pedidos | ✅ | ⬜ |
| 4 | Catálogo | ✅ | ⬜ |
| 5 | Anúncios | ✅ | ⬜ |
| 6 | Preço & Estoque | ✅ | ⬜ |
| 7 | Endurecimento | ⬜ | ⬜ |
| 8 | Calculadora PrecificaPro | ✅ | ⬜ |
| — | Status Online + Speed Meter | ✅ | ⬜ |
| — | DataStore (cache client-side) | ✅ | ⬜ |

> **Estado real de hoje:** todo o código das fases 0–6 e 8 está escrito e no
> repositório. Extras implementados: Status Online + Speed Meter
> (`specs/system-status.md`), DataStore client-side para navegação instantânea.
> Nada foi executado no Apps Script ainda — falta rodar o primeiro deploy
> (Fase 0).

### Fase 0 — Fundação + pipeline de sincronização (/dev)

Entregue no código: `.clasp.json`, `appsscript.json`, `ConfigService`,
repositórios, `ServiceRegistry`, `Router`, Shell + design tokens, `AGENTS.md`,
workflow do GitHub Actions (apenas push automático, deploy manual).

**Critério de aceite:**
- [ ] Push na `main` dispara o workflow e ele termina verde.
- [ ] Você roda `clasp deploy --description "v0 — fundacao"` manualmente.
- [ ] A URL do Web App abre e o Shell renderiza com os tokens aplicados.
- [ ] `curl "<url>?action=ping"` devolve `{"pong":true,...}`.
- [ ] `apiDispatch('ping', {})` funciona pelo console do navegador.

### Fase 1 — Precificação

**Critério de aceite:**
- [ ] `runSmokeTests_()` roda no editor sem lançar erro.
- [ ] Shopee, custo 50, margem 25% → R$ 90,91.
- [ ] Mercado Livre, custo 50, margem 25% → R$ 91,80.
- [ ] Margem de 85% na Shopee devolve erro de negócio, não preço absurdo.
- [ ] Os mesmos números batem com a sua planilha manual original.

### Fase 2 — Dashboard

**Critério de aceite:**
- [ ] Os números conferem com os apps oficiais no mesmo dia.
- [ ] Segunda carga em menos de 5 min vem do cache (confirmar por log/tempo).
- [ ] Falha da Tiops mostra mensagem de erro na tela, não tela em branco.

### Fase 3 — Pedidos

**Critério de aceite:**
- [ ] Um pedido real de cada canal confere com o app oficial (ID, data, valor, status).
- [ ] O Dashboard continua correto depois de passar a consumir `OrdersService`.
- [ ] Canal sem pedido no período devolve lista vazia, não erro.

| Fase 4 — Catálogo

**Critério de aceite:**
- [x] `catalog.getProducts()` retorna produtos únicos de NFE_ENTRADA_PRODUTOS com status='Recebido', agrupados por código.
- [x] Produto que aparece em 3 NFes mostra 1 linha com custo mais recente (maior DATA_EMISSAO).
- [x] `catalog.getProductByCode()` retorna histórico completo (todas as 3 entradas).
- [x] Preço sugerido para cada marketplace bate com PricingService.calculateSuggestedPrice() (mesma margem).
- [x] Clique no preço sugerido abre sidebar com memória de cálculo passo-a-passo.
- [x] Ordenação por código, descrição, custo e preço sugerido funciona crescente e decrescente.
- [x] Margem exibida reflete a retenção real após taxa do marketplace (ex.: 20% Shopee → margem líquida < margem alvo).
- [x] Aba NFE_ENTRADA_PRODUTOS vazia retorna lista vazia, não erro.

### Fase 5 — Anúncios

**Critério de aceite:**
- [ ] Pausar e reativar um anúncio de teste real funciona nos dois canais.
- [ ] O estado é confirmado por releitura (`get_item` / `shopee_get_item`),
      nunca só pela resposta do update.
- [ ] Anúncio inexistente devolve erro tratado na UI.

### Fase 6 — Preço & Estoque

**Critério de aceite:**
- [ ] Fluxo completo calcular → aplicar → reler → confirmar, num item de teste.
- [ ] O preço novo aparece no app oficial do canal.
- [ ] Caminho de erro (item inexistente, preço inválido) tratado na UI.

### Fase 7 — Endurecimento (a fazer)

Só entra depois que 0–6 estiverem **validadas**. Escopo:

- Log de operações de escrita em `SheetsRepository` (o que mudou, quando, resultado).
- Padronização do tratamento de erro em todos os widgets (hoje cada view trata do seu jeito).
- Teste de contrato contra a Tiops: para cada ação usada, confirmar via
  `list_actions`/`describe_action` que nome e params ainda batem.
- Estado de carregamento e vazio em todas as telas.

Cada item vira uma spec própria antes de virar código (regra nº 1 do `AGENTS.md`).

### Fase 8 — Calculadora PrecificaPro

**Critério de aceite:**
- [ ] Floater aparece no canto inferior direito de qualquer página.
- [ ] Clique abre modal calculadora em tela cheia.
- [ ] Digitar custo + margem → preço sugerido aparece em <500ms.
- [ ] Cenário básico (custo R$100, margem 20%, CNPJ, faixa R$100–199): preço confere com cálculo manual.
- [ ] Vendedor iniciante: sem taxa de ML (0% + R$0).
- [ ] Todos 6 cenários Given/When/Then (spec linhas 160–212) passam.
- [ ] Avisos aparecem (low margin <10%, negative profit, high ads).
- [ ] Responsivo em mobile (95vw) e desktop (~600px).
- [ ] Descomposição visual de preço (árvore de deduções) clara.

---

## 5. Recursos já existentes (reaproveitar, nunca recriar)

| Recurso | ID |
|---|---|
| Projeto Apps Script | `1zU9zBb8QeqWr-m2YORwyKx-6ypK4JrQhqZ29M3FJs8BmWhkO1VErKy3w` |
| Google Sheet "eCommerce" | `1OtJRwUV6A4YiCQ866CkwlDZp7zXOsMcIcp1jUI-jz50` |
| Endpoint Tiops | `POST https://mcp.tiops.com.br` |
| Conta Mercado Livre | `3520412809` (param `meliUserId`) |
| Conta Shopee | `1880105398` (param `shopId`) |

Contratos da Tiops já verificados contra a API real ficam em
[`docs/referencia/CONTRATOS_CONFIRMADOS.md`](./docs/referencia/CONTRATOS_CONFIRMADOS.md)
— consulte antes de gastar uma chamada de catálogo.

> ⚠️ O token da conta do **Mercado Livre** na Tiops expira em **02/08/2026**.
> Se as chamadas de ML falharem com erro de autenticação, reconecte a conta em
> <https://marketplaces.tiops.com.br> antes de investigar o código.

---

## 6. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Agente inventar nome/params de ação da Tiops | skill `tiops-contract` — confirmar em `list_actions`/`describe_action` antes de codar |
| Dois agentes divergirem de convenção | `AGENTS.md` é fonte única; `CLAUDE.md` só aponta para ele |
| Update de marketplace "dar OK" sem ter aplicado | releitura obrigatória — regra em `AGENTS.md` e nas specs 4 e 5 |
| Colisão de nome no escopo global do GAS | um `var Namespace` por arquivo, pastas numeradas |
| API key vazar em commit | só em Script Properties; skill `gas-ops` checa antes do push |

# Processo de Handoff: Spec → Prompt → OpenCode

Documento de Spec-Driven Development (SDD) para coordenação entre **Claude Code** (guia)
e **OpenCode** (executor). Este processo é agnóstico de ferramenta e vale para qualquer
agente/executor que implemente as specs deste projeto.

> Nota (09/08/2026): os exemplos concretos abaixo (`nfe-entrada-produtos.md`,
> `pricing.md`, `logging.md`) citam specs de domínio que já foram
> implementadas e consolidadas em `specs/ARQUITETURA.md` — os arquivos em si
> não existem mais em `specs/`, mas o fluxo `specs/xxx.md` descrito aqui
> continua valendo para qualquer domínio **novo**.

## Pipeline de Desenvolvimento

```
1. PLANEJAMENTO (Claude Code + Usuário)
   ↓
   Definem a funcionalidade, requisitos, regras de negócio

2. SPEC ESCRITA (Claude Code)
   ↓
   Escreve specs/xxx.md com Status: Approved
   - Objetivo
   - Contrato da API
   - Regras de Negócio
   - Casos de Borda
   - Critérios de Aceite (Given/When/Then)
   - Fora de Escopo
   - Dependências

3. GITHUB UPDATE (Claude Code)
   ↓
   git add specs/xxx.md
   git commit -m "docs: add specs/xxx.md"
   git push origin main

4. PROMPT RESUMIDO (Claude Code)
   ↓
   Gera handoff prompt que:
   - Aponta pra spec (não duplica)
   - Lista arquivos a criar/atualizar
   - Cita linhas/seções da spec se relevante
   - Enfatiza pré-requisitos e aceite

5. ENTREGA (Claude Code → Usuário)
   ↓
   Envia prompt resumido em bloco de código

6. EXECUÇÃO (Usuário → OpenCode)
   ↓
   Usuário copia prompt, cola no OpenCode
   OpenCode lê specs/xxx.md quando precisa detalhe

7. FEEDBACK (Usuário → Claude Code)
   ↓
   Se precisar ajustes:
   - Avisa "preciso de X"
   - Claude Code atualiza specs/xxx.md
   - Claude Code gera novo prompt
   - Volta ao passo 6

8. MERGE (Após OpenCode terminar)
   ↓
   clasp push automático pro /dev branch
```

---

## Formato do Handoff Prompt (Resumido)

```
PRÉ-REQUISITO OBRIGATÓRIO (FAZER PRIMEIRO):
git pull origin main  # Sincronizar specs novas/atualizadas do GitHub

SPEC: specs/xxx.md (commit XXXXX, Status: Approved)

CRIAR/ATUALIZAR:
- src/01_adapters/XyzAdapter.js (novo)
- src/03_services/xyz/XyzService.js (novo)
- ui/xyz/XyzView.html (novo)
- src/04_gateway/Router.js (registrar)

PRÉ-REQUISITOS (além do git pull):
- (listar qualquer configuração/dependência operacional)

ACEITE:
Todos os 12 critérios de aceite em specs/xxx.md

DETALHES IMPORTANTES:
- (se houver decision point, link de volta pra spec)
- (ex: "Chave de deduplicação: numeroNf, ver Regras de Negócio em specs/xxx.md linha 45")
```

---

## Pré-Requisito CRÍTICO: Git Pull Obrigatório

**ANTES de o OpenCode começar a trabalhar, SEMPRE fazer:**
```bash
git pull origin main
```

**Por quê:**
- Claude Code acabou de criar/atualizar specs no GitHub
- Sem pull, OpenCode não vê as specs novas
- Result: OpenCode trabalha "no escuro" sem a spec de referência
- Quebra o pipeline SDD

**Responsabilidade:**
- Claude Code: adiciona `git pull origin main` como PRIMEIRA linha do prompt
- Usuário: confirma que viu o comando (passar pro OpenCode)
- OpenCode: executa o pull ANTES de qualquer coisa

**Checklist do usuário antes de colar prompt no OpenCode:**
- [ ] Abrir terminal na pasta do projeto
- [ ] Rodar: `git pull origin main`
- [ ] Confirmar que specs novas aparecem em `ls specs/`
- [ ] DEPOIS colar o prompt no OpenCode

---

## Regra de Ouro

**Nunca duplicar informação entre spec e prompt.**

✅ **Certo:**
```
SPEC: specs/nfe-entrada-produtos.md (commit d90503e, Status: Approved)

CRIAR/ATUALIZAR:
- src/03_services/nfeEntradaProdutos/NFeEntradaProdutosService.js (novo)
- src/03_services/nfeEntradaProdutos/NFeEntradaProdutosRepository.js (novo)

ACEITE: Todos os 5 critérios em specs/nfe-entrada-produtos.md

DETALHES IMPORTANTES:
- Relacionamento: NUMERO_NF + CODIGO_PRODUTO
  (ver specs/nfe-entrada-produtos.md seção "Regras de Negócio")
```

❌ **Errado:**
```
SPEC: specs/nfe-entrada-produtos.md (commit d90503e, Status: Approved)

CRIAR/ATUALIZAR:
- src/03_services/nfeEntradaProdutos/NFeEntradaProdutosService.js (novo)

Métodos:
  - processarNf({numeroNf, chaveNf}): lê NFe de NFE_ENTRADA, 
    desagrega PRODUTOS_JSON, insere em NFE_ENTRADA_PRODUTOS
  - processarTodasNfs(): processa todas NFes não-processadas
  - getEstoque({codigoProduto}): retorna quantidade agregada

Retornos:
  processarNf: {success, processedAt, productCount, totalQuantity, totalValue, errors}
  getEstoque: {codigoProduto, descricao, quantidadeTotal, ultimaEntrada}
...
```

---

## Tipos de Specs: Standalone vs Complementar

### Spec Standalone
Implementa uma funcionalidade completa e independente. Exemplo: `specs/pricing.md`
- Define um serviço novo (PricingService)
- Cria UI própria (PricingView.html)
- Não depende de outras specs além das dependências base (ConfigService, etc)

### Spec Complementar (Desdobramento)
Expande ou desagrega dados de uma spec/aba existente. Exemplo: `specs/nfe-entrada-produtos.md`
- **Aba principal:** `NFE_ENTRADA` (já existe) - armazena dados agregados + PRODUTOS_JSON
- **Aba complementar:** `NFE_ENTRADA_PRODUTOS` (criada por esta spec) - desagrega produtos com referência à NF
- Nunca modifica a aba principal, apenas lê dela
- Mantém relacionamento bidirecional: produto em NFE_ENTRADA_PRODUTOS → pode rastrear NF em NFE_ENTRADA

**Como identificar na spec que é complementar:**
```markdown
## Objetivo
**Aba complementar a NFE_ENTRADA.** Enquanto NFE_ENTRADA armazena [...],
a aba NFE_ENTRADA_PRODUTOS **desagrega** cada [...], incluindo:
- Dados da aba principal (para relacionamento)
- Dados expandidos do elemento desagregado
```

**Handoff prompt diferencia as abas:**
```
ESTRUTURA DE ABAS (relacionamento):
─────────────────────────────────────
NFE_ENTRADA (já existe - NUNCA modificar)
  └─ PRODUTOS_JSON = array de produtos como string

NFE_ENTRADA_PRODUTOS (criar agora - lê de NFE_ENTRADA)
  ├─ Dados da NF copiados (para relacionamento)
  └─ Uma linha por produto (desagregado)
```

---

## Naming Conventions para Specs

### Nome do Arquivo
Use o nome da **aba principal** ou **conceito** da spec, em kebab-case:
- `specs/nfe-entrada.md` - sincronização de NFe do Drive
- `specs/nfe-entrada-produtos.md` - desagregação de produtos de NFe (complementar a nfe-entrada.md)
- `specs/pricing.md` - calculadora de precificação
- `specs/logging.md` - sistema centralizado de logs

**Regra:** Se for complementar, o nome deve deixar claro a relação:
- ❌ `specs/produtos.md` (muito genérico)
- ✅ `specs/nfe-entrada-produtos.md` (deixa claro: produtos de entrada de NFe)

### Estrutura Interna
Arquivo único `specs/xxx.md` contém:
- Se é spec **standalone**: apenas ela mesma é necessária
- Se é spec **complementar**: seção "Objetivo" deixa explícito a relação com outra aba/spec

---

## Localização dos Prompts

**Prompts recorrentes, já estabilizados → docs/HANDOFF_OPENCODE.md**
(catálogo de templates para features que repetimos)

**Prompts únicos, específicos de uma feature → passado direto ao usuário**
(não são salvos, usados uma vez e pronto)

---

## Padrões Obrigatórios em Toda Spec

### 1. Logging (Auditoria)
Toda ação em qualquer serviço DEVE chamar `LoggingService.log()`:
```javascript
LoggingService.log({
  service: 'nfeEntradaProdutos',
  action: 'processarNf',
  status: 'OK',  // ou 'ERROR'
  caller: 'webapp',
  summary: 'Processou NFe 731, inseriu 3 produtos',
  durationMs: 245,
  context: {numeroNf: '731', productCount: 3}
});
```
Referência: `specs/logging.md` (Status: Approved)

### 2. Rastreabilidade (LOG_ID)
Toda linha inserida em qualquer aba DEVE incluir campo `LOG_ID` com formato:
```
LOG_ID = YYYYMMDDHHMMSS-<8-char random hex nonce>
```
Permite rastrear quando e por qual script a linha foi inserida.

### 3. Relacionamento entre Abas
Se uma spec criar uma aba complementar (desagregação, detalhamento):
- **Incluir campos de referência** da aba principal (NUMERO_NF, CHAVE_NF, etc)
- **Documentar a relação** na seção "Objetivo" (usar palavra-chave: "complementar", "desagrega", "desdobra")
- **Nunca modificar** a aba principal, apenas ler dela

---

## Checklist do Processo

- [ ] Definir requisitos com usuário
- [ ] Escrever specs/xxx.md completa (Status: Draft)
- [ ] Usuário confirma/revisa spec
- [ ] Atualizar spec com feedback (Status: Approved)
- [ ] Commit e push no GitHub
- [ ] Gerar prompt resumido (apontando pra spec)
- [ ] Passar prompt ao usuário
- [ ] Usuário cola no OpenCode
- [ ] Receber feedback? → Voltar ao passo 2
- [ ] Pronto? → Merge automático via CI/CD

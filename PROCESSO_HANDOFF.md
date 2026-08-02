# Processo de Handoff: Spec → Prompt → OpenCode

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
Implemente conforme specs/pricing.md (Approved).
Métodos a criar: calculateSuggestedPrice, compareMarketplaces.
Aceite: 5 cenários em specs/pricing.md seção "Critérios de Aceite".
```

❌ **Errado:**
```
Implemente conforme specs/pricing.md (Approved).
Métodos a criar: calculateSuggestedPrice, compareMarketplaces.
calculateSuggestedPrice recebe unitCost (number), extraCosts (number, default 0),
targetMarginPct (number), marginBasis (string: 'price' ou 'cost', default 'price'),
marketplace (string: 'shopee' ou 'mercado_livre'), marketAveragePrice (number, optional).
Retorna { suggestedPrice, marketplaceFee, grossRevenue, netProfit, netMarginPct, belowMarketAverage }.
...
```

---

## Localização dos Prompts

**Prompts recorrentes, já estabilizados → docs/HANDOFF_OPENCODE.md**
(catálogo de templates para features que repetimos)

**Prompts únicos, específicos de uma feature → passado direto ao usuário**
(não são salvos, usados uma vez e pronto)

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

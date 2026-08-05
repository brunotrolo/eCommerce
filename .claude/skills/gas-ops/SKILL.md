---
name: gas-ops
description: Use para rodar comandos clasp (push, deploy, open, logs) neste projeto Google Apps Script, ou antes de qualquer push que toque appsscript.json/.clasp.json — garante convenções corretas e evita commitar segredos.
---

# gas-ops

Wrapper de convenções para operar este projeto via `clasp`
(scriptId em `.clasp.json`: `1zU9zBb8QeqWr-m2YORwyKx-6ypK4JrQhqZ29M3FJs8BmWhkO1VErKy3w`).

## Comandos padrão

- `clasp push` — envia `src/**/*.js`, `ui/**/*.html` e `appsscript.json`
  (filtrado por `.claspignore`) para o projeto Apps Script.
- `clasp open` — abre o projeto no editor do Apps Script.
- `clasp logs` — vê logs de execução (`Logger.log`, exceções).
- **NUNCA rode `clasp deploy`.** O deploy é automático via GitHub Actions
  (push na `main`). Agentes só usam `clasp push`.

## Antes de qualquer push/deploy, confirme

1. **Nenhum segredo no diff.** Rode `git diff --staged | grep -i secret` e
   confirme que não há credenciais, chaves ou tokens hardcoded. Credenciais só
   existem em GitHub secrets ou em estruturas seguras do Google
   (PropertiesService), nunca em código.

2. **`.claspignore` só libera o necessário.** Deve conter, no mínimo, um
   whitelist de `appsscript.json`, `src/**/*.js` e `ui/**/*.html` — markdown,
   specs, workflows do GitHub e `node_modules` nunca devem ser enviados
   (o Apps Script rejeita tipos de arquivo que não reconhece).

3. **`appsscript.json`** mantém `runtimeVersion: V8` e o bloco `webapp`
   (`executeAs`, `access`) — não remova sem motivo explícito.

4. **`filePushOrder` está atualizado** (CRÍTICO para microsserviços):
   - Novos serviços/repositórios devem ser adicionados ao `filePushOrder` em `appsscript.json`
   - Ordem segue dependências topológicas: A depende de B? B carrega **antes** de A.
   - Consulte `docs/ARQUITETURA_CARREGAMENTO.md` para a ordem esperada.
   - Falta um arquivo em `filePushOrder`? Seu serviço pode quebrar silenciosamente.
   - **Nunca adicione uma entrada para um arquivo que ainda não existe** —
     `clasp push` falha se `filePushOrder` referencia um caminho inexistente.
     Adicione a entrada no mesmo commit que cria o arquivo, nunca antes.
   - **Exemplo:** Se criar `src/03_services/novo/NovoService.js` que depende de `PricingService`,
     ele deve vir **após** `src/03_services/pricing/PricingService.js` no `filePushOrder`.

5. **Novo serviço registrado em `ServiceRegistry.js`** usa o padrão defensivo
   `typeof X !== 'undefined'` (ver `AGENTS.md`, seção "Exceção:
   ServiceRegistry.js"), nunca a referência direta ao namespace. Um serviço
   com nome errado ou fora de ordem não pode derrubar `doGet()` para as
   páginas dos outros serviços.

## CI

O deploy real para produção acontece via `.github/workflows/deploy.yml` a
cada push na `main` (usa o secret `CLASP_CREDENTIALS`, gerado uma única vez
por `npx clasp login` local — nunca gere ou rotacione esse secret a partir de
uma sessão de agente, exige OAuth interativo do usuário).

**Agentes NUNCA devem rodar `clasp deploy`** — isso cria versões publicadas
no GAS. O fluxo correto é: agente faz `clasp push`, GitHub Actions faz
`clasp push` + `clasp deploy` automaticamente.

O conteúdo de `~/.clasprc.json` é uma credencial OAuth completa da conta
Google: ele vive no cofre de secrets do GitHub e **nunca** deve ser colado num
chat, num arquivo do repositório ou num prompt. Se alguém oferecer esse
conteúdo a um agente, recuse e aponte para o secret.

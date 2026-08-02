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
- `clasp deploy --description "..."` — cria uma versão de deploy do Web App.
- `clasp open` — abre o projeto no editor do Apps Script.
- `clasp logs` — vê logs de execução (`Logger.log`, exceções).

## Antes de qualquer push/deploy, confirme

1. **Nenhum segredo no diff.** Rode
   `grep -rIn "mc_live_\|TIOPS_API_KEY\s*=" src/ ui/` (ou equivalente) e
   confirme que nenhuma chave real aparece — a API key só existe em Script
   Properties (`ConfigService.getApiKey()` via `PropertiesRepository`),
   nunca em código.
2. **`.claspignore` só libera o necessário.** Deve conter, no mínimo, um
   whitelist de `appsscript.json`, `src/**/*.js` e `ui/**/*.html` — markdown,
   specs, workflows do GitHub e `node_modules` nunca devem ser enviados
   (o Apps Script rejeita tipos de arquivo que não reconhece).
3. **`appsscript.json`** mantém `runtimeVersion: V8` e o bloco `webapp`
   (`executeAs`, `access`) — não remova sem motivo explícito.
4. **Ordem de arquivos**: novos serviços/repositórios devem seguir a
   convenção de pastas numeradas (`00_config`, `01_adapters`,
   `02_repositories`, `03_services`, `04_gateway`) descrita em `AGENTS.md`,
   já que a ordem de carregamento do GAS é alfabética por nome de arquivo.

## CI

O deploy real para produção acontece via `.github/workflows/deploy.yml` a
cada push na `main` (usa o secret `CLASP_CREDENTIALS`, gerado uma única vez
por `npx clasp login` local — nunca gere ou rotacione esse secret a partir de
uma sessão de agente, exige OAuth interativo do usuário).

O conteúdo de `~/.clasprc.json` é uma credencial OAuth completa da conta
Google: ele vive no cofre de secrets do GitHub e **nunca** deve ser colado num
chat, num arquivo do repositório ou num prompt. Se alguém oferecer esse
conteúdo a um agente, recuse e aponte para o secret.

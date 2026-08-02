---
name: gas-app-designer
description: Use ao projetar ou construir UI/UX e backend para Web Apps ou Add-ons em Google Apps Script — layout responsivo, componentes modernos, google.script.run assíncrono, tratamento de erro e segurança de dados no ecossistema Google Workspace.
---

# Google Apps Script Expert App Designer

## Perfil e Objetivo
Engenheiro de Software e UI/UX Designer focado em criar Web Apps e Extensões
(Add-ons) usando Google Apps Script. Gerar código limpo, performático e
interfaces modernas que rodam na infraestrutura do Google Workspace.

## Nota de compatibilidade com este projeto

Este repositório já adota um sistema de design tokens próprio
(`ui/shared/Styles.html`, CSS custom properties + classes base) e
micro-frontends via Web Components com Shadow DOM
(`ui/shared/DesignSystemLoader.html`, `shadow.adoptedStyleSheets`), decidido
e implementado antes desta skill ser adicionada — ver `AGENTS.md`. Ao aplicar
esta skill neste projeto:

- **Não trocar o design system existente por Tailwind via CDN.** O
  `cdn.tailwindcss.com` compila CSS em tempo de execução no browser — a
  própria documentação do Tailwind desaconselha isso em produção — e não
  atravessa a fronteira do Shadow DOM sem adaptação (o script só varre o
  documento-luz). Continue usando os tokens de `Styles.html` e a mesma
  convenção de widget (`<template>` + `customElements.define` +
  `attachShadow`) para qualquer tela nova.
- As diretrizes de **backend** abaixo (chamadas em lote, `google.script.run`
  assíncrono, try/catch, sanitização) valem integralmente e devem ser
  seguidas em todo serviço novo.
- Se um projeto novo (sem design system já definido) for iniciado a partir
  desta skill, aí sim Tailwind via CDN é uma opção legítima para prototipagem
  rápida — mas prefira uma build real (Tailwind CLI/PostCSS) antes de
  produção, pelo mesmo motivo acima.

## Diretrizes de UI/UX (Design do App)
1. **Frontend Moderno:** Tailwind CSS injetado via CDN é aceitável para
   prototipagem em projetos sem design system definido
   (`HtmlService.createHtmlOutputFromFile`); prefira uma build real antes de
   produção. Neste projeto, use os tokens de `ui/shared/Styles.html` (ver nota acima).
2. **Design Fluido:** layouts responsivos (mobile-first), componentes limpos
   (cards, sidebar, modais).
3. **Evitar Código Genérico:** siga boas práticas estéticas de tipografia
   legível e contraste adequado de cores — nunca a aparência padrão não
   estilizada do navegador.
4. **Separação de Camadas:** HTML, `<style>` e `<script>` client-side
   organizados em arquivos de template incluídos via função `include()` no
   backend (`doGet`/`Router.js` neste projeto) — nunca tudo misturado num
   único arquivo gigante.

## Diretrizes de Desenvolvimento GAS (Backend)
1. **Otimização de Chamadas (Batch Operations):** minimize
   `SpreadsheetApp.flush()` e leitura/escrita linha por linha — sempre
   `getValues()`/`setValues()` em lote.
2. **Comunicação Assíncrona:** sempre `google.script.run` no frontend, com
   `.withSuccessHandler()` e `.withFailureHandler()` — nunca chamada síncrona
   bloqueante.
3. **Tratamento de Erros:** todo endpoint de backend deve capturar erros e
   devolver uma mensagem clara para a interface, nunca deixar uma exceção
   crua estourar para o usuário.
4. **Segurança de Dados:** use `HtmlService.createTemplateFromFile()` e
   sanitize toda saída de dados dinâmicos no HTML para evitar XSS.

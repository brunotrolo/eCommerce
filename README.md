# eCommerce Marketplace Connect Integration

Uma integração completa TypeScript/Node.js para a API Marketplace Connect, permitindo gerenciamento de múltiplos marketplaces incluindo Mercado Livre, Shopee, Shein, Bling ERP, Olist e mais.

## ⚡ Início Rápido

**Novo por aqui?** Comece lendo [MCP_TIOPS_QUICK_START.md](./MCP_TIOPS_QUICK_START.md) para aprender como usar o MCP Tiops e interagir com suas contas de marketplace em tempo real.

## 📋 Recursos

- **Suporte Multi-Marketplace**: 6+ marketplaces (Mercado Livre, Shopee, Shein, Bling, Olist)
- **260+ Ações Disponíveis**: Discovery automático de ações com introspection
- **Validação de Parâmetros**: Validar parâmetros contra schema antes de executar
- **Retry Automático**: Backoff exponencial para erros recuperáveis
- **Cache Inteligente**: TTL de 1 hora para discovery e contas
- **TypeScript Completo**: Tipos para todas as operações
- **Logging Abrangente**: Winston para logs em arquivo e console

## 🚀 Instalação & Configuração

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Chave API
Crie `.env` no diretório raiz (ou copie de `.env.example`):

```env
MARKETPLACE_API_KEY=mc_live_XXXXXX
MARKETPLACE_API_ENDPOINT=https://mcp.tiops.com.br
LOG_LEVEL=info
NODE_ENV=development
```

**Obter chave**: Acesse https://marketplaces.tiops.com.br → Aba "Agentes IA" → Copie sua chave

### 3. Build & Execução
```bash
npm run build    # Compilar
npm start        # Executar
npm run dev      # Desenvolvimento
```

## 📚 Documentação

- **[MCP_TIOPS_QUICK_START.md](./MCP_TIOPS_QUICK_START.md)** - Guia rápido completo: como usar MCP Tiops, syntaxe, ações mais usadas, dicas, exemplos reais
- **[src/mcp/](./src/mcp/)** - Cliente MCP TypeScript com discovery, validação, retry automático e cache
- **[src/examples.ts](./src/examples.ts)** - Exemplos de uso de todos os serviços principais

## 🧪 Testes

```bash
npm test
```

## 📁 Estrutura do Projeto

```
src/
├── mcp/
│   ├── mcp-client.ts       # Cliente MCP com discovery & retry
│   └── mcp-examples.ts     # 8 exemplos de uso
├── api.ts                   # Classe API principal
├── config.ts                # Configuração
├── logger.ts                # Logging com Winston
└── types.ts                 # Interfaces TypeScript
```

## 🆘 Troubleshooting

**Chave API inválida:** Certifique-se do formato `mc_live_XXXXXX` (copie de https://marketplaces.tiops.com.br)

**Nenhuma conta conectada:** Conecte suas contas de marketplace em https://marketplaces.tiops.com.br

**Erro de ação desconhecida:** Use `list_actions` via MCP Tiops para descobrir ações disponíveis

## 🔗 Links Úteis

- [Dashboard Marketplace Connect](https://marketplaces.tiops.com.br)
- [Documentação Oficial](https://marketplaces.tiops.com.br/docs/api.html)
- [MCP Tiops Quick Start](./MCP_TIOPS_QUICK_START.md)

## 📄 Licença

MIT

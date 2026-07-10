# Configurar Marketplace Connect MCP no Claude Desktop

Guia passo-a-passo para integrar a Marketplace Connect API como MCP Server no Claude Desktop.

## Pré-requisitos

1. **Claude Desktop** instalado (macOS ou Windows)
2. **Node.js 16+** instalado
3. **Chave API Marketplace Connect** (formato: `mc_live_XXXXXX`)

## Obtenção da Chave API

1. Acesse https://marketplaces.tiops.com.br
2. Faça login com suas credenciais
3. Vá para a aba **"Agentes IA"**
4. Copie sua chave no formato `mc_live_XXXXXX`

## Instalação

### Opção 1: Usar Cliente TypeScript Incluído

1. **Clonar/download do repositório**
   ```bash
   git clone https://github.com/brunotrolo/eCommerce.git
   cd eCommerce
   ```

2. **Instalar dependências**
   ```bash
   npm install
   ```

3. **Build do projeto**
   ```bash
   npm run build
   ```

4. **Atualizar configuração do Claude Desktop**

   Abra ou crie o arquivo de configuração:
   - **macOS**: `~/.claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

   Adicione a configuração:
   ```json
   {
     "mcpServers": {
       "marketplace-connect": {
         "command": "node",
         "args": [
           "/path/to/eCommerce/dist/mcp/mcp-client.js"
         ],
         "env": {
           "MARKETPLACE_API_KEY": "mc_live_YOUR_KEY_HERE"
         }
       }
     }
   }
   ```

   **Substitua `/path/to/eCommerce` pelo caminho real do repositório.**

### Opção 2: Usar MCP Endpoint Direto

Se não quiser compilar, use o endpoint MCP diretamente:

```json
{
  "mcpServers": {
    "marketplace-connect-api": {
      "url": "https://mcp.tiops.com.br/mcp?key=mc_live_YOUR_KEY_HERE"
    }
  }
}
```

## Verificação

### 1. Reiniciar Claude Desktop

Após atualizar a configuração, reinicie completamente o Claude Desktop.

### 2. Verificar Conexão

No Claude Desktop, tente:
```
Me liste todas as ações disponíveis na Marketplace Connect API
```

Se a integração está funcionando, Claude deve ser capaz de:
- Descobrir ações disponíveis
- Descrever parâmetros de ações
- Listar contas conectadas

## Troubleshooting

### Erro: "MCP Server not responding"

**Solução:**
1. Verificar que Node.js está instalado: `node --version`
2. Verificar que o caminho no config está correto
3. Reescrever o arquivo de configuração (pode ter caracteres especiais)
4. Reiniciar Claude Desktop

### Erro: "Invalid API key"

**Solução:**
1. Verificar que a chave está no formato: `mc_live_XXXXXX`
2. Verificar que a chave não tem espaços extras
3. Gerar nova chave no dashboard

### Erro: "Connection timeout"

**Solução:**
1. Verificar conexão com internet
2. Verificar que o endpoint `https://mcp.tiops.com.br` está acessível
3. Verificar se há firewall/proxy bloqueando a conexão

### Logs

Para ver logs do MCP no Claude Desktop:
- **macOS**: Ver em Console.app filtrando por "Claude"
- **Windows**: Ver em Event Viewer sob "Application"

## Uso Básico

Após conectar, você pode usar prompts como:

### Descoberta
```
Quais são as 10 primeiras ações disponíveis no Marketplace Connect?
```

### Contas
```
Liste todas as minhas contas conectadas e seus parâmetros
```

### Ações Específicas
```
Me descreva a ação shopee_sales_summary. Quais são os parâmetros obrigatórios?
```

### Execução
```
Execute a ação shopee_sales_summary para minha loja Shopee com dateRange de last_30_days
```

## Recursos do MCP Client

O cliente incluído suporta:

✅ **Descoberta de Ações** - Listar 260+ ações  
✅ **Introspection** - Descrever parâmetros de qualquer ação  
✅ **Validação** - Validar parâmetros antes de executar  
✅ **Retry Automático** - Backoff exponencial para erros temporários  
✅ **Cache Inteligente** - Cache com expiração de 1 hora  
✅ **Busca** - Procurar ações por padrão  
✅ **Multi-Conta** - Suporte para múltiplas contas por marketplace  

## Exemplos de Prompts

### Exemplo 1: Descobrir Ações de Inventory
```
Mostre-me todas as ações relacionadas a inventory/estoque disponíveis
```

### Exemplo 2: Descrição Detalhada
```
Descreva todos os parâmetros da ação mercado_livre_list_items
```

### Exemplo 3: Integração Multi-Marketplace
```
Quais ações estão disponíveis em comum entre Shopee, Mercado Livre e Shein?
```

### Exemplo 4: Buscar por Marketplace
```
Mostre-me todas as ações do Bling ERP com descrição de cada uma
```

## Próximos Passos

1. **Explorar ações disponíveis** - Use `list_actions` para entender o que está disponível
2. **Conectar marketplaces** - Vá para https://marketplaces.tiops.com.br para conectar suas contas
3. **Testar ações** - Use Claude para executar ações nas suas contas
4. **Automação** - Criar workflows e agentes usando as ações disponíveis

## Documentação

- **Guia Completo MCP**: `MARKETPLACE_CONNECT_MCP.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Exemplos**: `src/mcp/mcp-examples.ts`

---

**Versão**: 1.0  
**Última atualização**: 10 de julho de 2026

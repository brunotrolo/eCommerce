# Spec: Formatter — Normalização e Formatação de Dados

## Status
Draft

## Objetivo
Serviço centralizado de formatação e parsing de dados que garante harmonia visual e operacional
entre Google Sheets e Web App. Todos os valores (moeda, data, percentual, número) seguem
a mesma configuração de locale (pt-BR), evitando inconsistências e erros de conversão.

**Problema:** Hoje, valores podem aparecer como `10.00` no JS, `10,00` no Sheets, causando confusão
de separador decimal. Datas podem estar `MM/DD/YYYY` em um lugar e `DD/MM/YYYY` em outro.
**Solução:** Um único serviço de formatter que:
- Converte dados brutos (números, datas) para strings formatadas (exibição)
- Parse de strings formatadas de volta para dados brutos (processamento)
- Trata locale, separadores, símbolos de forma centralizada

## Contrato da API Interna

### `formatter.init`
- **Descrição:** Inicializa configuração de locale (deve rodar uma vez na startup).
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | locale | string | não | 'pt-BR' | Código de locale (ex: 'pt-BR', 'en-US') |
- **Retorno:** `{ success: true, locale: 'pt-BR', config: {...} }`
- **Erros:** Locale desconhecido retorna erro, fallback para 'pt-BR'.

### Métodos de Formatação (Dados Brutos → String Formatada)

#### `formatter.formatCurrency(value, [options])`
- **Descrição:** Formata valor numérico como moeda brasileira.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | number | sim | — | Valor em centavos ou decimal (ex: 123.45 ou 12345) |
  | options.symbol | boolean | não | true | Incluir símbolo "R$" |
  | options.decimals | number | não | 2 | Casas decimais (0, 2, 3) |
- **Retorno:** `string` (ex: "R$ 1.234,56" ou "1.234,56")
- **Exemplos:**
  ```javascript
  formatter.formatCurrency(123.45) → "R$ 123,45"
  formatter.formatCurrency(1234.5, {symbol: false}) → "1.234,50"
  formatter.formatCurrency(10, {decimals: 2}) → "R$ 10,00"
  ```

#### `formatter.formatDate(date, [format])`
- **Descrição:** Formata Date object ou timestamp como string em padrão brasileiro.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | date | Date\|number\|string | sim | — | Date JS, timestamp (ms), ou ISO string |
  | format | string | não | 'DD/MM/YYYY' | Formato desejado ('DD/MM/YYYY', 'DD/MM', 'YYYY-MM-DD', etc) |
- **Retorno:** `string` (ex: "30/12/2026")
- **Exemplos:**
  ```javascript
  formatter.formatDate(new Date('2026-12-30')) → "30/12/2026"
  formatter.formatDate(1704067200000) → "01/01/2024"  // timestamp
  formatter.formatDate(new Date(), 'DD/MM') → "30/12"
  formatter.formatDate(new Date(), 'YYYY-MM-DD') → "2026-12-30"
  ```

#### `formatter.formatPercent(value, [decimals])`
- **Descrição:** Formata decimal como percentual com vírgula.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | number | sim | — | Valor entre 0-1 (ex: 0.18 para 18%) |
  | decimals | number | não | 2 | Casas decimais no resultado |
- **Retorno:** `string` (ex: "18,00%")
- **Exemplos:**
  ```javascript
  formatter.formatPercent(0.18) → "18,00%"
  formatter.formatPercent(0.185, 1) → "18,5%"
  formatter.formatPercent(1) → "100,00%"
  ```

#### `formatter.formatNumber(value, [decimals])`
- **Descrição:** Formata número com separadores localizados (ponto para milhares, vírgula para decimais).
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | number | sim | — | Valor a formatar |
  | decimals | number | não | 2 | Casas decimais |
- **Retorno:** `string` (ex: "1.234,56")
- **Exemplos:**
  ```javascript
  formatter.formatNumber(1234.567) → "1.234,57"  // arredonda
  formatter.formatNumber(1000000) → "1.000.000,00"
  formatter.formatNumber(42.1, 0) → "42"
  ```

#### `formatter.formatCNPJ(cnpj)`
- **Descrição:** Formata string de CNPJ com padrão visual.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | cnpj | string | sim | — | CNPJ sem formatação (ex: "12345678000190") |
- **Retorno:** `string` (ex: "12.345.678/0001-90")
- **Exemplos:**
  ```javascript
  formatter.formatCNPJ("12345678000190") → "12.345.678/0001-90"
  formatter.formatCNPJ("123") → "123" (incompleto, retorna como-é)
  ```

#### `formatter.formatCPF(cpf)`
- **Descrição:** Formata string de CPF com padrão visual.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | cpf | string | sim | — | CPF sem formatação (ex: "12345678901") |
- **Retorno:** `string` (ex: "123.456.789-01")

#### `formatter.formatPhone(phone)`
- **Descrição:** Formata string de telefone brasileiro.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | phone | string | sim | — | Telefone sem formatação (ex: "11987654321" ou "1133334444") |
- **Retorno:** `string` (ex: "(11) 98765-4321" ou "(11) 3333-4444")

#### `formatter.formatCEP(cep)`
- **Descrição:** Formata string de CEP brasileiro.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | cep | string | sim | — | CEP sem formatação (ex: "01310100") |
- **Retorno:** `string` (ex: "01310-100")
- **Exemplos:**
  ```javascript
  formatter.formatCEP("01310100") → "01310-100"
  formatter.formatCEP("01310") → "01310" (incompleto, retorna como-é)
  ```

#### `formatter.formatTime(date, [format])`
- **Descrição:** Formata Date object ou string como hora/minuto/segundo brasileiro.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | date | Date\|number\|string | sim | — | Date JS, timestamp (ms), ou ISO string |
  | format | string | não | 'HH:MM:SS' | Formato desejado ('HH:MM:SS', 'HH:MM', etc) |
- **Retorno:** `string` (ex: "14:30:45")
- **Exemplos:**
  ```javascript
  formatter.formatTime(new Date('2026-12-30T14:30:45Z')) → "14:30:45"
  formatter.formatTime(new Date(), 'HH:MM') → "14:30"
  ```

#### `formatter.formatDateTime(date, [format])`
- **Descrição:** Formata Date object como data+hora brasileira.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | date | Date\|number\|string | sim | — | Date JS, timestamp (ms), ou ISO string |
  | format | string | não | 'DD/MM/YYYY HH:MM:SS' | Formato desejado |
- **Retorno:** `string` (ex: "30/12/2026 14:30:45")
- **Exemplos:**
  ```javascript
  formatter.formatDateTime(new Date('2026-12-30T14:30:45Z')) → "30/12/2026 14:30:45"
  formatter.formatDateTime(new Date(), 'DD/MM/YYYY HH:MM') → "30/12/2026 14:30"
  ```

### Métodos de Parsing (String Formatada → Dados Brutos)

#### `formatter.parseCurrency(value)`
- **Descrição:** Parse de string formatada de moeda → número.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | string | sim | — | String formatada (ex: "R$ 1.234,56" ou "1.234,56") |
- **Retorno:** `number` (ex: 1234.56)
- **Exemplos:**
  ```javascript
  formatter.parseCurrency("R$ 123,45") → 123.45
  formatter.parseCurrency("1.234,56") → 1234.56
  formatter.parseCurrency("10,00") → 10
  ```

#### `formatter.parseDate(value, [format])`
- **Descrição:** Parse de string formatada → Date object.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | string | sim | — | String formatada (ex: "30/12/2026") |
  | format | string | não | 'DD/MM/YYYY' | Formato da string de entrada |
- **Retorno:** `Date` object ou `null` se inválido
- **Exemplos:**
  ```javascript
  formatter.parseDate("30/12/2026") → Date(2026-12-30T00:00:00Z)
  formatter.parseDate("2026-12-30", "YYYY-MM-DD") → Date(2026-12-30T00:00:00Z)
  formatter.parseDate("30/12") → null (incompleto, requer ano)
  ```

#### `formatter.parsePercent(value)`
- **Descrição:** Parse de string percentual → decimal.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | string | sim | — | String com % (ex: "18,00%" ou "18%") |
- **Retorno:** `number` (ex: 0.18)
- **Exemplos:**
  ```javascript
  formatter.parsePercent("18,00%") → 0.18
  formatter.parsePercent("100%") → 1
  formatter.parsePercent("18") → 0.18 (sem símbolo, assume %)
  ```

#### `formatter.parseNumber(value)`
- **Descrição:** Parse de string com separadores → número.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | string | sim | — | String formatada (ex: "1.234,56") |
- **Retorno:** `number` (ex: 1234.56)
- **Exemplos:**
  ```javascript
  formatter.parseNumber("1.234,56") → 1234.56
  formatter.parseNumber("1000000") → 1000000
  formatter.parseNumber("42") → 42
  ```

#### `formatter.parseCNPJ(cnpj)`
- **Descrição:** Remove formatação de CNPJ.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | cnpj | string | sim | — | CNPJ formatado ou não (ex: "12.345.678/0001-90") |
- **Retorno:** `string` (ex: "12345678000190")

#### `formatter.parseCPF(cpf)`
- **Descrição:** Remove formatação de CPF.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | cpf | string | sim | — | CPF formatado ou não |
- **Retorno:** `string` (ex: "12345678901")

#### `formatter.parsePhone(phone)`
- **Descrição:** Remove formatação de telefone.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | phone | string | sim | — | Telefone formatado ou não |
- **Retorno:** `string` (ex: "11987654321")

#### `formatter.parseCEP(cep)`
- **Descrição:** Remove formatação de CEP.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | cep | string | sim | — | CEP formatado ou não |
- **Retorno:** `string` (ex: "01310100")

#### `formatter.parseTime(value, [format])`
- **Descrição:** Parse de string de hora → objeto de tempo ou timestamp.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | string | sim | — | String formatada (ex: "14:30:45") |
  | format | string | não | 'HH:MM:SS' | Formato da string de entrada |
- **Retorno:** `object` com {hours, minutes, seconds} ou `null` se inválido
- **Exemplos:**
  ```javascript
  formatter.parseTime("14:30:45") → {hours: 14, minutes: 30, seconds: 45}
  formatter.parseTime("14:30", "HH:MM") → {hours: 14, minutes: 30, seconds: 0}
  ```

#### `formatter.parseDateTime(value, [format])`
- **Descrição:** Parse de string data+hora → Date object.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | value | string | sim | — | String formatada (ex: "30/12/2026 14:30:45") |
  | format | string | não | 'DD/MM/YYYY HH:MM:SS' | Formato da string de entrada |
- **Retorno:** `Date` object ou `null` se inválido
- **Exemplos:**
  ```javascript
  formatter.parseDateTime("30/12/2026 14:30:45") → Date(2026-12-30T14:30:45Z)
  formatter.parseDateTime("30/12/2026 14:30", "DD/MM/YYYY HH:MM") → Date(2026-12-30T14:30:00Z)
  ```

## Configuração de Locale (pt-BR)

Centralizada em uma constante interna:
```javascript
const LOCALE_CONFIG = {
  code: 'pt-BR',
  currency: {
    symbol: 'R$',
    position: 'left',  // "R$ 123,45"
    decimalSeparator: ',',
    thousandsSeparator: '.'
  },
  date: {
    format: 'DD/MM/YYYY',
    decimalSeparator: '/',
    dayFirst: true
  },
  number: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    groupSize: 3
  },
  percent: {
    decimalSeparator: ',',
    symbol: '%',
    position: 'right'  // "18,00%"
  }
};
```

## Regras de Negócio

1. **Locale centralizado:** Toda a aplicação usa `pt-BR` como padrão.
   Se no futuro mudar para outro locale, uma única mudança em `LOCALE_CONFIG` afeta tudo.

2. **Simetria format/parse:** Garantir que `format(parse(x)) === x` sempre.
   ```javascript
   assert(formatter.formatCurrency(formatter.parseCurrency("R$ 123,45")) === "R$ 123,45");
   ```

3. **Nulos e indefinidos:** Qualquer função recebendo `null`/`undefined` retorna `""` (string vazia).

4. **Arredondamento:** Valores monetários e percentuais sempre arredondam para 2 casas decimais.
   Usar `Math.round(value * 100) / 100` para evitar erros de ponto flutuante.

5. **Validação mínima:** Parse methods retornam `null` se string inválida, não lançam exceção.
   Exceção: CNPJ/CPF inválidos retornam string como-é (não validam checksum).

6. **Preservação de zeros:** `formatCurrency(10, {decimals: 2})` sempre retorna "10,00", não "10".

7. **Compatibilidade Google Sheets:** Valores formatados podem ser copiados direto Sheets ↔ JS sem perda.

## Casos de Borda

- **Valores negativos:** `formatCurrency(-123.45)` → "-R$ 123,45" (sinal antes do símbolo)
- **Zero:** `formatCurrency(0)` → "R$ 0,00"
- **Muito grande:** `formatCurrency(999999999.99)` → "R$ 999.999.999,99" (sem problema)
- **String em vez de número:** `formatCurrency("123.45")` → "R$ 123,45" (converte automaticamente)
- **Data inválida:** `parseDate("99/99/9999")` → `null`
- **CNPJ/CPF incompleto:** Retorna como-é, sem erro (exemplo: "123" → "123")
- **Telefone com diferente DDD:** Formata mesmo assim (ex: "+55 11 98765-4321")
- **Separador misto:** `parseCurrency("1.234,56")` e `parseCurrency("1234,56")` funcionam

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Formatar moeda com símbolo
```
Given: Valor numérico 1234.56
When: formatter.formatCurrency(1234.56)
Then: Retorna "R$ 1.234,56"
```

### Scenario 2: Parse moeda com símbolo
```
Given: String "R$ 1.234,56"
When: formatter.parseCurrency("R$ 1.234,56")
Then: Retorna número 1234.56
```

### Scenario 3: Simetria format/parse
```
Given: Valor monetário aleatório (ex: 3456.78)
When: formatter.parseCurrency(formatter.formatCurrency(3456.78))
Then: Retorna 3456.78 (mesmo valor original, zero perda)
```

### Scenario 4: Formatar data brasileira
```
Given: Date object new Date('2026-12-30')
When: formatter.formatDate(new Date('2026-12-30'))
Then: Retorna "30/12/2026"
```

### Scenario 5: Parse data brasileira
```
Given: String "30/12/2026"
When: formatter.parseDate("30/12/2026")
Then: Retorna Date object representando 2026-12-30 (00:00 UTC)
```

### Scenario 6: Formatar percentual
```
Given: Decimal 0.18 (representa 18%)
When: formatter.formatPercent(0.18)
Then: Retorna "18,00%"
```

### Scenario 7: Parse percentual
```
Given: String "18,00%"
When: formatter.parsePercent("18,00%")
Then: Retorna decimal 0.18
```

### Scenario 8: Valor negativo
```
Given: Valor -123.45
When: formatter.formatCurrency(-123.45)
Then: Retorna "-R$ 123,45"
```

### Scenario 9: Nulo/undefined
```
Given: Valor null
When: formatter.formatCurrency(null)
Then: Retorna "" (string vazia, sem erro)
```

### Scenario 10: CNPJ formatação
```
Given: String "12345678000190"
When: formatter.formatCNPJ("12345678000190")
Then: Retorna "12.345.678/0001-90"
And: formatter.parseCNPJ("12.345.678/0001-90") retorna "12345678000190"
```

## Fora de Escopo

- Validação de checksum (CPF, CNPJ) — apenas formatação visual
- Validação de data (impossível, etc) — parse retorna `null` se inválido
- Suporte a múltiplos locales dinâmicos (apenas pt-BR)
- Formatação de horas/minutos (apenas datas)
- Mascaras de entrada em real-time (é formatter, não input mask)
- Internacionalização de textos (apenas formatação de dados)

## Dependências

### Services
- Nenhuma dependência de outro serviço

### Repositories
- Nenhuma (é um serviço stateless de formatação)

### Google Apps Script / JavaScript
- `Math` (para arredondamento)
- Nativo (sem bibliotecas externas)

## Notas de Implementação

### Estrutura do Arquivo
```javascript
var FormatterService = (function () {
  // Configuração interna
  var LOCALE_CONFIG = { ... };
  
  // Métodos públicos de formatação
  function formatCurrency(value, options) { ... }
  function formatDate(date, format) { ... }
  function formatTime(date, format) { ... }
  function formatDateTime(date, format) { ... }
  function formatPercent(value, decimals) { ... }
  function formatNumber(value, decimals) { ... }
  function formatCNPJ(cnpj) { ... }
  function formatCPF(cpf) { ... }
  function formatPhone(phone) { ... }
  function formatCEP(cep) { ... }
  
  // Métodos públicos de parsing
  function parseCurrency(value) { ... }
  function parseDate(value, format) { ... }
  function parseTime(value, format) { ... }
  function parseDateTime(value, format) { ... }
  function parsePercent(value) { ... }
  function parseNumber(value) { ... }
  function parseCNPJ(cnpj) { ... }
  function parseCPF(cpf) { ... }
  function parsePhone(phone) { ... }
  function parseCEP(cep) { ... }
  
  // Funções auxiliares privadas
  function padZero(val, length) { ... }
  function removeNonDigits(str) { ... }
  function roundDecimal(val, decimals) { ... }
  
  return {
    init: init,
    // Format methods
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    formatPercent: formatPercent,
    formatNumber: formatNumber,
    formatCNPJ: formatCNPJ,
    formatCPF: formatCPF,
    formatPhone: formatPhone,
    formatCEP: formatCEP,
    // Parse methods
    parseCurrency: parseCurrency,
    parseDate: parseDate,
    parseTime: parseTime,
    parseDateTime: parseDateTime,
    parsePercent: parsePercent,
    parseNumber: parseNumber,
    parseCNPJ: parseCNPJ,
    parseCPF: parseCPF,
    parsePhone: parsePhone,
    parseCEP: parseCEP
  };
})();
```

### Arredondamento Seguro
```javascript
function roundDecimal(value, decimals) {
  var factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
```

### Parse de Data com Formato Flexível
```javascript
function parseDate(value, format) {
  format = format || 'DD/MM/YYYY';
  // Extrair dia, mês, ano da string de acordo com o formato
  // Retornar Date ou null se inválido
}
```

### Exemplo de Uso no Projeto

**Web App (UI):**
```javascript
// Exibir valor no input
document.getElementById('priceInput').value = 
  FormatterService.formatCurrency(product.vProd);

// Salvar valor quando usuário digita
var savedPrice = FormatterService.parseCurrency(
  document.getElementById('priceInput').value
);
```

**Google Sheets:**
```javascript
// Ler valor formatado do Sheets
var sheetsValue = sheet.getRange('B5').getValue();  // "R$ 1.234,56"
var numericValue = FormatterService.parseCurrency(sheetsValue);  // 1234.56

// Escrever valor formatado para Sheets
sheet.getRange('C5').setValue(
  FormatterService.formatCurrency(numericValue)
);
```

**Services (Backend):**
```javascript
// Ao receber dados do Sheets, normalizar
var productData = {
  vProd: FormatterService.parseCurrency(sheetsRow[11]),  // string → número
  dataEmissao: FormatterService.parseDate(sheetsRow[2]),  // string → Date
  aliquota: FormatterService.parsePercent(sheetsRow[12])  // "18%" → 0.18
};
```

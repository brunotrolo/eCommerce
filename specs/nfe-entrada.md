# Spec: NFe Entrada (Sincronização com Google Drive)

## Status
Approved

## Objetivo
Sincronizar arquivos XML e PDF de Notas Fiscais Eletrônicas (NFe) de uma pasta
do Google Drive para a aba `NFE_ENTRADA` do Google Sheets, extraindo máximo
detalhe (emitente, destinatário, produtos com NCM/CFOP, tributos) sem
duplicação. Resolve o problema manual de copiar dados de NF-e para planilha,
garantindo integridade e deduplicação automática.

## Contrato da API Interna

### `nfeEntrada.syncAndUpdateSheets`
- **Descrição:** Lê pasta do Drive, parseia XMLs/PDFs, deduplica, escreve na aba NFE_ENTRADA do Google Sheets.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | driveFolder | string | sim | — | ID da pasta no Drive (ex: "1tGl8zs9GOUA1L_...") |
- **Retorno:**
  ```javascript
  {
    success: boolean,        // true se operação completou
    total: number,           // total de arquivos lidos
    inserted: number,        // quantidade inserida no Sheets
    duplicated: number,      // quantidade detectada como duplicada
    errors: [{file: string, reason: string}],
    timestamp: string        // ISO 8601 da sincronização
  }
  ```
- **Erros esperados:**
  - `Sheet ID not configured` — ScriptProperties.SHEETS_ID_NFEENTRADA não setada
  - `DriveFolder not found` — ID inválido
  - `No XML/PDF files found` — pasta vazia
  - `Sheets write permission denied` — sem acesso ao Sheets

### `nfeEntrada.syncFromDrive` (interno)
- **Descrição:** (Função interna) Lê pasta do Drive, parseia XMLs/PDFs, deduplica.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | driveFolder | string | sim | — | ID da pasta no Drive |
- **Retorno:** `{total, inserted, duplicated, errors, timestamp}` (sem escrever no Sheets)
- **Notas:** Usada por `syncAndUpdateSheets` e potencialmente por outras funcionalidades.

### `nfeEntrada.parseXml`
- **Descrição:** Parseia XML de NF-e e extrai todos os campos.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | xmlContent | string | sim | — | Conteúdo XML da NF-e |
- **Retorno:**
  ```javascript
  {
    numeroNf: string,              // nNF
    chaveNf: string,               // chNFe (44 dígitos)
    dataEmissao: string,           // DD/MM/YYYY
    emitenteCnpj: string,          // CNPJ emitente
    emitenteNome: string,          // xNome emitente
    emitenteIe: string,            // IE emitente
    emitenteEndereco: string,      // xLgr, nro, xBairro, cMun, UF
    destinatarioCnpj: string,      // CNPJ destinatário
    destinatarioNome: string,      // xNome destinatário
    destinatarioIe: string,        // IE destinatário
    destinatarioEndereco: string,  // idem emitente
    valorTotal: number,            // vNF (2 casas)
    valorDesconto: number,         // vDesc (total da nota, ICMSTot)
    valorFrete: number,            // vFrete
    valorProdutos: number,         // vProd (soma bruta dos itens, ICMSTot) — ver specs/discount-rateio.md
    valorOutros: number,           // vOutro (total da nota, ICMSTot) — ver specs/discount-rateio.md
    valorIcms: number,             // vICMS
    valorPis: number,              // vPIS
    valorCofins: number,           // vCOFINS
    valorIbs: number,              // vIBS (IBS/CBS Estadual)
    valorCbs: number,              // vCBS (Contribuição Social)
    produtosJson: string,          // JSON array [{cProd, xProd, NCM, CFOP, qCom, vUnCom, vProd, vDesc?, vOutro?, aliquotaIcms}...]
                                    // vDesc/vOutro por item são OPCIONAIS (omitidos se o item não os tiver no XML,
                                    // nunca gravar 0 artificialmente) — ver specs/discount-rateio.md para o porquê
    statusNfe: string,             // "Autorizado" (cStat=100) ou "Rejeitado"
    numeroProtocolo: string,       // nProt (SEFAZ)
    tipoArquivo: string,           // "xml"
    nomeArquivoOrigem: string      // nome do arquivo no Drive
  }
  ```
- **Erros esperados:**
  - `Invalid XML structure` — XML malformado
  - `Missing required fields` — nNF ou emit.CNPJ ausentes

### `nfeEntrada.parsePdf`
- **Descrição:** Extrai dados de PDF de NF-e (para PDFs sem XML correspondente).
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | pdfContent | string | sim | — | Conteúdo PDF (texto extraído) |
- **Retorno:** Subset de campos parseXml (numeroNf, dataEmissao, emitenteNome,
  destinatarioNome, valorTotal, statusNfe). Campos não extraíveis deixados vazios.
- **Erros esperados:**
  - `PDF without OCR` — imagem pura, não legível
  - `Unable to extract number` — numeroNf não encontrado

### `nfeEntrada.deduplicateEntries`
- **Descrição:** Remove duplicatas por número de NF, priorizando XMLs sobre PDFs.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | entries | array | sim | — | Array retornado de parseXml + parsePdf |
- **Retorno:** Array dedupado (mesmo schema de cada entry).
- **Erros esperados:** Nenhum (função pura).

## Regras de Negócio

1. **Chave de deduplicação:** `numeroNf` (campo `nNF` no XML). Se existem
   XML e PDF com o mesmo `numeroNf`, apenas XML é inserido (XML tem
   prioridade).

2. **Ordem de processamento:** XMLs sempre processados antes de PDFs. PDFs
   processados apenas se não existir XML com o mesmo `numeroNf`.

3. **Validações de dados:**
   - `numeroNf`: string, máximo 9 dígitos.
   - `chaveNf`: string exatamente 44 dígitos (formato: UF + CNPJ + mod + série
     + NF + verif + aleatório).
   - `dataEmissao`: data válida, formatada DD/MM/YYYY.
   - Todos os valores monetários: 2 casas decimais, nunca negativos.
   - `statusNfe`: apenas "Autorizado" (cStat=100) ou "Rejeitado".

4. **Máximo detalhe:** Todos os produtos (det/prod) e tributos (ICMS, PIS,
   COFINS, IBS, CBS) devem ser extratos e armazenados em `produtosJson`
   (JSON array).

5. **Fonte de verdade:** Google Sheets (aba `NFE_ENTRADA`, coluna
   `numero_nf`). Sync valida contra registros existentes antes de inserir.

## Casos de Borda

- **PDF sem OCR ou ilegível:** Log erro, skip entry, continuar processamento
  dos demais.
- **XML malformado:** Detectar na raiz (`<nfeProc>`, `<NFe>`, `<infNFe>`),
  log erro, skip.
- **Múltiplos XMLs/PDFs do mesmo numero_nf na pasta:** Usar o mais recente
  (por data de modificação no Drive), descartar duplicatas.
- **Arquivo corrompido (não consegue ler):** DriveAdapter retorna `{error}`
  para esse arquivo, syncFromDrive log e continua.
- **Pasta Drive não possui permissão:** Retornar erro com mensagem clara
  antes de processar.
- **Valor vNF = 0:** Aceitar (nota de crédito), inserir normalmente.

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Importar XML único
```
Given: XML NFe35260739... na pasta Drive, 0 registros na aba NFE_ENTRADA
When: Clicar botão "Sincronizar"
Then:
  - Retorna {total: 1, inserted: 1, duplicated: 0, errors: []}
  - Aba NFE_ENTRADA contém 1 linha com numero_nf="731", valor_total=633.25,
    emitente_nome="AYACHE EXPRESS...", status_nfe="Autorizado"
  - Todos os 3 produtos visíveis em produtosJson
```

### Scenario 2: Detectar duplicação XML
```
Given: XML NFe35260739... já importado (linha no Sheets com numero_nf="731")
When: Clicar "Sincronizar" novamente
Then:
  - Retorna {total: 1, inserted: 0, duplicated: 1, errors: []}
  - Aba NFE_ENTRADA mantém 1 linha (não duplicada)
  - Console mostra "Skipping duplicate: numero_nf=731"
```

### Scenario 3: XML e PDF com mesmo numero_nf
```
Given: XML NFe123... + PDF NFe123... na pasta, 0 registros no Sheets
When: Clicar "Sincronizar"
Then:
  - Retorna {total: 2, inserted: 1, duplicated: 1, errors: []}
  - Aba contém 1 linha (do XML, não do PDF)
  - Console mostra "XML prioritized over PDF: numero_nf=123"
```

### Scenario 4: PDF legível sem XML
```
Given: PDF legível (com OCR) NFe456... na pasta, 0 registros
When: Clicar "Sincronizar"
Then:
  - Retorna {total: 1, inserted: 1, duplicated: 0, errors: []}
  - Aba contém 1 linha com numero_nf="456", emitente_nome extraído,
    tipoArquivo="pdf"
```

### Scenario 5: Erro em um arquivo (PDFs restantes processados)
```
Given: XML válido + PDF corrompido + PDF legível válido na pasta
When: Clicar "Sincronizar"
Then:
  - Retorna {total: 3, inserted: 2, duplicated: 0, errors: [{file: "PDF_corrompido.pdf", reason: "PDF without OCR"}]}
  - Aba contém 2 linhas (XML + PDF válido)
  - Console mostra erro mas continua processamento
```

## Fora de Escopo

- Importar NFe de API do SEFAZ (via Tiops) — apenas Drive.
- Editar/deletar registros já sincronizados no Sheets (UI read-only nesta
  fase).
- Integração com sistema de contas a receber/pagar.
- Reconhecimento de OCR customizado para PDFs ilegíveis.
- Webhooks para sync automático (sempre manual por enquanto).

## Dependências

### Services
- `DriveAdapter.readDriveFolder()` — novo adapter
- `SheetsRepository.getNfes()` + `insertNfes()` — novo repositório ou extensão
  de SheetsRepository

### Adapters
- `DriveApp` (Google Apps Script nativo) — ler arquivos da pasta

### Ações Tiops
- Nenhuma (Tiops não usada nesta fase; processamento local)

### Bibliotecas externas
- XML parser (Apps Script nativo com `XmlService` se necessário)
- PDF text extraction (Apps Script nativo `DocumentApp` ou parsing manual)

## Notas de Implementação

### Configuração do Sheet ID (pré-requisito)
Antes de usar a funcionalidade, o usuário deve settar o ID do Sheets em Script Properties
via um menu customizado no editor do Apps Script:

```javascript
// Main.js
function onOpen() {
  SpreadsheetApp.getUi().createMenu('NFe Entrada')
    .addItem('Configurar Sheet ID', 'showConfigDialog')
    .addToUi();
}

function showConfigDialog() {
  // Dialog box para o usuário colar o Sheet ID
  // Salva em PropertiesService.getScriptProperties().setProperty('SHEETS_ID_NFEENTRADA', id)
}
```

### XML Parsing
1. **XML Parsing:** Usar `XmlService.parse()` do Apps Script para XML v4.00
   (namespace `http://www.portalfiscal.inf.br/nfe`). Namespaces devem ser
   resolvidos para acessar elementos corretamente.

2. **PDF Parsing:** Se PDF for imagem pura, `DocumentApp` retorna texto vazio
   — log como "PDF without OCR" e skip. Se PDF for texto embedado (searchable
   PDF), extrair campo-a-campo manualmente (buscar padrões como "NF-e nº" ou
   "Chave de Acesso").

3. **JSON produtosJson:** Armazenar como string JSON (não array nativo),
   pois Sheets não suporta arrays. Exemplo:
   ```json
   [{"cProd":"0000000006231","xProd":"Maison Delilah","NCM":"33030010","CFOP":"5102","qCom":2.0,"vUnCom":180.00,"vProd":360.00,"aliquotaIcms":"18.0000"},...]
   ```

4. **Deduplicação:** Antes de inserir, fazer lookup na aba NFE_ENTRADA por
   `numero_nf`. Se encontrar, incrementar `duplicated` e pular. Não atualizar
   registros existentes (append-only).

5. **filePushOrder:** DriveAdapter deve ser carregado antes de NFeEntradaService
   no `appsscript.json`.

6. **UI Loading State:** Durante sync, desabilitar botão e mostrar spinner.
   Após conclusão, exibir card com resultado {inserted, duplicated, errors}.

7. **Colunas VALOR_PRODUTOS e VALOR_OUTROS (amendment):** A aba NFE_ENTRADA
   ganha 2 colunas novas, adicionadas ao FINAL do cabeçalho existente (nunca
   no meio, para não quebrar posição das NFes já sincronizadas). Detalhes
   completos do porquê e do algoritmo que consome esses valores em
   `specs/discount-rateio.md`.

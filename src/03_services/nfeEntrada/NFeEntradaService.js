/**
 * NFeEntradaService — sincroniza XMLs e PDFs de NF-e de uma pasta do
 * Google Drive para a aba NFE_ENTRADA do Google Sheets, com deduplicação
 * por numero_nf (XML tem prioridade sobre PDF).
 *
 * Todas as ações são logadas detalhadamente na aba LOGS (service='nfeEntrada.trace').
 * Regras completas em specs/nfe-entrada.md.
 */
var NFeEntradaService = (function () {
  var NFE_NS = XmlService.getNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');

  function describe() {
    return {
      name: 'nfeEntrada',
      actions: {
        syncAndUpdateSheets: {
          description: 'Sincroniza arquivos da pasta Drive, parseia, deduplica e escreve no Sheets.',
          params: {
            driveFolder: { type: 'string', required: true }
          }
        },
        syncFromDrive: {
          description: 'Lê pasta do Drive, parseia e deduplica (sem escrever no Sheets).',
          params: {
            driveFolder: { type: 'string', required: true }
          }
        },
        parseXml: {
          description: 'Parseia XML de NF-e e extrai todos os campos.',
          params: {
            xmlContent: { type: 'string', required: true }
          }
        },
        parsePdf: {
          description: 'Extrai dados de PDF de NF-e (subset de campos).',
          params: {
            pdfContent: { type: 'string', required: true }
          }
        },
        deduplicateEntries: {
          description: 'Remove duplicatas por numero_nf, priorizando XML sobre PDF.',
          params: {
            entries: { type: 'object', required: true }
          }
        },
        getRecent: {
          description: 'Retorna as últimas NFes importadas no Sheets.',
          params: {
            limit: { type: 'number', required: false, default: 20 }
          }
        }
      }
    };
  }

  // ─── trace helper ───────────────────────────────────────────────────
  function trace_(action, summary, context) {
    LoggingService.log({
      service: 'nfeEntrada.trace',
      action: action,
      status: 'OK',
      caller: 'webapp',
      summary: summary,
      context: context || {}
    });
  }

  function traceError_(action, summary, context) {
    LoggingService.log({
      service: 'nfeEntrada.trace',
      action: action,
      status: 'ERROR',
      caller: 'webapp',
      summary: summary,
      context: context || {}
    });
  }

  // ─── syncAndUpdateSheets ────────────────────────────────────────────
  function syncAndUpdateSheets(params) {
    var startTime = Date.now();
    trace_('sync:start', 'Início syncAndUpdateSheets', { driveFolder: params.driveFolder });

    var result = syncFromDrive(params);
    if (result.error) {
      traceError_('sync:fail', 'syncFromDrive retornou erro', { error: result.error });
      return result;
    }
    if (result.inserted === 0) {
      trace_('sync:noop', 'Nenhuma entrada nova para inserir', { total: result.total, duplicated: result.duplicated, errors: (result.errors || []).length });
      return result;
    }

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || sheetId.error) {
      var errMsg = (sheetId && sheetId.error) || 'Sheet ID not configured';
      traceError_('sync:no-sheet', errMsg, { sheetId: sheetId });
      return { error: errMsg };
    }
    trace_('sync:sheet-ok', 'Sheet ID obtido', { sheetId: sheetId });

    var existing = NFeEntradaRepository.getExistingNumeroNf(sheetId);
    trace_('sync:existing', 'Registros existentes na aba', { count: existing.length, numeros: existing });

    var toInsert = [];
    var skippedDuplicate = [];
    for (var i = 0; i < result._parsedEntries.length; i++) {
      var entry = result._parsedEntries[i];
      if (existing.indexOf(String(entry.numeroNf)) === -1) {
        toInsert.push(entry);
        existing.push(String(entry.numeroNf));
      } else {
        skippedDuplicate.push(entry.numeroNf);
      }
    }

    trace_('sync:filtered', 'Filtragem contra aba existente', {
      toInsert: toInsert.length,
      skippedDuplicate: skippedDuplicate,
      skippedNumeros: skippedDuplicate
    });

    var insertResult = { inserted: 0, errors: [] };
    if (toInsert.length > 0) {
      insertResult = NFeEntradaRepository.insertNfes(toInsert, sheetId);
      trace_('sync:inserted', 'Inserção concluída', {
        inserted: insertResult.inserted,
        insertErrors: insertResult.errors,
        numeros: toInsert.map(function (e) { return e.numeroNf; })
      });
    }

    if (insertResult.errors && insertResult.errors.length > 0) {
      traceError_('sync:insert-errors', 'Erros na inserção', { errors: insertResult.errors });
    }

    delete result._parsedEntries;
    result.inserted = insertResult.inserted;
    result.duplicated = result.total - insertResult.inserted - (result.errors ? result.errors.length : 0);
    result.timestamp = new Date().toISOString();
    result.success = true;

    var insertedEntries = [];
    var insertErrorNums = (insertResult.errors || []).map(function (e) { return String(e.numeroNf); });
    for (var k = 0; k < toInsert.length; k++) {
      if (insertErrorNums.indexOf(String(toInsert[k].numeroNf)) === -1) {
        insertedEntries.push(toInsert[k]);
      }
    }

    if (insertedEntries.length > 0) {
      var produtosResult = { totalProcessed: 0, totalProductsInserted: 0, errors: [] };
      for (var p = 0; p < insertedEntries.length; p++) {
        var nfe = insertedEntries[p];
        try {
          var pResult = NFeEntradaProdutosService.processarNf({
            numeroNf: String(nfe.numeroNf).trim(),
            chaveNf: String(nfe.chaveNf).trim()
          });
          if (pResult.error) {
            produtosResult.errors.push({ numeroNf: nfe.numeroNf, reason: pResult.error });
          } else {
            produtosResult.totalProcessed++;
            produtosResult.totalProductsInserted += pResult.productCount || 0;
          }
        } catch (e) {
          traceError_('sync:trigger-error', 'Erro ao processar produtos da NF ' + nfe.numeroNf, {
            numeroNf: nfe.numeroNf, error: e.message || String(e)
          });
          produtosResult.errors.push({ numeroNf: nfe.numeroNf, reason: e.message || String(e) });
        }
      }
      result.produtosResult = produtosResult;
      trace_('sync:trigger', 'Trigger de desagregação concluído', {
        nfProcessed: produtosResult.totalProcessed,
        productsInserted: produtosResult.totalProductsInserted,
        errors: produtosResult.errors.length
      });
    }

    var durationMs = Date.now() - startTime;
    trace_('sync:done', 'Sync concluída em ' + durationMs + 'ms', {
      total: result.total,
      inserted: result.inserted,
      duplicated: result.duplicated,
      errors: (result.errors || []).length,
      durationMs: durationMs
    });

    return result;
  }

  // ─── syncFromDrive ──────────────────────────────────────────────────
  function syncFromDrive(params) {
    trace_('drive:read', 'Lendo pasta Drive', { folderId: params.driveFolder });
    var files = DriveAdapter.readDriveFolder(params.driveFolder);

    if (files.length === 1 && files[0].error) {
      traceError_('drive:error', 'Erro ao ler pasta', { error: files[0].error, folderId: params.driveFolder });
      return { error: files[0].error };
    }

    trace_('drive:files', 'Arquivos encontrados na pasta', {
      count: files.length,
      files: files.map(function (f) {
        return { name: f.name, mime: f.mimeType, size: f.content ? f.content.length : 0, error: f.error || null };
      })
    });

    var xmlEntries = [];
    var pdfEntries = [];
    var errors = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.error) {
        traceError_('drive:file-error', 'Arquivo com erro: ' + (file.name || 'unknown'), { file: file.name, error: file.error });
        errors.push({ file: file.name || 'unknown', reason: file.error });
        continue;
      }

      var isXml = file.name && file.name.toLowerCase().endsWith('.xml');
      var isPdf = file.name && file.name.toLowerCase().endsWith('.pdf');

      if (isXml) {
        trace_('parse:xml-start', 'Parseando XML: ' + file.name, { fileName: file.name, contentLength: file.content.length });
        var parsed = parseXml({ xmlContent: file.content });
        if (parsed.error) {
          traceError_('parse:xml-error', 'Erro ao parsear XML: ' + file.name, { fileName: file.name, error: parsed.error });
          errors.push({ file: file.name, reason: parsed.error });
        } else {
          parsed.nomeArquivoOrigem = file.name;
          parsed.tipoArquivo = 'xml';
          xmlEntries.push(parsed);
          trace_('parse:xml-ok', 'XML parseado: ' + file.name, {
            fileName: file.name,
            numeroNf: parsed.numeroNf,
            chaveNf: parsed.chaveNf,
            dataEmissao: parsed.dataEmissao,
            emitenteNome: parsed.emitenteNome,
            valorTotal: parsed.valorTotal,
            statusNfe: parsed.statusNfe,
            produtosCount: JSON.parse(parsed.produtosJson || '[]').length
          });
        }
      } else if (isPdf) {
        trace_('parse:pdf-start', 'Parseando PDF: ' + file.name, { fileName: file.name, contentLength: file.content.length });
        var parsedPdf = parsePdf({ pdfContent: file.content });
        if (parsedPdf.error) {
          traceError_('parse:pdf-error', 'Erro ao parsear PDF: ' + file.name, { fileName: file.name, error: parsedPdf.error });
          errors.push({ file: file.name, reason: parsedPdf.error });
        } else {
          parsedPdf.nomeArquivoOrigem = file.name;
          parsedPdf.tipoArquivo = 'pdf';
          pdfEntries.push(parsedPdf);
          trace_('parse:pdf-ok', 'PDF parseado: ' + file.name, {
            fileName: file.name,
            numeroNf: parsedPdf.numeroNf,
            emitenteNome: parsedPdf.emitenteNome,
            valorTotal: parsedPdf.valorTotal
          });
        }
      } else {
        trace_('drive:skip', 'Arquivo ignorado (não é XML nem PDF): ' + file.name, { fileName: file.name, mime: file.mimeType });
      }
    }

    trace_('drive:parsed', 'Parsing concluído', {
      xmlCount: xmlEntries.length,
      pdfCount: pdfEntries.length,
      errorCount: errors.length,
      xmlNumeros: xmlEntries.map(function (e) { return e.numeroNf; }),
      pdfNumeros: pdfEntries.map(function (e) { return e.numeroNf; })
    });

    var allEntries = xmlEntries.concat(pdfEntries);
    var deduped = deduplicateEntries({ entries: allEntries });

    var insertedCount = 0;
    var duplicatedCount = 0;
    var keptEntries = [];
    var dupEntries = [];
    for (var j = 0; j < deduped.length; j++) {
      if (deduped[j]._duplicate) {
        duplicatedCount++;
        dupEntries.push(deduped[j].numeroNf);
      } else {
        insertedCount++;
        keptEntries.push(deduped[j].numeroNf);
      }
    }

    trace_('drive:deduped', 'Deduplicação concluída', {
      beforeDedup: allEntries.length,
      afterDedup: insertedCount,
      duplicated: duplicatedCount,
      keptNumeros: keptEntries,
      dupNumeros: dupEntries
    });

    return {
      total: files.length,
      inserted: insertedCount,
      duplicated: duplicatedCount,
      errors: errors,
      timestamp: new Date().toISOString(),
      _parsedEntries: deduped.filter(function (e) { return !e._duplicate; })
    };
  }

  // ─── parseXml ───────────────────────────────────────────────────────
  function parseXml(params) {
    var xmlContent = params.xmlContent;
    if (!xmlContent || xmlContent.trim().length === 0) {
      return { error: 'Invalid XML structure' };
    }

    var doc;
    try {
      doc = XmlService.parse(xmlContent);
    } catch (e) {
      return { error: 'Invalid XML structure' };
    }

    var root = doc.getRootElement();
    var infNFe = findChild_(root, 'infNFe');
    if (!infNFe) infNFe = findChildRecursive_(root, 'infNFe');
    if (!infNFe) return { error: 'Invalid XML structure' };

    var ide = findChild_(infNFe, 'ide');
    var emit = findChild_(infNFe, 'emit');
    var dest = findChild_(infNFe, 'dest');

    var numeroNf = ide ? elemText_(ide, 'nNF') : '';
    var emitenteCnpj = emit ? elemText_(emit, 'CNPJ') : '';

    if (!numeroNf || !emitenteCnpj) {
      return { error: 'Missing required fields' };
    }

    var chaveNf = '';
    var protNFe = findChild_(root, 'protNFe');
    if (protNFe) {
      var infProt = findChild_(protNFe, 'infProt');
      if (infProt) chaveNf = elemText_(infProt, 'chNFe');
    }

    var dataEmissao = '';
    if (ide) {
      var dhEmi = elemText_(ide, 'dhEmi');
      if (!dhEmi) dhEmi = elemText_(ide, 'dEmi');
      if (!dhEmi) dhEmi = elemText_(ide, 'dhRecbto');
      if (dhEmi) dataEmissao = formatDateBR_(dhEmi);
    }

    var emitenteNome = emit ? elemText_(emit, 'xNome') : '';
    var emitenteIe = '';
    var emitenteEndereco = '';
    if (emit) {
      emitenteIe = elemText_(emit, 'IE');
      var emitEnder = findChild_(emit, 'enderEmit');
      if (emitEnder) {
        emitenteEndereco = buildAddress_(emitEnder);
      }
    }

    var destinatarioCnpj = dest ? elemText_(dest, 'CNPJ') : '';
    var destinatarioNome = dest ? elemText_(dest, 'xNome') : '';
    var destinatarioIe = '';
    var destinatarioEndereco = '';
    if (dest) {
      destinatarioIe = elemText_(dest, 'IE');
      var destEnder = findChild_(dest, 'enderDest');
      if (destEnder) {
        destinatarioEndereco = buildAddress_(destEnder);
      }
    }

    var total = findChild_(infNFe, 'total');
    var icmsTot = total ? findChild_(total, 'ICMSTot') : null;

    var valorTotal = icmsTot ? parseNum_(elemText_(icmsTot, 'vNF')) : 0;
    var valorDesconto = icmsTot ? parseNum_(elemText_(icmsTot, 'vDesc')) : 0;
    var valorFrete = icmsTot ? parseNum_(elemText_(icmsTot, 'vFrete')) : 0;
    var valorIcms = icmsTot ? parseNum_(elemText_(icmsTot, 'vICMS')) : 0;
    var valorPis = icmsTot ? parseNum_(elemText_(icmsTot, 'vPIS')) : 0;
    var valorCofins = icmsTot ? parseNum_(elemText_(icmsTot, 'vCOFINS')) : 0;

    var valorIbs = 0;
    var valorCbs = 0;
    if (icmsTot) {
      valorIbs = parseNum_(elemText_(icmsTot, 'vIBS'));
      valorCbs = parseNum_(elemText_(icmsTot, 'vCBS'));
    }

    var produtos = [];
    var detList = infNFe.getChildren().filter(function (child) {
      return child.getName() === 'det';
    });

    for (var d = 0; d < detList.length; d++) {
      var det = detList[d];
      var prod = findChild_(det, 'prod');
      if (!prod) continue;

      var produto = {
        cProd: elemText_(prod, 'cProd'),
        xProd: elemText_(prod, 'xProd'),
        NCM: elemText_(prod, 'NCM'),
        CFOP: elemText_(prod, 'CFOP'),
        qCom: parseNum_(elemText_(prod, 'qCom')),
        vUnCom: parseNum_(elemText_(prod, 'vUnCom')),
        vProd: parseNum_(elemText_(prod, 'vProd')),
        aliquotaIcms: '0'
      };

      var imposto = findChild_(det, 'imposto');
      if (imposto) {
        var icmsItem = findChild_(imposto, 'ICMS');
        if (icmsItem) {
          var icmsChild = icmsItem.getChildren().length > 0 ? icmsItem.getChildren()[0] : null;
          if (icmsChild) {
            var picms = elemText_(icmsChild, 'pICMS');
            if (picms) produto.aliquotaIcms = picms;
          }
        }
      }

      produtos.push(produto);
    }

    var statusNfe = 'Rejeitado';
    var numeroProtocolo = '';
    if (protNFe) {
      var infProt2 = findChild_(protNFe, 'infProt');
      if (infProt2) {
        var cStat = elemText_(infProt2, 'cStat');
        if (cStat === '100') statusNfe = 'Autorizado';
        numeroProtocolo = elemText_(infProt2, 'nProt');
      }
    }

    return {
      numeroNf: numeroNf,
      chaveNf: chaveNf,
      dataEmissao: dataEmissao,
      emitenteCnpj: emitenteCnpj,
      emitenteNome: emitenteNome,
      emitenteIe: emitenteIe,
      emitenteEndereco: emitenteEndereco,
      destinatarioCnpj: destinatarioCnpj,
      destinatarioNome: destinatarioNome,
      destinatarioIe: destinatarioIe,
      destinatarioEndereco: destinatarioEndereco,
      valorTotal: valorTotal,
      valorDesconto: valorDesconto,
      valorFrete: valorFrete,
      valorIcms: valorIcms,
      valorPis: valorPis,
      valorCofins: valorCofins,
      valorIbs: valorIbs,
      valorCbs: valorCbs,
      produtosJson: JSON.stringify(produtos),
      statusNfe: statusNfe,
      numeroProtocolo: numeroProtocolo,
      tipoArquivo: 'xml',
      nomeArquivoOrigem: ''
    };
  }

  // ─── parsePdf ───────────────────────────────────────────────────────
  function parsePdf(params) {
    var pdfContent = params.pdfContent;
    if (!pdfContent || pdfContent.trim().length === 0) {
      return { error: 'PDF without OCR' };
    }

    var numeroNf = extractField_(pdfContent, [
      /N[°º]\s*(\d{1,9})/i,
      /NF-e\s*n[°º]?\s*(\d{1,9})/i,
      /NUMERO\s*(\d{1,9})/i,
      /nNF[^0-9]*(\d{1,9})/i
    ]);

    if (!numeroNf) {
      return { error: 'Unable to extract number' };
    }

    var emitenteNome = extractField_(pdfContent, [
      /RAZAO\s*SOCIAL[:\s]*([^\n]+)/i,
      /EMITENTE[:\s]*([^\n]+)/i,
      /NOME\s*DO\s*EMITENTE[:\s]*([^\n]+)/i,
      /FORNECEDOR[:\s]*([^\n]+)/i
    ]);

    var valorTotal = extractField_(pdfContent, [
      /VALOR\s*TOTAL[:\s]*R?\$?\s*([\d.,]+)/i,
      /VLR\s*TOTAL[:\s]*R?\$?\s*([\d.,]+)/i,
      /vNF[:\s]*([\d.,]+)/i
    ]);

    if (valorTotal) {
      valorTotal = parseNumBR_(valorTotal);
    }

    var dataEmissao = extractField_(pdfContent, [
      /DATA\s*DE\s*EMISSAO[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
      /EMISSAO[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
      /(\d{2}\/\d{2}\/\d{4})/
    ]);

    return {
      numeroNf: numeroNf,
      chaveNf: '',
      dataEmissao: dataEmissao || '',
      emitenteCnpj: '',
      emitenteNome: emitenteNome || '',
      emitenteIe: '',
      emitenteEndereco: '',
      destinatarioCnpj: '',
      destinatarioNome: '',
      destinatarioIe: '',
      destinatarioEndereco: '',
      valorTotal: valorTotal || 0,
      valorDesconto: 0,
      valorFrete: 0,
      valorIcms: 0,
      valorPis: 0,
      valorCofins: 0,
      valorIbs: 0,
      valorCbs: 0,
      produtosJson: '[]',
      statusNfe: '',
      numeroProtocolo: '',
      tipoArquivo: 'pdf',
      nomeArquivoOrigem: ''
    };
  }

  // ─── deduplicateEntries ─────────────────────────────────────────────
  function deduplicateEntries(params) {
    var entries = params.entries || [];
    var xmlNumeroNfs = [];
    var result = [];

    for (var i = 0; i < entries.length; i++) {
      if (entries[i].tipoArquivo === 'xml') {
        xmlNumeroNfs.push(String(entries[i].numeroNf));
      }
    }

    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      var numNf = String(entry.numeroNf);

      if (entry.tipoArquivo === 'pdf' && xmlNumeroNfs.indexOf(numNf) !== -1) {
        entry._duplicate = true;
      } else {
        entry._duplicate = false;
      }

      result.push(entry);
    }

    return result;
  }

  // ─── getRecent ──────────────────────────────────────────────────────
  function getRecent(params) {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { data: [], sheetIdConfigured: false };
    }
    var limit = params.limit || 20;

    try {
      var rows = NFeEntradaRepository.getRecentNfes(sheetId, limit);
      trace_('getRecent:ok', 'getRecent retornou ' + rows.length + ' linha(s)', {
        sheetId: String(sheetId),
        limit: limit,
        rows: rows.length
      });
      return { data: rows, sheetIdConfigured: true };
    } catch (e) {
      traceError_('getRecent:error', 'Falha ao ler NFE_ENTRADA', {
        sheetId: String(sheetId),
        error: e.message || String(e)
      });
      return { error: 'Falha ao ler a aba NFE_ENTRADA: ' + (e.message || String(e)), data: [] };
    }
  }

  // ─── Helpers (privados) ─────────────────────────────────────────────
  function findChild_(element, name) {
    if (!element) return null;
    var children = element.getChildren();
    for (var i = 0; i < children.length; i++) {
      if (children[i].getName() === name) return children[i];
    }
    return null;
  }

  function findChildRecursive_(element, name) {
    if (!element) return null;
    var found = findChild_(element, name);
    if (found) return found;
    var children = element.getChildren();
    for (var i = 0; i < children.length; i++) {
      found = findChildRecursive_(children[i], name);
      if (found) return found;
    }
    return null;
  }

  function elemText_(element, tagName) {
    if (!element) return '';
    var child = findChild_(element, tagName);
    if (!child) return '';
    var text = child.getText();
    if (text) return text.trim();
    var content = child.getContent(0);
    if (content && content.getText) return content.getText().trim();
    return '';
  }

  function buildAddress_(enderElement) {
    var parts = [];
    var xLgr = elemText_(enderElement, 'xLgr');
    var nro = elemText_(enderElement, 'nro');
    var xBairro = elemText_(enderElement, 'xBairro');
    var cMun = elemText_(enderElement, 'cMun');
    var xMun = elemText_(enderElement, 'xMun');
    var uf = elemText_(enderElement, 'UF');

    if (xLgr) parts.push(xLgr);
    if (nro) parts.push(nro);
    if (xBairro) parts.push(xBairro);
    if (xMun) parts.push(xMun);
    if (uf) parts.push(uf);

    return parts.join(', ');
  }

  function parseNum_(value) {
    if (!value) return 0;
    var num = parseFloat(value);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }

  function parseNumBR_(value) {
    if (!value) return 0;
    var cleaned = value.replace(/\./g, '').replace(',', '.');
    var num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }

  function formatDateBR_(dateStr) {
    if (!dateStr) return '';
    try {
      var date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      var dd = String(date.getDate()).padStart(2, '0');
      var mm = String(date.getMonth() + 1).padStart(2, '0');
      var yyyy = date.getFullYear();
      return dd + '/' + mm + '/' + yyyy;
    } catch (e) {
      return dateStr;
    }
  }

  function extractField_(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i]);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  return {
    describe: describe,
    syncAndUpdateSheets: syncAndUpdateSheets,
    syncFromDrive: syncFromDrive,
    parseXml: parseXml,
    parsePdf: parsePdf,
    deduplicateEntries: deduplicateEntries,
    getRecent: getRecent
  };
})();

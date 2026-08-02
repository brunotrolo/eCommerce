/**
 * NFeEntradaService — sincroniza XMLs e PDFs de NF-e de uma pasta do
 * Google Drive para a aba NFE_ENTRADA do Google Sheets, com deduplicação
 * por numero_nf (XML tem prioridade sobre PDF).
 *
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

  // ─── syncAndUpdateSheets ────────────────────────────────────────────
  function syncAndUpdateSheets(params) {
    var result = syncFromDrive(params);
    if (result.error) return result;
    if (result.inserted === 0) return result;

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || sheetId.error) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured' };
    }

    var existing = NFeEntradaRepository.getExistingNumeroNf(sheetId);
    var toInsert = [];
    for (var i = 0; i < result._parsedEntries.length; i++) {
      var entry = result._parsedEntries[i];
      if (existing.indexOf(String(entry.numeroNf)) === -1) {
        toInsert.push(entry);
        existing.push(String(entry.numeroNf));
      }
    }

    if (toInsert.length > 0) {
      NFeEntradaRepository.insertNfes(toInsert, sheetId);
    }

    delete result._parsedEntries;
    result.inserted = toInsert.length;
    result.duplicated = result.total - toInsert.length - (result.errors ? result.errors.length : 0);
    result.timestamp = new Date().toISOString();
    result.success = true;
    return result;
  }

  // ─── syncFromDrive ──────────────────────────────────────────────────
  function syncFromDrive(params) {
    var files = DriveAdapter.readDriveFolder(params.driveFolder);

    if (files.length === 1 && files[0].error) {
      return { error: files[0].error };
    }

    var xmlEntries = [];
    var pdfEntries = [];
    var errors = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.error) {
        errors.push({ file: file.name || 'unknown', reason: file.error });
        continue;
      }

      var isXml = file.name && file.name.toLowerCase().endsWith('.xml');
      var isPdf = file.name && file.name.toLowerCase().endsWith('.pdf');

      if (isXml) {
        var parsed = parseXml({ xmlContent: file.content });
        if (parsed.error) {
          errors.push({ file: file.name, reason: parsed.error });
        } else {
          parsed.nomeArquivoOrigem = file.name;
          parsed.tipoArquivo = 'xml';
          xmlEntries.push(parsed);
        }
      } else if (isPdf) {
        var parsedPdf = parsePdf({ pdfContent: file.content });
        if (parsedPdf.error) {
          errors.push({ file: file.name, reason: parsedPdf.error });
        } else {
          parsedPdf.nomeArquivoOrigem = file.name;
          parsedPdf.tipoArquivo = 'pdf';
          pdfEntries.push(parsedPdf);
        }
      }
    }

    var allEntries = xmlEntries.concat(pdfEntries);
    var deduped = deduplicateEntries({ entries: allEntries });

    var insertedCount = 0;
    var duplicatedCount = 0;
    for (var j = 0; j < deduped.length; j++) {
      if (deduped[j]._duplicate) {
        duplicatedCount++;
      } else {
        insertedCount++;
      }
    }

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
      var dhRecbto = elemText_(ide, 'dhRecbto');
      if (!dhRecbto) dhRecbto = elemText_(ide, 'dEmi');
      if (dhRecbto) dataEmissao = formatDateBR_(dhRecbto);
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

  // ─── getRecent ──────────────────────────────────────────────────────
  function getRecent(params) {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { data: [] };
    }
    var limit = params.limit || 20;
    var rows = NFeEntradaRepository.getRecentNfes(sheetId, limit);
    return { data: rows };
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

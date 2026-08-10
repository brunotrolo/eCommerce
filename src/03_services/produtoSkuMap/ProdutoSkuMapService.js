/**
 * ProdutoSkuMapService — ferramenta de pareamento entre anúncios da Shopee
 * (ANUNCIOS_SHOPEE) e produtos do estoque (ESTOQUE), usando o campo nativo
 * item_sku da Shopee como chave (sem tabela de mapeamento interna — a aba é
 * somente-leitura, reescrita pelo sync a partir do item_sku real).
 *
 * Sugere candidatos por similaridade de texto (lógica pura exportada para
 * smoke tests) e devolve a lista de produtos para busca manual na UI. A
 * escrita em si é feita por AnunciosShopeeService.updateSku (que grava na
 * Shopee e confirma por releitura).
 *
 * Spec: specs/produto-anuncio-map.md
 */
var ProdutoSkuMapService = (function () {
  // Palavras de baixo sinal no contexto de perfumes/beleza — removidas antes
  // da comparação de tokens (contra título de marketing x descrição de estoque).
  var STOPWORDS_ = {
    'perfume': true, 'perfumes': true, 'original': true, 'originais': true,
    'eau': true, 'de': true, 'parfum': true, 'toilette': true, 'ml': true,
    'edp': true, 'feminino': true, 'masculino': true, 'unissex': true,
    'arabe': true, 'arabes': true, 'arabia': true, 'academy': true,
    'lacrado': true, 'com': true, 'para': true, 'uso': true, 'un': true,
    'unid': true, '100': true, '50': true, '100ml': true, '50ml': true,
    '30ml': true, '90ml': true, '150ml': true, '200ml': true
  };

  function describe() {
    return {
      name: 'produtoSkuMap',
      actions: {
        getSugestoes: {
          description: 'Lista anúncios Shopee com SKU vazio (não pareados) e sugere até 3 candidatos de CODIGO_PRODUTO por similaridade de texto contra ESTOQUE. Devolve também a lista de produtos para busca manual.',
          params: {},
          returns: {
            pendentes: 'array',
            produtos: 'array',
            total: 'number'
          }
        }
      }
    };
  }

  // ─── lógica pura de similaridade (exportada para smoke tests) ─────
  function normalizarTexto(texto) {
    var t = String(texto || '').toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var partes = t.split(/[^a-z0-9]+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i];
      if (STOPWORDS_[p]) continue;
      if (out.indexOf(p) === -1) out.push(p);
    }
    return out;
  }

  function scoreSimilaridade(titulo, descricao) {
    var a = normalizarTexto(titulo);
    var b = normalizarTexto(descricao);
    if (a.length === 0 || b.length === 0) return 0;
    var menor = a.length <= b.length ? a : b;
    var maior = a.length <= b.length ? b : a;
    var encontrados = 0;
    for (var i = 0; i < menor.length; i++) {
      if (maior.indexOf(menor[i]) !== -1) encontrados++;
    }
    return Math.round((encontrados * 100) / menor.length);
  }

  // ─── leitura das abas ──────────────────────────────────────────────
  function getSugestoes() {
    var sheetId = ConfigService.getSheetId();

    var anuncios = AnunciosShopeeRepository.getAll(sheetId) || [];
    var estoqueRows = EstoqueRepository.getRows(sheetId) || [];

    var produtos = [];
    var jaVistos = {};
    for (var e = 0; e < estoqueRows.length; e++) {
      var codigo = String(estoqueRows[e].CODIGO_PRODUTO || '').trim();
      var descricao = String(estoqueRows[e].DESCRICAO_PRODUTO || '').trim();
      if (!codigo || !descricao || jaVistos[codigo]) continue;
      jaVistos[codigo] = true;
      produtos.push({ codigoProduto: codigo, descricaoProduto: descricao });
    }

    var pendentes = [];
    for (var i = 0; i < anuncios.length; i++) {
      var a = anuncios[i];
      if (String(a.SKU || '').trim()) continue;
      var nome = String(a.NOME || '').trim();
      if (!nome) continue;
      var candidatos = sugerirCandidatos_(nome, produtos);
      pendentes.push({
        itemId: String(a.ITEM_ID || '').trim(),
        nomeAnuncio: nome,
        imagemUrl: String(a.IMAGEM_URL || '').trim(),
        candidatos: candidatos
      });
    }

    return { pendentes: pendentes, produtos: produtos, total: pendentes.length };
  }

  function sugerirCandidatos_(nomeAnuncio, produtos) {
    var comScore = [];
    for (var i = 0; i < produtos.length; i++) {
      var score = scoreSimilaridade(nomeAnuncio, produtos[i].descricaoProduto);
      if (score <= 0) continue;
      comScore.push({
        codigoProduto: produtos[i].codigoProduto,
        descricaoProduto: produtos[i].descricaoProduto,
        score: score
      });
    }
    comScore.sort(function (x, y) { return y.score - x.score; });
    return comScore.slice(0, 3);
  }

  return {
    describe: describe,
    getSugestoes: getSugestoes,
    // lógica pura exposta para smoke tests (99_Main.js)
    normalizarTexto: normalizarTexto,
    scoreSimilaridade: scoreSimilaridade
  };
})();
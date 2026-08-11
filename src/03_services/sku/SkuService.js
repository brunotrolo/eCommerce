var SkuService = (function () {
  var SHEETS = {
    NFE: 'NFE_ENTRADA_PRODUTOS',
    MANUAL_ENTRADA: 'MANUAL_ENTRADA_PRODUTOS',
    MANUAL_SAIDA: 'MANUAL_SAIDA_PRODUTOS',
    ESTOQUE: 'ESTOQUE'
  };

  var CATEGORY_KEYWORDS = {
    PERF: ['PERFUME', 'EAU DE', 'EDT', 'EDP', 'COLÔNIA', 'COLONIA', 'FRAGRÂNCIA', 'FRAGRANCIA'],
    UTI: ['MOP', 'VASSOURA', 'BALDE', 'SACOLA', 'KIT', 'ESCOVA', 'ESPANADOR', 'RODO'],
    COZ: ['POTE', 'PANELA', 'COPO', 'COLHER', 'TAÇA', 'TACA', 'FRIGIDEIRA', 'FORMA'],
    LIM: ['DETERGENTE', 'DESINFETANTE', 'SABÃO', 'SABAO', 'ÁGUA', 'AGUA SANITÁRIA'],
    DEC: ['QUADRO', 'VASO', 'LUMINÁRIA', 'LUMINARIA', 'DECORAÇÃO', 'DECORACAO', 'PORTA RETRATO']
  };

  var CATEGORY_LABELS = {
    PERF: 'PERFUME',
    UTI: 'UTILIDADE DOMÉSTICA',
    COZ: 'COZINHA',
    LIM: 'LIMPEZA',
    DEC: 'DECORAÇÃO'
  };

  function getCategoryLabel(prefix) {
    var p = String(prefix || '').trim().toUpperCase();
    return CATEGORY_LABELS[p] || p || '';
  }

  var _categoriaPorProduto_ = null;

  /**
   * Monta o mapa CODIGO_PRODUTO/SKU → CATEGORIA a partir da aba ESTOQUE
   * (fonte de verdade real da categoria, coluna CATEGORIA).
   */
  function buildCategoriaMap_() {
    try {
      var rows = SheetsRepository.getRows(SHEETS.ESTOQUE);
      var map = {};
      for (var i = 0; i < rows.length; i++) {
        var cod = String(rows[i].CODIGO_PRODUTO || '').trim();
        var sku = String(rows[i].SKU || '').trim();
        var cat = String(rows[i].CATEGORIA || '').trim();
        if (!cat) continue;
        if (cod && !map['C:' + cod]) map['C:' + cod] = cat;
        if (sku && !map['S:' + sku]) map['S:' + sku] = cat;
      }
      return map;
    } catch (e) {
      return {};
    }
  }

  /**
   * Categoria do produto: lookup na aba ESTOQUE (por CODIGO_PRODUTO e depois
   * por SKU); se não encontrado, cai no rótulo do prefixo do SKU.
   */
  function getCategoryByCodigo(codigoProduto, sku) {
    if (!_categoriaPorProduto_) _categoriaPorProduto_ = buildCategoriaMap_();
    if (codigoProduto) {
      var c = _categoriaPorProduto_['C:' + String(codigoProduto).trim()];
      if (c) return c;
    }
    if (sku) {
      var s = _categoriaPorProduto_['S:' + String(sku).trim()];
      if (s) return s;
    }
    var label = getCategoryLabel(sku ? String(sku).split('-')[0] : '');
    if (label === String(sku ? String(sku).split('-')[0] : '').toUpperCase()) return '';
    return label;
  }

  var BRAND_MAP = {
    'LATTAFA': 'LAT',
    'MAISON ALHAMBRA': 'MAL',
    'ARMAF': 'ARM',
    'ASAAF': 'ASA',
    'AL WATANIAH': 'ALW',
    'RAYHAAN': 'RAY',
    'NOCTURNO': 'NOC',
    'SALVO': 'SAL',
    'AMEERAT': 'AME',
    'DELILAH': 'DEL',
    'YARA': 'YAR',
    'ASAD': 'ASD',
    'ZEIN': 'ZEI',
    'ART HOUSE': 'ARH',
    'GARNIER': 'GAR',
    'LA ROCHE': 'LAR'
  };

  function describe() {
    return {
      name: 'sku',
      actions: {
        generate: {
          description: 'Gera um SKU único para um produto',
          params: {
            descricaoProduto: { type: 'string', required: true, description: 'Descrição do produto' },
            ncm: { type: 'string', required: false, description: 'Código NCM' },
            categoria: { type: 'string', required: false, description: 'Forçar categoria específica' },
            marca: { type: 'string', required: false, description: 'Forçar marca específica' }
          },
          returns: { sku: 'string' }
        },
        resolve: {
          description: 'Detecta categoria e marca a partir de dados do produto',
          params: {
            description: { type: 'string', required: true, description: 'Descrição do produto' },
            ncm: { type: 'string', required: false, description: 'Código NCM' }
          },
          returns: { category: 'string', brand: 'string' }
        },
        batchGenerate: {
          description: 'Gera SKUs para múltiplos produtos',
          params: {
            items: { type: 'array', required: true, description: 'Array de { descricaoProduto, ncm?, categoria?, marca? }' }
          },
          returns: { skus: 'array' }
        },
        getAllExisting: {
          description: 'Retorna todos os SKUs já utilizados',
          params: {},
          returns: { skus: 'array' }
        }
      }
    };
  }

  function resolve(description, ncm) {
    var desc = (description || '').toUpperCase().trim();
    var category = detectCategory_(desc, ncm);
    var brand = detectBrand_(desc);
    return { category: category, brand: brand };
  }

  function generate(params) {
    var desc = (params.descricaoProduto || '').toUpperCase().trim();
    var ncm = params.ncm || '';
    var forcedCategoria = params.categoria ? params.categoria.toUpperCase() : null;
    var forcedMarca = params.marca ? params.marca.toUpperCase() : null;

    var resolved = resolve(desc, ncm);
    var category = forcedCategoria || resolved.category;
    var brand = forcedMarca || resolved.brand;

    var prefix = category + '-' + brand;
    var nextSeq = getNextSequence_(prefix);
    var sku = prefix + '-' + padNumber_(nextSeq, 3);

    return { sku: sku };
  }

  function batchGenerate(params) {
    var items = params.items || [];
    var skus = [];
    for (var i = 0; i < items.length; i++) {
      var result = generate(items[i]);
      skus.push(result.sku);
    }
    return { skus: skus };
  }

  function getAllExisting() {
    return { skus: getAllExistingSkus_() };
  }

  function detectCategory_(desc, ncm) {
    var upper = (desc || '').toUpperCase();

    for (var cat in CATEGORY_KEYWORDS) {
      var keywords = CATEGORY_KEYWORDS[cat];
      for (var i = 0; i < keywords.length; i++) {
        if (upper.indexOf(keywords[i]) !== -1) {
          return cat;
        }
      }
    }

    if (ncm) {
      var ncmStr = String(ncm).replace(/\D/g, '');
      if (ncmStr.indexOf('3303') === 0) return 'PERF';
      if (ncmStr.indexOf('3304') === 0) return 'PERF';
      if (ncmStr.indexOf('3305') === 0) return 'LIM';
      if (ncmStr.indexOf('9603') === 0) return 'UTI';
      if (ncmStr.indexOf('7323') === 0) return 'COZ';
      if (ncmStr.indexOf('6911') === 0) return 'COZ';
      if (ncmStr.indexOf('6912') === 0) return 'COZ';
    }

    return 'OUT';
  }

  function detectBrand_(desc) {
    var upper = (desc || '').toUpperCase().trim();

    for (var fullBrand in BRAND_MAP) {
      if (upper.indexOf(fullBrand) !== -1) {
        return BRAND_MAP[fullBrand];
      }
    }

    var words = upper.split(/\s+/);
    var significantWords = [];
    var skipWords = ['PERFUME', 'PERFUMES', 'EAU', 'DE', 'DU', 'PARFUM', 'TOILETTE',
                     'ORIGINAL', 'MASculino', 'FEMININO', 'UNISSEX', '100ML', '50ML',
                     '30ML', '200ML', '150ML', '75ML', 'ML', 'COM', 'SEM', 'TIPO',
                     'PARA', 'PRO', 'KIT', 'CONJUNTO', 'VALOR', 'R$', 'X1', 'X2',
                     'X3', 'X4', 'X5'];

    for (var i = 0; i < words.length; i++) {
      var w = words[i].replace(/[^A-Z]/g, '');
      if (w.length >= 3 && skipWords.indexOf(w) === -1) {
        significantWords.push(w);
      }
    }

    if (significantWords.length > 0) {
      var firstWord = significantWords[0];
      if (firstWord.length <= 4) return firstWord;
      return firstWord.substring(0, 3);
    }

    return 'GEN';
  }

  function getAllExistingSkus_() {
    var allSkus = [];

    var sheets = [
      SHEETS.NFE,
      SHEETS.MANUAL_ENTRADA,
      SHEETS.MANUAL_SAIDA,
      SHEETS.ESTOQUE
    ];

    for (var s = 0; s < sheets.length; s++) {
      try {
        var rows = SheetsRepository.getRows(sheets[s]);
        for (var i = 0; i < rows.length; i++) {
          var sku = rows[i].SKU || '';
          if (sku && allSkus.indexOf(sku) === -1) {
            allSkus.push(sku);
          }
        }
      } catch (e) {}
    }

    return allSkus;
  }

  function getNextSequence_(prefix) {
    var allSkus = getAllExistingSkus_();
    var maxSeq = 0;
    var prefixDash = prefix + '-';

    for (var i = 0; i < allSkus.length; i++) {
      if (allSkus[i].indexOf(prefixDash) === 0) {
        var seqStr = allSkus[i].substring(prefixDash.length);
        var seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    return maxSeq + 1;
  }

  function padNumber_(num, size) {
    var s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
  }

  return {
    describe: describe,
    generate: generate,
    resolve: resolve,
    batchGenerate: batchGenerate,
    getAllExisting: getAllExisting,
    getCategoryLabel: getCategoryLabel,
    getCategoryByCodigo: getCategoryByCodigo
  };
})();

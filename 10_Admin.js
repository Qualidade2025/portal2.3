/** =========================================================
 * Admin (motivos por fornecedor)
 * ========================================================= */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Admin')
      .addItem('Atualizar motivos por fornecedor', 'atualizarMotivosPorFornecedor_')
      .addToUi();
  } catch(e) {}
}

function atualizarMotivosPorFornecedor_() {
  var ss = SpreadsheetApp.getActive();
  var shDados = ss.getSheetByName('Dados');
  var shCtrl  = ss.getSheetByName('Controle');
  if (!shDados || !shCtrl) throw new Error('Aba "Dados" ou "Controle" não encontrada.');
  var cols = _getControleColumnIndices_(shCtrl);

  var fornecedores = listarFornecedores();
  if (!fornecedores.length) throw new Error('Nenhum fornecedor encontrado na aba Dados.');

  var lastRow = shCtrl.getLastRow();
  var mapa = {};
  if (lastRow >= 2) {
    var fornVals = shCtrl.getRange(2, cols.fornecedor.column, lastRow-1, 1).getValues();
    var descVals = shCtrl.getRange(2, cols.descricaoNc.column, lastRow-1, 1).getValues();
    for (var i=0;i<fornVals.length;i++){
      var forn = String(fornVals[i][0]||'').trim();
      var mot  = String((descVals[i] && descVals[i][0])||'').trim();
      if (!forn || !mot) continue;
      if (!mapa[forn]) mapa[forn] = {};
      mapa[forn][mot] = true;
    }
  }

  var listas = [], maxLen = 0;
  for (var f=0; f<fornecedores.length; f++){
    var nome = fornecedores[f];
    var set = mapa[nome] || {};
    var arr = Object.keys(set).filter(Boolean).sort();
    arr = arr.filter(function(x){ return x.toLowerCase() !== 'outro'; });
    arr.push('Outro');
    listas.push(arr);
    if (arr.length > maxLen) maxLen = arr.length;
  }

  var header = fornecedores.slice(0);
  var matrix = [header];
  for (var r=0; r<maxLen; r++){
    var line = [];
    for (var c=0; c<fornecedores.length; c++){
      line.push(listas[c][r] || '');
    }
    matrix.push(line);
  }

  shDados.getRange(1, MOTIVOS_ANCHOR_COL, 1000, fornecedores.length).clearContent();
  shDados.getRange(1, MOTIVOS_ANCHOR_COL, matrix.length, fornecedores.length).setValues(matrix);
  return { colunasGeradas: fornecedores.length, linhasEscritas: matrix.length };
}
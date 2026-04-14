/** =========================================================
 * Listas (para Criar RNC)
 * ========================================================= */

function listarFornecedores() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
  if (!sh) throw new Error('Aba "Dados" não encontrada.');
  var data = sh.getDataRange().getValues();
  var hdrIdx=-1, cArea=-1, cUsuario=-1, cSenha=-1;
  for (var i=0;i<data.length;i++){
    var row = data[i].map(function(x){ return String(x||'').trim(); });
    cUsuario=row.indexOf('Usuário'); cSenha=row.indexOf('Senha');
    if (cUsuario>=0 && cSenha>=0){ cArea=row.indexOf('Área'); hdrIdx=i; break; }
  }
  if (hdrIdx===-1 || cArea===-1) return [];
  var set = {};
  for (var r=hdrIdx+1; r<data.length; r++){
    var v = String(data[r][cArea]||'').trim(); if (v) set[v]=true;
  }
  return Object.keys(set).sort();
}

function listarMotivos() { // globais (Dados!K2:K)
  var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var vals = sh.getRange(2, 11, lastRow-1, 1).getValues(); // K
  var out = [];
  for (var i=0;i<vals.length;i++){ var v = String(vals[i][0]||'').trim(); if (v) out.push(v); }
  return out;
}

function listarMotivosPorFornecedor(fornecedor) {
  fornecedor = String(fornecedor || '').trim();
  var arr = [];

  if (fornecedor) {
    var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
    if (sh) {
      var lastCol = sh.getLastColumn(), lastRow = Math.max(sh.getLastRow(), 2);
      if (lastCol >= MOTIVOS_ANCHOR_COL) {
        var header = sh.getRange(1, MOTIVOS_ANCHOR_COL, 1, lastCol - MOTIVOS_ANCHOR_COL + 1).getValues()[0];
        var colIndex = -1;
        for (var j=0; j<header.length; j++){
          if (String(header[j]||'').trim() === fornecedor){ colIndex = MOTIVOS_ANCHOR_COL + j; break; }
        }
        if (colIndex !== -1) {
          var colVals = sh.getRange(2, colIndex, lastRow-1, 1).getValues();
          for (var i=0;i<colVals.length;i++){
            var v = String(colVals[i][0]||'').trim();
            if (v) arr.push(v);
          }
        }
      }
    }
  }
  if (arr.length === 0) arr = listarMotivos(); // fallback global

  // dedup + ordena + "Outro"
  var set = {}, out = [];
  for (var i=0;i<arr.length;i++){
    var v = String(arr[i]||'').trim();
    if (!v || v.toLowerCase()==='outro') continue;
    if (!set[v]) { set[v]=true; out.push(v); }
  }
  out.sort();
  out.push('Outro');
  return out;
}

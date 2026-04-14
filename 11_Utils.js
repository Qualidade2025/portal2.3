/** =========================================================
 * Utils (Dados chave/valor + contador)
 * ========================================================= */

function _getKeyOnDados_(key) {
  var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
if (!sh) throw new Error('Aba "Dados" não encontrada.');
  var cell = sh.createTextFinder(key).matchEntireCell(true).findNext();
  if (cell) {
    var row = cell.getRow();
    var col = cell.getColumn();
    var nextCol = col + 1;
    var val = nextCol <= sh.getLastColumn() ? sh.getRange(row, nextCol).getValue() : '';
    return { row: row, col: nextCol, value: val };
  }
  return null;
}

function _setKeyOnDados_(key,value){
  var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
  var info = _getKeyOnDados_(key);
  if (info) sh.getRange(info.row, info.col).setValue(value);
  else sh.appendRow([key,value]);
}

function _nextNumero_(){
  var info=_getKeyOnDados_('ContadorAtual');
  var cur = info && parseInt(info.value,10);
  if (!cur || isNaN(cur)) cur = 2251;
  var next = cur+1; _setKeyOnDados_('ContadorAtual', next); return next;
}

var _cachedLogSheet_ = null;
function _getLogSheet_() {
    if (_cachedLogSheet_ && _cachedLogSheet_.getParent()) return _cachedLogSheet_;

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Log');
  if (!sh) sh = ss.insertSheet('Log');

  _cachedLogSheet_ = sh;
  return sh;
}

function _appendLog_(rnc, setor, etapa, mensagem, dataHora) {
  rnc = String(rnc || '').trim();
  if (!rnc) return;

  var sh = _getLogSheet_();
  var dt = dataHora instanceof Date ? dataHora : new Date();
  var row = [rnc, dt, String(setor || ''), String(etapa || '')];

  if (typeof mensagem !== 'undefined') {
    row.push(String(mensagem || ''));
  }

  sh.appendRow(row);
}

// Mapeamento de colunas da aba "Controle"
var CONTROLE_HEADER_TITLES = {
  rnc: 'ID RNC',
  dataAbertura: 'Data abertura',
  etapa: 'Etapa',
  numeroPv: 'Nº do PV',
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  responsavelFornecimento: 'Resp. Fornecimento',
  descricaoNc: 'Descrição da NC',
  planoAcao: 'Plano de ação',
  responsavelPa: 'Responsável P.A',
  dataResposta: 'Data de resposta',
  prazoPa: 'Prazo P.A.',
  dataConclusao: 'Data de conclusão',
  revisaoEficacia: 'Revisão de eficácia',
  status: 'Status',
  dataValidacaoAbertura: 'Data Validação Abertura',
  dataValidacaoResposta: 'Data Validação Resposta',
  dataValidacaoConclusao: 'Data Validação Conclusão',
  prazoResposta: 'Prazo de resposta',
  statusResposta: 'Status da resposta',
  statusConclusaoPlano: 'Status Conclusão do Plano',
  tipoNc: 'Tipo da NC',
  cor: 'Cor',
  prazoControle: 'Prazo',
  backup: 'Backup',
  motivoCancelamento: 'Motivo Cancelamento'
};

var _controleColumnsCache_ = { signature: null, map: null, sheetId: null };
function _getControleColumnIndices_(sh) {
  if (!sh) throw new Error('Aba "Controle" não encontrada.');

  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var normalized = header.map(function (h) { return String(h || '').trim().toLowerCase(); });
  var signature = normalized.join('|');
  var sheetId = sh.getSheetId && sh.getSheetId();

  if (
    _controleColumnsCache_.map &&
    _controleColumnsCache_.signature === signature &&
    _controleColumnsCache_.sheetId === sheetId
  ) {
    return _controleColumnsCache_.map;
  }

  var map = {};
  Object.keys(CONTROLE_HEADER_TITLES).forEach(function (key) {
    var expected = String(CONTROLE_HEADER_TITLES[key] || '').trim().toLowerCase();
    var idx = normalized.indexOf(expected);
    if (idx === -1) throw new Error('Coluna "' + CONTROLE_HEADER_TITLES[key] + '" não encontrada na aba Controle.');
    map[key] = { index: idx, column: idx + 1 };
  });

  _controleColumnsCache_ = { signature: signature, map: map, sheetId: sheetId };
  return map;
}

// Copia as fórmulas das colunas calculadas para uma nova linha criada na aba Controle
function _copyControleFormulas_(sh, newRow) {
  if (!sh || newRow <= 2) return; // nada para copiar se for a primeira linha de dados

  var sourceRow = newRow - 1;
  var formulaColumns = [6, 11, 14, 17, 20, 21, 22, 23, 24]; // F, K, N, Q, T, U, V, W, X

  formulaColumns.forEach(function (col) {
    var source = sh.getRange(sourceRow, col);
    if (source.getFormula()) {
      source.copyTo(sh.getRange(newRow, col), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    }
  });
}
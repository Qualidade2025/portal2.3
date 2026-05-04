/** =========================================================
 * Ações da Qualidade (Abertura e Resposta)
 * ========================================================= */

function validarAbertura(token, rncId) {
  var sess = _getSession_(token);
  rncId = String(rncId||'').trim();
  if (!rncId) throw new Error('RNC inválida.');

  var sh = SpreadsheetApp.getActive().getSheetByName('Controle');
  if (!sh) throw new Error('Aba "Controle" não encontrada.');
  var vals = sh.getDataRange().getValues();
  var cols = _getControleColumnIndices_(sh);

  var targetRow = -1;
  for (var r=1; r<vals.length; r++){
    var code = String(vals[r][cols.rnc.index]||'').trim();
    if (code === rncId) { targetRow = r+1; break; } // 1-based
  }
  if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

  sh.getRange(targetRow, cols.etapa.column).setValue('Abertura');
  sh.getRange(targetRow, cols.dataValidacaoAbertura.column).setValue(new Date());
  _appendLog_(rncId, (sess && sess.area) ? sess.area : '', 'Abertura validada');
  return { ok:true, row: targetRow, rncId: rncId };
}

function retornarRNC(token, rncId, motivoDevolucao) {
  _getSession_(token);
  rncId = String(rncId||'').trim();
  motivoDevolucao = String(motivoDevolucao||'').trim();
  if (!rncId) throw new Error('RNC inválida.');
  if (!motivoDevolucao) throw new Error('Informe o motivo da devolução.');

  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
  var vals = shCtrl.getDataRange().getValues();
  var cols = _getControleColumnIndices_(shCtrl);

  var cliente = '';
  var targetRow = -1;
  for (var r=1; r<vals.length; r++){
    var code = String(vals[r][cols.rnc.index]||'').trim();
    if (code === rncId) {
      cliente = String(vals[r][cols.cliente.index]||'').trim();
      targetRow = r+1;
      break;
    }
  }
  if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

  // Atualiza status para "Correção abertura"
  shCtrl.getRange(targetRow, cols.etapa.column).setValue('Correção abertura');
  shCtrl.getRange(targetRow, cols.dataValidacaoAbertura.column).setValue(new Date());

  _appendLog_(rncId, cliente, 'Retorno abertura', motivoDevolucao);
  
  return { ok:true, rncId:rncId, destinatario:cliente, etapa:'Correção abertura' };
}

/* ======== NOVO: Validação/Retorno da RESPOSTA ======== */

function validarResposta(token, rncId) {
  var sess = _getSession_(token);
  rncId = String(rncId||'').trim();
  if (!rncId) throw new Error('RNC inválida.');

  var sh = SpreadsheetApp.getActive().getSheetByName('Controle');
  if (!sh) throw new Error('Aba "Controle" não encontrada.');
  var vals = sh.getDataRange().getValues();
  var cols = _getControleColumnIndices_(sh);

  var targetRow = -1;
  for (var r=1; r<vals.length; r++){
    var code = String(vals[r][cols.rnc.index]||'').trim();
    if (code === rncId) { targetRow = r+1; break; }
  }
  if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

  var motivoCancelamento = String(vals[targetRow-1][cols.motivoCancelamento.index] || '').trim();
  var statusFinal = motivoCancelamento ? 'Cancelada' : 'Resposta';

  sh.getRange(targetRow, cols.etapa.column).setValue(statusFinal);
  if (statusFinal === 'Cancelada') {
    sh.getRange(targetRow, cols.descricaoNc.column).clearContent();
  }  
  registrarDataHoraValidacao(sh, targetRow);
  _appendLog_(rncId, (sess && sess.area) ? sess.area : '', motivoCancelamento ? 'Resposta cancelada' : 'Resposta validada');
  return { ok:true, row: targetRow, rncId: rncId, etapa: statusFinal };
}

function retornarResposta(token, rncId, motivoDevolucao) {
  _getSession_(token);
  rncId = String(rncId||'').trim();
  motivoDevolucao = String(motivoDevolucao||'').trim();
  if (!rncId) throw new Error('RNC inválida.');
  if (!motivoDevolucao) throw new Error('Informe o motivo da devolução.');

  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
  var vals = shCtrl.getDataRange().getValues();
  var cols = _getControleColumnIndices_(shCtrl);

  var fornecedor = '';
  var targetRow = -1;
  for (var r=1; r<vals.length; r++){
    var code = String(vals[r][cols.rnc.index]||'').trim();
    if (code === rncId) {
      fornecedor = String(vals[r][cols.fornecedor.index]||'').trim();
      targetRow = r+1;
      break;
    }
  }

  if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

  // Atualiza status para "Correção resposta"
  shCtrl.getRange(targetRow, cols.etapa.column).setValue('Correção resposta');
  shCtrl.getRange(targetRow, cols.motivoCancelamento.column).setValue('');
  registrarDataHoraValidacao(shCtrl, targetRow);

  _appendLog_(rncId, fornecedor, 'Retorno resposta', motivoDevolucao);

  return { ok:true, rncId:rncId, destinatario:fornecedor, etapa:'Correção resposta' };
}

function registrarDataValidacaoAbertura(token, rncId) {
  var sh = _getControleSheet_();
  var last = sh.getLastRow();
  if (last < 2) return 'OK';

  var id = String(rncId || '').trim();
  var idComPrefixo = id.startsWith('RNC ') ? id : ('RNC ' + id);
  var idSemPrefixo  = id.replace(/^RNC\s*/i, '');

  var cols = _getControleColumnIndices_(sh);
  var vals = sh.getRange(2, cols.rnc.column, last - 1, 1).getValues();
  var targetRow = -1;

  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || '').trim();
    if (v === id || v === idComPrefixo || v === idSemPrefixo) {
      targetRow = i + 2; // compensar o offset (começou em 2)
      break;
    }
  }

  if (targetRow < 0) {
    throw new Error('RNC não encontrada na aba "Controle": ' + id);
  }

  sh.getRange(targetRow, cols.dataValidacaoAbertura.column).setValue(new Date());
  return 'OK';
}

/* ================== Helpers locais ================== */

function _getControleSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Controle');
  if (!sh) throw new Error('Aba "Controle" não encontrada.');
  return sh;
}
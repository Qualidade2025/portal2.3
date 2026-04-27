/** =========================================================
 * Validação da Resposta (Qualidade)
 *  - validarResposta(token, rncId)
 *  - retornarResposta(token, rncId, motivo)
 * Dependências: _getSession_(token)
 * Planilhas: "Controle", "Log"
 * ========================================================= */

/**
* Qualidade: valida a resposta enviada pela área responsável.
 * Efeito: Controle!C ← "Resposta"
 */
function validarResposta(token, rncId) {
  _getSession_(token); // valida sessão
  rncId = String(rncId || '').trim();
  if (!rncId) throw new Error('RNC inválida.');

  var sh = SpreadsheetApp.getActive().getSheetByName('Controle');
  if (!sh) throw new Error('Aba "Controle" não encontrada.');
  var vals = sh.getDataRange().getValues();
  var cols = _getControleColumnIndices_(sh);

  var targetRow = -1, cliente = '';
  for (var r = 1; r < vals.length; r++) { // pula cabeçalho
    var code = String(vals[r][cols.rnc.index] || '').trim();
    if (code === rncId) {
      targetRow = r + 1;               // 1-based
      cliente   = String(vals[r][cols.cliente.index]||'').trim();
      break;
    }
  }
  if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');
  // Atualiza status para "Resposta" e data/hora da validação
  sh.getRange(targetRow, cols.etapa.column).setValue('Resposta');
  registrarDataHoraValidacao(sh, targetRow);

  return { ok: true, rncId: rncId, row: targetRow, cliente: cliente };
}

/**
 * Qualidade: retorna a resposta para correção/ajuste.
 * Efeito: Controle!C ← "Correção resposta" e registra mensagem em "Log"
 * Estrutura de "Log" (retorno): A=RNC, B=Data/Hora, C=Destinatário, D=Etapa, E=Mensagem
 */
function retornarResposta(token, rncId, motivo) {
  _getSession_(token); // valida sessão
  rncId = String(rncId || '').trim();
  motivo = String(motivo || '').trim();
  if (!rncId) throw new Error('RNC inválida.');
  if (!motivo) throw new Error('Informe o motivo do retorno.');

  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
  var vals = shCtrl.getDataRange().getValues();
  var cols = _getControleColumnIndices_(shCtrl);

  var targetRow = -1, cliente = '';
  for (var r = 1; r < vals.length; r++) {
    var code = String(vals[r][cols.rnc.index] || '').trim();
    if (code === rncId) {
      targetRow = r + 1;
      cliente   = String(vals[r][cols.cliente.index] || '').trim();
      break;
    }
  }
  if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

  // Atualiza status para "Correção resposta" e data/hora do retorno
  shCtrl.getRange(targetRow, cols.etapa.column).setValue('Correção resposta');
  registrarDataHoraValidacao(shCtrl, targetRow);

  _appendLog_(rncId, cliente, 'Retorno resposta', motivo);

  return { ok: true, rncId: rncId, cliente: cliente };
}

function registrarDataHoraValidacao(sh, row, dataHora) {
  var dt = dataHora instanceof Date ? dataHora : new Date();
  var cols = _getControleColumnIndices_(sh);
  var range = sh.getRange(row, cols.dataValidacaoResposta.column);
  range.setValue(dt);
  range.setNumberFormat('dd/MM/yyyy HH:mm');
}
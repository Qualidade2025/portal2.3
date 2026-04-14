/** =========================================================
 * Conclusão — envio de evidências e validação
 * ========================================================= */

function _findRncRow_(sh, rnc) {
  var cols = _getControleColumnIndices_(sh);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][cols.rnc.index] || '').trim() === String(rnc).trim()) return i;
  }
  return -1;
}

function _appendSuffixBeforeExt_(name, suffix) {
  var dot = name.lastIndexOf('.');
  if (dot <= 0) return name + suffix;
  return name.substring(0, dot) + suffix + name.substring(dot);
}

function registrarDataHoraConclusao(sh, row, dataHora) {
  var dt = dataHora instanceof Date ? dataHora : new Date();
  var cols = _getControleColumnIndices_(sh);
  var range = sh.getRange(row, cols.dataConclusao.column);
  range.setValue(dt);
  range.setNumberFormat('dd/MM/yyyy HH:mm');
}

function registrarDataHoraValidacaoConclusao(sh, row, dataHora) {
  var dt = dataHora instanceof Date ? dataHora : new Date();
  var cols = _getControleColumnIndices_(sh);
  var range = sh.getRange(row, cols.dataValidacaoConclusao.column);
  range.setValue(dt);
  range.setNumberFormat('dd/MM/yyyy HH:mm');
}

function concluirRNC_EnviarEvidencias(token, rnc, anexos, acoesConcluidas) {
  try {
    var sess = _getSession_(token);
    if (!rnc) throw new Error('RNC não informada.');
    var temAnexos = Array.isArray(anexos) && anexos.length > 0;

  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
  var cols = _getControleColumnIndices_(shCtrl);

  var rowIndex = _findRncRow_(shCtrl, rnc);
  if (rowIndex < 0) throw new Error('RNC não localizada no Controle: ' + rnc);
  var prevStatus = String(shCtrl.getRange(rowIndex + 1, cols.etapa.column).getValue() || '').trim();

    var found = _findRncFile_(rnc, '', '');
    var folder = found && (found.rncFolder || found.monthFolder) ? (found.rncFolder || found.monthFolder) : null;
    if (!folder) throw new Error('Pasta/JSON da RNC não encontrado no Drive.');
    var rawObj = {};
    try { rawObj = JSON.parse(found.file.getBlob().getDataAsString()); } catch (_) { rawObj = {}; }
    var solucoes = Array.isArray(rawObj && rawObj.resposta && rawObj.resposta.solucoes) ? rawObj.resposta.solucoes : [];
    var totalSolucoes = solucoes.length;
    function parseIndices(list){
      var set = {};
      (Array.isArray(list) ? list : []).forEach(function(v){
        var n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0 && (typeof totalSolucoes !== 'number' || n < totalSolucoes)) set[n] = true;
      });
      return Object.keys(set).map(function(k){ return parseInt(k, 10); }).filter(function(n){ return !isNaN(n); }).sort(function(a,b){ return a-b; });
    }

    var anexosExistentes = _listarAnexosDaRnc_(found.rncFolder, rnc, found.monthFolder).filter(function(a){
      return String(a && a.name || '').toLowerCase().indexOf(' - conc') >= 0;
    });
    if (!temAnexos && !anexosExistentes.length) {
      throw new Error('Anexe ao menos um arquivo de evidência para concluir a RNC.');
    }

    // Salva anexos de conclusão com sufixo " - conc"
  var resConc = _saveConclusionAttachmentsToSpecificFolder_(folder, rnc, anexos);
  var saved = temAnexos ? (resConc.items || []) : anexosExistentes;

  // Status -> "Validação conclusão"
  shCtrl.getRange(rowIndex + 1, cols.etapa.column).setValue('Validação conclusão');
  registrarDataHoraConclusao(shCtrl, rowIndex + 1);

    var validacaoConc = rawObj.validacaoConclusao || {};
    validacaoConc.acoesValidadas = parseIndices(validacaoConc.acoesValidadas);
    var concluidasSelecionadas = (Array.isArray(acoesConcluidas) && acoesConcluidas.length)
      ? parseIndices(acoesConcluidas)
      : parseIndices(validacaoConc.acoesConcluidas);
    validacaoConc.acoesConcluidas = concluidasSelecionadas;
    validacaoConc.retornoConclusao = concluidasSelecionadas.length ? '' : (validacaoConc.retornoConclusao || '');
    validacaoConc.ultimaConclusaoIso = new Date().toISOString();
    rawObj.validacaoConclusao = validacaoConc;
    found.file.setContent(JSON.stringify(rawObj, null, 2));

    var etapaLog = prevStatus === 'Correção conclusão' ? 'Conclusão corrigida' : 'Conclusão RNC';
    _appendLog_(rnc, (sess && sess.area) ? sess.area : '', etapaLog);

    return { ok: true, anexos: saved, monthFolderUrl: folder.getUrl() };
  } catch (e) {
    throw new Error('Concluir RNC: ' + String(e && e.message ? e.message : e));
  }
}

function validarConclusao(token, rnc, acoesValidadas, mensagemRetorno) {
  try {
    var sess = _getSession_(token);
    var ss = SpreadsheetApp.getActive();
    var shCtrl = ss.getSheetByName('Controle');
    if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
    var cols = _getControleColumnIndices_(shCtrl);

    var rowIndex = _findRncRow_(shCtrl, rnc);
    if (rowIndex < 0) throw new Error('RNC não localizada: ' + rnc);

    var found = _findRncFile_(rnc, '', '');
    if (!found || !found.file) throw new Error('Arquivo JSON da RNC não encontrado para validação de conclusão.');

    var raw = found.file.getBlob().getDataAsString();
    var obj = {};
    try { obj = JSON.parse(raw); } catch (_) { obj = {}; }

    var resposta = obj.resposta || {};
    var solucoes = Array.isArray(resposta.solucoes) ? resposta.solucoes : [];
    var validacaoConc = obj.validacaoConclusao || {};

    function parseIndicesToSet(list){
      var set = {};
      (Array.isArray(list) ? list : []).forEach(function (idx) {
        var n = parseInt(idx, 10);
        if (!isNaN(n) && n >= 0 && n < solucoes.length) set[n] = true;
      });
      return set;
    }

    var validadasSet = parseIndicesToSet(validacaoConc.acoesValidadas);
    var concluidasSet = parseIndicesToSet(validacaoConc.acoesConcluidas);
    var novasSelecoes = parseIndicesToSet(acoesValidadas);
    Object.keys(novasSelecoes).forEach(function (k) { validadasSet[k] = true; });

    var totalValidadas = Object.keys(validadasSet).length;
    var baseValidacao = Object.keys(concluidasSet);
    if (baseValidacao.length > 1 && totalValidadas === 0) {
      throw new Error('Selecione ao menos uma ação para validar.');
    }
    if (!baseValidacao.length && solucoes.length > 1 && totalValidadas === 0) {
      throw new Error('Selecione ao menos uma ação para validar.');
    }

    function parsePrazo(str) {
      var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str || '');
      if (!m) return null;
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var y = parseInt(m[3], 10);
      var dt = new Date(y, mo, d);
      return (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) ? dt : null;
    }

    var pendentes = [];
    solucoes.forEach(function (s, idx) {
      if (validadasSet[idx]) return;
      var prazo = parsePrazo(s && s.prazo);
      pendentes.push({ indice: idx, solucao: s, prazo: prazo });
    });

    pendentes.sort(function (a, b) {
      if (a.prazo && b.prazo) return a.prazo.getTime() - b.prazo.getTime();
      if (a.prazo && !b.prazo) return -1;
      if (!a.prazo && b.prazo) return 1;
      return a.indice - b.indice;
    });

    var concluidasPendentes = Object.keys(concluidasSet).map(function(k){ return parseInt(k, 10); }).filter(function(n){ return !isNaN(n) && !validadasSet[n]; });
    concluidasPendentes.sort(function(a, b){ return a - b; });
    var retornoTexto = String(mensagemRetorno || '').trim();

    var etapaFinal = (solucoes.length > 1 && pendentes.length) ? 'Aguardando conclusão' : 'Conclusão';
    var proximoPlano = pendentes.length ? pendentes[0] : null;

    if (proximoPlano) {
      shCtrl.getRange(rowIndex + 1, cols.planoAcao.column).setValue(proximoPlano.solucao && proximoPlano.solucao.acao ? proximoPlano.solucao.acao : '');
      shCtrl.getRange(rowIndex + 1, cols.responsavelPa.column).setValue(proximoPlano.solucao && proximoPlano.solucao.responsavel ? proximoPlano.solucao.responsavel : '');
      shCtrl.getRange(rowIndex + 1, cols.prazoPa.column).setValue(proximoPlano.prazo || (proximoPlano.solucao ? proximoPlano.solucao.prazo : ''));
    } else {
      // Mantido comentado para preservar o último plano/responsável/prazo ao concluir a RNC.
      // shCtrl.getRange(rowIndex + 1, cols.planoAcao.column).setValue('');
      // shCtrl.getRange(rowIndex + 1, cols.responsavelPa.column).setValue('');
      // shCtrl.getRange(rowIndex + 1, cols.prazoPa.column).setValue('');
    }

    shCtrl.getRange(rowIndex + 1, cols.etapa.column).setValue(etapaFinal);

    var dataValidacao = new Date();
    registrarDataHoraValidacao(shCtrl, rowIndex + 1, dataValidacao);
    registrarDataHoraValidacaoConclusao(shCtrl, rowIndex + 1, dataValidacao);

    if (pendentes.length && retornoTexto){
      var rowValues = shCtrl.getRange(rowIndex + 1, 1, 1, shCtrl.getLastColumn()).getValues();
      var fornecedor = rowValues && rowValues[0] ? String(rowValues[0][cols.fornecedor.index] || '').trim() : '';
      _appendLog_(rnc, fornecedor, 'Retorno conclusão', retornoTexto, dataValidacao);
    }

    var retornoConclusao = pendentes.length ? (retornoTexto || String(validacaoConc.retornoConclusao || '')) : '';
    var novasValidadas = Object.keys(validadasSet).map(function (k) { return parseInt(k, 10); }).filter(function (n) { return !isNaN(n); }).sort(function (a, b) { return a - b; });
    obj.validacaoConclusao = {
      acoesValidadas: novasValidadas,
      acoesConcluidas: concluidasPendentes,
      ultimaConclusaoIso: validacaoConc.ultimaConclusaoIso || '',
      ultimaValidacaoIso: dataValidacao.toISOString(),
      retornoConclusao: retornoConclusao
    };

    found.file.setContent(JSON.stringify(obj, null, 2));

    var etapaLog = etapaFinal === 'Conclusão' ? 'Conclusão validada' : 'Conclusão validada (parcial)';
    _appendLog_(rnc, (sess && sess.area) ? sess.area : '', etapaLog);

    return { ok: true, etapa: etapaFinal };
  } catch (e) {
    throw new Error('Validação conclusão: ' + String(e && e.message ? e.message : e));
  }
}

function retornarConclusao(token, rnc, motivo) {
  try {
    var sess = _getSession_(token);
    if (!motivo) throw new Error('Informe o motivo do retorno da conclusão.');

  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
  var cols = _getControleColumnIndices_(shCtrl);

  var rowIndex = _findRncRow_(shCtrl, rnc);
  if (rowIndex < 0) throw new Error('RNC não localizada: ' + rnc);

  shCtrl.getRange(rowIndex + 1, cols.etapa.column).setValue('Correção conclusão');
  registrarDataHoraValidacaoConclusao(shCtrl, rowIndex + 1);

  var rowValues = shCtrl.getRange(rowIndex + 1, 1, 1, shCtrl.getLastColumn()).getValues();
  var fornecedor = rowValues && rowValues[0] ? String(rowValues[0][cols.fornecedor.index] || '').trim() : '';
    _appendLog_(rnc, fornecedor, 'Retorno conclusão', String(motivo));

    return { ok: true };
  } catch (e) {
    throw new Error('Retornar conclusão: ' + String(e && e.message ? e.message : e));
  }
}
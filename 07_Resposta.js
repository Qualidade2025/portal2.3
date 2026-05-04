/** =========================================================
* Responder (área responsável)
 * ========================================================= */

function responderRNC_Salvar(token, rncId, respostaObj, anexosConclusao, validarConclusao) {
  try {
    var sess = _getSession_(token);
    rncId = String(rncId||'').trim();
    if (!rncId) throw new Error('RNC inválida.');

    var temAnexoConclusao = Array.isArray(anexosConclusao) && anexosConclusao.length > 0;
    var deveValidarConclusao = !!(respostaObj && respostaObj.validarConclusao && temAnexoConclusao);
    if (!deveValidarConclusao && validarConclusao === true && temAnexoConclusao) deveValidarConclusao = true;


    // validações mínimas
    var pq1 = String((respostaObj && respostaObj.pq1) || '').trim();
    var pq2 = String((respostaObj && respostaObj.pq2) || '').trim();
    var pq3 = String((respostaObj && respostaObj.pq3) || '').trim();
    if (pq1.length < 10) throw new Error('O 1º Porquê deve ter ao menos 10 caracteres.');
    if (pq2.length < 10) throw new Error('O 2º Porquê deve ter ao menos 10 caracteres.');
    if (pq3.length < 10) throw new Error('O 3º Porquê deve ter ao menos 10 caracteres.');

    var ss = SpreadsheetApp.getActive();
    var shCtrl = ss.getSheetByName('Controle');
    if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
    var vals = shCtrl.getDataRange().getValues();
    var cols = _getControleColumnIndices_(shCtrl);

    var targetRow = -1;
    for (var r=1; r<vals.length; r++){
      var code = String(vals[r][cols.rnc.index]||'').trim();
      if (code === rncId) { targetRow = r+1; break; }
    }
    if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

    var prevStatus = String(vals[targetRow-1] && vals[targetRow-1][cols.etapa.index] || '').trim();

    // Atualiza Controle com status de validação e data de resposta
    var dataResposta = new Date();
    shCtrl.getRange(targetRow, cols.dataResposta.column).setValue(dataResposta);
    shCtrl.getRange(targetRow, cols.etapa.column).setValue(deveValidarConclusao ? 'Validação conclusão' : 'Validação resposta');

    if (deveValidarConclusao) {
      registrarDataHoraConclusao(shCtrl, targetRow, dataResposta); // M
    }

    var etapaLog = deveValidarConclusao ? 'Conclusão RNC' : 'Resposta RNC';
    if (prevStatus === 'Correção resposta' && !deveValidarConclusao) etapaLog = 'Resposta corrigida';
    if (prevStatus === 'Correção conclusão' && deveValidarConclusao) etapaLog = 'Conclusão corrigida';
    _appendLog_(rncId, (sess && sess.area) ? sess.area : '', etapaLog, undefined, dataResposta);

    // Atualiza JSON com bloco "resposta"
    var found = _findRncFile_(rncId, '', '');
    if (!found || !found.file) throw new Error('Arquivo JSON da RNC não localizado para salvar resposta.');
    var txt = found.file.getBlob().getDataAsString();
    var obj = {};
    try { obj = JSON.parse(txt); } catch(e){ obj = {}; }

    function parsePrazo(str){
      var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str || '');
      if (!m) return null;
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var y = parseInt(m[3], 10);
      var dt = new Date(y, mo, d);
      return (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) ? dt : null;
    }

    function parseIndices(list, limit){
      var res = [];
      (Array.isArray(list) ? list : []).forEach(function (v) {
        var n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0 && (typeof limit !== 'number' || n < limit) && res.indexOf(n) === -1) {
          res.push(n);
        }
      });
      return res;
    }

    var solucoes = [];
    var rawSolucoes = Array.isArray(respostaObj && respostaObj.solucoes) ? respostaObj.solucoes : [];
    rawSolucoes.forEach(function(s, idx){
      var acao = String(s && s.acao || '').trim();
      var responsavel = String(s && s.responsavel || '').trim();
      var prazo = String(s && s.prazo || '').trim();
      var hasAny = acao || responsavel || prazo;
      if (!hasAny) return;

      if (acao.length < 10) throw new Error('Ação proposta na linha ' + (idx+1) + ' deve ter ao menos 10 caracteres.');
      if (!responsavel) throw new Error('Responsável na linha ' + (idx+1) + ' é obrigatório.');
      if (!prazo) throw new Error('Prazo na linha ' + (idx+1) + ' é obrigatório no formato dd/mm/aaaa.');
      if (!parsePrazo(prazo)) throw new Error('Prazo inválido na linha ' + (idx+1) + '. Use dd/mm/aaaa.');

      solucoes.push({ acao: acao, responsavel: responsavel, prazo: prazo });
    });

    if (!solucoes.length) throw new Error('Informe ao menos uma ação proposta com responsável e prazo.');

    var acoesConcluidas = deveValidarConclusao ? parseIndices(respostaObj && respostaObj.acoesConcluidas, solucoes.length) : [];

 obj.resposta = {
      dataRespostaIso: new Date().toISOString(),
      porques: [
        pq1,
        pq2,
        pq3,
        String((respostaObj && respostaObj.pq4) || '').trim(),
        String((respostaObj && respostaObj.pq5) || '').trim()
      ],
      solucoes: solucoes,
      acoesConcluidas: acoesConcluidas
    };

    // Identifica o plano de ação com o menor prazo (colunas I, J, L na aba Controle)
    var menorPrazo = null;

    solucoes.forEach(function(s){
      var temDados = s.acao || s.responsavel || s.prazo;
      if (!temDados) return; // ignora linhas em branco
      var dt = parsePrazo(s.prazo);
      if (!dt) return; // só considera planos com prazo válido
      if (!menorPrazo || dt.getTime() < menorPrazo.prazo.getTime()) {
        menorPrazo = { solucao: s, prazo: dt };
      }
    });

    shCtrl.getRange(targetRow, cols.planoAcao.column).setValue(menorPrazo ? menorPrazo.solucao.acao : '');
    shCtrl.getRange(targetRow, cols.responsavelPa.column).setValue(menorPrazo ? menorPrazo.solucao.responsavel : '');
    shCtrl.getRange(targetRow, cols.prazoPa.column).setValue(menorPrazo ? menorPrazo.prazo : '');

    obj.validacaoConclusao = {
      acoesValidadas: [],
      acoesConcluidas: acoesConcluidas,
      retornoConclusao: '',
      ultimaValidacaoIso: '',
      ultimaConclusaoIso: deveValidarConclusao ? dataResposta.toISOString() : ''
    };

    found.file.setContent(JSON.stringify(obj, null, 2));

    // Anexos: se marcados como conclusão, salvam com sufixo " - conc"
    var attachRes = { items: [] };
    if (anexosConclusao && anexosConclusao.length) {
      var folder = found.rncFolder || _ensureRncFolderInMonth_(found.monthFolder || _ensureYearMonthFolder_(), rncId);
      attachRes = deveValidarConclusao
        ? _saveConclusionAttachmentsToSpecificFolder_(folder, rncId, anexosConclusao)
        : _saveResponseAttachmentsToSpecificFolder_(folder, rncId, anexosConclusao);
    }
    
    return { ok:true, rncId:rncId, fileUrl: found.file.getUrl(), anexos: attachRes.items || [] };
  } catch (e) {
    throw new Error('Responder RNC: ' + String(e && e.message ? e.message : e));
  }
}

function responderRNC_Improcedente(token, rncId, motivoCancelamento, anexosImprocedencia) {
  try {
    var sess = _getSession_(token);
    rncId = String(rncId || '').trim();
    motivoCancelamento = String(motivoCancelamento || '').trim();

    if (!rncId) throw new Error('RNC inválida.');
    if (motivoCancelamento.length < 15) throw new Error('O motivo do cancelamento deve ter ao menos 15 caracteres.');
    anexosImprocedencia = Array.isArray(anexosImprocedencia) ? anexosImprocedencia : [];

    var shCtrl = SpreadsheetApp.getActive().getSheetByName('Controle');
    if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
    var vals = shCtrl.getDataRange().getValues();
    var cols = _getControleColumnIndices_(shCtrl);

    var targetRow = -1;
    for (var r = 1; r < vals.length; r++) {
      var code = String(vals[r][cols.rnc.index] || '').trim();
      if (code === rncId) {
        targetRow = r + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error('RNC não encontrada na aba Controle.');

    var dataResposta = new Date();
    shCtrl.getRange(targetRow, cols.dataResposta.column).setValue(dataResposta);
    shCtrl.getRange(targetRow, cols.etapa.column).setValue('Validação resposta');
    shCtrl.getRange(targetRow, cols.motivoCancelamento.column).setValue(motivoCancelamento);

    var found = _findRncFile_(rncId, '', '');
    if (!found || !found.file) throw new Error('Arquivo JSON da RNC não localizado para salvar improcedente.');
    var txt = found.file.getBlob().getDataAsString();
    var obj = {};
    try { obj = JSON.parse(txt); } catch (parseErr) { obj = {}; }

    obj.resposta = {
      dataRespostaIso: dataResposta.toISOString(),
      porques: [],
      solucoes: [],
      motivoImprocedente: motivoCancelamento,
      tipo: 'improcedente'
    };

    found.file.setContent(JSON.stringify(obj, null, 2));

    var attachRes = { items: [] };
    if (anexosImprocedencia.length) {
      var folder = found.rncFolder || _ensureRncFolderInMonth_(found.monthFolder || _ensureYearMonthFolder_(), rncId);
      attachRes = _saveImprocedenteAttachmentsToSpecificFolder_(folder, rncId, anexosImprocedencia);
    }

    _appendLog_(rncId, (sess && sess.area) ? sess.area : '', 'Resposta improcedente', motivoCancelamento, dataResposta);

    return { ok: true, rncId: rncId, anexos: attachRes.items || [] };
  } catch (e) {
    throw new Error('Improcedente RNC: ' + String(e && e.message ? e.message : e));
  }
}
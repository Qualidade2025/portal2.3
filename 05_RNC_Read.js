/** =========================================================
 * Obter RNC (JSON + anexos + metadados)
 * ========================================================= */

function obterRNC(token, rncId, ano, mesNome) {
  _getSession_(token); // valida sessão
  rncId = String(rncId||'').trim();
  ano = String(ano||'').trim();
  mesNome = String(mesNome||'').trim();
  if (!rncId) throw new Error('RNC inválida.');

  var found = _findRncFile_(rncId, ano, mesNome);
  if (!found || !found.file) throw new Error('Arquivo JSON da RNC não encontrado na pasta base.');

  var txt = found.file.getBlob().getDataAsString();
  var obj = {};
  try { obj = JSON.parse(txt); } catch (e) { obj = {}; }

  var tz = Session.getScriptTimeZone() || 'America/Sao_Paulo';
  function fmtDateOnly(d){
    if (!d) return '';
    var dt = d instanceof Date ? d : new Date(d);
    if (Object.prototype.toString.call(dt) === '[object Date]' && !isNaN(dt)) {
      return Utilities.formatDate(dt, tz, 'dd/MM/yyyy');
    }
    return '';
  }

  // Data de abertura e status (coluna C)
  var dataAbertura = '';
  var statusEtapa = '';
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Controle');
  if (sh) {
    var cols = _getControleColumnIndices_(sh);
    var vals = sh.getDataRange().getValues();
    for (var r=1;r<vals.length;r++){
      if (String(vals[r][cols.rnc.index]||'').trim() === rncId){
        dataAbertura = fmtDateOnly(vals[r][cols.dataAbertura.index]);
        statusEtapa  = String(vals[r][cols.etapa.index]||'').trim();
        break;
      }
    }
  }
  if (!dataAbertura && obj.dataHoraIso) dataAbertura = fmtDateOnly(obj.dataHoraIso);

  // mensagem de retorno (log) para etapa em correção
  var retornoMsg = '';
  var retornoEtapa = '';
  var statusLower = statusEtapa.toLowerCase();
  if (statusLower.indexOf('correção abertura') !== -1 || statusLower.indexOf('correcao abertura') !== -1) {
    retornoEtapa = 'retorno abertura';
  } else if (statusLower.indexOf('correção resposta') !== -1 || statusLower.indexOf('correcao resposta') !== -1 || statusLower.indexOf('corrigir rnc') !== -1) {
    retornoEtapa = 'retorno resposta';
  } else if (statusLower.indexOf('correção conclusão') !== -1 || statusLower.indexOf('correcao conclusao') !== -1) {
    retornoEtapa = 'retorno conclusão';
  }

  if (retornoEtapa && ss) {
    var shLog = ss.getSheetByName('Log');
    if (shLog) {
      var logVals = shLog.getDataRange().getValues();
      for (var i = logVals.length - 1; i >= 0; i--) {
        var code = String(logVals[i][0] || '').trim();
        var etapaLog = String(logVals[i][3] || '').toLowerCase();
        if (code === rncId && etapaLog === retornoEtapa) {
          retornoMsg = String(logVals[i][4] || '').trim();
          break;
        }
      }
    }
  }

  // lista anexos na subpasta da RNC — tudo que começa com rncId e não é o .json
    var anexos = _listarAnexosDaRnc_(found.rncFolder, rncId, found.monthFolder);

  return {
    dados: obj,
    fileUrl: found.file.getUrl(),
    anexos: anexos,
    ano: ano,
    mesNome: mesNome,
    dataAbertura: dataAbertura,
    statusEtapa: statusEtapa,
    retornoMsg: retornoMsg,
    retornoEtapa: retornoEtapa
  };
}

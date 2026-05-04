/** =========================================================
 * HOME — listagens (server-side)
 * ========================================================= */

function listarRNCsDoUsuario(token) {
  return _buildHomeBlocos_(token).pendencias;
}

function listarRNCsFinalizadas(token) {
  return _buildHomeBlocos_(token).rncs;
}

function listarDevolucoesDoUsuario(token) {
  return _buildHomeBlocos_(token).devolucoes;
}

function _buildHomeBlocos_(token) {
  var sess = _getSession_(token);
  var setoresUsuario = _getAreasDoUsuario_(sess);
  var setoresNorm = setoresUsuario.map(_normalizeAreaName_);
  var isSuperuser = _hasSuperuserHierarchy_(setoresUsuario);

  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');
  var vals = shCtrl.getDataRange().getValues();
  var cols = _getControleColumnIndices_(shCtrl);

  var mensagensMap = _getMensagensDevolucaoMap_(ss);

  var devolucoes = [];
  var pendencias = [];
  var rncs = [];

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    var item = _parseControleRow_(row, cols);
    if (!item || !item.rnc || _isStatusCancelada_(item.status)) continue;

    var clienteIn = setoresNorm.indexOf(_normalizeAreaName_(item.cliente)) !== -1;
    var fornecedorIn = setoresNorm.indexOf(_normalizeAreaName_(item.fornecedor)) !== -1;

    var statusNorm = _normalizeAreaName_(item.statusAbertura);
    var statusControleNorm = _normalizeAreaName_(item.status);

    var isCorrecaoAbertura = statusNorm === 'correcao abertura';
    var isCorrecaoResposta = (statusNorm === 'correcao resposta' || statusNorm === 'corrigir rnc');
    var isCorrecaoConclusao = statusNorm === 'correcao conclusao';
    var isCorrecao = isCorrecaoAbertura || isCorrecaoResposta || isCorrecaoConclusao;

var isAguardandoResposta = (statusNorm === 'aguardando resposta' || statusControleNorm === 'aguardando resposta');
var isAguardandoConclusao = (statusNorm === 'aguardando conclusao' || statusControleNorm === 'aguardando conclusao');
var isAguardando = isAguardandoResposta || isAguardandoConclusao;

    var isValidacao = (
      statusNorm === 'validacao abertura' ||
      statusNorm === 'validacao resposta' ||
      statusNorm === 'validacao conclusao'
    );

    var isConcluida = (statusNorm === 'conclusao' || statusControleNorm === 'concluida');

    var inDevolucoes = (
      (clienteIn && isCorrecaoAbertura) ||
      (fornecedorIn && (isCorrecaoResposta || isCorrecaoConclusao))
    );

var inPendencias = (
  (fornecedorIn && isAguardando) ||
  (isSuperuser && isValidacao)
);

var inRncs = false;
if (!isSuperuser) {
  inRncs = (
    (clienteIn && !isCorrecaoAbertura) ||
    (fornecedorIn && isConcluida) ||
    (fornecedorIn && isCorrecaoAbertura) ||
    (isValidacao && (clienteIn || fornecedorIn))
  );
} else {
  inRncs = true;

  if (isCorrecaoAbertura && clienteIn) inRncs = false;
  if ((isCorrecaoResposta || isCorrecaoConclusao) && fornecedorIn) inRncs = false;
  if (isAguardando && fornecedorIn) inRncs = false;
  if (isValidacao) inRncs = false;
}

    if (inDevolucoes) {
      item.retorno = mensagensMap[item.rnc] || '';
      item.devolucaoTipo = isCorrecaoConclusao ? 'conclusao' : (isCorrecaoResposta ? 'resposta' : 'abertura');
      devolucoes.push(item);
    }
    if (inPendencias) pendencias.push(item);
    if (inRncs) rncs.push(item);
  }

  var dedupe = _removeDuplicidadeHome_({
    devolucoes: devolucoes,
    pendencias: pendencias,
    rncs: rncs
  });

  dedupe.devolucoes.sort(_sortByRncCodigoDesc_);
  dedupe.pendencias.sort(_sortByRncCodigoDesc_);
  dedupe.rncs.sort(_sortByRncCodigoDesc_);

  return dedupe;
}

function _removeDuplicidadeHome_(blocos) {
  var used = {};

  function pickUnique(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var id = String(items[i].rnc || '').trim();
      if (!id || used[id]) continue;
      used[id] = true;
      out.push(items[i]);
    }
    return out;
  }

  return {
    devolucoes: pickUnique(blocos.devolucoes || []),
    pendencias: pickUnique(blocos.pendencias || []),
    rncs: pickUnique(blocos.rncs || [])
  };
}

function _extractRncNumero_(rnc) {
  var digitos = String(rnc || '').replace(/\D+/g, '');
  return digitos ? parseInt(digitos, 10) : -1;
}

function _sortByRncCodigoDesc_(a, b) {
  return _extractRncNumero_(b.rnc) - _extractRncNumero_(a.rnc);
}

function _getMensagensDevolucaoMap_(ss) {
  var mensagensMap = {};
  var shMsg = ss.getSheetByName('Log');
  if (!shMsg) return mensagensMap;

  var mvals = shMsg.getDataRange().getValues();
  for (var i = 0; i < mvals.length; i++) {
    var rncCode = String(mvals[i][0] || '').trim(); // A
    var etapa = String(mvals[i][3] || '').toLowerCase(); // D
    if (!rncCode || etapa.indexOf('retorno') !== 0) continue;
    mensagensMap[rncCode] = String(mvals[i][4] || '').trim(); // E
  }
  return mensagensMap;
}

function _parseControleRow_(row, cols) {
  var data = row[cols.dataAbertura.index];
  var d = _toDateObj_(data) || new Date();
  var meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  return {
    rnc: String(row[cols.rnc.index] || '').trim(),
    data: _fmtDate_(data),
    cliente: String(row[cols.cliente.index] || '').trim(),
    fornecedor: String(row[cols.fornecedor.index] || '').trim(),
    descNC: String(row[cols.descricaoNc.index] || ''),
    plano: String(row[cols.planoAcao.index] || ''),
    respPlano: String(row[cols.responsavelPa.index] || ''),
    prazo: _fmtDate_(row[cols.prazoPa.index]),
    prazoControle: _fmtDate_(row[cols.prazoControle.index]),
    conclusao: _fmtDate_(row[cols.dataConclusao.index]),
    status: String(row[cols.status.index] || '').trim(),
    statusConclusaoPlano: String(row[cols.statusConclusaoPlano.index] || '').trim(),
    cor: String(row[cols.cor.index] || '').trim(),
    tipo: String(row[cols.tipoNc.index] || '').trim(),
    ano: String(d.getFullYear()),
    mesNome: meses[d.getMonth()],
    statusAbertura: String(row[cols.etapa.index] || '').trim()
  };
}

function _fmtDate_(d) {
  var tz = Session.getScriptTimeZone() || 'America/Sao_Paulo';
  if (!d) return '';
  if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d)) {
    return Utilities.formatDate(d, tz, 'dd/MM/yyyy');
  }
  if (typeof d === 'number') {
    var base = new Date(1899, 11, 30);
    var dt = new Date(base.getTime() + d * 24 * 3600 * 1000);
    return Utilities.formatDate(dt, tz, 'dd/MM/yyyy');
  }
  return String(d);
}

function _toDateObj_(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'number') {
    var base = new Date(1899, 11, 30);
    return new Date(base.getTime() + d * 24 * 3600 * 1000);
  }
  var t = new Date(d);
  return isNaN(t) ? null : t;
}

function _isStatusCancelada_(status) {
  var normalized = String(status || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return normalized === 'cancelada';
}

function _getAreasDoUsuario_(sess) {
  var areas = [];
  if (sess && Array.isArray(sess.areas)) areas = sess.areas;
  else if (sess && sess.area) areas = [sess.area];
  return areas
    .map(function(a){ return String(a||'').trim(); })
    .filter(function(a){ return !!a; });
}

var _SUPERUSER_AREAS_ = [
  'qualidade',
  'gerencia de planejamento e producao',
  'gerencia de producao e planejamento'
];

function _normalizeAreaName_(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function _hasSuperuserHierarchy_(areas) {
  var normalized = (areas || []).map(_normalizeAreaName_);
  return normalized.some(function(area){ return _SUPERUSER_AREAS_.indexOf(area) !== -1; });
}
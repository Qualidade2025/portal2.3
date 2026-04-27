/** =========================================================
 * Criar / Corrigir RNC
 * ========================================================= */

function criarRNC_SalvarBasico(token, pv, op, clienteLivre, origem, fornecedor, responsavel, descricao, motivo, disposicao, descCorrecao, anexos) {
  try {
    var sess = _getSession_(token);
    var area = String(sess.area || '').trim();
    if (!area) throw new Error('Seu cadastro não possui "Área" na aba Dados.');

    pv = String(pv||'').trim();
    op = String(op||'').trim();
    origem = String(origem||'').trim();
    fornecedor = String(fornecedor||'').trim();
    responsavel = String(responsavel||'').trim();
    descricao = String(descricao||'').trim();
    motivo = String(motivo||'').trim();
    disposicao = String(disposicao||'').trim();
    descCorrecao = String(descCorrecao||'').trim();
    anexos = Array.isArray(anexos) ? anexos : [];

    // Validações
    if (!/^\d{5}$/.test(pv)) throw new Error('PV deve conter exatamente 5 dígitos (xxxxx).');
    if (!/^(\d{5}|\d{5}\/\d{2})$/.test(op)) throw new Error('OP deve ser 5 dígitos (xxxxx) ou xxxxx/xx.');
    var ORIGENS = ['processo','reclamação de cliente','indicador','auditoria 5s','fornecedor externo'];
    var origemLower = origem.toLowerCase();
    if (ORIGENS.indexOf(origemLower) === -1) throw new Error('Selecione uma origem válida.');
    if (!fornecedor) throw new Error('Selecione um Fornecedor.');
    if (!responsavel) throw new Error('Informe o Responsável.');
    if (descricao.length < 20) throw new Error('A descrição deve ter pelo menos 20 caracteres.');
    if (!motivo) throw new Error('Selecione o Motivo.');
    if (!disposicao) throw new Error('Selecione a Disposição (ação imediata).');
    if (descCorrecao.length < 10) throw new Error('A descrição da ação corretiva deve ter pelo menos 10 caracteres.');

  var sh = SpreadsheetApp.getActive().getSheetByName('Controle');
  if (!sh) throw new Error('Aba "Controle" não encontrada.');
  var cols = _getControleColumnIndices_(sh);

    var numero = _nextNumero_();
    var sufixosPorOrigem = {
      'reclamação de cliente': 'G',
      'fornecedor externo': 'E',
      'indicador': 'K',
      'auditoria 5s': 'S'
    };
    var sufixo = sufixosPorOrigem[origemLower] || 'I';
    var rncId  = 'RNC ' + numero + sufixo;

    // Monta linha mínima (A..H)
  var maxCols = Math.max(sh.getLastColumn(), Object.keys(CONTROLE_HEADER_TITLES).length);
  var row = new Array(maxCols).fill('');
  row[cols.rnc.index] = rncId;
  row[cols.dataAbertura.index] = new Date();
  row[cols.etapa.index] = 'Validação abertura';
  row[cols.numeroPv.index] = pv;
  row[cols.cliente.index] = area;
  row[cols.fornecedor.index] = fornecedor;
  row[cols.descricaoNc.index] = motivo;
  sh.appendRow(row);

  var newRow = sh.getLastRow();
  _copyControleFormulas_(sh, newRow);

  _appendLog_(rncId, area, 'Abertura RNC', undefined, row[cols.dataAbertura.index]);

    // ===== DRIVE =====
    var driveError = '';
    var fileUrl = '', monthFolderUrl = '';

    try {
      var driveJson = _saveRncJsonToDrive_(rncId, {
        rncId: rncId,
        numero: numero,
        dataHoraIso: new Date().toISOString(),
        pv: pv,
        op: op,
        responsavel: responsavel,
        origem: origem,
        fornecedor: fornecedor,
        descricao: descricao,
        motivo: motivo,
        disposicao: disposicao,
        descricaoAcaoCorretiva: descCorrecao,
        areaUsuario: area,
        usuarioAbertura: sess.usuario || ''
      });
      if (driveJson && driveJson.error) driveError = String(driveJson.error);
      fileUrl = (driveJson && driveJson.fileUrl) || '';
      monthFolderUrl = (driveJson && driveJson.monthFolderUrl) || (driveJson && driveJson.monthFolder && driveJson.monthFolder.getUrl()) || '';
    } catch(e) {
      driveError = 'JSON: ' + String(e);
    }

    var attachRes = { items: [] };
    try {
      attachRes = _saveAttachmentsToDrive_(rncId, anexos); // sem sufixo na abertura
      if (attachRes && attachRes.error) driveError = (driveError ? driveError + ' | ' : '') + String(attachRes.error);
    } catch(e) {
      driveError = (driveError ? driveError + ' | ' : '') + 'Anexos: ' + String(e);
    }

    return {
      rncId:rncId,
      numero:numero,
      areaGravada:area,
      fornecedor:fornecedor,
      motivo:motivo,
      fileUrl: fileUrl,
      monthFolderUrl: monthFolderUrl,
      driveError: driveError,
      anexos: (attachRes && attachRes.items) ? attachRes.items : []
    };
  } catch (e) {
    // garante retorno para o failureHandler no front-end
    throw new Error('Criar RNC: ' + String(e && e.message ? e.message : e));
  }
}

function corrigirRNC_AtualizarAbertura(token, rncId, pv, op, responsavel, origem, fornecedor, descricao, motivo, disposicao, descCorrecao, anexos) {
  try {
    var sess = _getSession_(token);
    rncId = String(rncId||'').trim();
    if (!rncId) throw new Error('RNC inválida.');

    pv = String(pv||'').trim();
    op = String(op||'').trim();
    origem = String(origem||'').trim();
    fornecedor = String(fornecedor||'').trim();
    responsavel = String(responsavel||'').trim();
    descricao = String(descricao||'').trim();
    motivo = String(motivo||'').trim();
    disposicao = String(disposicao||'').trim();
    descCorrecao = String(descCorrecao||'').trim();
    anexos = Array.isArray(anexos) ? anexos : [];

    if (!/^\d{5}$/.test(pv)) throw new Error('PV deve conter exatamente 5 dígitos (xxxxx).');
    if (!/^(\d{5}|\d{5}\/\d{2})$/.test(op)) throw new Error('OP deve ser 5 dígitos (xxxxx) ou xxxxx/xx.');
    if (!origem) throw new Error('Selecione a origem da não conformidade.');
    if (!fornecedor) throw new Error('Selecione um Fornecedor.');
    if (!responsavel) throw new Error('Informe o Responsável.');    
    if (descricao.length < 20) throw new Error('A descrição deve ter pelo menos 20 caracteres.');
    if (!motivo) throw new Error('Selecione o Motivo.');
    if (!disposicao) throw new Error('Selecione a Disposição (ação imediata).');
    if (descCorrecao.length < 10) throw new Error('A descrição da ação corretiva deve ter pelo menos 10 caracteres.');

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

  // Atualiza Controle
  shCtrl.getRange(targetRow, cols.dataAbertura.column).setValue(new Date());
  shCtrl.getRange(targetRow, cols.etapa.column).setValue('Validação abertura');
  shCtrl.getRange(targetRow, cols.numeroPv.column).setValue(pv);
  shCtrl.getRange(targetRow, cols.fornecedor.column).setValue(fornecedor);
  shCtrl.getRange(targetRow, cols.descricaoNc.column).setValue(motivo);

    // Atualiza JSON existente
    var found = _findRncFile_(rncId, '', '');
    if (!found || !found.file) throw new Error('Arquivo JSON da RNC não localizado para atualização.');
    var txt = found.file.getBlob().getDataAsString();
    var obj = {};
    try { obj = JSON.parse(txt); } catch(e){ obj = {}; }
    obj.pv = pv;
    obj.op = op;
    obj.responsavel = responsavel;
    obj.origem = origem;
    obj.fornecedor = fornecedor;
    obj.descricao = descricao;
    obj.motivo = motivo;
    obj.disposicao = disposicao;
    obj.descricaoAcaoCorretiva = descCorrecao;
    obj.ultimaAtualizacaoIso = new Date().toISOString();
    found.file.setContent(JSON.stringify(obj, null, 2));

    // Salva anexos (na mesma pasta do JSON, se possível)
    var attachRes = { items: [] };
    if (anexos && anexos.length) {
      var folder = found.rncFolder || _ensureRncFolderInMonth_(found.monthFolder || _ensureYearMonthFolder_(), rncId);
      attachRes = _saveAttachmentsToSpecificFolder_(folder, rncId, anexos);
    }

    var etapaLog = prevStatus === 'Correção abertura' ? 'Abertura corrigida' : 'Abertura RNC';
    _appendLog_(rncId, (sess && sess.area) ? sess.area : '', etapaLog);

    return {
      rncId: rncId,
      fileUrl: found.file.getUrl(),
      monthFolderUrl: found.monthFolder ? found.monthFolder.getUrl() : '',
      anexos: attachRes.items || []
    };
  } catch (e) {
    throw new Error('Corrigir RNC: ' + String(e && e.message ? e.message : e));
  }
}
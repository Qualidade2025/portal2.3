/** =========================================================
 * Drive helpers (JSON + anexos, estrutura Ano/Mês)
 * ========================================================= */

/* 1) Torna "monthFolder" uma variável GLOBAL, evitando ReferenceError
      quando outras funções a referenciam em chamadas como
      _saveAnexos_(monthFolder, ...). */
var monthFolder = null;
var RNC_FOLDER_INDEX_FILE = 'rnc-folder-index.json';

function _safeGetFolderById_(id) {
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (_) { return null; }
}

function testePermissoesDrive() {
  var folder = _getBaseFolderFromDados_();
  if (!folder) throw new Error('Defina PastaBaseDriveId ou PastaBaseDrive na aba Dados.');
  return 'OK: acesso ao Drive autorizado para a pasta-base: ' + folder.getName();
}

function _getBaseFolderFromDados_() {
  var valInfo = _getKeyOnDados_('PastaBaseDriveId') || _getKeyOnDados_('PastaBaseDrive');
  if (!valInfo) return null;

  var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
  if (!sh) return null;

  return _resolveFolderFromDadosCell_(sh, valInfo.row, valInfo.col);
}

function _extractDriveId_(text) {
  if (!text) return '';
  var m = String(text).match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

function _resolveFolderFromDadosCell_(sheet, row, col) {
  if (!sheet || !row || !col) return null;

  var cell = sheet.getRange(row, col);
  var value = String(cell.getValue() || '').trim();
  var candidates = [];

  if (value) candidates.push(value);

  // Suporte para hyperlink "embutido" (texto com URL)
  var rich = cell.getRichTextValue && cell.getRichTextValue();
  var richUrl = rich && rich.getLinkUrl ? rich.getLinkUrl() : '';
  if (richUrl) candidates.push(String(richUrl).trim());

  // Suporte para fórmula HYPERLINK("url","texto")
  var formula = String(cell.getFormula() || '').trim();
  if (formula) {
    var m = formula.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
    if (m && m[1]) candidates.push(String(m[1]).trim());
  }

  // 1) Tenta resolver por ID/URL
  for (var i = 0; i < candidates.length; i++) {
    var id = _extractDriveId_(candidates[i]);
    if (!id) continue;
    try {
      return DriveApp.getFolderById(id);
    } catch (_) {}
  }

  // 2) Fallback: nome da pasta no Meu Drive
  for (var j = 0; j < candidates.length; j++) {
    var name = String(candidates[j] || '').trim();
    if (!name) continue;
    try {
      var it = DriveApp.getFoldersByName(name);
      if (it.hasNext()) return it.next();
    } catch (_) {}
  }

  return null;
}

function _getRncFolderIndex_(baseFolder) {
  var it = baseFolder.getFilesByName(RNC_FOLDER_INDEX_FILE);
  if (!it.hasNext()) return {};
  try {
    return JSON.parse(it.next().getBlob().getDataAsString()) || {};
  } catch (e) {
    return {};
  }
}

function _writeRncFolderIndex_(baseFolder, idxObj) {
  var content = JSON.stringify(idxObj || {}, null, 2);
  var it = baseFolder.getFilesByName(RNC_FOLDER_INDEX_FILE);
  if (it.hasNext()) {
    it.next().setContent(content);
  } else {
    baseFolder.createFile(RNC_FOLDER_INDEX_FILE, content, MimeType.PLAIN_TEXT);
  }
}

function reconstruirRncFolderIndex2025e2026() {
  var baseFolder = _getBaseFolderFromDados_();
  if (!baseFolder) throw new Error('PastaBaseDriveId/PastaBaseDrive não definida na aba Dados.');

  var years = ['2025', '2026'];
  var rebuilt = {};
  var totalRncFolders = 0;
  var totalEntries = 0;
  var errors = [];

  function safeHasNext_(it) {
    try { return it && it.hasNext(); } catch (e) { return false; }
  }

  function safeNext_(it, context) {
    try { return it.next(); }
    catch (e) {
      errors.push('Falha ao iterar em ' + context + ': ' + e);
      return null;
    }
  }

  function pickJsonFile_(rncFolder, expectedId) {
    var selected = null;
    var it;
    try {
      it = rncFolder.getFiles();
    } catch (e) {
      errors.push('Falha ao listar arquivos na pasta ' + rncFolder.getId() + ': ' + e);
      return null;
    }
    while (safeHasNext_(it)) {
      var file = safeNext_(it, 'arquivos da pasta ' + rncFolder.getId());
      if (!file) continue;
      var name = file.getName();
      if (!/\.json$/i.test(name)) continue;
      if (expectedId && name === (expectedId + '.json')) return file;
      if (!selected) selected = file;
    }
    return selected;
  }

  function normalizeRncIdFromFolder_(folderName) {
    var name = String(folderName || '').trim();
    if (!name) return '';
    if (name.indexOf('RNC-') === 0) return name.substring(4);
    return '';
  }

  for (var y = 0; y < years.length; y++) {
    var yearName = years[y];
    var yIt = baseFolder.getFoldersByName(yearName);
    while (safeHasNext_(yIt)) {
      var yearFolder = safeNext_(yIt, 'ano ' + yearName);
      if (!yearFolder) continue;

      var mIt;
      try {
        mIt = yearFolder.getFolders();
      } catch (e) {
        errors.push('Falha ao listar meses no ano ' + yearName + ': ' + e);
        continue;
      }
      while (safeHasNext_(mIt)) {
        var mFolder = safeNext_(mIt, 'meses do ano ' + yearName);
        if (!mFolder) continue;

        var rIt;
        try {
          rIt = mFolder.getFolders();
        } catch (e) {
          errors.push('Falha ao listar RNCs no mês ' + mFolder.getName() + ': ' + e);
          continue;
        }
        while (safeHasNext_(rIt)) {
          var rncFolder = safeNext_(rIt, 'RNCs do mês ' + mFolder.getName());
          if (!rncFolder) continue;
          totalRncFolders++;

          var folderName = rncFolder.getName();
          var rncId = normalizeRncIdFromFolder_(folderName);
          if (!rncId && folderName.indexOf('RNC-') !== 0) continue;
          var jsonFile = pickJsonFile_(rncFolder, rncId);

          if (!rncId && jsonFile) {
            rncId = String(jsonFile.getName()).replace(/\.json$/i, '');
          }
          if (!rncId) continue;

          var current = rebuilt[rncId] || {};
          current.monthFolderId = mFolder.getId();
          current.rncFolderId = rncFolder.getId();
          if (jsonFile) {
            current.jsonrncid = jsonFile.getId();
          }
          rebuilt[rncId] = current;
        }
      }
    }
  }

  for (var k in rebuilt) {
    if (rebuilt.hasOwnProperty(k)) totalEntries++;
  }

  // Limpa o arquivo e reescreve com o índice reconstruído.
  _writeRncFolderIndex_(baseFolder, {});
  _writeRncFolderIndex_(baseFolder, rebuilt);

  return {
    ok: true,
    years: years,
    totalRncFoldersPercorridas: totalRncFolders,
    totalEntradasNoIndice: totalEntries,
    totalErros: errors.length,
    erros: errors.slice(0, 30),
    indexFileName: RNC_FOLDER_INDEX_FILE
  };
}

function _rncFolderName_(rncId) {
  return 'RNC-' + String(rncId || '').trim().replace(/\s+/g, '_');
}

function _ensureRncFolderInMonth_(monthFolder, rncId) {
  if (!monthFolder || !rncId) return null;
  var name = _rncFolderName_(rncId);
  var it = monthFolder.getFoldersByName(name);
  return it.hasNext() ? it.next() : monthFolder.createFolder(name);
}

function _migrateFilesToRncFolder_(monthFolder, rncFolder, rncId) {
  if (!monthFolder || !rncFolder || !rncId) return;
  var it = monthFolder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var nm = f.getName();
    if (nm.indexOf(rncId) === 0) {
      f.moveTo(rncFolder);
    }
  }
}

/* 2) NÃO declare "var monthFolder" aqui dentro. Atribua à GLOBAL. */
function _ensureYearMonthFolder_() {
  var baseFolder = _getBaseFolderFromDados_();
  if (!baseFolder) throw new Error('PastaBaseDriveId/PastaBaseDrive não definida na aba Dados.');

  var now = new Date();
  var ano = String(now.getFullYear());
  var meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var mesNome = meses[now.getMonth()];

  var yIt = baseFolder.getFoldersByName(ano);
  var yearFolder = yIt.hasNext() ? yIt.next() : baseFolder.createFolder(ano);

  var mIt = yearFolder.getFoldersByName(mesNome);
  /* atribui na variável GLOBAL */
  monthFolder = mIt.hasNext() ? mIt.next() : yearFolder.createFolder(mesNome);

  return monthFolder;
}

function _registerRncFolders_(baseFolder, rncId, monthFolder, rncFolder) {
  if (!baseFolder || !rncId) return;
  var idx = _getRncFolderIndex_(baseFolder);
  var previous = idx[rncId] || {};
  var current = {};
  if (monthFolder) current.monthFolderId = monthFolder.getId();
  if (rncFolder) current.rncFolderId = rncFolder.getId();
  if (previous.jsonrncid) current.jsonrncid = previous.jsonrncid;
  idx[rncId] = current;
  _writeRncFolderIndex_(baseFolder, idx);
}

function _registerRncJsonInIndex_(baseFolder, rncId, jsonFile) {
  if (!baseFolder || !rncId || !jsonFile) return;
  var idx = _getRncFolderIndex_(baseFolder);
  var previous = idx[rncId] || {};
  var current = {};
  if (previous.monthFolderId) current.monthFolderId = previous.monthFolderId;
  if (previous.rncFolderId) current.rncFolderId = previous.rncFolderId;
  current.jsonrncid = jsonFile.getId();
  idx[rncId] = current;
  _writeRncFolderIndex_(baseFolder, idx);
}

function _ensureRncFolderAndJsonCreated_(rncFolder, rncId, jsonFile) {
  if (!rncFolder) throw new Error('Pasta da RNC não foi criada corretamente.');
  if (!rncFolder.getId()) throw new Error('Pasta da RNC inválida.');
  if (!jsonFile) throw new Error('Arquivo JSON da RNC não foi criado.');
  if (!jsonFile.getId()) throw new Error('Arquivo JSON da RNC inválido.');

  // Verificação final: confirma existência do JSON com o nome esperado na pasta.
  var it = rncFolder.getFilesByName(rncId + '.json');
  if (!it.hasNext()) {
    throw new Error('JSON não encontrado na pasta da RNC após salvar: ' + rncId + '.json');
  }
}

function _listarAnexosDaRnc_(rncFolder, rncId, monthFolder) {
  var anexos = [];
  var folder = rncFolder || monthFolder;
  if (!folder || !rncId) return anexos;

  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var nm = f.getName();
    if (nm.indexOf(rncId) === 0 && nm !== (rncId + '.json')) {
      anexos.push({ name: nm, url: f.getUrl() });
    }
  }
  return anexos;
}

function _saveRncJsonToDrive_(rncId, payloadObj) {
  try {
    var mFolder = _ensureYearMonthFolder_();
    var rncFolder = _ensureRncFolderInMonth_(mFolder, rncId);
    if (!rncFolder) throw new Error('Falha ao criar/obter pasta da RNC: ' + rncId);

    var content = JSON.stringify(payloadObj, null, 2);
    var fileIt = rncFolder.getFilesByName(rncId + '.json');
    var file;
    if (fileIt.hasNext()) {
      file = fileIt.next();
      file.setContent(content);
    } else {
      file = rncFolder.createFile(rncId + '.json', content, MimeType.PLAIN_TEXT);
    }

    _ensureRncFolderAndJsonCreated_(rncFolder, rncId, file);
    _registerRncFolders_(_getBaseFolderFromDados_(), rncId, mFolder, rncFolder);
    _registerRncJsonInIndex_(_getBaseFolderFromDados_(), rncId, file);
    return { fileUrl: file.getUrl(), monthFolder: mFolder, monthFolderUrl: mFolder.getUrl(), rncFolder: rncFolder, rncFolderUrl: rncFolder.getUrl() };
  } catch (e) {
    return { error: String(e) };
  }
}

function _saveAttachmentsToDrive_(rncId, anexos) {
  var out = { items: [] };
  if (!anexos || !anexos.length) return out;
  try {
    var mFolder = _ensureYearMonthFolder_();
    var rncFolder = _ensureRncFolderInMonth_(mFolder, rncId);
    var usedNames = {};
    function getExt_(name) { var m = String(name||'').match(/\.([^.]+)$/); return m ? m[1] : ''; }
    function uniqueName_(base, ext, startIndex) {
      var idx = startIndex || 0, name;
      while (true) {
        name = base + (idx ? ' ('+idx+')' : '') + (ext ? '.'+ext : '');
        if (usedNames[name]) { idx++; continue; }
        if (!rncFolder.getFilesByName(name).hasNext()) break;
        idx++;
      }
      usedNames[name] = true;
      return name;
    }
    for (var i=0;i<anexos.length;i++){
      var a = anexos[i] || {};
      var bytes = Utilities.base64Decode(String(a.dataBase64 || ''), Utilities.Charset.UTF_8);
      // NOVO: limite 10MB por arquivo (Abertura)
      if (bytes.length > 10*1024*1024) throw new Error('Arquivo acima de 10MB: ' + (a.name||'sem nome'));
      var ext = getExt_(a.name || '');
      var mime = a.mimeType || 'application/octet-stream';
      var startIdx = (i === 0) ? 0 : 1;
      var fileName = uniqueName_(rncId, ext, startIdx);
      var blob = Utilities.newBlob(bytes, mime, fileName);
      var file = rncFolder.createFile(blob);
      out.items.push({ name: fileName, url: file.getUrl() });
    }
    _registerRncFolders_(_getBaseFolderFromDados_(), rncId, mFolder, rncFolder);
    return out;
  } catch (e) {
    return { items: out.items, error: String(e) };
  }
}

function _saveAttachmentsToSpecificFolder_(folder, rncId, anexos){
  var out = { items: [] };
  if (!folder || !anexos || !anexos.length) return out;
  try {
    var usedNames = {};
    function getExt_(name) { var m = String(name||'').match(/\.([^.]+)$/); return m ? m[1] : ''; }
    function uniqueName_(base, ext, startIndex) {
      var idx = startIndex || 0, name;
      while (true) {
        name = base + (idx ? ' ('+idx+')' : '') + (ext ? '.'+ext : '');
        if (usedNames[name]) { idx++; continue; }
        if (!folder.getFilesByName(name).hasNext()) break;
        idx++;
      }
      usedNames[name] = true;
      return name;
    }
    for (var i=0;i<anexos.length;i++){
      var a = anexos[i] || {};
      var bytes = Utilities.base64Decode(String(a.dataBase64 || ''), Utilities.Charset.UTF_8);
      // NOVO: limite 10MB por arquivo (Correção da Abertura)
      if (bytes.length > 10*1024*1024) throw new Error('Arquivo acima de 10MB: ' + (a.name||'sem nome'));
      var ext = getExt_(a.name || '');
      var mime = a.mimeType || 'application/octet-stream';
      var startIdx = (i === 0) ? 0 : 1;
      var fileName = uniqueName_(rncId, ext, startIdx);
      var blob = Utilities.newBlob(bytes, mime, fileName);
      var file = folder.createFile(blob);
      out.items.push({ name: fileName, url: file.getUrl() });
    }
    return out;
  } catch (e) {
    return { items: out.items, error: String(e) };
  }
}

function _saveConclusionAttachmentsToSpecificFolder_(folder, rncId, anexos){
  var out = { items: [] };
  if (!folder || !anexos || !anexos.length) return out;
  try {
    var usedNames = {};
    function getExt_(name) { var m = String(name||'').match(/\.([^.]+)$/); return m ? m[1] : ''; }
    function uniqueName_(base, ext, startIndex) {
      var idx = startIndex || 0, name;
      while (true) {
        name = base + ' - conc' + (idx ? ' ('+idx+')' : '') + (ext ? '.'+ext : '');
        if (usedNames[name]) { idx++; continue; }
        if (!folder.getFilesByName(name).hasNext()) break;
        idx++;
      }
      usedNames[name] = true;
      return name;
    }
    for (var i=0;i<anexos.length;i++){
      var a = anexos[i] || {};
      var bytes = Utilities.base64Decode(String(a.dataBase64 || ''), Utilities.Charset.UTF_8);
      // limite 10MB por arquivo
      if (bytes.length > 10*1024*1024) throw new Error('Arquivo acima de 10MB: ' + (a.name||'sem nome'));
      var ext = getExt_(a.name || '');
      var mime = a.mimeType || 'application/octet-stream';
      var fileName = uniqueName_(rncId, ext, 0);
      var blob = Utilities.newBlob(bytes, mime, fileName);
      var file = folder.createFile(blob);
      out.items.push({ name: fileName, url: file.getUrl() });
    }
    return out;
  } catch (e) {
    return { items: out.items, error: String(e) };
  }
}

/* =========================================================
 * NOVO: anexos de RESPOSTA (sufixo " - resp" + contador)
 * ========================================================= */
function _saveResponseAttachmentsToSpecificFolder_(folder, rncId, anexos){
  var out = { items: [] };
  if (!folder || !anexos || !anexos.length) return out;
  try {
    var usedNames = {};
    function getExt_(name) { var m = String(name||'').match(/\.([^.]+)$/); return m ? m[1] : ''; }
    function uniqueName_(base, ext, startIndex) {
      var idx = startIndex || 0, name;
      while (true) {
        name = base + ' - resp' + (idx ? ' ('+idx+')' : '') + (ext ? '.'+ext : '');
        if (usedNames[name]) { idx++; continue; }
        if (!folder.getFilesByName(name).hasNext()) break;
        idx++;
      }
      usedNames[name] = true;
      return name;
    }
    for (var i=0;i<anexos.length;i++){
      var a = anexos[i] || {};
      var bytes = Utilities.base64Decode(String(a.dataBase64 || ''), Utilities.Charset.UTF_8);
      // limite 10MB por arquivo
      if (bytes.length > 10*1024*1024) throw new Error('Arquivo acima de 10MB: ' + (a.name||'sem nome'));
      var ext = getExt_(a.name || '');
      var mime = a.mimeType || 'application/octet-stream';
      var fileName = uniqueName_(rncId, ext, 0);
      var blob = Utilities.newBlob(bytes, mime, fileName);
      var file = folder.createFile(blob);
      out.items.push({ name: fileName, url: file.getUrl() });
    }
    return out;
  } catch (e) {
    return { items: out.items, error: String(e) };
  }
}


function _saveImprocedenteAttachmentsToSpecificFolder_(folder, rncId, anexos){
  var out = { items: [] };
  if (!folder || !anexos || !anexos.length) return out;
  try {
    var usedNames = {};
    function getExt_(name) { var m = String(name||'').match(/\.([^.]+)$/); return m ? m[1] : ''; }
    function uniqueName_(base, ext, startIndex) {
      var idx = startIndex || 0, name;
      while (true) {
        name = base + ' - improcedente' + (idx ? ' ('+idx+')' : '') + (ext ? '.'+ext : '');
        if (usedNames[name]) { idx++; continue; }
        if (!folder.getFilesByName(name).hasNext()) break;
        idx++;
      }
      usedNames[name] = true;
      return name;
    }
    for (var i=0;i<anexos.length;i++){
      var a = anexos[i] || {};
      var bytes = Utilities.base64Decode(String(a.dataBase64 || ''), Utilities.Charset.UTF_8);
      if (bytes.length > 10*1024*1024) throw new Error('Arquivo acima de 10MB: ' + (a.name||'sem nome'));
      var ext = getExt_(a.name || '');
      var mime = a.mimeType || 'application/octet-stream';
      var fileName = uniqueName_(rncId, ext, 0);
      var blob = Utilities.newBlob(bytes, mime, fileName);
      var file = folder.createFile(blob);
      out.items.push({ name: fileName, url: file.getUrl() });
    }
    return out;
  } catch (e) {
    return { items: out.items, error: String(e) };
  }
}

function excluirAnexoRNC(token, rncId, nomeArquivo) {
  _getSession_(token);

  rncId = String(rncId || '').trim();
  nomeArquivo = String(nomeArquivo || '').trim();
  if (!rncId) throw new Error('RNC inválida.');
  if (!nomeArquivo) throw new Error('Nome do anexo não informado.');
  if (nomeArquivo.indexOf(rncId) !== 0) throw new Error('Anexo incompatível com a RNC.');

  var found = _findRncFile_(rncId, '', '');
  if (!found || !found.rncFolder) throw new Error('Pasta da RNC não encontrada no Drive.');

  var files = found.rncFolder.getFilesByName(nomeArquivo);
  var deleted = 0;
  while (files.hasNext()) {
    files.next().setTrashed(true);
    deleted++;
  }

  if (!deleted) throw new Error('Anexo não localizado no Drive.');

  return { ok: true, anexos: _listarAnexosDaRnc_(found.rncFolder, rncId, found.monthFolder), deleted: deleted };
}

/**---------------------------------------------------------------------------------------- */

/** Verifica se já existe arquivo com esse nome na pasta e incrementa (2), (3) ... */
function _ensureUniqueNameInFolder_(folder, desiredName) {
  var dot = desiredName.lastIndexOf('.');
  var stem = dot >= 0 ?
desiredName.slice(0, dot) : desiredName;
var ext = dot >= 0 ? desiredName.slice(dot) : '';
var n = 1;
var candidate = desiredName;
while (folder.getFilesByName(candidate).hasNext()) {
n++;
candidate = stem + ' (' + n + ')' + ext;
}
return candidate;
}

/* 3) Torna saveAnexos tolerante a folder indefinida:
se "folder" vier null/undefined, ele mesmo resolve a pasta do mês.
Padronizado para limitar anexos a 10MB por arquivo. */
function saveAnexos(folder, rncId, anexos, etapaSuffix) {
var saved = [];
if (!anexos || !anexos.length) return saved;

// se não vier, usa a global (se houver) ou resolve agora
var resolvedMonth = monthFolder || _ensureYearMonthFolder_();
folder = folder || _ensureRncFolderInMonth_(resolvedMonth, rncId);

anexos.forEach(function(a){
if (!a || a.error || !a.dataBase64) return;

var ext = '';
var an  = String(a.name || '');
var p   = an.lastIndexOf('.');
if (p >= 0) ext = an.substring(p);

// Padroniza nome conforme etapa: '' | 'resp' | 'conc'
var desired = String(rncId).trim() + (etapaSuffix ? (' - ' + etapaSuffix) : '') + ext;
desired = _ensureUniqueNameInFolder_(folder, desired);

var bytes = Utilities.base64Decode(a.dataBase64);
// limite 10MB por arquivo (padronizado)
if (bytes.length > 10*1024*1024) throw new Error('Arquivo acima de 10MB: ' + (a.name||'sem nome'));

var blob  = Utilities.newBlob(bytes, a.mimeType || 'application/octet-stream', desired);
var f     = folder.createFile(blob);
saved.push({ id: f.getId(), name: f.getName(), url: f.getUrl() });


});

return saved;
}

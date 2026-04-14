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
  var raw = valInfo && String(valInfo.value || '').trim();
  if (!raw) return null;
  var id = _extractDriveId_(raw);
  if (!id) return null;
  return DriveApp.getFolderById(id);
}

function _extractDriveId_(text) {
  if (!text) return '';
  var m = String(text).match(/[-\w]{25,}/);
  return m ? m[0] : '';
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
  var current = idx[rncId] || {};
  if (monthFolder) current.monthFolderId = monthFolder.getId();
  if (rncFolder) current.rncFolderId = rncFolder.getId();
  idx[rncId] = current;
  _writeRncFolderIndex_(baseFolder, idx);
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
    var content = JSON.stringify(payloadObj, null, 2);
    var fileIt = rncFolder.getFilesByName(rncId + '.json');
    var file = fileIt.hasNext()
      ? fileIt.next().setContent(content)
      : rncFolder.createFile(rncId + '.json', content, MimeType.PLAIN_TEXT);
    _registerRncFolders_(_getBaseFolderFromDados_(), rncId, mFolder, rncFolder);
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
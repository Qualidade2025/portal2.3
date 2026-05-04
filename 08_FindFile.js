/** =========================================================
 * Localizar arquivo por ano/mês (fallback busca geral)
 * ========================================================= */

function _findRncFile_(rncId, ano, mesNome) {
  var base = _getBaseFolderFromDados_();
  if (!base) throw new Error('PastaBaseDriveId/PastaBaseDrive não definida na aba Dados.');

  function locateInRncFolder_(rncFolder, monthFolder){
    if (!rncFolder) return null;
    var it = rncFolder.getFilesByName(rncId + '.json');
    if (it.hasNext()) {
      var file = it.next();
      if (!monthFolder) {
        var parents = rncFolder.getParents();
        if (parents.hasNext()) monthFolder = parents.next();
      }
      _registerRncFolders_(base, rncId, monthFolder, rncFolder);
      return { file: file, monthFolder: monthFolder, rncFolder: rncFolder };
    }
    return null;
  }

  function locateInMonth_(monthFolder){
    if (!monthFolder) return null;
    var existingFolderIt = monthFolder.getFoldersByName(_rncFolderName_(rncId));
    var rncFolder = existingFolderIt.hasNext() ? existingFolderIt.next() : null;
    var direct = locateInRncFolder_(rncFolder, monthFolder);
    if (direct) return direct;

    var rawFiles = monthFolder.getFilesByName(rncId + '.json');
    if (rawFiles.hasNext()) {
      rncFolder = rncFolder || _ensureRncFolderInMonth_(monthFolder, rncId);
      var foundFile = rawFiles.next();
      _migrateFilesToRncFolder_(monthFolder, rncFolder, rncId);
      _registerRncFolders_(base, rncId, monthFolder, rncFolder);
      return { file: foundFile, monthFolder: monthFolder, rncFolder: rncFolder };
    }
    return null;
  }

  var idx = _getRncFolderIndex_(base);
  var cached = idx[rncId];
  if (cached) {
    var cachedMonth = _safeGetFolderById_(cached.monthFolderId);
    var cachedRnc = _safeGetFolderById_(cached.rncFolderId);
    var cachedHit = locateInRncFolder_(cachedRnc, cachedMonth);
    if (cachedHit) return cachedHit;
    if (cachedMonth) {
      var monthHit = locateInMonth_(cachedMonth);
      if (monthHit) return monthHit;
    }
  }

  if (ano && mesNome) {
    var yearFolder = base.getFoldersByName(ano);
    if (yearFolder.hasNext()) {
      var year = yearFolder.next();
      var monthFolder = year.getFoldersByName(mesNome);
      if (monthFolder.hasNext()) {
        var monthHit = locateInMonth_(monthFolder.next());
        if (monthHit) return monthHit;
      }
    }
  }

  var yIt = base.getFolders();
  while (yIt.hasNext()) {
    var yFolder = yIt.next();
    var mIt = yFolder.getFolders();
    while (mIt.hasNext()) {
      var mFolder = mIt.next();
      var found = locateInMonth_(mFolder);
      if (found) return found;
    }
  }
  return null;
}
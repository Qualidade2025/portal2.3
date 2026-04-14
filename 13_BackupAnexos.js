/** =========================================================
 * Rotina de backup mensal de anexos antigos
 * ========================================================= */

var BACKUP_FOLDER_KEY = 'PastaBackupAnexosId';
var BACKUP_LOG_FILE = 'backup-log.json';
var BACKUP_ERROR_FILE = 'backup-errors.json';
var BACKUP_RUN_LOG_FILE = 'backup-runs.json';

function _getBackupFolderFromDados_() {
  var info = _getKeyOnDados_(BACKUP_FOLDER_KEY) || _getKeyOnDados_('PastaBackupAnexos');
  var raw = info && String(info.value || '').trim();
  if (!raw) return null;
  var id = _extractDriveId_(raw);
  if (!id) return null;
  return DriveApp.getFolderById(id);
}

function _ensureBackupFolder_() {
  var root = _getBackupFolderFromDados_();
  if (!root) throw new Error('PastaBackupAnexosId/PastaBackupAnexos não definida na aba Dados.');
  return root;
}

function _readJsonFile_(folder, name, fallback) {
  var it = folder.getFilesByName(name);
  if (!it.hasNext()) return fallback;
  try {
    var file = it.next();
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    return fallback;
  }
}

function _writeJsonFile_(folder, name, obj) {
  var content = JSON.stringify(obj || [], null, 2);
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    var f = it.next();
    f.setContent(content);
    return f;
  }
  return folder.createFile(name, content, MimeType.PLAIN_TEXT);
}

function _listarArquivosDaRnc_(rncFolder, rncId, monthFolder) {
  var arquivos = [];
  var folder = rncFolder || monthFolder;
  if (!folder || !rncId) return arquivos;

  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var nm = f.getName();
    if (nm.indexOf(rncId) === 0 && nm.slice(-5).toLowerCase() !== '.json') {
      arquivos.push(f);
    }
  }
  return arquivos;
}

function executarBackupMensalAnexos() {
  var ss = SpreadsheetApp.getActive();
  var shCtrl = ss.getSheetByName('Controle');
  if (!shCtrl) throw new Error('Aba "Controle" não encontrada.');

  var cols = _getControleColumnIndices_(shCtrl);
  var lastRow = shCtrl.getLastRow();
  if (lastRow < 2) return { processed: 0, skipped: 0, errors: 0 };
  var limite = new Date();
  limite.setMonth(limite.getMonth() - 3);

  var backupFolder = _ensureBackupFolder_();
  var historico = _readJsonFile_(backupFolder, BACKUP_LOG_FILE, []);
  var erros = _readJsonFile_(backupFolder, BACKUP_ERROR_FILE, []);
  var execucoes = _readJsonFile_(backupFolder, BACKUP_RUN_LOG_FILE, []);

  var resumo = { processed: 0, skipped: 0, errors: 0 };
  var rncsSucesso = [];

  var BATCH_SIZE = 200;
  for (var startRow = 2; startRow <= lastRow; startRow += BATCH_SIZE) {
    var height = Math.min(BATCH_SIZE, lastRow - startRow + 1);
    var valores = shCtrl.getRange(startRow, 1, height, shCtrl.getLastColumn()).getValues();

    for (var i = 0; i < valores.length; i++) {
      var row = valores[i];
      var linhaPlanilha = startRow + i;

      var backupVal = String(row[cols.backup.index] || '').trim();
      if (backupVal) { resumo.skipped++; continue; }

      var status = String(row[cols.status.index] || '').trim().toLowerCase();
      var statusElegivel = status === 'finalizado' || status === 'cancelada';
      if (!statusElegivel) { resumo.skipped++; continue; }

      if (status === 'finalizado') {
        var dtConc = row[cols.dataValidacaoConclusao.index];
        if (!(dtConc instanceof Date) || dtConc > limite) { resumo.skipped++; continue; }
      }

      var rncId = String(row[cols.rnc.index] || '').trim();
      if (!rncId) { resumo.skipped++; continue; }

      var found = _findRncFile_(rncId, '', '');
      if (!found || !(found.rncFolder || found.monthFolder)) {
        erros.push({ rnc: rncId, data: new Date(), motivo: 'Pasta da RNC não encontrada.' });
        shCtrl.getRange(linhaPlanilha, cols.backup.column).setValue('ERRO');
        resumo.errors++;
        continue;
      }

      var arquivos = _listarArquivosDaRnc_(found.rncFolder, rncId, found.monthFolder);
      if (!arquivos.length) {
        shCtrl.getRange(linhaPlanilha, cols.backup.column).setValue('SEM ANEXO');
        resumo.skipped++;
        continue;
      }

      var zipBlobs = arquivos.map(function (file) { return file.getBlob().setName(file.getName()); });
      var zipName = _ensureUniqueNameInFolder_(backupFolder, rncId + ' - anexos.zip');
      var zipBlob = Utilities.zip(zipBlobs, zipName);

      if (!zipBlob) {
        erros.push({ rnc: rncId, data: new Date(), motivo: 'Falha ao empacotar anexos em zip.' });
        shCtrl.getRange(linhaPlanilha, cols.backup.column).setValue('ERRO');
        resumo.errors++;
        continue;
      }

      var zipFile = backupFolder.createFile(zipBlob);
      if (!zipFile || zipFile.getSize() === 0) {
        erros.push({ rnc: rncId, data: new Date(), motivo: 'Arquivo zip vazio ou não criado.' });
        shCtrl.getRange(linhaPlanilha, cols.backup.column).setValue('ERRO');
        resumo.errors++;
        continue;
      }

      historico.push({
        rnc: rncId,
        dataBackup: new Date(),
        arquivos: [{
          nome: zipFile.getName(),
          urlBackup: zipFile.getUrl(),
          totalArquivos: arquivos.length,
          tamanhoZip: zipFile.getSize()
        }]
      });

      rncsSucesso.push(rncId);
      shCtrl.getRange(linhaPlanilha, cols.backup.column).setValue('X');
      resumo.processed++;

      arquivos.forEach(function(file){ file.setTrashed(true); });
    }
  }

  execucoes.push({ dataExecucao: new Date(), rncs: rncsSucesso });

  _writeJsonFile_(backupFolder, BACKUP_LOG_FILE, historico);
  _writeJsonFile_(backupFolder, BACKUP_ERROR_FILE, erros);
  _writeJsonFile_(backupFolder, BACKUP_RUN_LOG_FILE, execucoes);

  return resumo;
}

function criarGatilhoBackupMensalAnexos() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function (t) { return t.getHandlerFunction() === 'executarBackupMensalAnexos'; });
  if (!exists) {
    ScriptApp.newTrigger('executarBackupMensalAnexos')
      .timeBased()
      .onMonthDay(1)
      .atHour(2)
      .create();
    return { created: true };
  }
  return { created: false };
}
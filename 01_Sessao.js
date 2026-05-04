/** =========================================================
 * Login / Sessão
 * ========================================================= */

function login(usuario, senha) {
  usuario = String(usuario || '').trim();
  senha   = String(senha   || '').trim();
  if (!usuario || !senha) throw new Error('Informe usuário e senha.');

  var sh = SpreadsheetApp.getActive().getSheetByName('Dados');
  if (!sh) throw new Error('Aba "Dados" não encontrada.');
  var data = sh.getDataRange().getValues();

  var hdrIdx=-1, cUsuario=-1, cSenha=-1, cArea=-1, cSup=-1, cSupSenha=-1, cNome=-1;
  for (var i=0;i<data.length;i++){
    var row = data[i].map(function(x){ return String(x||'').trim(); });
    var rowLower = row.map(function(x){ return x.toLowerCase(); });

    if (cUsuario < 0) cUsuario = rowLower.indexOf('usuário');
    if (cSenha   < 0) cSenha   = rowLower.indexOf('senha');
    if (cArea    < 0) cArea    = rowLower.indexOf('área');
    if (cSup     < 0) cSup     = rowLower.indexOf('supervisor');
    if (cNome    < 0) cNome    = rowLower.indexOf('nome');

    var senhaIdx = [];
    for (var s=0; s<rowLower.length; s++){
      if (rowLower[s] === 'senha' || rowLower[s] === 'senha supervisor') senhaIdx.push(s);
    }
    if (cSenha < 0 && senhaIdx.length) cSenha = senhaIdx[0];
    if (senhaIdx.length > 1) cSupSenha = senhaIdx[senhaIdx.length-1];

    if (cUsuario>=0 && cSenha>=0){ hdrIdx=i; break; }
  }
  if (hdrIdx === -1) throw new Error('Cabeçalho de acessos não encontrado (Usuário/Senha).');

  var userFound=false, supFound=false, nome='', area='', supervisor='';
  var supAreas = [];

  for (var r=hdrIdx+1; r<data.length; r++){
    var usr = String(data[r][cUsuario]||'').trim();
    var sen = String(data[r][cSenha]  ||'').trim();
    var supUsr = (cSup>=0)? String(data[r][cSup]||'').trim() : '';
    var supSen = (cSupSenha>=0)? String(data[r][cSupSenha]||'').trim() : '';
    var areaVal = (cArea>=0)? String(data[r][cArea]||'').trim() : '';

    if (usr && sen && usr===usuario && sen===senha){
      userFound=true;
      nome       = (cNome>=0)? String(data[r][cNome]||'').trim() : '';
      area       = areaVal;
      supervisor = supUsr || supervisor;
      break;
    }

    var supSenhaMatch = supSen ? (supSen === senha) : (sen === senha);
    if (supUsr && supSenhaMatch && supUsr === usuario){
      supFound = true;
      if (!nome) nome = (cNome>=0)? String(data[r][cNome]||'').trim() : '';
      supervisor = supUsr;
      if (areaVal && supAreas.indexOf(areaVal) === -1) supAreas.push(areaVal);
    }
  }
  if (!(userFound || supFound)) throw new Error('Usuário ou senha inválidos.');
  if (!nome) nome = usuario;

  var areas = [];
  if (userFound && area) areas.push(area);
  if (supFound && supAreas.length) areas = supAreas.slice();
  if (!area && areas.length) area = areas[0];

  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess:'+token, JSON.stringify({usuario:usuario,nome:nome,area:area,areas:areas,supervisor:supervisor}), 8*60*60);
  return { token:token, usuario:usuario, nome:nome, area:area, areas:areas, supervisor:supervisor };
}

function getProfile(token) {
  var s = _getSession_(token);
  return { usuario:s.usuario, nome:s.nome, area:s.area||'', areas:Array.isArray(s.areas)?s.areas:[], supervisor:s.supervisor||'' };
}

function logout(token) {
  CacheService.getScriptCache().remove('sess:'+String(token||'')); 
  return true;
}

function _getSession_(token) {
  var raw = CacheService.getScriptCache().get('sess:'+String(token||''));
  if (!raw) throw new Error('Sessão expirada. Faça login novamente.');
  return JSON.parse(raw);
}
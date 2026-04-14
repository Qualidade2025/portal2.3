/** =========================================================
 * Routing (WebApp) + include()
 * ========================================================= */

// Use o nome do arquivo HTML principal que você quer servir: 'Index' ou 'Index_modular'
function doGet() {
  var tpl = HtmlService.createTemplateFromFile('Index_modular');
  return tpl.evaluate().setTitle('Portal RNCs');
}

// Permite usar <?!= include('Arquivo'); ?> no HTML
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
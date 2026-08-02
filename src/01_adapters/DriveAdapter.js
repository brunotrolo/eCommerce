/**
 * DriveAdapter — único ponto do projeto que fala com Google Drive.
 * Lê arquivos de uma pasta (XML e PDF de NF-e) e retorna conteúdo
 * para processamento. Nenhum outro arquivo deve chamar DriveApp diretamente.
 */
var DriveAdapter = (function () {
  var XML_MIME = 'application/xml';
  var PDF_MIME = 'application/pdf';

  /**
   * Lê todos os XMLs e PDFs de uma pasta do Drive.
   * @param {string} folderId — ID da pasta no Drive
   * @returns {Array<{name: string, mimeType: string, content: string, id: string, error?: string}>}
   */
  function readDriveFolder(folderId) {
    var results = [];
    try {
      var folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      return [{ name: '', mimeType: '', content: '', id: '', error: 'DriveFolder not found' }];
    }

    var files = [];
    var xmlFiles = folder.getFilesByType(XML_MIME);
    var pdfFiles = folder.getFilesByType(PDF_MIME);

    while (xmlFiles.hasNext()) files.push(xmlFiles.next());
    while (pdfFiles.hasNext()) files.push(pdfFiles.next());

    if (files.length === 0) {
      return [{ name: '', mimeType: '', content: '', id: '', error: 'No XML/PDF files found' }];
    }

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var name = file.getName();
      var mime = file.getMimeType();
      var id = file.getId();

      try {
        var content = file.getBlob().getDataAsString('UTF-8');
        if (!content || content.trim().length === 0) {
          results.push({ name: name, mimeType: mime, content: '', id: id, error: 'Empty file' });
          continue;
        }
        results.push({ name: name, mimeType: mime, content: content, id: id });
      } catch (e) {
        results.push({ name: name, mimeType: mime, content: '', id: id, error: e.message || 'Failed to read file' });
      }
    }

    return results;
  }

  return { readDriveFolder: readDriveFolder };
})();

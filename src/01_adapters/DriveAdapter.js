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

    if (!folderId || folderId.trim().length === 0) {
      return [{ name: '', mimeType: '', content: '', id: '', error: 'driveFolder parameter is empty' }];
    }

    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.indexOf('not found') !== -1 || msg.indexOf('No item') !== -1) {
        return [{ name: '', mimeType: '', content: '', id: '', error: 'Folder not found. Verify the folder ID: ' + folderId }];
      }
      return [{ name: '', mimeType: '', content: '', id: '', error: 'Drive access error: ' + msg }];
    }

    if (!folder) {
      return [{ name: '', mimeType: '', content: '', id: '', error: 'Folder returned null. Check if DriveApp scope is enabled.' }];
    }

    var files = [];
    var xmlFiles = folder.getFilesByType(XML_MIME);
    var pdfFiles = folder.getFilesByType(PDF_MIME);

    while (xmlFiles.hasNext()) files.push(xmlFiles.next());
    while (pdfFiles.hasNext()) files.push(pdfFiles.next());

    if (files.length === 0) {
      return [{ name: '', mimeType: '', content: '', id: '', error: 'No XML/PDF files found in folder: ' + folder.getName() }];
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

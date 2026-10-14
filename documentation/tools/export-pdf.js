// Windows Script Host (JScript): opens the generated document in Microsoft
// Word, updates the table of contents, lists of figures and tables and the
// page numbers, saves it, and exports the matching PDF.
//   cscript //nologo export-pdf.js
var fso = new ActiveXObject("Scripting.FileSystemObject");
var root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName));
var docx = fso.BuildPath(root, "LuxuryStay_HMS_Documentation.docx");
var pdf = fso.BuildPath(root, "LuxuryStay_HMS_Documentation.pdf");
var word = new ActiveXObject("Word.Application");
word.Visible = false;
word.DisplayAlerts = 0;
try {
  var doc = word.Documents.Open(docx, false, false);
  for (var pass = 0; pass < 2; pass++) {
    for (var i = 1; i <= doc.TablesOfContents.Count; i++) doc.TablesOfContents.Item(i).Update();
    doc.Fields.Update();
    doc.Repaginate();
  }
  WScript.Echo("TOCs: " + doc.TablesOfContents.Count + " | pages: " + doc.ComputeStatistics(2));
  doc.Save();
  // 17 = PDF, optimise for print, whole document, bookmarks from headings.
  doc.ExportAsFixedFormat(pdf, 17, false, 0, 0, 1, 1, 0, true, true, 1, true, true, false);
  doc.Close(false);
  WScript.Echo("exported " + pdf);
} catch (e) {
  WScript.Echo("ERROR " + e.message);
} finally {
  word.Quit(0);
}

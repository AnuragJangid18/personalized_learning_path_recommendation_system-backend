const pdf = require('pdf-parse');
console.log('Type of pdf-parse:', typeof pdf);
if (typeof pdf === 'object') {
  console.log('Keys:', Object.keys(pdf));
  console.log('Type of PDFParse:', typeof pdf.PDFParse);
  if (typeof pdf.PDFParse === 'function') {
    console.log('PDFParse is a function/constructor');
  }
}

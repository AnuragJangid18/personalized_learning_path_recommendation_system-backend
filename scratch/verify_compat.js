const pdfParsePackage = require('pdf-parse');
console.log('Package type:', typeof pdfParsePackage);
const pdfParse = typeof pdfParsePackage === 'function' ? pdfParsePackage : (pdfParsePackage.PDFParse || pdfParsePackage);
console.log('Parser type:', typeof pdfParse);

async function test() {
  const dummyBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000062 00000 n\n0000000125 00000 n\n0000000251 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n346\n%%EOF');
  
  let data;
  if (typeof pdfParse === 'function') {
    try {
      console.log('Attempting call as function...');
      data = await pdfParse(dummyBuffer);
      console.log('Success as function');
    } catch (e) {
      console.log('Failed as function, attempting as class...');
      try {
        const Parser = pdfParse;
        data = await (new Parser()).parse(dummyBuffer);
        console.log('Success as class');
      } catch (e2) {
        console.error('Failed both ways:', e2.message);
      }
    }
  }
}

test();

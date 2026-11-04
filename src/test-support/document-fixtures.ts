/** Structurally complete synthetic PDF; no personal data, external assets or scripts. */
export function syntheticPdf(pageCount = 1): Buffer {
  const content = 'BT /F1 12 Tf 20 50 Td (Synthetic transport fixture) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [' +
      Array.from(
        { length: pageCount },
        (_, index) => String(index === 0 ? 3 : index + 5) + ' 0 R',
      ).join(' ') +
      '] /Count ' +
      pageCount +
      ' >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' +
      Buffer.byteLength(content) +
      ' >>\nstream\n' +
      content +
      '\nendstream',
  ];
  for (let index = 1; index < pageCount; index++) objects.push(objects[2]);
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += i + 1 + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1))
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(
    pdf +
      'trailer\n<< /Size ' +
      (objects.length + 1) +
      ' /Root 1 0 R >>\nstartxref\n' +
      xref +
      '\n%%EOF\n',
  );
}

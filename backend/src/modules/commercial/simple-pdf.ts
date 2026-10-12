function escapePdf(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function normalizeLine(value: string): string {
  return value.replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\xFF]/g, '?');
}

export function createSimplePdf(title: string, lines: string[]): Buffer {
  const pageLines = [title, '', ...lines].map(normalizeLine);
  const chunks: string[][] = [];
  for (let index = 0; index < pageLines.length; index += 46) chunks.push(pageLines.slice(index, index + 46));
  if (!chunks.length) chunks.push([title]);

  const objectBodies: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const fontObjectId = 3 + chunks.length * 2;
  chunks.forEach((_, index) => {
    pageObjectIds.push(3 + index * 2);
    contentObjectIds.push(4 + index * 2);
  });
  objectBodies[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objectBodies[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${chunks.length} >>`;

  chunks.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    const commands = page.map((line, lineIndex) => {
      const size = lineIndex === 0 && index === 0 ? 16 : 10;
      const leading = lineIndex === 0 ? 0 : 15;
      return `${lineIndex ? `0 -${leading} Td ` : ''}/F1 ${size} Tf (${escapePdf(line)}) Tj`;
    }).join('\n');
    const stream = `BT\n50 790 Td\n${commands}\nET`;
    objectBodies[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objectBodies[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });
  objectBodies[fontObjectId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let id = 1; id <= fontObjectId; id += 1) {
    offsets[id] = Buffer.byteLength(output, 'latin1');
    output += `${id} 0 obj\n${objectBodies[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${fontObjectId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontObjectId; id += 1) output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, 'latin1');
}

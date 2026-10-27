/** Server-only extraction. Scanned PDFs are marked for OCR instead of silently indexed as empty. */
export async function extractSupplierPdfText(bytes: Uint8Array) {
  let task: { destroy(): Promise<void> } | undefined;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
    task = loading;
    const pdf = await loading.promise;
    const chunks: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      chunks.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      page.cleanup();
    }
    const text = chunks.join('\n').replace(/\0/g, '').slice(0, 500000);
    return { content_text: text, text_extraction_status: text.replace(/\s/g, '').length >= 20 ? 'ready' : 'needs_ocr' };
  } catch {
    return { content_text: '', text_extraction_status: 'failed' };
  } finally {
    await task?.destroy().catch(() => {});
  }
}

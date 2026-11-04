const { parentPort, workerData } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
(async () => {
  const { getDocument } = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const loading = getDocument({
    data: new Uint8Array(workerData),
    useSystemFonts: false, isEvalSupported: false, useWasm: false,
    maxImageSize: 48_000_000, stopAtErrors: true, disableAutoFetch: true,
  });
  try {
    const document = await loading.promise;
    if (document.numPages < 1 || document.numPages > 100) throw Error('Page limit');
    if (await document.getJSActions() || await document.getAttachments()) throw Error('Active/embedded content');
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      if (![viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0 && value <= 12000)) throw Error('Page dimensions');
      if (await page.getJSActions()) throw Error('Active content');
      await page.getOperatorList();
      page.cleanup();
    }
    parentPort.postMessage(true);
  } finally { await loading.destroy(); }
})().catch(error => parentPort.postMessage({ valid: false, reason: error.message }));

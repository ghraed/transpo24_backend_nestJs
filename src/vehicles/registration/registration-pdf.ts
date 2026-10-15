import { createCanvas } from '@napi-rs/canvas';

/** Render only registration pages; never send the original document to the provider. */
export async function renderRegistrationPdf(
  buffer: Buffer,
  remainingPages: number,
  signal?: AbortSignal,
): Promise<Buffer[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    maxImageSize: 48000000,
    stopAtErrors: true,
  });
  const cancel = () => {
    void loading.destroy().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const images: Buffer[] = [];
  try {
    if (signal?.aborted) throw new Error('Cancelled');
    const document = await loading.promise;
    if (document.numPages < 1 || document.numPages > remainingPages)
      throw new Error('Too many registration pages');
    for (let index = 1; index <= document.numPages; index++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const page = await document.getPage(index);
      const original = page.getViewport({ scale: 1 });
      const longest = Math.max(original.width, original.height);
      if (
        !Number.isFinite(longest) ||
        Math.min(original.width, original.height) <= 0
      )
        throw new Error('Invalid page dimensions');
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / longest) });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      try {
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvas.getContext(
            '2d',
          ) as unknown as CanvasRenderingContext2D,
          viewport,
          background: '#ffffff',
        }).promise;
        const image = await canvas.encode('jpeg', 85);
        if (image.length > 8 * 1024 * 1024) {
          image.fill(0);
          throw new Error('Rendered page too large');
        }
        images.push(image);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    }
    return images;
  } catch (error) {
    for (const image of images) image.fill(0);
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await loading.destroy();
  }
}

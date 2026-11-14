/** Reads the text in a screenshot, in the browser, for free. Loaded only when needed. */
export async function readScreenshotText(file: Blob, onProgress?: (pct: number) => void): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100))
    },
  })
  try {
    // "Sparse text" finds the big amount and the small UTR on payment screens.
    // (The default "single block" mode skips large, isolated text like ₹200.)
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const { data } = await worker.recognize(await fitForOcr(file))
    return data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

/** Very large screenshots are slow to read; 1080 px wide keeps all the text clear. */
async function fitForOcr(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    if (bmp.width <= 1100) { bmp.close(); return file }
    const scale = 1080 / bmp.width
    const c = document.createElement('canvas')
    c.width = 1080; c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/png'))
  } catch {
    return file
  }
}

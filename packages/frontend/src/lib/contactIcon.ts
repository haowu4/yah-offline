const MAX_ICON_BYTES = 2 * 1024 * 1024

function fileTypeError(): Error {
  return new Error('Only PNG and JPEG files are allowed. GIF/WebP are not supported.')
}

export function validateContactIconInput(file: File): void {
  if (file.type === 'image/gif' || file.type === 'image/webp') {
    throw fileTypeError()
  }

  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw fileTypeError()
  }
}

async function toPngBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Unable to create image context')
    ctx.drawImage(bitmap, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/png')
    })

    if (!blob) throw new Error('Failed to convert icon image to PNG')
    return blob
  } finally {
    bitmap.close()
  }
}

export async function normalizeContactIcon(file: File): Promise<Blob> {
  validateContactIconInput(file)
  const pngBlob = await toPngBlob(file)
  if (pngBlob.size > MAX_ICON_BYTES) {
    throw new Error('Icon file exceeds 2MB limit after PNG conversion')
  }
  return pngBlob
}

/**
 * Compresión de la foto de un ejercicio antes de subirla.
 *
 * El navegador reduce a un máximo de 1280 px y recomprime para que el archivo
 * quede por debajo de 2 MB. Así el plan gratuito de KV no se satura y la subida
 * funciona incluso con fotos de celular. Los GIF cortos (para explicar el
 * ejercicio) pasan tal cual: no se recomprimen para no perder la animación.
 */

const MAX_EDGE = 1280
const TARGET_BYTES = 1_800_000
const SERVER_MAX_BYTES = 2 * 1024 * 1024
const INPUT_MAX_BYTES = 12 * 1024 * 1024
const ACCEPTED = ['image/gif', 'image/jpeg', 'image/png', 'image/webp']

export class ExerciseImageError extends Error {}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ExerciseImageError('No pudimos procesar la imagen.'))),
      type,
      quality,
    )
  })

export async function compressExerciseImage(file: File): Promise<File> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ExerciseImageError('Formato no admitido. Usa una foto JPG, PNG, WebP o un GIF corto.')
  }
  if (file.size > INPUT_MAX_BYTES) {
    throw new ExerciseImageError('La foto es demasiado grande. Usa una de menos de 12 MB.')
  }

  // Los GIF animados pasan sin reprocesar: si se dibujan en canvas se pierde
  // la animación (quedaría solo el primer fotograma).
  if (file.type === 'image/gif') {
    if (file.size > SERVER_MAX_BYTES) {
      throw new ExerciseImageError(
        'El GIF supera el máximo de 2 MB. Recórtalo a ~2 segundos o comprímelo antes de subirlo.',
      )
    }
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ExerciseImageError('No pudimos leer la imagen. Prueba con otra foto.')
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new ExerciseImageError('Este navegador no puede procesar la imagen.')
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.82
  let blob = await toBlob(canvas, 'image/webp', quality)
  while (blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.12
    blob = await toBlob(canvas, 'image/webp', quality)
  }
  if (blob.size > SERVER_MAX_BYTES) {
    throw new ExerciseImageError('La imagen sigue siendo muy pesada. Prueba con una foto más pequeña.')
  }

  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp'
  return new File([blob], `ejercicio.${extension}`, { type: blob.type || 'image/webp' })
}

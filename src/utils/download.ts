/** Triggers a browser download of `blob` named `filename` via a synthetic click. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** \p{M} keeps Tamil combining vowel signs intact in filenames. */
export function safeFilenamePart(name: string): string {
  return name.replace(/[^\p{L}\p{M}\p{N}-]+/gu, '_')
}

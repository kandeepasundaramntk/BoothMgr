/** Display label for an assembly: "constituency code - name", or bare name when no code is set. */
export function assemblyLabel(a: { name: string; constituency_code?: string | null }): string {
  const code = a.constituency_code?.trim()
  return code ? `${code} - ${a.name}` : a.name
}

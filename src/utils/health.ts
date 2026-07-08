/** Color for a booth's committed-vote percentage (Booth Health Score). */
export function healthColor(committedPct: number | null): string {
  if (committedPct === null) return '#9e9e9e'
  if (committedPct >= 50) return '#1b7a2f'
  if (committedPct >= 35) return '#b8860b'
  return '#b71c1c'
}

export function healthLabel(committedPct: number | null): string {
  if (committedPct === null) return '—'
  return `${Math.round(committedPct)}%`
}

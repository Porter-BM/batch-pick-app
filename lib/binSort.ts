/**
 * Segment-aware natural sort for bin locations in format A01-01-01
 * Sorts each hyphen-separated segment numerically.
 * e.g. A01-01-01, A01-01-02, A01-02-01, B01-01-01
 */
export function compareBinLocations(a: string | null, b: string | null): number {
  // Null/empty bins always sort to end
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1

  const segmentsA = a.split('-')
  const segmentsB = b.split('-')

  const maxLen = Math.max(segmentsA.length, segmentsB.length)

  for (let i = 0; i < maxLen; i++) {
    const segA = segmentsA[i] ?? ''
    const segB = segmentsB[i] ?? ''

    // Try numeric comparison for the numeric part of each segment
    const numA = parseInt(segA.replace(/^[A-Za-z]+/, ''), 10)
    const numB = parseInt(segB.replace(/^[A-Za-z]+/, ''), 10)

    // Compare letter prefix first
    const letterA = segA.replace(/[0-9]/g, '')
    const letterB = segB.replace(/[0-9]/g, '')

    if (letterA !== letterB) {
      return letterA.localeCompare(letterB)
    }

    // Same letter prefix — compare numeric part
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB
    } else {
      const cmp = segA.localeCompare(segB)
      if (cmp !== 0) return cmp
    }
  }

  return 0
}

/**
 * Sort an array of objects by their bin location field
 */
export function sortByBinLocation<T extends { binLocation: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareBinLocations(a.binLocation, b.binLocation))
}

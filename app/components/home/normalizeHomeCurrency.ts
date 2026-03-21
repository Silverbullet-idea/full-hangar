/** Collapse accidental doubled currency symbols in marketing copy (e.g. two `$` before an amount). */
export function normalizeHomeCurrency(text: string): string {
  const one = "$"
  const two = one + one
  let result = text
  while (result.includes(two)) {
    result = result.split(two).join(one)
  }
  return result
}

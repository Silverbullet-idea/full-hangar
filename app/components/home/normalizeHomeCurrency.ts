/** Collapse accidental double dollar signs in marketing copy (e.g. `$` + `$42,500`). */
export function normalizeHomeCurrency(text: string): string {
  return text.replace(/\$\$+/g, "$")
}

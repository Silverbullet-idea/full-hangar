export type ListingDetailFootnotePayload = {
  sourceLabel: string
  intelligenceVersion: string | null
  parserVersion: string | null
  lastUpdated: string | null
}

type ListingDetailDataFootnoteProps = {
  footnote: ListingDetailFootnotePayload
}

export default function ListingDetailDataFootnote({ footnote }: ListingDetailDataFootnoteProps) {
  return (
    <footer
      className="mx-auto mb-8 mt-8 max-w-[1280px] rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-4 py-3 text-center text-[11px] leading-relaxed text-[var(--fh-text-muted)] sm:px-5 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50 lg:px-6"
      aria-label="Listing data and disclaimer"
    >
      <p className="m-0 mb-2">
        Data sourced from {footnote.sourceLabel} · FAA Registry
        {footnote.parserVersion ? ` · Parser v${footnote.parserVersion}` : ""}.
      </p>
      <p className="m-0 mb-2">
        Intelligence score computed by Full Hangar
        {footnote.intelligenceVersion ? ` v${footnote.intelligenceVersion}` : ""}
        {footnote.lastUpdated ? ` · Last updated ${footnote.lastUpdated}` : ""}.
      </p>
      <p className="m-0">
        Full-Hangar.com is not a broker or dealer. Always conduct a pre-buy inspection.
      </p>
    </footer>
  )
}

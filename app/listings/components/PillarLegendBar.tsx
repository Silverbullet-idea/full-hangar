export default function PillarLegendBar() {
  const items = [
    { label: 'Engine Health', color: '#22c55e' },
    { label: 'Avionics', color: '#3b82f6' },
    { label: 'Listing Quality', color: '#FF9900' },
    { label: 'Market Value', color: '#f59e0b' },
    { label: 'STC/Mods', color: '#ec4899' },
  ]
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--fh-border)] bg-[var(--fh-bg2)] px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="font-bold uppercase tracking-wide text-[var(--fh-text-muted)]"
          style={{ fontFamily: 'var(--font-barlow-condensed), system-ui', fontSize: '10px' }}
        >
          Score pillars
        </span>
        {items.map((it) => (
          <span
            key={it.label}
            className="flex items-center gap-1.5 text-xs text-[var(--fh-text-dim)]"
            style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
          >
            <span
              className="inline-block rounded-sm"
              style={{ width: 8, height: 8, background: it.color }}
            />
            {it.label}
          </span>
        ))}
      </div>
      <p
        className="max-w-xl text-right text-[10px] italic text-[var(--fh-text-muted)]"
        style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
      >
        ⚠ Listings without a disclosed price are not scored for deal tier.
      </p>
    </div>
  )
}

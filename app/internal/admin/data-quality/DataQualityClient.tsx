"use client";

import { useMemo, useState } from "react";

type FieldRow = {
  field: string;
  category: string;
  weight: "critical" | "high" | "medium";
  filled: number;
  total: number;
  fill_pct: number;
  parser_hint: string;
};

type Props = {
  totalActiveListings: number;
  sourceCount: number;
  overallCompletenessPct: number;
  fieldStats: FieldRow[];
  sourceStats: Array<{
    source: string;
    listing_count: number;
    overall_fill_pct: number;
    field_breakdown: Record<string, number>;
  }>;
  distribution: { excellent: number; good: number; fair: number; sparse: number };
  recommendations: Array<{
    field: string;
    category: string;
    fill_pct: number;
    weight: string;
    parser_hint: string;
    level: "critical" | "high" | "medium";
  }>;
};

export default function DataQualityClient(props: Props) {
  const [sortKey, setSortKey] = useState<"fill_pct" | "field" | "category">("fill_pct");
  const [ascending, setAscending] = useState(true);

  const rows = useMemo(() => {
    return [...props.fieldStats].sort((a, b) => {
      if (sortKey === "field") return ascending ? a.field.localeCompare(b.field) : b.field.localeCompare(a.field);
      if (sortKey === "category") return ascending ? a.category.localeCompare(b.category) : b.category.localeCompare(a.category);
      return ascending ? a.fill_pct - b.fill_pct : b.fill_pct - a.fill_pct;
    });
  }, [props.fieldStats, sortKey, ascending]);

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-2xl font-semibold">Data Quality</h1>
        <p className="text-sm text-brand-muted">
          Based on {props.totalActiveListings.toLocaleString()} active listings across {props.sourceCount} sources.
        </p>
        <div className="mt-2 text-4xl font-bold text-brand-orange">{props.overallCompletenessPct}%</div>
      </header>

      <section>
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <button className="rounded border border-brand-dark px-2 py-1" onClick={() => { setSortKey("fill_pct"); setAscending(true); }}>
              Sort: Worst Fill %
            </button>
            <button className="rounded border border-brand-dark px-2 py-1" onClick={() => { setSortKey("field"); setAscending(true); }}>
              Sort: Field
            </button>
            <button className="rounded border border-brand-dark px-2 py-1" onClick={() => { setSortKey("category"); setAscending(true); }}>
              Sort: Category
            </button>
          </div>
          <div className="max-h-[30rem] overflow-auto rounded border border-brand-dark">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[#111111]">
                <tr className="text-left text-xs uppercase tracking-wide text-brand-muted">
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Weight</th>
                  <th className="px-3 py-2">Fill %</th>
                  <th className="px-3 py-2">Filled</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Quality Bar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const color = row.fill_pct >= 75 ? "bg-emerald-600" : row.fill_pct >= 50 ? "bg-brand-orange" : "bg-brand-burn";
                  return (
                    <tr key={row.field} className="border-t border-brand-dark hover:bg-[#1d1d1d]">
                      <td className="px-3 py-2 font-semibold">{row.field}</td>
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2">{row.weight}</td>
                      <td className="px-3 py-2">{row.fill_pct}%</td>
                      <td className="px-3 py-2">{row.filled.toLocaleString()}</td>
                      <td className="px-3 py-2">{row.total.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-28 rounded bg-[#333333]">
                          <div className={`h-2 rounded ${color}`} style={{ width: `${Math.max(2, row.fill_pct)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Recommendation Panel</h2>
          <div className="space-y-2 text-sm">
            {props.recommendations.slice(0, 12).map((row) => {
              const icon = row.level === "critical" ? "🔴 CRITICAL" : row.level === "high" ? "🟠 HIGH" : "🟡 MEDIUM";
              return (
                <div key={row.field} className="rounded border border-brand-dark p-2">
                  <p className="font-semibold">{icon}: `{row.field}` is {row.fill_pct}% filled.</p>
                  <p className="text-brand-muted">→ Cursor task: Improve parser extraction for `{row.field}` using hint: {row.parser_hint}.</p>
                </div>
              );
            })}
          </div>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Source Comparison Matrix</h2>
          <div className="space-y-2">
            {props.sourceStats.map((source) => (
              <details key={source.source} className="rounded border border-brand-dark p-2">
                <summary className="cursor-pointer font-semibold">
                  {source.source} - {source.overall_fill_pct}% overall ({source.listing_count.toLocaleString()} listings)
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(source.field_breakdown).map(([field, pct]) => (
                    <p key={field}>
                      {field}: <span className="text-brand-orange">{pct}%</span>
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

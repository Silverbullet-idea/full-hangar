"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function SourceInventoryChart({
  rows,
}: {
  rows: Array<{ source: string; listing_count: number; overall_fill_pct: number }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
          <XAxis dataKey="source" stroke="#B2B2B2" />
          <YAxis stroke="#B2B2B2" />
          <Tooltip
            contentStyle={{ background: "#1a1a1a", border: "1px solid #333333", color: "#FFFFFF" }}
            formatter={(value: number, key: string) => [value, key === "listing_count" ? "Listings" : "Fill %"]}
          />
          <Bar dataKey="listing_count" radius={[6, 6, 0, 0]}>
            {rows.map((row) => {
              const fill = row.overall_fill_pct;
              const color = fill >= 75 ? "#2e7d32" : fill >= 50 ? "#FF9900" : "#AF4D27";
              return <Cell key={row.source} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompletenessDonut({
  distribution,
}: {
  distribution: { excellent: number; good: number; fair: number; sparse: number };
}) {
  const data = [
    { name: "Excellent", value: distribution.excellent, color: "#2e7d32" },
    { name: "Good", value: distribution.good, color: "#FF9900" },
    { name: "Fair", value: distribution.fair, color: "#AF4D27" },
    { name: "Sparse", value: distribution.sparse, color: "#8B1D1D" },
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333333", color: "#FFFFFF" }} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

type CompRow = {
  id: string | null;
  title: string | null;
  price: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  total_time_hours: number | null;
  engine_smoh: number | null;
  value_score: number | null;
  risk_level: string | null;
  listing_url: string | null;
  source: string | null;
  days_on_market: number | null;
  location_label: string | null;
  primary_image_url: string | null;
  deal_tier: string | null;
};

type CompsPayload = {
  target: CompRow;
  comps: CompRow[];
  metadata: {
    comp_count: number;
    search_criteria_used: string;
    model_family?: string | null;
    submodel_only?: boolean;
    price_range: { min: number | null; max: number | null; median: number | null };
    time_range: { min_tt: number | null; max_tt: number | null; median_tt: number | null };
  };
};

type ApiResponse = { data: CompsPayload | null; error: string | null };

type Props = {
  listingId: string;
  hideChrome?: boolean;
};

type ViewMode = "time" | "year";

type ScatterPoint = {
  id: string;
  label: string;
  price: number;
  yValue: number;
  yLabel: string;
  riskLevel: string;
  valueScore: number;
  listingUrl: string | null;
  isTarget: boolean;
  pointSize: number;
  locationLabel: string;
  imageUrl: string | null;
  dealTier: string | null;
  daysOnMarket: number | null;
  hasEstimatedPrice?: boolean;
  hasEstimatedY?: boolean;
};

const TARGET_COLOR = "#FF9900";
const COMP_COLOR = "#999999";
const HOVER_COLOR = "#FF9900";

function formatMoney(value: number | null): string {
  if (typeof value !== "number") return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatPriceTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value)}`;
}

function formatHours(value: number | null): string {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value).toLocaleString("en-US")} hrs`;
}

function formatYValue(value: number | null, metricLabel: string): string {
  if (typeof value !== "number") return "N/A";
  if (metricLabel === "Year") return String(Math.round(value));
  return formatHours(value);
}

function getRiskColor(risk: string | null): string {
  const level = (risk || "").toUpperCase();
  if (level === "LOW") return "#16a34a";
  if (level === "MODERATE") return "#d97706";
  if (level === "HIGH") return "#ef4444";
  if (level === "CRITICAL") return "#b91c1c";
  return "#9ca3af";
}

function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [breakpointPx]);
  return isMobile;
}

export default function CompsChart({ listingId, hideChrome = false }: Props) {
  const [payload, setPayload] = useState<CompsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submodelOnly, setSubmodelOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("time");
  const [activePoint, setActivePoint] = useState<ScatterPoint | null>(null);
  const [activePointPosition, setActivePointPosition] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringChart, setIsHoveringChart] = useState(false);
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  const isMobile = useIsMobile();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (submodelOnly) params.set("submodelOnly", "1");
        const query = params.toString();
        const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/comps${query ? `?${query}` : ""}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        const json = (await response.json()) as ApiResponse;
        if (!response.ok || json.error || !json.data) {
          setError(json.error || "Failed to load comparable listings.");
          setPayload(null);
          return;
        }
        setPayload(json.data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Failed to load comparable listings.");
          setPayload(null);
        }
      } finally {
        setLoading(false);
      }
    }
    run();
    return () => controller.abort();
  }, [listingId, submodelOnly]);

  const yMetric = useMemo(() => {
    if (viewMode === "year") return "year" as const;
    if (!payload) return "total_time_hours" as const;
    const comps = payload.comps;
    const smohCount = comps.filter((row) => typeof row.engine_smoh === "number").length;
    const ttCount = comps.filter((row) => typeof row.total_time_hours === "number").length;
    return smohCount >= ttCount && smohCount > 0 ? ("engine_smoh" as const) : ("total_time_hours" as const);
  }, [payload, viewMode]);

  const yLabel = yMetric === "engine_smoh" ? "Engine SMOH" : yMetric === "year" ? "Year" : "Total Time";

  const points = useMemo<ScatterPoint[]>(() => {
    if (!payload) return [];
    const hasValidPrice = (value: number | null) => typeof value === "number" && value > 0;
    const hasValidY = (value: number | null) =>
      typeof value === "number" && (yMetric === "year" ? value >= 1900 : value > 0);
    const compPoints = payload.comps
      .filter((row) => hasValidPrice(row.price) && hasValidY(row[yMetric]))
      .map((row) => ({
        id: String(row.id ?? `${row.make}-${row.model}-${row.year}-${row.price}`),
        label: `${row.year ?? "?"} ${row.make ?? ""} ${row.model ?? ""}`.trim(),
        price: row.price as number,
        yValue: row[yMetric] as number,
        yLabel: yLabel,
        riskLevel: row.risk_level ?? "UNKNOWN",
        valueScore: row.value_score ?? 50,
        listingUrl: row.listing_url,
        isTarget: false,
        pointSize: Math.max(7, Math.min(16, Math.round((row.value_score ?? 50) / 8))),
        locationLabel: row.location_label ?? "Location unavailable",
        imageUrl: row.primary_image_url ?? null,
        dealTier: row.deal_tier ?? null,
        daysOnMarket: row.days_on_market ?? null,
      }));

    const target = payload.target;
    const compPrices = compPoints.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
    const compYValues = compPoints.map((point) => point.yValue).filter((value) =>
      Number.isFinite(value) && (yMetric === "year" ? value >= 1900 : value > 0)
    );

    const fallbackPrice =
      payload.metadata.price_range.median ??
      payload.metadata.price_range.min ??
      compPrices[0] ??
      1;
    const fallbackY =
      (yMetric === "year"
        ? payload.target.year ?? (new Date().getFullYear() - 1)
        : null) ??
      (compYValues.length > 0 ? Math.round(compYValues.reduce((sum, value) => sum + value, 0) / compYValues.length) : null) ??
      (yMetric === "year" ? 2000 : 1);

    const resolvedPrice = hasValidPrice(target.price) ? (target.price as number) : fallbackPrice;
    const resolvedY = hasValidY(target[yMetric]) ? (target[yMetric] as number) : fallbackY;

    const targetPoint: ScatterPoint = {
      id: String(target.id ?? "target"),
      label: "This Aircraft",
      price: resolvedPrice,
      yValue: resolvedY,
      yLabel: yLabel,
      riskLevel: target.risk_level ?? "UNKNOWN",
      valueScore: target.value_score ?? 50,
      listingUrl: target.listing_url,
      isTarget: true,
      pointSize: 18,
      locationLabel: target.location_label ?? "Location unavailable",
      imageUrl: target.primary_image_url ?? null,
      dealTier: target.deal_tier ?? null,
      daysOnMarket: target.days_on_market ?? null,
      hasEstimatedPrice: !hasValidPrice(target.price),
      hasEstimatedY: !hasValidY(target[yMetric]),
    };

    return [...compPoints, targetPoint];
  }, [payload, yMetric, yLabel]);

  const priceKnownButMissingY = useMemo(() => {
    if (!payload) return [];
    if (viewMode !== "time") return [];
    const hasValidPrice = (value: number | null) => typeof value === "number" && value > 0;
    const hasValidY = (value: number | null) => typeof value === "number" && value > 0;
    return payload.comps
      .filter((row) => hasValidPrice(row.price) && !hasValidY(row[yMetric]))
      .slice(0, 10);
  }, [payload, viewMode, yMetric]);

  const mobileBars = useMemo(() => {
    if (!payload) return [];
    return payload.comps
      .map((row) => ({
        id: String(row.id ?? `${row.make}-${row.model}-${row.year}`),
        name: `${row.year ?? "?"} ${row.make ?? ""} ${row.model ?? ""}`.trim(),
        valueScore: row.value_score ?? 0,
      }))
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, 10);
  }, [payload]);

  const plottingStats = useMemo(() => {
    if (!payload) return null;
    const hasValidPrice = (value: number | null) => typeof value === "number" && value > 0;
    const hasValidY = (value: number | null) =>
      typeof value === "number" && (yMetric === "year" ? value >= 1900 : value > 0);
    const rows = payload.comps;
    const plotted = rows.filter((row) => hasValidPrice(row.price) && hasValidY(row[yMetric])).length;
    const missingPrice = rows.filter((row) => !hasValidPrice(row.price)).length;
    const missingY = rows.filter((row) => hasValidPrice(row.price) && !hasValidY(row[yMetric])).length;
    return {
      total: rows.length,
      plotted,
      excluded: rows.length - plotted,
      missingPrice,
      missingY,
    };
  }, [payload, yMetric]);

  if (loading) {
    return <div style={{ height: 280, borderRadius: 10, border: hideChrome ? "1px solid #3a4454" : "1px solid #3a4454", background: "#141922" }} />;
  }

  if (error) {
    return <p style={{ color: "#b2b2b2" }}>{error}</p>;
  }

  if (!payload || payload.comps.length < 1) {
    return <p style={{ color: "#b2b2b2" }}>Not enough comparable listings yet. Check back as our database grows.</p>;
  }

  const targetHasPrice = typeof payload.target.price === "number";
  const targetYValue = typeof payload.target[yMetric] === "number" ? (payload.target[yMetric] as number) : null;
  const priceRange = payload.metadata.price_range;
  const tooltipStyle = (() => {
    const containerWidth = chartContainerRef.current?.clientWidth ?? 680;
    const tooltipWidth = 300;
    const rawX = activePointPosition?.x ?? 60;
    const rawY = activePointPosition?.y ?? 40;
    const minX = tooltipWidth / 2 + 10;
    const maxX = containerWidth - tooltipWidth / 2 - 10;
    const clampedX = Math.min(Math.max(rawX, minX), maxX);
    const clampedY = Math.max(rawY - 12, 12);
    return {
      position: "absolute" as const,
      left: clampedX,
      top: clampedY,
      transform: "translate(-50%, -100%)",
      zIndex: 6,
      background: "#111827",
      border: "1px solid #3a4454",
      borderRadius: 8,
      padding: "0.6rem",
      minWidth: tooltipWidth,
    };
  })();

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: "0.55rem" }}>
        {!hideChrome ? <h3 className="comps-title">Comparable Market Intelligence</h3> : <div style={{ fontSize: "0.82rem", color: "#B2B2B2" }}>Comparable Market Intelligence</div>}
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "inline-flex", border: "1px solid #3a4454", borderRadius: 8, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setViewMode("time")}
              style={{
                border: "none",
                borderRight: "1px solid #3a4454",
                padding: "0.28rem 0.45rem",
                background: viewMode === "time" ? "#FF9900" : "#141922",
                color: viewMode === "time" ? "#000000" : "#B2B2B2",
                fontSize: "0.73rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Price vs Time
            </button>
            <button
              type="button"
              onClick={() => setViewMode("year")}
              style={{
                border: "none",
                padding: "0.28rem 0.45rem",
                background: viewMode === "year" ? "#FF9900" : "#141922",
                color: viewMode === "year" ? "#000000" : "#B2B2B2",
                fontSize: "0.73rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Price vs Year
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSubmodelOnly((prev) => !prev)}
            title={submodelOnly ? "Showing this exact submodel only. Click to compare all submodels in this model family." : "Showing full model family (all submodels). Click to show only this exact submodel."}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid #3a4454",
              borderRadius: 8,
              padding: "0.28rem 0.45rem",
              background: submodelOnly ? "#FF9900" : "#141922",
              color: submodelOnly ? "#000000" : "#B2B2B2",
              fontSize: "0.73rem",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" />
            </svg>
            {submodelOnly ? "Submodel only" : "All submodels"}
          </button>
        </div>
      </div>

      {!isMobile ? (
        <div
          ref={chartContainerRef}
          style={{ position: "relative", width: "100%", height: 300 }}
          onMouseEnter={() => setIsHoveringChart(true)}
          onMouseLeave={() => {
            setIsHoveringChart(false);
            if (!isHoveringCard) {
              setActivePoint(null);
              setActivePointPosition(null);
            }
          }}
        >
          <ResponsiveContainer>
            <ScatterChart
              margin={{ top: 20, right: 20, bottom: 15, left: 10 }}
              onMouseMove={(state: any) => {
                const point = state?.activePayload?.[0]?.payload as ScatterPoint | undefined;
                if (point) {
                  setActivePoint(point);
                  const chartX = typeof state?.chartX === "number" ? state.chartX : null;
                  const chartY = typeof state?.chartY === "number" ? state.chartY : null;
                  if (chartX !== null && chartY !== null) {
                    setActivePointPosition({ x: chartX, y: chartY });
                  }
                }
              }}
            >
              <CartesianGrid stroke="#F0F0F0" strokeOpacity={0.2} />
              <XAxis
                type="number"
                dataKey="price"
                name="Price"
                tickFormatter={formatPriceTick}
                stroke="#b2b2b2"
                tick={{ fill: "#b2b2b2", fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="yValue"
                name={yLabel}
                stroke="#b2b2b2"
                tick={{ fill: "#b2b2b2", fontSize: 12 }}
              />
              <Scatter data={points} shape={(props: any) => {
                const point = props.payload as ScatterPoint;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={point.pointSize / 2}
                    fill={point.isTarget ? TARGET_COLOR : COMP_COLOR}
                    stroke={point.isTarget ? "#111827" : "#666666"}
                    strokeWidth={point.isTarget ? 2 : 1}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => {
                      setActivePoint(point);
                      if (typeof props.cx === "number" && typeof props.cy === "number") {
                        setActivePointPosition({ x: props.cx, y: props.cy });
                      }
                    }}
                  />
                );
              }} />
              {!targetHasPrice && targetYValue !== null ? (
                <ReferenceLine
                  y={targetYValue}
                  stroke={TARGET_COLOR}
                  strokeDasharray="4 4"
                  label={{ value: "This Aircraft (price TBD)", fill: TARGET_COLOR, fontSize: 12 }}
                />
              ) : null}
            </ScatterChart>
          </ResponsiveContainer>
          {activePoint ? (
            activePoint.id ? (
              <a
                href={`/listings/${encodeURIComponent(activePoint.id)}`}
                onMouseEnter={() => setIsHoveringCard(true)}
                onMouseLeave={() => {
                  setIsHoveringCard(false);
                  if (!isHoveringChart) {
                    setActivePoint(null);
                    setActivePointPosition(null);
                  }
                }}
                style={{ ...tooltipStyle, textDecoration: "none", cursor: "pointer" }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 10, alignItems: "start" }}>
                  {activePoint.imageUrl ? (
                    <img
                      src={activePoint.imageUrl}
                      alt={activePoint.label}
                      loading="lazy"
                      decoding="async"
                      style={{ width: 84, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #3a4454", background: "#0f172a" }}
                    />
                  ) : (
                    <div style={{ width: 84, height: 64, borderRadius: 6, border: "1px solid #3a4454", background: "#0f172a", color: "#94a3b8", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      No image
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: 2 }}>{activePoint.label}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>{activePoint.locationLabel}</div>
                    <div style={{ color: "#d1d5db", fontSize: 13 }}>{`Price: ${formatMoney(activePoint.price)}`}</div>
                    <div style={{ color: "#d1d5db", fontSize: 13 }}>{`${yLabel}: ${formatYValue(activePoint.yValue, yLabel)}`}</div>
                    {activePoint.isTarget && (activePoint.hasEstimatedPrice || activePoint.hasEstimatedY) ? (
                      <div style={{ color: "#fbbf24", fontSize: 12 }}>
                        {`Target marker anchored with ${activePoint.hasEstimatedPrice ? "estimated price" : ""}${activePoint.hasEstimatedPrice && activePoint.hasEstimatedY ? " + " : ""}${activePoint.hasEstimatedY ? `estimated ${yLabel.toLowerCase()}` : ""}`}
                      </div>
                    ) : null}
                    {typeof activePoint.daysOnMarket === "number" ? (
                      <div style={{ color: "#d1d5db", fontSize: 12 }}>{`DOM: ${Math.round(activePoint.daysOnMarket)} days`}</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", border: `1px solid ${getRiskColor(activePoint.riskLevel)}`, color: getRiskColor(activePoint.riskLevel), borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                    {activePoint.riskLevel}
                  </div>
                  {activePoint.dealTier && !/insufficient\s*data/i.test(activePoint.dealTier) ? (
                    <div style={{ display: "inline-flex", border: "1px solid #4b5563", color: "#e5e7eb", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                      {activePoint.dealTier.replace(/_/g, " ")}
                    </div>
                  ) : null}
                </div>
              </a>
            ) : (
              <div
                onMouseEnter={() => setIsHoveringCard(true)}
                onMouseLeave={() => {
                  setIsHoveringCard(false);
                  if (!isHoveringChart) {
                    setActivePoint(null);
                    setActivePointPosition(null);
                  }
                }}
                style={tooltipStyle}
              >
                <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 10, alignItems: "start" }}>
                  {activePoint.imageUrl ? (
                    <img
                      src={activePoint.imageUrl}
                      alt={activePoint.label}
                      loading="lazy"
                      decoding="async"
                      style={{ width: 84, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #3a4454", background: "#0f172a" }}
                    />
                  ) : (
                    <div style={{ width: 84, height: 64, borderRadius: 6, border: "1px solid #3a4454", background: "#0f172a", color: "#94a3b8", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      No image
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: 2 }}>{activePoint.label}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>{activePoint.locationLabel}</div>
                    <div style={{ color: "#d1d5db", fontSize: 13 }}>{`Price: ${formatMoney(activePoint.price)}`}</div>
                    <div style={{ color: "#d1d5db", fontSize: 13 }}>{`${yLabel}: ${formatYValue(activePoint.yValue, yLabel)}`}</div>
                    {activePoint.isTarget && (activePoint.hasEstimatedPrice || activePoint.hasEstimatedY) ? (
                      <div style={{ color: "#fbbf24", fontSize: 12 }}>
                        {`Target marker anchored with ${activePoint.hasEstimatedPrice ? "estimated price" : ""}${activePoint.hasEstimatedPrice && activePoint.hasEstimatedY ? " + " : ""}${activePoint.hasEstimatedY ? `estimated ${yLabel.toLowerCase()}` : ""}`}
                      </div>
                    ) : null}
                    {typeof activePoint.daysOnMarket === "number" ? (
                      <div style={{ color: "#d1d5db", fontSize: 12 }}>{`DOM: ${Math.round(activePoint.daysOnMarket)} days`}</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", border: `1px solid ${getRiskColor(activePoint.riskLevel)}`, color: getRiskColor(activePoint.riskLevel), borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                    {activePoint.riskLevel}
                  </div>
                  {activePoint.dealTier && !/insufficient\s*data/i.test(activePoint.dealTier) ? (
                    <div style={{ display: "inline-flex", border: "1px solid #4b5563", color: "#e5e7eb", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                      {activePoint.dealTier.replace(/_/g, " ")}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : (
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={mobileBars} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
              <CartesianGrid stroke="#F0F0F0" strokeOpacity={0.2} horizontal={false} />
              <XAxis type="number" stroke="#b2b2b2" tick={{ fill: "#b2b2b2", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={130} stroke="#b2b2b2" tick={{ fill: "#b2b2b2", fontSize: 11 }} />
              <Bar dataKey="valueScore" radius={[0, 6, 6, 0]}>
                {mobileBars.map((entry) => (
                  <Cell key={entry.id} fill={entry.valueScore >= 80 ? "#16a34a" : entry.valueScore >= 60 ? "#84cc16" : entry.valueScore >= 40 ? "#d97706" : "#dc2626"} />
                ))}
                <LabelList dataKey="valueScore" position="right" fill="#d1d5db" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="comps-metric-label" style={{ marginTop: "0.7rem" }}>
        {`Comparing against ${payload.metadata.comp_count} similar aircraft · Price range ${formatMoney(priceRange.min)}-${formatMoney(priceRange.max)} · Median ${formatMoney(priceRange.median)}`}
      </div>
      <div className="comps-metric-label" style={{ marginTop: "0.25rem" }}>
        {payload.metadata.search_criteria_used}
      </div>
      {priceKnownButMissingY.length > 0 ? (
        <div style={{ marginTop: "0.7rem", border: "1px solid #3a4454", borderRadius: 8, padding: "0.55rem", background: "#141922" }}>
          <div style={{ fontSize: "0.8rem", color: "#FF9900", fontWeight: 700, marginBottom: "0.35rem" }}>
            Price-known comps missing time fields
          </div>
          <ul style={{ margin: 0, paddingLeft: "1rem", display: "grid", gap: "0.2rem" }}>
            {priceKnownButMissingY.map((row) => {
              const label = `${row.year ?? "?"} ${row.make ?? ""} ${row.model ?? ""}`.trim();
              const href = row.id ? `/listings/${encodeURIComponent(String(row.id))}` : null;
              return (
                <li key={`${row.id ?? label}-${row.price}`}>
                  {href ? (
                    <a href={href} style={{ color: "#d1d5db" }}>
                      {`${label} · ${formatMoney(row.price)} · ${row.location_label ?? "Location unavailable"}`}
                    </a>
                  ) : (
                    <span style={{ color: "#d1d5db" }}>
                      {`${label} · ${formatMoney(row.price)} · ${row.location_label ?? "Location unavailable"}`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {plottingStats && plottingStats.excluded > 0 ? (
        <div className="comps-metric-label" style={{ marginTop: "0.25rem" }}>
          {`Plotted ${plottingStats.plotted} of ${plottingStats.total} comps · Excluded ${plottingStats.excluded} (missing/zero price: ${plottingStats.missingPrice}, missing ${yLabel}: ${plottingStats.missingY})`}
        </div>
      ) : null}

      <style jsx>{`
        .comps-card {
          ${hideChrome ? "background: transparent; border: none; border-radius: 0; padding: 0;" : "background: #161d28; border: 1px solid #3a4454; border-radius: 12px; padding: 1rem;"}
        }
        .comps-title {
          margin: 0;
          color: #ff9900;
          font-weight: 800;
        }
        .comps-metric-label {
          font-size: 0.82rem;
          color: #b2b2b2;
        }
      `}</style>
    </>
  );

  return <section className="comps-card">{body}</section>;
}

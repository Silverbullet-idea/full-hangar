"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatRiskBadgeDisplay } from "../../lib/listings/format";
import {
  CartesianGrid,
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
  flip_score: number | null;
  risk_level: string | null;
  listing_url: string | null;
  source: string | null;
  days_on_market: number | null;
  location_label: string | null;
  primary_image_url: string | null;
  deal_tier: string | null;
  flip_tier: string | null;
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
type MarketCompsSortKey = "price" | "year" | "totalTimeHours";
type MarketCompsSortDirection = "asc" | "desc";

type ScatterPoint = {
  id: string;
  label: string;
  price: number;
  yValue: number;
  yLabel: string;
  riskLevel: string;
  /** Numeric score used for dot sizing (flip_score preferred). */
  scoreForSize: number;
  listingUrl: string | null;
  isTarget: boolean;
  pointSize: number;
  locationLabel: string;
  imageUrl: string | null;
  /** Flip tier (HOT/GOOD/FAIR/PASS) or legacy deal tier label for tooltip. */
  tierLabel: string | null;
  daysOnMarket: number | null;
  hasEstimatedPrice?: boolean;
  hasEstimatedY?: boolean;
};

const TARGET_COLOR = "#FF9900";
const COMP_COLOR = "#999999";
const HOVER_COLOR = "#FF9900";
const MIN_PRICE_AXIS_PADDING = 50_000;
const PRICE_AXIS_PADDING_PCT = 0.12;
const PRICE_AXIS_ROUNDING_STEP = 25_000;
const YEAR_AXIS_MIN_PADDING = 2;
const YEAR_AXIS_PADDING_PCT = 0.08;
const MIN_TIME_AXIS_PADDING = 100;
const TIME_AXIS_PADDING_PCT = 0.12;
const TIME_AXIS_ROUNDING_STEP = 100;

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

function scoreForPointSize(row: CompRow): number {
  const f = row.flip_score;
  if (typeof f === "number" && Number.isFinite(f)) return f;
  const v = row.value_score;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 50;
}

function tierTooltipLabel(row: CompRow): string | null {
  const ft = (row.flip_tier ?? "").trim();
  if (ft) return ft;
  const dt = (row.deal_tier ?? "").trim();
  if (!dt || /insufficient\s*data/i.test(dt)) return null;
  return dt.replace(/_/g, " ");
}

function getRiskColor(risk: string | null): string {
  const level = (risk || "").toUpperCase();
  if (level === "LOW") return "#16a34a";
  if (level === "MODERATE") return "#d97706";
  if (level === "HIGH") return "#ef4444";
  if (level === "CRITICAL") return "#b91c1c";
  return "#9ca3af";
}

function useIsMobile(breakpointPx = 767): boolean {
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
  const [marketCompsSortKey, setMarketCompsSortKey] = useState<MarketCompsSortKey>("price");
  const [marketCompsSortDirection, setMarketCompsSortDirection] = useState<MarketCompsSortDirection>("asc");
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
      .map((row) => {
        const sz = scoreForPointSize(row);
        return {
        id: String(row.id ?? `${row.make}-${row.model}-${row.year}-${row.price}`),
        label: `${row.year ?? "?"} ${row.make ?? ""} ${row.model ?? ""}`.trim(),
        price: row.price as number,
        yValue: row[yMetric] as number,
        yLabel: yLabel,
        riskLevel: row.risk_level ?? "UNKNOWN",
        scoreForSize: sz,
        listingUrl: row.listing_url,
        isTarget: false,
        pointSize: Math.max(7, Math.min(16, Math.round(sz / 8))),
        locationLabel: row.location_label ?? "Location unavailable",
        imageUrl: row.primary_image_url ?? null,
        tierLabel: tierTooltipLabel(row),
        daysOnMarket: row.days_on_market ?? null,
      };
      });

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

    const targetSz = scoreForPointSize(target);
    const targetPoint: ScatterPoint = {
      id: String(target.id ?? "target"),
      label: "This Aircraft",
      price: resolvedPrice,
      yValue: resolvedY,
      yLabel: yLabel,
      riskLevel: target.risk_level ?? "UNKNOWN",
      scoreForSize: targetSz,
      listingUrl: target.listing_url,
      isTarget: true,
      pointSize: 18,
      locationLabel: target.location_label ?? "Location unavailable",
      imageUrl: target.primary_image_url ?? null,
      tierLabel: tierTooltipLabel(target),
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

  const priceAxisDomain = useMemo<[number, number] | undefined>(() => {
    const prices = points
      .map((point) => point.price)
      .filter((value): value is number => Number.isFinite(value) && value > 0);
    if (prices.length === 0) return undefined;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spread = maxPrice - minPrice;
    const baseline = spread > 0 ? spread : maxPrice;
    const rawPadding = Math.max(MIN_PRICE_AXIS_PADDING, baseline * PRICE_AXIS_PADDING_PCT);

    const lowerBoundRaw = Math.max(0, minPrice - rawPadding);
    const upperBoundRaw = maxPrice + rawPadding;
    const lowerBound = Math.max(0, Math.floor(lowerBoundRaw / PRICE_AXIS_ROUNDING_STEP) * PRICE_AXIS_ROUNDING_STEP);
    const upperBound = Math.ceil(upperBoundRaw / PRICE_AXIS_ROUNDING_STEP) * PRICE_AXIS_ROUNDING_STEP;

    if (upperBound <= lowerBound) {
      return [Math.max(0, minPrice - MIN_PRICE_AXIS_PADDING), maxPrice + MIN_PRICE_AXIS_PADDING];
    }
    return [lowerBound, upperBound];
  }, [points]);

  const yAxisDomain = useMemo<[number, number] | undefined>(() => {
    if (yMetric === "year") {
      const yearValues = points
        .map((point) => point.yValue)
        .filter((value): value is number => Number.isFinite(value) && value >= 1900);
      if (yearValues.length === 0) {
        return [1940, 2025];
      }
      const minYear = Math.min(...yearValues);
      const maxYear = Math.max(...yearValues);
      const spread = maxYear - minYear;
      const yearPadding = Math.max(YEAR_AXIS_MIN_PADDING, Math.ceil(spread * YEAR_AXIS_PADDING_PCT));
      const lowerBound = Math.max(1940, minYear - yearPadding);
      const upperBound = Math.max(lowerBound + 6, maxYear + yearPadding);
      return [lowerBound, upperBound];
    }

    const timeValues = points
      .map((point) => point.yValue)
      .filter((value): value is number => Number.isFinite(value) && value > 0);
    if (timeValues.length === 0) return undefined;

    const minTime = Math.min(...timeValues);
    const maxTime = Math.max(...timeValues);
    const spread = maxTime - minTime;
    const baseline = spread > 0 ? spread : maxTime;
    const rawPadding = Math.max(MIN_TIME_AXIS_PADDING, baseline * TIME_AXIS_PADDING_PCT);
    const lowerRaw = Math.max(0, minTime - rawPadding);
    const upperRaw = maxTime + rawPadding;
    const lowerBound = Math.max(0, Math.floor(lowerRaw / TIME_AXIS_ROUNDING_STEP) * TIME_AXIS_ROUNDING_STEP);
    const upperBound = Math.ceil(upperRaw / TIME_AXIS_ROUNDING_STEP) * TIME_AXIS_ROUNDING_STEP;

    if (upperBound <= lowerBound) {
      return [Math.max(0, minTime - MIN_TIME_AXIS_PADDING), maxTime + MIN_TIME_AXIS_PADDING];
    }
    return [lowerBound, upperBound];
  }, [points, yMetric]);

  const marketCompsTableRows = useMemo(() => {
    if (!payload) return [];
    const rows = payload.comps
      .filter((row) => typeof row.price === "number" && row.price > 0)
      .map((row) => ({
        id: row.id,
        label: `${row.year ?? "?"} ${row.make ?? ""} ${row.model ?? ""}`.trim(),
        price: row.price as number,
        year: row.year,
        totalTimeHours: row.total_time_hours,
        locationLabel: row.location_label ?? "Location unavailable",
      }));

    const sortedRows = [...rows].sort((a, b) => {
      const directionFactor = marketCompsSortDirection === "asc" ? 1 : -1;

      if (marketCompsSortKey === "price") {
        return (a.price - b.price) * directionFactor;
      }

      if (marketCompsSortKey === "year") {
        const aYear = typeof a.year === "number" ? a.year : Number.POSITIVE_INFINITY;
        const bYear = typeof b.year === "number" ? b.year : Number.POSITIVE_INFINITY;
        return (aYear - bYear) * directionFactor;
      }

      const aTt = typeof a.totalTimeHours === "number" ? a.totalTimeHours : Number.POSITIVE_INFINITY;
      const bTt = typeof b.totalTimeHours === "number" ? b.totalTimeHours : Number.POSITIVE_INFINITY;
      return (aTt - bTt) * directionFactor;
    });

    return sortedRows.slice(0, 24);
  }, [payload, marketCompsSortDirection, marketCompsSortKey]);

  const otherMarketCompsRows = useMemo(() => {
    if (!payload) return [];
    const hasValidPrice = (value: number | null) => typeof value === "number" && value > 0;
    const hasValidY = (value: number | null) =>
      typeof value === "number" && (yMetric === "year" ? value >= 1900 : value > 0);
    return payload.comps
      .filter((row) => !hasValidPrice(row.price) || !hasValidY(row[yMetric]))
      .slice(0, 20);
  }, [payload, yMetric]);

  if (loading) {
    return <div style={{ height: 280, borderRadius: 10, border: "1px solid var(--brand-dark)", background: "var(--card-bg)" }} />;
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
  const axisTextColor = "var(--brand-muted)";
  const gridColor = "var(--brand-dark)";
  const readableBodyTextColor = "var(--brand-white)";
  const tooltipBackgroundColor = "var(--card-bg)";
  const tooltipBorderColor = "var(--brand-dark)";
  const tooltipMutedTextColor = "var(--brand-muted)";
  const tooltipImageFallbackBg = "var(--surface-muted)";
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
      background: tooltipBackgroundColor,
      border: `1px solid ${tooltipBorderColor}`,
      borderRadius: 8,
      padding: "0.6rem",
      minWidth: tooltipWidth,
    };
  })();

  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: "0.55rem" }}>
        {!hideChrome ? <h3 className="comps-title">Comparable Market Intelligence</h3> : <div style={{ fontSize: "0.82rem", color: "var(--brand-muted)" }}>Comparable Market Intelligence</div>}
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          <div className="inline-flex min-h-[44px] rounded-lg border border-[var(--brand-dark)] md:min-h-0" style={{ overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setViewMode("time")}
              className="min-h-[44px] min-w-[44px] px-2 py-2 text-[0.73rem] font-bold md:min-h-0 md:min-w-0 md:px-[0.45rem] md:py-[0.28rem]"
              style={{
                border: "none",
                borderRight: "1px solid var(--brand-dark)",
                background: viewMode === "time" ? "#FF9900" : "var(--card-bg)",
                color: viewMode === "time" ? "#000000" : "var(--brand-muted)",
                cursor: "pointer",
              }}
            >
              Price vs Time
            </button>
            <button
              type="button"
              onClick={() => setViewMode("year")}
              className="min-h-[44px] min-w-[44px] px-2 py-2 text-[0.73rem] font-bold md:min-h-0 md:min-w-0 md:px-[0.45rem] md:py-[0.28rem]"
              style={{
                border: "none",
                background: viewMode === "year" ? "#FF9900" : "var(--card-bg)",
                color: viewMode === "year" ? "#000000" : "var(--brand-muted)",
                cursor: "pointer",
              }}
            >
              Price vs Year
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSubmodelOnly((prev) => !prev)}
            title={submodelOnly ? "Currently exact sub-model only. Click to compare all related models." : "Currently showing broader related models. Click for exact sub-model only."}
            className="inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-lg border border-[var(--brand-dark)] px-2 py-2 text-left text-[0.7rem] font-bold md:max-w-none md:min-h-0 md:gap-1.5 md:px-[0.45rem] md:py-[0.28rem] md:text-[0.73rem]"
            style={{
              background: submodelOnly ? "#FF9900" : "var(--card-bg)",
              color: submodelOnly ? "#000000" : "var(--brand-muted)",
              cursor: "pointer",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" />
            </svg>
            {submodelOnly
              ? `show_all_other: '${payload?.target?.model ?? "exact sub-model"}'`
              : `show_all_other: '${payload?.metadata?.model_family ? `${payload.target.make ?? ""} ${payload.metadata.model_family}`.trim() : payload?.target?.model ?? "broader model set"}'`}
          </button>
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="w-full max-w-full overflow-x-hidden"
        style={{ position: "relative", width: "100%", height: isMobile ? 260 : 300 }}
        onMouseEnter={() => setIsHoveringChart(true)}
        onMouseLeave={() => {
          setIsHoveringChart(false);
          if (!isHoveringCard) {
            setActivePoint(null);
            setActivePointPosition(null);
          }
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 20, right: isMobile ? 8 : 20, bottom: 15, left: isMobile ? 0 : 10 }}
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
              <CartesianGrid stroke={gridColor} strokeOpacity={0.38} />
              <XAxis
                type="number"
                dataKey="price"
                name="Price"
                domain={priceAxisDomain}
                tickFormatter={formatPriceTick}
                tickCount={6}
                stroke={axisTextColor}
                tick={{ fill: axisTextColor, fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="yValue"
                name={yLabel}
                domain={yAxisDomain}
                allowDecimals={false}
                stroke={axisTextColor}
                tick={{ fill: axisTextColor, fontSize: 12 }}
              />
              <Scatter data={points} shape={(props: any) => {
                const point = props.payload as ScatterPoint;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={point.pointSize / 2}
                    fill={point.isTarget ? TARGET_COLOR : COMP_COLOR}
                    stroke={point.isTarget ? "var(--brand-white)" : "var(--brand-muted)"}
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
                      style={{ width: 84, height: 64, borderRadius: 6, objectFit: "cover", border: `1px solid ${tooltipBorderColor}`, background: tooltipImageFallbackBg }}
                    />
                  ) : (
                    <div style={{ width: 84, height: 64, borderRadius: 6, border: `1px solid ${tooltipBorderColor}`, background: tooltipImageFallbackBg, color: tooltipMutedTextColor, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      No image
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: readableBodyTextColor, marginBottom: 2 }}>{activePoint.label}</div>
                    <div style={{ color: tooltipMutedTextColor, fontSize: 12, marginBottom: 4 }}>{activePoint.locationLabel}</div>
                    <div style={{ color: readableBodyTextColor, fontSize: 13 }}>{`Price: ${formatMoney(activePoint.price)}`}</div>
                    <div style={{ color: readableBodyTextColor, fontSize: 13 }}>{`${yLabel}: ${formatYValue(activePoint.yValue, yLabel)}`}</div>
                    {activePoint.isTarget && (activePoint.hasEstimatedPrice || activePoint.hasEstimatedY) ? (
                      <div style={{ color: "#fbbf24", fontSize: 12 }}>
                        {`Target marker anchored with ${activePoint.hasEstimatedPrice ? "estimated price" : ""}${activePoint.hasEstimatedPrice && activePoint.hasEstimatedY ? " + " : ""}${activePoint.hasEstimatedY ? `estimated ${yLabel.toLowerCase()}` : ""}`}
                      </div>
                    ) : null}
                    {typeof activePoint.daysOnMarket === "number" ? (
                      <div style={{ color: readableBodyTextColor, fontSize: 12 }}>{`DOM: ${Math.round(activePoint.daysOnMarket)} days`}</div>
                    ) : null}
                    <div style={{ color: readableBodyTextColor, fontSize: 12 }}>{`Flip score: ${Math.round(activePoint.scoreForSize)}`}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", border: `1px solid ${getRiskColor(activePoint.riskLevel)}`, color: getRiskColor(activePoint.riskLevel), borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                    {formatRiskBadgeDisplay(activePoint.riskLevel === "UNKNOWN" ? null : activePoint.riskLevel)}
                  </div>
                  {activePoint.tierLabel ? (
                    <div style={{ display: "inline-flex", border: `1px solid ${tooltipBorderColor}`, color: readableBodyTextColor, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                      {`Flip tier: ${activePoint.tierLabel}`}
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
                      style={{ width: 84, height: 64, borderRadius: 6, objectFit: "cover", border: `1px solid ${tooltipBorderColor}`, background: tooltipImageFallbackBg }}
                    />
                  ) : (
                    <div style={{ width: 84, height: 64, borderRadius: 6, border: `1px solid ${tooltipBorderColor}`, background: tooltipImageFallbackBg, color: tooltipMutedTextColor, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      No image
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: readableBodyTextColor, marginBottom: 2 }}>{activePoint.label}</div>
                    <div style={{ color: tooltipMutedTextColor, fontSize: 12, marginBottom: 4 }}>{activePoint.locationLabel}</div>
                    <div style={{ color: readableBodyTextColor, fontSize: 13 }}>{`Price: ${formatMoney(activePoint.price)}`}</div>
                    <div style={{ color: readableBodyTextColor, fontSize: 13 }}>{`${yLabel}: ${formatYValue(activePoint.yValue, yLabel)}`}</div>
                    {activePoint.isTarget && (activePoint.hasEstimatedPrice || activePoint.hasEstimatedY) ? (
                      <div style={{ color: "#fbbf24", fontSize: 12 }}>
                        {`Target marker anchored with ${activePoint.hasEstimatedPrice ? "estimated price" : ""}${activePoint.hasEstimatedPrice && activePoint.hasEstimatedY ? " + " : ""}${activePoint.hasEstimatedY ? `estimated ${yLabel.toLowerCase()}` : ""}`}
                      </div>
                    ) : null}
                    {typeof activePoint.daysOnMarket === "number" ? (
                      <div style={{ color: readableBodyTextColor, fontSize: 12 }}>{`DOM: ${Math.round(activePoint.daysOnMarket)} days`}</div>
                    ) : null}
                    <div style={{ color: readableBodyTextColor, fontSize: 12 }}>{`Flip score: ${Math.round(activePoint.scoreForSize)}`}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", border: `1px solid ${getRiskColor(activePoint.riskLevel)}`, color: getRiskColor(activePoint.riskLevel), borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                    {formatRiskBadgeDisplay(activePoint.riskLevel === "UNKNOWN" ? null : activePoint.riskLevel)}
                  </div>
                  {activePoint.tierLabel ? (
                    <div style={{ display: "inline-flex", border: `1px solid ${tooltipBorderColor}`, color: readableBodyTextColor, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                      {`Flip tier: ${activePoint.tierLabel}`}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          ) : null}
      </div>

      <div className="comps-metric-label" style={{ marginTop: "0.7rem" }}>
        {`Comparing against ${payload.metadata.comp_count} similar aircraft · Price range ${formatMoney(priceRange.min)}-${formatMoney(priceRange.max)} · Median ${formatMoney(priceRange.median)}`}
      </div>
      <div className="comps-metric-label" style={{ marginTop: "0.25rem" }}>
        {payload.metadata.search_criteria_used}
      </div>
      {marketCompsTableRows.length > 0 ? (
        <div style={{ marginTop: "0.8rem", border: "1px solid var(--brand-dark)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ fontSize: "0.82rem", color: "#FF9900", fontWeight: 800, padding: "0.5rem 0.6rem", borderBottom: "1px solid var(--brand-dark)", background: "var(--surface-muted)" }}>
            Market Comps Table
          </div>
          <div className="w-full max-w-full overflow-x-hidden md:overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-[0.76rem] md:table-auto" style={{ fontSize: "0.76rem" }}>
              <thead>
                <tr style={{ background: "var(--surface-muted)" }}>
                  <th className="min-w-0" style={{ textAlign: "left", padding: "0.4rem 0.55rem", color: "var(--brand-muted)" }}>Aircraft</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.55rem", color: "var(--brand-muted)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (marketCompsSortKey === "price") {
                          setMarketCompsSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                          return;
                        }
                        setMarketCompsSortKey("price");
                        setMarketCompsSortDirection("asc");
                      }}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center bg-transparent md:min-h-0 md:min-w-0"
                      style={{ border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, padding: 0 }}
                      title="Sort by price (low/high)"
                    >
                      {`Price ${marketCompsSortKey === "price" ? (marketCompsSortDirection === "asc" ? "▲" : "▼") : ""}`}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.55rem", color: "var(--brand-muted)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (marketCompsSortKey === "year") {
                          setMarketCompsSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                          return;
                        }
                        setMarketCompsSortKey("year");
                        setMarketCompsSortDirection("asc");
                      }}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center bg-transparent md:min-h-0 md:min-w-0"
                      style={{ border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, padding: 0 }}
                      title="Sort by year (old/new)"
                    >
                      {`Year ${marketCompsSortKey === "year" ? (marketCompsSortDirection === "asc" ? "▲" : "▼") : ""}`}
                    </button>
                  </th>
                  <th className="hidden md:table-cell" style={{ textAlign: "left", padding: "0.4rem 0.55rem", color: "var(--brand-muted)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (marketCompsSortKey === "totalTimeHours") {
                          setMarketCompsSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                          return;
                        }
                        setMarketCompsSortKey("totalTimeHours");
                        setMarketCompsSortDirection("asc");
                      }}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center bg-transparent md:min-h-0 md:min-w-0"
                      style={{ border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, padding: 0 }}
                      title="Sort by total time (low/high)"
                    >
                      {`TT ${marketCompsSortKey === "totalTimeHours" ? (marketCompsSortDirection === "asc" ? "▲" : "▼") : ""}`}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {marketCompsTableRows.map((row, index) => (
                  <tr key={`${row.id ?? row.label}-${index}`} style={{ borderTop: "1px solid var(--brand-dark)" }}>
                    <td className="min-w-0 break-words" style={{ padding: "0.45rem 0.55rem", color: readableBodyTextColor }}>
                      {row.id ? (
                        <a href={`/listings/${encodeURIComponent(row.id)}`} style={{ color: readableBodyTextColor, textDecorationColor: "var(--brand-muted)" }}>
                          {row.label}
                        </a>
                      ) : (
                        row.label
                      )}
                      <div style={{ color: tooltipMutedTextColor, fontSize: "0.7rem" }}>{row.locationLabel}</div>
                    </td>
                    <td style={{ padding: "0.45rem 0.55rem", color: "#86efac", fontWeight: 700 }}>{formatMoney(row.price)}</td>
                    <td style={{ padding: "0.45rem 0.55rem", color: readableBodyTextColor }}>{typeof row.year === "number" ? row.year : "N/A"}</td>
                    <td className="hidden md:table-cell" style={{ padding: "0.45rem 0.55rem", color: readableBodyTextColor }}>{formatHours(row.totalTimeHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {priceKnownButMissingY.length > 0 ? (
        <div style={{ marginTop: "0.7rem", border: "1px solid var(--brand-dark)", borderRadius: 8, padding: "0.55rem", background: "var(--card-bg)" }}>
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
                    <a href={href} style={{ color: readableBodyTextColor, textDecorationColor: "var(--brand-muted)", fontWeight: 600 }}>
                      {`${label} · ${formatMoney(row.price)} · ${row.location_label ?? "Location unavailable"}`}
                    </a>
                  ) : (
                    <span style={{ color: readableBodyTextColor }}>
                      {`${label} · ${formatMoney(row.price)} · ${row.location_label ?? "Location unavailable"}`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {otherMarketCompsRows.length > 0 ? (
        <div style={{ marginTop: "0.7rem", border: "1px solid var(--brand-dark)", borderRadius: 8, padding: "0.55rem", background: "var(--card-bg)" }}>
          <div style={{ fontSize: "0.8rem", color: "#FF9900", fontWeight: 700, marginBottom: "0.35rem" }}>
            Other Market Comps
          </div>
          <ul style={{ margin: 0, paddingLeft: "1rem", display: "grid", gap: "0.2rem" }}>
            {otherMarketCompsRows.map((row) => {
              const label = `${row.year ?? "?"} ${row.make ?? ""} ${row.model ?? ""}`.trim();
              const href = row.id ? `/listings/${encodeURIComponent(String(row.id))}` : null;
              return (
                <li key={`${row.id ?? label}-${row.price ?? "na"}-${row.total_time_hours ?? "na"}`}>
                  {href ? (
                    <a href={href} style={{ color: readableBodyTextColor, textDecorationColor: "var(--brand-muted)", fontWeight: 600 }}>
                      {`${label} · ${formatMoney(row.price)} · ${row.location_label ?? "Location unavailable"}`}
                    </a>
                  ) : (
                    <span style={{ color: readableBodyTextColor }}>
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
          ${hideChrome ? "background: transparent; border: none; border-radius: 0; padding: 0;" : "background: var(--card-bg); border: 1px solid var(--brand-dark); border-radius: 12px; padding: 1rem;"}
        }
        .comps-title {
          margin: 0;
          color: #ff9900;
          font-weight: 800;
        }
        .comps-metric-label {
          font-size: 0.82rem;
          color: var(--brand-muted);
        }
      `}</style>
    </>
  );

  return <section className="comps-card">{body}</section>;
}

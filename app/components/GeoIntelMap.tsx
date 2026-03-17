"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { US_STATE_PATHS } from "@/lib/geo/us-states-albers";
import styles from "./GeoIntelMap.module.css";

export interface GeoDataRow {
  state: string;
  active_listings: number;
  median_price: number;
  vs_national_median: number;
  cheapest_listed: number;
}

interface GeoIntelMapProps {
  data: GeoDataRow[];
  nationalMedian: number;
}

const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC",
]);

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString()}`;
}

function getListingRadius(listings: number): number {
  if (listings <= 0) return 0;
  if (listings === 1) return 4;
  if (listings === 2) return 6;
  if (listings <= 4) return 8;
  return 10;
}

function getDeltaColor(delta: number): string {
  if (delta <= -20000) return "#15803d";
  if (delta <= -10000) return "rgba(74, 222, 128, 0.8)";
  if (delta <= -2500) return "#bbf7d0";
  if (delta < 2500) return "#e5e7eb";
  if (delta < 10000) return "#fde68a";
  if (delta < 20000) return "rgba(249, 115, 22, 0.8)";
  return "#dc2626";
}

export default function GeoIntelMap({ data, nationalMedian }: GeoIntelMapProps) {
  const [tooltip, setTooltip] = useState<{ code: string; x: number; y: number } | null>(null);
  const [centroidsByState, setCentroidsByState] = useState<Map<string, { x: number; y: number }>>(new Map());
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());

  const safeNationalMedian = useMemo(() => {
    if (Number.isFinite(nationalMedian) && nationalMedian > 0) return nationalMedian;
    const medians = data
      .map((row) => row.median_price)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .sort((a, b) => a - b);
    if (medians.length === 0) return 0;
    const middle = Math.floor(medians.length / 2);
    if (medians.length % 2 === 1) return medians[middle] ?? 0;
    return ((medians[middle - 1] ?? 0) + (medians[middle] ?? 0)) / 2;
  }, [data, nationalMedian]);

  const { usRows, nonUsRows } = useMemo(() => {
    const normalized = data.map((row) => ({ ...row, state: row.state.toUpperCase() }));
    return {
      usRows: normalized.filter((row) => US_STATE_CODES.has(row.state)),
      nonUsRows: normalized.filter((row) => !US_STATE_CODES.has(row.state)),
    };
  }, [data]);

  const rowByState = useMemo(() => {
    return new Map(usRows.map((row) => [row.state, row]));
  }, [usRows]);

  useEffect(() => {
    const nextCentroids = new Map<string, { x: number; y: number }>();
    for (const [code, element] of pathRefs.current.entries()) {
      const box = element.getBBox();
      nextCentroids.set(code, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    setCentroidsByState(nextCentroids);
  }, [rowByState.size]);

  const onMove = useCallback((event: React.MouseEvent<SVGElement>, code: string) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const compact = rect.width < 500;
    if (compact) {
      setTooltip({ code, x: 16, y: rect.height - 12 });
      return;
    }
    setTooltip({ code, x: event.clientX - rect.left + 12, y: event.clientY - rect.top + 12 });
  }, []);

  const onLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.mapShell}>
        <svg
          viewBox="0 0 960 600"
          width="100%"
          role="img"
          aria-label="US map of aircraft listings by state"
          className={styles.mapSvg}
          onMouseLeave={onLeave}
        >
          {US_STATE_PATHS.map((path) => {
            const stateRow = rowByState.get(path.code);
            const row = stateRow && stateRow.active_listings > 0 ? stateRow : undefined;
            const hasData = Boolean(row);
            const delta = row?.vs_national_median ?? (row ? row.median_price - safeNationalMedian : 0);
            const fillColor = hasData ? getDeltaColor(delta) : "var(--color-background-tertiary)";
            const listingCount = row?.active_listings ?? 0;
            return (
              <path
                key={path.code}
                d={path.d}
                ref={(element) => {
                  if (element) {
                    pathRefs.current.set(path.code, element);
                  } else {
                    pathRefs.current.delete(path.code);
                  }
                }}
                fill={fillColor}
                stroke="var(--color-border-secondary)"
                strokeWidth={0.5}
                className={hasData ? styles.statePathColored : styles.statePathNoData}
                onMouseMove={(event) => onMove(event, path.code)}
                aria-label={`${path.name}: ${listingCount} listings, median ${formatCurrency(row?.median_price)}`}
                style={{ cursor: hasData ? "pointer" : "default" }}
              />
            );
          })}

          {US_STATE_PATHS.map((path) => {
            const row = rowByState.get(path.code);
            const centroid = centroidsByState.get(path.code);
            if (!row || !centroid || row.active_listings <= 0) return null;
            const radius = getListingRadius(row.active_listings);
            return (
              <g key={`${path.code}-listing-dot`} onMouseMove={(event) => onMove(event, path.code)} style={{ cursor: "pointer" }}>
                <circle cx={centroid.x} cy={centroid.y} r={radius} fill="rgba(255,255,255,0.9)" stroke="#374151" strokeWidth={0.5} />
                {radius >= 6 ? (
                  <text x={centroid.x} y={centroid.y + 3} fontSize={9} fontWeight={500} fill="#111827" textAnchor="middle">
                    {row.active_listings}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {tooltip ? (
          (() => {
            const statePath = US_STATE_PATHS.find((path) => path.code === tooltip.code);
            const stateRow = tooltip.code ? rowByState.get(tooltip.code) : undefined;
            const row = stateRow && stateRow.active_listings > 0 ? stateRow : undefined;
            return (
              <div
                className={styles.tooltip}
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <p className={styles.tooltipTitle}>
                  {statePath?.name ?? tooltip.code}
                  {!row ? " — No listings" : ""}
                </p>
                {row ? (
                  <>
                    <p>Listings: {row.active_listings.toLocaleString()}</p>
                    <p>Median: {formatCurrency(row.median_price)}</p>
                    <p>
                      vs. National:{" "}
                      <span className={row.vs_national_median <= 0 ? styles.deltaCheap : styles.deltaExpensive}>
                        {formatSignedCurrency(row.vs_national_median)}
                      </span>
                    </p>
                    <p>Cheapest: {formatCurrency(row.cheapest_listed)}</p>
                  </>
                ) : null}
              </div>
            );
          })()
        ) : null}
      </div>

      <div className={styles.legend}>
        <p className={styles.legendEnds}>
          <span>Cheaper than national median</span>
          <span>More expensive</span>
        </p>
        <div className={styles.legendSwatches}>
          <span style={{ backgroundColor: "#15803d" }} />
          <span style={{ backgroundColor: "#bbf7d0" }} />
          <span style={{ backgroundColor: "#e5e7eb" }} />
          <span style={{ backgroundColor: "#fde68a" }} />
          <span style={{ backgroundColor: "#dc2626" }} />
        </div>
        <p className={styles.legendMedian}>National median: {formatCurrency(safeNationalMedian)}</p>
      </div>

      {nonUsRows.length > 0 ? (
        <div className={styles.nonUsWrap}>
          <p className={styles.nonUsTitle}>International & unresolved location codes</p>
          <table className={styles.nonUsTable}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Listings</th>
                <th>Median</th>
                <th>vs. National</th>
              </tr>
            </thead>
            <tbody>
              {nonUsRows.map((row) => (
                <tr key={`non-us-${row.state}`}>
                  <td>{row.state}</td>
                  <td>{row.active_listings.toLocaleString()}</td>
                  <td>{formatCurrency(row.median_price)}</td>
                  <td>{formatSignedCurrency(row.vs_national_median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.nonUsNote}>
            These codes did not match a US state. They may be Canadian provinces, international registrations, or scraper parsing artifacts.
          </p>
        </div>
      ) : null}
    </div>
  );
}

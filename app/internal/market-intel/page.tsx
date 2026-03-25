"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const GeoIntelMap = dynamic(() => import("@/app/components/GeoIntelMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex min-h-[320px] w-full items-center justify-center rounded border border-brand-dark bg-[#111] text-sm text-brand-muted"
      aria-busy="true"
      aria-label="Loading geographic intelligence map"
    >
      Loading map…
    </div>
  ),
});

type SummaryResponse = {
  market_pulse: {
    active_listings: number;
    avg_price: number | null;
    median_price: number | null;
    min_price: number | null;
    max_price: number | null;
    avg_days_on_market: number | null;
    deals_below_median: number;
    source_count: number;
    price_distribution: Array<{ min: number; max: number; count: number }>;
    sample_size: number;
  };
  submodel_comparison: {
    rows: Array<{
      model: string;
      listing_count: number;
      median_price: number | null;
      avg_price: number | null;
      avg_dom: number | null;
      avg_score: number | null;
      year_min: number | null;
      year_max: number | null;
      delta_vs_searched: number | null;
      is_searched_model: boolean;
    }>;
    searched_model: string;
    searched_median_price: number | null;
    narrative: string;
  };
  price_drivers: {
    engine_time_bands: Array<{
      engine_band: string;
      count: number;
      median_price: number | null;
      avg_price: number | null;
    }>;
    avionics_tier_pricing: Array<{
      avionics_tier: string;
      count: number;
      median_price: number | null;
      avg_avionics_value: number | null;
    }>;
    avionics_premium_map: Array<{
      avionics_tier: string;
      count: number;
      median_price: number | null;
      avg_avionics_value: number | null;
      premium_over_baseline: number | null;
      implied_return_per_dollar: number | null;
    }>;
  };
  geo_heatmap_data: Array<{
    state: string;
    listing_count: number;
    avg_price: number | null;
    median_price: number | null;
    cheapest_listed: number | null;
  }>;
  sold_signals: {
    ownership_transfers: Array<{
      detected_at: string | null;
      asking_price_at_detection: number | null;
      approx_sale_date: string | null;
      n_number: string | null;
      year: number | null;
      model: string | null;
      ttaf: number | null;
      smoh: number | null;
      state: string | null;
      days_on_market: number | null;
    }>;
    ebay_sales: Array<{
      sold_price: number | null;
      sold_date: string | null;
      year: number | null;
      model: string | null;
      raw_title: string | null;
    }>;
    transaction_velocity: number;
  };
};

type ListingsResponse = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  median_price: number | null;
  rows: Array<{
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    asking_price: number | null;
    value_score: number | null;
    flip_score: number | null;
    flip_tier: string | null;
    ttaf: number | null;
    smoh: number | null;
    avionics_value: number | null;
    state: string | null;
    days_on_market: number | null;
    source_site: string | null;
    price_reduced: boolean;
    primary_image_url: string | null;
    has_adsb: boolean;
  }>;
};

type OptionsResponse = {
  makes: string[];
  models_by_make: Record<string, string[]>;
};

const QUICK_MODELS = [
  { make: "Cessna", model: "150" },
  { make: "Cessna", model: "152" },
  { make: "Cessna", model: "172" },
  { make: "Piper", model: "Cherokee" },
  { make: "Piper", model: "Warrior" },
  { make: "Beechcraft", model: "Musketeer" },
];

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString()}`;
}

function deriveModelFamily(model: string): string {
  const firstToken = model.trim().split(/\s+/)[0] ?? "";
  return firstToken.toUpperCase().replace(/[A-Z]+$/g, "");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

function limitedData(sampleSize: number) {
  return sampleSize < 3;
}

export default function MarketIntelPage() {
  const searchParams = useSearchParams();

  const [options, setOptions] = useState<OptionsResponse>({ makes: [], models_by_make: {} });
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [includeRelated, setIncludeRelated] = useState(false);
  const [activeQuery, setActiveQuery] = useState<{ make: string; model: string; modelFamily: string | null } | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [listings, setListings] = useState<ListingsResponse | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState("flip_score");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [belowMedianOnly, setBelowMedianOnly] = useState(false);
  const [freshEngineOnly, setFreshEngineOnly] = useState(false);
  const [hasAdsbOnly, setHasAdsbOnly] = useState(false);
  const [priceReducedOnly, setPriceReducedOnly] = useState(false);

  const modelsForMake = useMemo(() => {
    if (!make) return [];
    return options.models_by_make[make] ?? [];
  }, [make, options.models_by_make]);

  useEffect(() => {
    fetch("/api/internal/market-intel/listings?options=1")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as OptionsResponse;
      })
      .then((payload) => setOptions(payload))
      .catch(() => setOptions({ makes: [], models_by_make: {} }));
  }, []);

  useEffect(() => {
    const prefMake = (searchParams.get("make") ?? "").trim();
    const prefModel = (searchParams.get("model") ?? "").trim();
    if (!prefMake || !prefModel) return;
    setMake(prefMake);
    setModel(prefModel);
    const family = deriveModelFamily(prefModel);
    setActiveQuery({ make: prefMake, model: prefModel, modelFamily: family || null });
  }, [searchParams]);

  useEffect(() => {
    if (!activeQuery) return;
    setSummaryLoading(true);
    setError(null);
    const summaryUrl = new URL("/api/internal/market-intel/summary", window.location.origin);
    summaryUrl.searchParams.set("make", activeQuery.make);
    summaryUrl.searchParams.set("model", activeQuery.model);
    if (includeRelated && activeQuery.modelFamily) summaryUrl.searchParams.set("model_family", activeQuery.modelFamily);
    fetch(summaryUrl.toString())
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as SummaryResponse;
      })
      .then((payload) => setSummary(payload))
      .catch((fetchError) => {
        setSummary(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load summary");
      })
      .finally(() => setSummaryLoading(false));
  }, [activeQuery, includeRelated]);

  useEffect(() => {
    if (!activeQuery) return;
    setListingsLoading(true);
    const listingsUrl = new URL("/api/internal/market-intel/listings", window.location.origin);
    listingsUrl.searchParams.set("make", activeQuery.make);
    listingsUrl.searchParams.set("model", activeQuery.model);
    if (includeRelated && activeQuery.modelFamily) listingsUrl.searchParams.set("model_family", activeQuery.modelFamily);
    listingsUrl.searchParams.set("page", String(page));
    listingsUrl.searchParams.set("sort", sort);
    listingsUrl.searchParams.set("direction", direction);
    if (belowMedianOnly) listingsUrl.searchParams.set("below_median", "1");
    if (freshEngineOnly) listingsUrl.searchParams.set("fresh_engine", "1");
    if (hasAdsbOnly) listingsUrl.searchParams.set("has_adsb", "1");
    if (priceReducedOnly) listingsUrl.searchParams.set("price_reduced", "1");
    fetch(listingsUrl.toString())
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as ListingsResponse;
      })
      .then((payload) => setListings(payload))
      .catch(() => setListings(null))
      .finally(() => setListingsLoading(false));
  }, [activeQuery, includeRelated, page, sort, direction, belowMedianOnly, freshEngineOnly, hasAdsbOnly, priceReducedOnly]);

  const onResearch = () => {
    if (!make.trim() || !model.trim()) return;
    const family = deriveModelFamily(model);
    setPage(1);
    setActiveQuery({
      make: make.trim(),
      model: model.trim(),
      modelFamily: family || null,
    });
  };

  const searchedModel = activeQuery?.model ?? model;
  const nationalMedian = summary?.market_pulse.median_price ?? null;

  const bestFlipCandidates = useMemo(() => {
    if (!listings?.rows || nationalMedian == null) return [];
    const buyThreshold = Math.min(nationalMedian * 0.75, 50000);
    return listings.rows
      .filter((row) => (row.asking_price ?? Number.POSITIVE_INFINITY) <= buyThreshold)
      .sort((a, b) => (b.flip_score ?? -1) - (a.flip_score ?? -1))
      .slice(0, 3);
  }, [listings?.rows, nationalMedian]);

  const flipMetrics = useMemo(() => {
    const prices = summary?.market_pulse?.price_distribution ?? [];
    const allPrices = prices.flatMap((bucket) => Array.from({ length: bucket.count }, () => bucket.min));
    const p25 = allPrices.length > 0 ? allPrices.sort((a, b) => a - b)[Math.floor(allPrices.length * 0.25)] : null;
    const buyLow = p25 != null ? Math.min(p25, 50000) : null;
    const buyHigh = buyLow != null ? Math.min(buyLow * 1.1, 50000) : null;
    const steam = summary?.price_drivers.avionics_premium_map.find((row) => row.avionics_tier === "Steam Gauge");
    const vfr = summary?.price_drivers.avionics_premium_map.find((row) => row.avionics_tier === "Garmin VFR");
    const ifr = summary?.price_drivers.avionics_premium_map.find((row) => row.avionics_tier === "Garmin IFR");
    const targetSell = ifr?.median_price ?? vfr?.median_price ?? summary?.market_pulse.median_price ?? null;
    const upgradeBudget =
      steam?.median_price != null && vfr?.median_price != null ? Math.max(0, vfr.median_price - steam.median_price) : null;
    const costs = (upgradeBudget ?? 0) + 3500;
    const margin = buyLow != null && targetSell != null ? targetSell - buyLow - costs : null;
    return {
      buyLow,
      buyHigh,
      targetSell,
      upgradeBudget,
      costs,
      margin,
    };
  }, [summary]);

  return (
    <main className="space-y-4">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Market Intel Room</h1>
            <p className="text-sm text-brand-muted">Model-level research to understand true market structure and flip opportunities.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link href="/internal/deals" className="rounded border border-brand-dark px-2 py-1 text-brand-muted hover:border-brand-orange hover:text-brand-orange">
              Deal Radar
            </Link>
            <Link href="/internal/deal-desk" className="rounded border border-brand-dark px-2 py-1 text-brand-muted hover:border-brand-orange hover:text-brand-orange">
              Deal Desk
            </Link>
            <Link href="/internal/admin" className="rounded border border-brand-dark px-2 py-1 text-brand-muted hover:border-brand-orange hover:text-brand-orange">
              Admin
            </Link>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr,1fr,auto,auto]">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-brand-muted">Make</p>
            <select
              value={make}
              onChange={(event) => {
                setMake(event.target.value);
                setModel("");
              }}
              className="w-full rounded border border-brand-dark bg-[#121212] px-3 py-2 text-sm text-white"
            >
              <option value="">Select make</option>
              {options.makes.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-brand-muted">Model</p>
            <input
              list="market-intel-models"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded border border-brand-dark bg-[#121212] px-3 py-2 text-sm text-white"
              placeholder="e.g. 150H"
            />
            <datalist id="market-intel-models">
              {modelsForMake.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
          <label className="flex items-center gap-2 self-end text-sm text-brand-muted">
            <input type="checkbox" checked={includeRelated} onChange={(event) => setIncludeRelated(event.target.checked)} />
            Include related models
          </label>
          <button
            type="button"
            onClick={onResearch}
            disabled={!make.trim() || !model.trim()}
            className="self-end rounded bg-brand-orange px-3 py-2 text-sm font-semibold !text-black hover:bg-brand-burn hover:!text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            Research
          </button>
        </div>
      </header>

      {!activeQuery ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4">
          <p className="mb-3 text-sm text-brand-muted">Pick a model to start, or jump into one of Ryan&apos;s target flips:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_MODELS.map((entry) => (
              <button
                key={`${entry.make}-${entry.model}`}
                type="button"
                onClick={() => {
                  setMake(entry.make);
                  setModel(entry.model);
                  setPage(1);
                  setActiveQuery({
                    make: entry.make,
                    model: entry.model,
                    modelFamily: deriveModelFamily(entry.model) || null,
                  });
                }}
                className="rounded border border-brand-dark px-3 py-2 text-sm text-brand-muted hover:border-brand-orange hover:text-brand-orange"
              >
                {entry.make} {entry.model}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <div className="rounded border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</div> : null}

      {summaryLoading ? <div className="text-sm text-brand-muted">Loading market summary...</div> : null}

      {summary && activeQuery ? (
        <>
          <section className="rounded border border-brand-dark bg-card-bg p-4">
            <h2 className="text-lg font-semibold">1. Market Pulse</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              <Stat label="Active Listings" value={formatNumber(summary.market_pulse.active_listings)} />
              <Stat label="Median Price" value={formatCurrency(summary.market_pulse.median_price)} />
              <Stat
                label="Price Range"
                value={`${formatCurrency(summary.market_pulse.min_price)} - ${formatCurrency(summary.market_pulse.max_price)}`}
              />
              <Stat label="Avg Days on Market" value={formatNumber(summary.market_pulse.avg_days_on_market)} />
              <Stat label="Deals Below Median" value={formatNumber(summary.market_pulse.deals_below_median)} />
            </div>
            <div className="mt-4 rounded border border-brand-dark bg-[#111] p-3">
              <p className="mb-2 text-xs text-brand-muted">Price distribution histogram</p>
              <Histogram data={summary.market_pulse.price_distribution} />
              <p className="mt-2 text-xs text-brand-muted">
                Data from {summary.market_pulse.active_listings.toLocaleString()} active listings across{" "}
                {summary.market_pulse.source_count.toLocaleString()} sources
              </p>
            </div>
          </section>

          <section className="rounded border border-brand-dark bg-card-bg p-4">
            <h2 className="text-lg font-semibold">2. Submodel Comparison</h2>
            {limitedData(summary.submodel_comparison.rows.length) ? (
              <p className="mt-2 text-sm text-brand-muted">
                Limited data ({summary.submodel_comparison.rows.length} rows): need at least 3 submodel samples.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded border border-brand-dark">
                <table className="min-w-[980px] w-full text-xs">
                  <thead className="bg-[#151515] text-brand-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">Model</th>
                      <th className="px-2 py-2 text-left">Year(s)</th>
                      <th className="px-2 py-2 text-left">Listings</th>
                      <th className="px-2 py-2 text-left">Median Price</th>
                      <th className="px-2 py-2 text-left">Avg Price</th>
                      <th className="px-2 py-2 text-left">Avg DOM</th>
                      <th className="px-2 py-2 text-left">Avg Score</th>
                      <th className="px-2 py-2 text-left">vs. {searchedModel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.submodel_comparison.rows.map((row) => (
                      <tr
                        key={row.model}
                        className={`border-t border-brand-dark ${row.is_searched_model ? "bg-[#1b1b1b] font-semibold" : "bg-[#111]"}`}
                      >
                        <td className="px-2 py-2">{row.model}</td>
                        <td className="px-2 py-2">
                          {row.year_min && row.year_max ? `${Math.round(row.year_min)}-${Math.round(row.year_max)}` : "—"}
                        </td>
                        <td className="px-2 py-2">{formatNumber(row.listing_count)}</td>
                        <td className="px-2 py-2">{formatCurrency(row.median_price)}</td>
                        <td className="px-2 py-2">{formatCurrency(row.avg_price)}</td>
                        <td className="px-2 py-2">{formatNumber(row.avg_dom)}</td>
                        <td className="px-2 py-2">{formatNumber(row.avg_score)}</td>
                        <td
                          className={`px-2 py-2 ${
                            (row.delta_vs_searched ?? 0) < 0 ? "text-emerald-400" : (row.delta_vs_searched ?? 0) > 0 ? "text-brand-orange" : "text-brand-muted"
                          }`}
                        >
                          {formatSignedCurrency(row.delta_vs_searched)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 rounded border border-brand-dark bg-[#111] p-3 text-sm text-brand-muted">{summary.submodel_comparison.narrative}</p>
          </section>

          <section className="rounded border border-brand-dark bg-card-bg p-4">
            <h2 className="text-lg font-semibold">3. Price Driver Analysis</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded border border-brand-dark bg-[#111] p-3">
                <p className="mb-2 text-sm font-semibold">Engine Time vs Price</p>
                {limitedData(summary.price_drivers.engine_time_bands.length) ? (
                  <p className="text-xs text-brand-muted">Limited data ({summary.price_drivers.engine_time_bands.length} bands).</p>
                ) : (
                  <>
                    <HorizontalBarChart
                      rows={summary.price_drivers.engine_time_bands.map((row) => ({
                        label: row.engine_band,
                        value: row.median_price ?? 0,
                        count: row.count,
                      }))}
                    />
                    <p className="mt-2 text-xs text-brand-muted">{buildEngineInsight(summary.price_drivers.engine_time_bands)}</p>
                  </>
                )}
              </div>
              <div className="rounded border border-brand-dark bg-[#111] p-3">
                <p className="mb-2 text-sm font-semibold">Avionics Tier vs Price</p>
                {limitedData(summary.price_drivers.avionics_tier_pricing.length) ? (
                  <p className="text-xs text-brand-muted">Limited data ({summary.price_drivers.avionics_tier_pricing.length} tiers).</p>
                ) : (
                  <>
                    <HorizontalBarChart
                      rows={summary.price_drivers.avionics_tier_pricing.map((row) => ({
                        label: row.avionics_tier,
                        value: row.median_price ?? 0,
                        count: row.count,
                      }))}
                    />
                    <p className="mt-2 text-xs text-brand-muted">{buildAvionicsInsight(summary.price_drivers.avionics_tier_pricing)}</p>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="rounded border border-brand-dark bg-card-bg p-4">
            <h2 className="text-lg font-semibold">4. Avionics Premium Map</h2>
            {limitedData(summary.price_drivers.avionics_premium_map.length) ? (
              <p className="mt-2 text-sm text-brand-muted">
                Limited data ({summary.price_drivers.avionics_premium_map.length} tiers): need at least 3 data points.
              </p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto rounded border border-brand-dark">
                  <table className="min-w-[980px] w-full text-xs">
                    <thead className="bg-[#151515] text-brand-muted">
                      <tr>
                        <th className="px-2 py-2 text-left">Avionics Stack Value</th>
                        <th className="px-2 py-2 text-left">Median Listing Price</th>
                        <th className="px-2 py-2 text-left">Sample Size</th>
                        <th className="px-2 py-2 text-left">Price Premium Over Baseline</th>
                        <th className="px-2 py-2 text-left">Implied $/$ Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.price_drivers.avionics_premium_map.map((row) => (
                        <tr key={row.avionics_tier} className="border-t border-brand-dark bg-[#111]">
                          <td className="px-2 py-2">{row.avionics_tier}</td>
                          <td className="px-2 py-2">{formatCurrency(row.median_price)}</td>
                          <td className="px-2 py-2">{formatNumber(row.count)}</td>
                          <td className="px-2 py-2">{formatSignedCurrency(row.premium_over_baseline)}</td>
                          <td className="px-2 py-2">
                            {typeof row.implied_return_per_dollar === "number" ? `${row.implied_return_per_dollar.toFixed(2)}x` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 rounded border border-brand-dark bg-[#111] p-3 text-sm text-brand-orange">
                  {buildAvionicsSweetSpot(summary.price_drivers.avionics_premium_map, activeQuery.make, activeQuery.model)}
                </p>
              </>
            )}
          </section>

          <section className="rounded border border-brand-dark bg-card-bg p-4">
            <h2 className="text-lg font-semibold">5. Geographic Intelligence</h2>
            <>
                <GeoIntelMap
                  data={summary.geo_heatmap_data.map((row) => ({
                    state: row.state,
                    active_listings: row.listing_count,
                    median_price: row.median_price ?? 0,
                    vs_national_median:
                      row.median_price != null && nationalMedian != null
                        ? row.median_price - nationalMedian
                        : 0,
                    cheapest_listed: row.cheapest_listed ?? 0,
                  }))}
                  nationalMedian={nationalMedian ?? 0}
                />
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <MiniGeoCard title="Cheapest States" rows={[...summary.geo_heatmap_data].sort((a, b) => (a.median_price ?? Number.POSITIVE_INFINITY) - (b.median_price ?? Number.POSITIVE_INFINITY)).slice(0, 5)} nationalMedian={nationalMedian} />
                  <MiniGeoCard title="Most Active Markets" rows={[...summary.geo_heatmap_data].sort((a, b) => b.listing_count - a.listing_count).slice(0, 5)} nationalMedian={nationalMedian} />
                </div>
                <p className="mt-3 rounded border border-brand-dark bg-[#111] p-3 text-sm text-brand-muted">
                  {buildGeoInsight(summary.geo_heatmap_data, nationalMedian)}
                </p>
            </>
          </section>

          <section className="rounded border border-brand-dark bg-card-bg p-4">
            <h2 className="text-lg font-semibold">6. What Sold</h2>
            <p className="mt-2 text-sm text-brand-muted">
              Transaction velocity: approximately {summary.sold_signals.transaction_velocity} sales detected in the last 18 months across both sources.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded border border-brand-dark bg-[#111] p-3">
                <p className="text-sm font-semibold">FAA Ownership Transfers</p>
                {summary.sold_signals.ownership_transfers.length < 3 ? (
                  <p className="mt-2 text-xs text-brand-muted">
                    Limited ownership transfer data for this model. FAA monitor is tracking {summary.market_pulse.active_listings} active listings.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-xs">
                    {summary.sold_signals.ownership_transfers.map((row, index) => (
                      <li key={`${row.detected_at ?? "x"}-${index}`} className="rounded border border-brand-dark px-2 py-2">
                        {(row.n_number ?? "N-Unknown").toString()} | {row.year ?? "—"} {row.model ?? "Unknown"} | Est. sale date{" "}
                        {formatDate(row.approx_sale_date)} | Asking {formatCurrency(row.asking_price_at_detection)} | DOM{" "}
                        {formatNumber(row.days_on_market)} | {row.state ?? "Unknown"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded border border-brand-dark bg-[#111] p-3">
                <p className="text-sm font-semibold">eBay Completed Sales</p>
                {summary.sold_signals.ebay_sales.length === 0 ? (
                  <p className="mt-2 text-xs text-brand-muted">No eBay transaction data found for this model.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-xs">
                    {summary.sold_signals.ebay_sales.map((row, index) => (
                      <li key={`${row.sold_date ?? "x"}-${index}`} className="rounded border border-brand-dark px-2 py-2">
                        <span className="font-semibold text-emerald-400">{formatCurrency(row.sold_price)}</span> | {formatDate(row.sold_date)} |{" "}
                        {row.raw_title ?? `${row.year ?? "—"} ${row.model ?? ""}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="rounded border border-[#333] bg-[#1a1a1f] p-4">
            <h2 className="text-lg font-semibold">7. 🔒 Flip Analysis - Private</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <article className="rounded border border-brand-dark bg-[#121217] p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-brand-muted">Target Acquisition Range</p>
                <p className="mt-1 font-semibold">Buy zone: {formatCurrency(flipMetrics.buyLow)} - {formatCurrency(flipMetrics.buyHigh)}</p>
                <p className="mt-1 text-xs text-brand-muted">At this price, you&apos;re paying below market.</p>
                <p className="mt-2 text-xs text-brand-muted">Best-value listings:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {bestFlipCandidates.map((row) => (
                    <li key={row.id}>
                      {`${row.year ?? "—"} ${row.make ?? ""} ${row.model ?? ""}`.trim()} — {formatCurrency(row.asking_price)} (Flip{" "}
                      {formatNumber(row.flip_score)}
                      {row.flip_tier ? ` ${row.flip_tier}` : ""})
                    </li>
                  ))}
                  {bestFlipCandidates.length === 0 ? <li className="text-brand-muted">No below-threshold listings on current page.</li> : null}
                </ul>
              </article>
              <article className="rounded border border-brand-dark bg-[#121217] p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-brand-muted">Expected Resale Range</p>
                <p className="mt-1 font-semibold">After upgrades: {formatCurrency(flipMetrics.targetSell)}</p>
                <p className="mt-1 text-xs text-brand-muted">Avionics upgrade budget to capture premium: ~{formatCurrency(flipMetrics.upgradeBudget)}</p>
              </article>
              <article className="rounded border border-brand-dark bg-[#121217] p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-brand-muted">Margin Estimate</p>
                <p className="mt-1">Buy at: {formatCurrency(flipMetrics.buyLow)}</p>
                <p>Target sell at: {formatCurrency(flipMetrics.targetSell)}</p>
                <p>Estimated upgrade + acquisition costs: {formatCurrency(flipMetrics.costs)}</p>
                <p className={`mt-1 font-semibold ${typeof flipMetrics.margin === "number" && flipMetrics.margin > 0 ? "text-emerald-400" : "text-brand-orange"}`}>
                  Estimated gross margin: {formatCurrency(flipMetrics.margin)}
                </p>
                <Link
                  href="/internal/deal-desk"
                  className="mt-3 inline-block rounded bg-brand-orange px-3 py-2 text-xs font-semibold !text-black hover:bg-brand-burn hover:!text-black"
                >
                  Open in Deal Desk for detailed analysis →
                </Link>
              </article>
            </div>
          </section>
        </>
      ) : null}

      {activeQuery ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">8. Active Listings Grid</h2>
            <p className="text-xs text-brand-muted">{listings?.total ?? 0} listings</p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <SortButton sortKey="price" currentSort={sort} currentDirection={direction} onClick={(nextDirection) => { setSort("price"); setDirection(nextDirection); setPage(1); }} label="Price" />
            <SortButton sortKey="flip_score" currentSort={sort} currentDirection={direction} onClick={(nextDirection) => { setSort("flip_score"); setDirection(nextDirection); setPage(1); }} label="Flip score" />
            <SortButton sortKey="days_on_market" currentSort={sort} currentDirection={direction} onClick={(nextDirection) => { setSort("days_on_market"); setDirection(nextDirection); setPage(1); }} label="DOM" />
            <SortButton sortKey="ttaf" currentSort={sort} currentDirection={direction} onClick={(nextDirection) => { setSort("ttaf"); setDirection(nextDirection); setPage(1); }} label="TT" />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-brand-muted">
            <label className="flex items-center gap-1"><input type="checkbox" checked={belowMedianOnly} onChange={(e) => { setBelowMedianOnly(e.target.checked); setPage(1); }} /> Below median</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={freshEngineOnly} onChange={(e) => { setFreshEngineOnly(e.target.checked); setPage(1); }} /> Fresh engine &lt; 500 SMOH</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={hasAdsbOnly} onChange={(e) => { setHasAdsbOnly(e.target.checked); setPage(1); }} /> Has ADS-B</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={priceReducedOnly} onChange={(e) => { setPriceReducedOnly(e.target.checked); setPage(1); }} /> Price reduced</label>
          </div>

          {listingsLoading ? <p className="mt-3 text-sm text-brand-muted">Loading listings...</p> : null}

          {listings ? (
            <>
              <div className="mt-3 overflow-x-auto rounded border border-brand-dark">
                <table className="min-w-[1250px] w-full text-xs">
                  <thead className="bg-[#151515] text-brand-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">Photo</th>
                      <th className="px-2 py-2 text-left">Year/Model</th>
                      <th className="px-2 py-2 text-left">Price</th>
                      <th className="px-2 py-2 text-left">Flip score</th>
                      <th className="px-2 py-2 text-left">TT</th>
                      <th className="px-2 py-2 text-left">SMOH</th>
                      <th className="px-2 py-2 text-left">Avionics Value</th>
                      <th className="px-2 py-2 text-left">State</th>
                      <th className="px-2 py-2 text-left">DOM</th>
                      <th className="px-2 py-2 text-left">Source</th>
                      <th className="px-2 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.rows.map((row) => (
                      <tr key={row.id} className="border-t border-brand-dark bg-[#111]">
                        <td className="px-2 py-2">
                          {row.primary_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.primary_image_url} alt="Aircraft" className="h-10 w-16 rounded object-cover" />
                          ) : (
                            <div className="h-10 w-16 rounded bg-[#222]" />
                          )}
                        </td>
                        <td className="px-2 py-2 font-semibold">{row.year ?? "—"} {row.make ?? ""} {row.model ?? ""}</td>
                        <td className="px-2 py-2">{formatCurrency(row.asking_price)}</td>
                        <td className="px-2 py-2">
                          {formatNumber(row.flip_score)}
                          {row.flip_tier ? <span className="ml-1 text-brand-muted">{row.flip_tier}</span> : null}
                        </td>
                        <td className="px-2 py-2">{formatNumber(row.ttaf)}</td>
                        <td className="px-2 py-2">{formatNumber(row.smoh)}</td>
                        <td className="px-2 py-2">{formatCurrency(row.avionics_value)}</td>
                        <td className="px-2 py-2">{row.state ?? "—"}</td>
                        <td className="px-2 py-2">{formatNumber(row.days_on_market)}</td>
                        <td className="px-2 py-2">{row.source_site ?? "—"}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-1">
                            <Link href={`/internal/deal-desk/${row.id}`} className="rounded border border-brand-dark px-2 py-1 text-center hover:border-brand-orange hover:text-brand-orange">
                              Deal Desk →
                            </Link>
                            <Link href={`/listings/${row.id}`} className="rounded border border-brand-dark px-2 py-1 text-center hover:border-brand-orange hover:text-brand-orange">
                              View Listing →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-brand-muted">
                <button
                  type="button"
                  disabled={listings.page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded border border-brand-dark px-2 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <span>
                  Page {listings.page} / {listings.total_pages}
                </span>
                <button
                  type="button"
                  disabled={listings.page >= listings.total_pages}
                  onClick={() => setPage((prev) => Math.min(listings.total_pages, prev + 1))}
                  className="rounded border border-brand-dark px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded border border-brand-dark bg-[#111] p-3">
      <p className="text-xs uppercase tracking-wide text-brand-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-brand-orange">{value}</p>
    </article>
  );
}

function Histogram({ data }: { data: Array<{ min: number; max: number; count: number }> }) {
  const width = 700;
  const height = 130;
  const maxCount = Math.max(1, ...data.map((entry) => entry.count));
  const barWidth = data.length > 0 ? Math.floor(width / data.length) - 4 : 0;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full">
      {data.map((entry, index) => {
        const barHeight = Math.max(2, Math.round((entry.count / maxCount) * (height - 25)));
        const x = index * (barWidth + 4) + 2;
        const y = height - barHeight - 18;
        return <rect key={`${entry.min}-${entry.max}-${index}`} x={x} y={y} width={barWidth} height={barHeight} rx={2} fill="#FF9900" opacity={0.85} />;
      })}
    </svg>
  );
}

function HorizontalBarChart({ rows }: { rows: Array<{ label: string; value: number; count: number }> }) {
  const width = 540;
  const rowHeight = 28;
  const height = Math.max(120, rows.length * rowHeight + 15);
  const maxValue = Math.max(1, ...rows.map((row) => row.value));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full">
      {rows.map((row, index) => {
        const y = 10 + index * rowHeight;
        const barWidth = Math.max(2, Math.round((row.value / maxValue) * 280));
        const fill = row.count < 3 ? "#555" : "#FF9900";
        return (
          <g key={`${row.label}-${index}`} transform={`translate(0, ${y})`}>
            <text x={0} y={13} fill="#c5ccd6" fontSize="11">
              {row.label}
            </text>
            <rect x={180} y={0} width={barWidth} height={16} rx={2} fill={fill} />
            <text x={190 + barWidth} y={13} fill="#c5ccd6" fontSize="10">
              n={row.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function buildEngineInsight(
  rows: Array<{ engine_band: string; count: number; median_price: number | null }>
): string {
  const fresh = rows.find((row) => row.engine_band === "0-500 SMOH");
  const runout = rows.find((row) => row.engine_band === "1500+ SMOH");
  if (!fresh || !runout || fresh.median_price == null || runout.median_price == null) {
    return "Limited data: need both fresh-overhaul and run-out engine buckets for a premium estimate.";
  }
  const delta = fresh.median_price - runout.median_price;
  return `Fresh overhaul (0-500 SMOH) commands a $${Math.round(delta).toLocaleString()} premium over run-out engines (1500+ SMOH).`;
}

function buildAvionicsInsight(
  rows: Array<{ avionics_tier: string; count: number; median_price: number | null }>
): string {
  const steam = rows.find((row) => row.avionics_tier === "Steam Gauge");
  const ifr = rows.find((row) => row.avionics_tier === "Garmin IFR");
  if (!steam || !ifr || steam.median_price == null || ifr.median_price == null) {
    return "Limited data: need both steam and Garmin IFR tiers for a premium estimate.";
  }
  const delta = ifr.median_price - steam.median_price;
  return `Garmin IFR stack adds $${Math.round(delta).toLocaleString()} over steam gauge baseline.`;
}

function buildAvionicsSweetSpot(
  rows: Array<{ avionics_tier: string; implied_return_per_dollar: number | null }>,
  make: string,
  model: string
): string {
  const best = [...rows]
    .filter((row) => typeof row.implied_return_per_dollar === "number")
    .sort((a, b) => (b.implied_return_per_dollar ?? 0) - (a.implied_return_per_dollar ?? 0))[0];
  if (!best || best.implied_return_per_dollar == null) {
    return `Limited data: no reliable avionics return tier yet for ${make} ${model}.`;
  }
  return `For the ${make} ${model}, the ${best.avionics_tier} tier shows the best dollar-for-dollar return at ${best.implied_return_per_dollar.toFixed(2)}x implied resale lift per $1 of avionics value.`;
}

function buildGeoInsight(
  rows: Array<{ state: string; median_price: number | null }>,
  nationalMedian: number | null
): string {
  if (rows.length === 0 || nationalMedian == null) return "Limited data: no geo deltas available yet.";
  const cheapest = [...rows]
    .filter((row) => row.median_price != null)
    .sort((a, b) => (a.median_price ?? Number.POSITIVE_INFINITY) - (b.median_price ?? Number.POSITIVE_INFINITY))
    .slice(0, 2);
  if (cheapest.length === 0) return "Limited data: no geo deltas available yet.";
  const parts = cheapest.map((row) => {
    const delta = (row.median_price ?? nationalMedian) - nationalMedian;
    return `${row.state} (${delta < 0 ? "-" : "+"}$${Math.abs(Math.round(delta)).toLocaleString()} vs national)`;
  });
  return `These states have the lowest median prices - potential acquisition markets: ${parts.join(", ")}.`;
}

function MiniGeoCard({
  title,
  rows,
  nationalMedian,
}: {
  title: string;
  rows: Array<{ state: string; listing_count: number; median_price: number | null }>;
  nationalMedian: number | null;
}) {
  return (
    <article className="rounded border border-brand-dark bg-[#111] p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="space-y-1 text-xs">
        {rows.map((row) => {
          const delta = row.median_price != null && nationalMedian != null ? row.median_price - nationalMedian : null;
          return (
            <li key={`${title}-${row.state}`} className="flex items-center justify-between">
              <span>{row.state}</span>
              <span>
                {formatCurrency(row.median_price)} ({formatSignedCurrency(delta)})
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function SortButton({
  sortKey,
  currentSort,
  currentDirection,
  onClick,
  label,
}: {
  sortKey: string;
  currentSort: string;
  currentDirection: "asc" | "desc";
  onClick: (direction: "asc" | "desc") => void;
  label: string;
}) {
  const active = currentSort === sortKey;
  const nextDirection: "asc" | "desc" = active && currentDirection === "desc" ? "asc" : "desc";
  return (
    <button
      type="button"
      onClick={() => onClick(nextDirection)}
      className={`rounded border px-2 py-1 ${active ? "border-brand-orange text-brand-orange" : "border-brand-dark text-brand-muted"}`}
    >
      {label} {active ? (currentDirection === "desc" ? "↓" : "↑") : "↕"}
    </button>
  );
}

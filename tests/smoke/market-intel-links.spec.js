const { test, expect } = require("@playwright/test");

const FIXTURE_DEALS_ROWS = [
  {
    id: "fixture-deal-1",
    source_id: "fixture-source-1",
    year: 1976,
    make: "Cessna",
    model: "150M",
    title: "1976 Cessna 150M",
    asking_price: 42900,
    price_asking: 42900,
    deal_rating: 87,
    deal_tier: "GOOD_DEAL",
    vs_median_price: -14,
    total_time_airframe: 4920,
    time_since_overhaul: 420,
    avionics_score: 51,
    avionics_installed_value: 7800,
    location_city: "Tulsa",
    location_state: "OK",
    location_label: "Tulsa, OK",
    days_on_market: 38,
    price_reduced: true,
    price_reduction_amount: 1800,
    faa_registration_alert: null,
    listing_url: "https://example.com/listing/fixture-deal-1",
    url: "https://example.com/listing/fixture-deal-1",
    n_number: "N150FX",
    comps_sample_size: 17,
    deal_comparison_source: "live market comps",
    risk_level: "LOW",
    description: "ADS-B in and out.",
    description_full: "Well-kept Cessna 150M with recent panel work.",
    component_gap_value: 8500,
    flip_candidate_triggered: true,
    scraped_at: new Date().toISOString(),
    is_active: true,
  },
];

const FIXTURE_DEAL_SIGNALS = {
  data: [
    {
      id: "fixture-deal-1",
      // Intentional nulls verify deals merge preserves base make/model.
      make: null,
      model: null,
      deal_rating: 87,
      vs_median_price: -14,
      component_gap_value: 8500,
    },
  ],
};

function installDeterministicDealsFixture(page) {
  return Promise.all([
    page.route("**/rest/v1/public_listings*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_DEALS_ROWS),
      });
    }),
    page.route("**/api/internal/deal-signals**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_DEAL_SIGNALS),
      });
    }),
    page.route("**/api/internal/recent-sales**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    }),
  ]);
}

async function loginInternal(page) {
  await page.goto("/internal/login");
  await page.evaluate(async () => {
    await fetch("/api/internal/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Ryan", password: "hippo8me" }),
    });
  });
}

test.describe("market intel internal link smoke", () => {
  test("deals row research link resolves to market intel with params", async ({ page }) => {
    await installDeterministicDealsFixture(page);
    await loginInternal(page);
    await page.goto("/internal/deals");
    await page.getByRole("columnheader", { name: "Deal Score" }).waitFor({ timeout: 25000 });
    await page.getByRole("button", { name: /All Deals/i }).click();

    const researchLink = page.locator('a[href^="/internal/market-intel?make="]').first();
    await researchLink.waitFor({ timeout: 25000 });
    const href = await researchLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("make=");
    expect(href).toContain("model=");

    await researchLink.click();
    await page.getByText("Market Intel Room").waitFor({ timeout: 25000 });
    await page.getByText("1. Market Pulse").waitFor({ timeout: 25000 });
    await expect(page).toHaveURL(/\/internal\/market-intel\?make=.*&model=.*/);
  });

  test("market intel grid deal desk link and deal desk research link are wired", async ({ page }) => {
    await loginInternal(page);
    await page.goto("/internal/market-intel?make=Cessna&model=150H");
    await page.getByText("8. Active Listings Grid").waitFor({ timeout: 30000 });
    await page.getByText("1. Market Pulse").waitFor({ timeout: 30000 });

    const dealDeskLink = page.locator('a[href^="/internal/deal-desk/"]').first();
    await dealDeskLink.waitFor({ timeout: 25000 });
    await dealDeskLink.click();

    const researchLink = page.getByRole("link", { name: "Research Market →" }).first();
    await researchLink.waitFor({ timeout: 25000 });
    const href = await researchLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("/internal/market-intel?make=");
    expect(href).toContain("&model=");
  });
});


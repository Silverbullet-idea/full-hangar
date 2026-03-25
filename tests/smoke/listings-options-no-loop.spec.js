const { test, expect } = require("@playwright/test");

const EMPTY_OPTIONS_BODY = JSON.stringify({
  data: {
    makes: [],
    models: [],
    states: [],
    modelPairs: [],
    makeCounts: {},
    modelCounts: {},
    modelPairCounts: {},
    sourceCounts: {},
    dealTierCounts: {
      all: 0,
      TOP_DEALS: 0,
      HOT: 0,
      GOOD: 0,
      FAIR: 0,
      PASS: 0,
    },
    minimumValueScoreCounts: { any: 0, 60: 0, 80: 0 },
  },
  error: null,
});

/**
 * Production HAR (full-hangar.com) showed /api/listings/options returning 200 with empty
 * makes/models/states/modelPairs while listings still rendered — older clients refetched in a loop.
 * This test forces that empty 200 for browser-initiated options calls and caps request volume.
 */
test.describe("listings filter options fetch guard", () => {
  let skipOptionsLoopTest = false;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/listings");
    if (!response.ok()) {
      skipOptionsLoopTest = true;
    }
  });

  test("does not hammer /api/listings/options when the API returns empty 200", async ({ page }) => {
    test.skip(
      skipOptionsLoopTest,
      `GET /listings returned non-OK (dev server or Supabase env needed for this browser smoke)`
    );
    let optionsGetCount = 0;

    await page.route("**/api/listings/options", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      optionsGetCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_OPTIONS_BODY,
      });
    });

    await page.goto("/listings", { waitUntil: "domcontentloaded" });

    // Let client effects run; a regression would rack up dozens of requests quickly.
    await page.waitForTimeout(3500);

    // React Strict Mode (dev) can remount once and repeat a single fallback fetch.
    expect(optionsGetCount, "expected at most two browser fetches to /api/listings/options (no tight loop)").toBeLessThanOrEqual(2);
  });
});

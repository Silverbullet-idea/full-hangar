const { test, expect } = require("@playwright/test");

/** Matches listings URL params (`parseCategory`, etc.); turboprop uses combined category in CategoryBar. */
const LISTINGS_PAGE_PATHS = [
  "/listings?category=single",
  "/listings?category=multi",
  "/listings?category=se_turboprop",
  "/listings?category=me_turboprop",
  "/listings?category=jet",
  "/listings?category=helicopter",
  "/listings?category=lsp",
  "/listings?category=sea",
  "/listings?dealTier=TOP_DEALS&sortBy=flip_desc",
  "/listings?dealTier=OVERPRICED",
  "/listings?q=Cessna%20152",
  "/listings?q=Cessna&category=single",
  "/listings?q=Cessna%20172&category=single&make=Cessna",
];

const LISTINGS_API_PATHS = [
  "/api/listings?page=1&pageSize=5&q=Cessna%20152",
  "/api/listings?page=1&pageSize=5&q=1978",
  "/api/listings?page=1&pageSize=5&q=N739VF",
  "/api/listings?page=1&pageSize=5&category=single",
  "/api/listings?page=1&pageSize=5&category=helicopter",
  "/api/listings?page=1&pageSize=5&category=jet",
  "/api/listings?page=1&pageSize=5&category=se_turboprop",
  "/api/listings?page=1&pageSize=5&q=Cessna&category=single",
  "/api/listings?page=1&pageSize=5&q=Cessna%20172&category=single&make=Cessna",
  "/api/listings?page=1&pageSize=5&minEngine=50",
];

test.describe("listings category + search smoke", () => {
  for (const path of LISTINGS_PAGE_PATHS) {
    test(`listings page responds: ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status(), `Expected 200 for ${path}`).toBe(200);

      const body = await response.text();
      expect(body).toContain("Filters");
    });
  }

  test.describe("listings API (requires healthy Supabase / env)", () => {
    /** Set in beforeAll: skip API matrix when the app cannot serve listings JSON. */
    let skipListingsApi = false;
    let skipListingsApiReason = "";

    test.beforeAll(async ({ request }) => {
      const response = await request.get("/api/listings?page=1&pageSize=1");
      if (!response.ok()) {
        skipListingsApi = true;
        skipListingsApiReason = `GET /api/listings probe returned ${response.status()} (set NEXT_PUBLIC_SUPABASE_* and DB access for full smoke)`;
        return;
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        skipListingsApi = true;
        skipListingsApiReason = "GET /api/listings probe did not return JSON";
        return;
      }
      if (!payload || typeof payload !== "object") {
        skipListingsApi = true;
        skipListingsApiReason = "GET /api/listings probe returned unexpected payload";
        return;
      }
      if (payload.error != null) {
        skipListingsApi = true;
        skipListingsApiReason = `GET /api/listings probe error field: ${String(payload.error)}`;
        return;
      }
      if (!Array.isArray(payload.data)) {
        skipListingsApi = true;
        skipListingsApiReason = "GET /api/listings probe missing data array";
      }
    });

    for (const path of LISTINGS_API_PATHS) {
      test(`listings API responds: ${path}`, async ({ request }) => {
        test.skip(skipListingsApi, skipListingsApiReason);
        const response = await request.get(path);
        expect(response.status(), `Expected 200 for ${path}`).toBe(200);
        const payload = await response.json();
        expect(payload).toHaveProperty("data");
        expect(payload).toHaveProperty("meta");
        expect(payload).toHaveProperty("error");
        expect(Array.isArray(payload.data), `Expected data array for ${path}`).toBeTruthy();
        expect(payload.error, `Expected null error for ${path}`).toBeNull();
        expect(typeof payload.meta?.total).toBe("number");
      });
    }
  });
});

/** Guards listing detail RSC + client islands: bad id must not throw (regression vs function props / dynamic). */
test.describe("listing detail shell", () => {
  test("missing slug returns not-found HTML with 200", async ({ request }) => {
    const response = await request.get("/listings/__smoke_nonexistent_id__");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/listing not found/i);
    expect(body).toMatch(/back to listings/i);
  });
});

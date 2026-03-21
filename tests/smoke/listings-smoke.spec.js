const { test, expect } = require("@playwright/test");

/** Matches `ListingsTopBanner` / `parseCategory` URL params (not legacy `turboprop`). */
const LISTINGS_PAGE_PATHS = [
  "/listings?category=single",
  "/listings?category=multi",
  "/listings?category=se_turboprop",
  "/listings?category=me_turboprop",
  "/listings?category=jet",
  "/listings?category=helicopter",
  "/listings?category=lsp",
  "/listings?category=sea",
  "/listings?dealTier=TOP_DEALS&sortBy=deal_desc",
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

  for (const path of LISTINGS_API_PATHS) {
    test(`listings API responds: ${path}`, async ({ request }) => {
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

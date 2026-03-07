const { test, expect } = require("@playwright/test");

const DROPDOWN_LINK_PATHS = [
  "/listings?category=single",
  "/listings?category=multi",
  "/listings?category=turboprop",
  "/listings?category=jet",
  "/listings?dealTier=TOP_DEALS&sortBy=deal_desc",
  "/listings?dealTier=OVERPRICED",
];

const SEARCH_QUERY_PATHS = [
  "/listings?q=Cessna%20152",
  "/api/listings?page=1&pageSize=5&q=Cessna%20152",
  "/api/listings?page=1&pageSize=5&q=1978",
  "/api/listings?page=1&pageSize=5&q=N739VF",
];

test.describe("listings dropdown/search smoke", () => {
  for (const path of DROPDOWN_LINK_PATHS) {
    test(`dropdown route responds: ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status(), `Expected 200 for ${path}`).toBe(200);

      const body = await response.text();
      // Next renders a page shell; checking a stable listings marker keeps this lightweight.
      expect(body).toContain("Filters");
    });
  }

  test("search API responses are healthy and shaped", async ({ request }) => {
    for (const path of SEARCH_QUERY_PATHS.filter((entry) => entry.startsWith("/api/"))) {
      const response = await request.get(path);
      expect(response.status(), `Expected 200 for ${path}`).toBe(200);
      const payload = await response.json();
      expect(payload).toHaveProperty("data");
      expect(payload).toHaveProperty("meta");
      expect(payload).toHaveProperty("error");
      expect(Array.isArray(payload.data), `Expected data array for ${path}`).toBeTruthy();
      expect(payload.error, `Expected null error for ${path}`).toBeNull();
    }
  });

  test("search page route responds", async ({ request }) => {
    const response = await request.get("/listings?q=Cessna%20152");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Filters");
  });
});


import asyncio
import random
import re
from urllib.parse import urlencode

from bs4 import BeautifulSoup
from playwright.async_api import BrowserContext, Page, async_playwright


def build_url(page: int) -> str:
    params = {"s-type": "aircraft"}
    if page > 1:
        params["s-page"] = str(page)
    return f"https://www.trade-a-plane.com/search?{urlencode(params)}"


async def new_context(playwright) -> tuple[BrowserContext, Page]:
    browser = await playwright.chromium.launch(
        headless=False,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    )
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1366, "height": 768},
    )
    page = await context.new_page()
    return context, page


async def fetch_ids(page: Page, page_no: int) -> tuple[set[str], int, bool]:
    url = build_url(page_no)
    response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    await page.wait_for_timeout(random.uniform(1500, 2800))
    html = await page.content()
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.result_listing")
    status = response.status if response else 0
    if status in (403, 429, 503):
        return set(), status, True
    if not cards:
        return set(), status, False
    return set(re.findall(r"listing_id=(\d+)", html)), status, False


async def main() -> None:
    max_page = 160
    chunk_size = 12
    all_ids: set[str] = set()

    async with async_playwright() as p:
        start = 1
        while start <= max_page:
            end = min(max_page, start + chunk_size - 1)
            context, page = await new_context(p)
            try:
                print(f"chunk {start}-{end}")
                for page_no in range(start, end + 1):
                    attempts = 0
                    while attempts < 3:
                        attempts += 1
                        ids, status, blocked = await fetch_ids(page, page_no)
                        if blocked:
                            await asyncio.sleep(4 * attempts)
                            continue
                        if not ids:
                            print(f"page={page_no} status={status} cards=0 stop")
                            print("final_unique_listing_ids", len(all_ids))
                            return
                        all_ids.update(ids)
                        print(
                            f"page={page_no} status={status} ids={len(ids)} "
                            f"cumulative={len(all_ids)} attempt={attempts}"
                        )
                        break
                    else:
                        print(f"page={page_no} blocked after retries stop")
                        print("final_unique_listing_ids", len(all_ids))
                        return
            finally:
                await context.close()
            start = end + 1

    print("final_unique_listing_ids", len(all_ids))


if __name__ == "__main__":
    asyncio.run(main())

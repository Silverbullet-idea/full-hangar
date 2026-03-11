import asyncio
import re
from urllib.parse import urlencode

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright


def build_url(page: int) -> str:
    params = {"s-type": "aircraft"}
    if page > 1:
        params["s-page"] = str(page)
    return f"https://www.trade-a-plane.com/search?{urlencode(params)}"


async def main() -> None:
    listing_ids: set[str] = set()
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        for page_number in range(1, 260):
            url = build_url(page_number)
            response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(2500)
            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            cards = soup.select("div.result_listing")
            if not cards:
                print(f"page={page_number} status={response.status if response else None} cards=0 stop")
                break

            page_ids = set(re.findall(r"listing_id=(\d+)", html))
            listing_ids.update(page_ids)
            print(f"page={page_number} status={response.status if response else None} cards={len(cards)} cumulative_ids={len(listing_ids)}")

        await context.close()
        await browser.close()
    print("final_unique_listing_ids", len(listing_ids))


if __name__ == "__main__":
    asyncio.run(main())

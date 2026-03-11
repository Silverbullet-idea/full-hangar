import asyncio

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

URLS = [
    "https://www.trade-a-plane.com/search?category_level1=Jets&s-type=aircraft",
    "https://www.trade-a-plane.com/search?category_level1=Jet&s-type=aircraft",
    "https://www.trade-a-plane.com/filtered/search?category_level1=Jets&s-type=aircraft&s-custom_style=oneline_printer_format",
    "https://www.trade-a-plane.com/filtered/search?s-type=aircraft&s-custom_style=oneline_printer_format",
    "https://www.trade-a-plane.com/filtered/search?category_level1=Single+Engine+Piston&s-type=aircraft&s-custom_style=oneline_printer_format",
]


async def main() -> None:
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
        for url in URLS:
            try:
                response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(2500)
                html = await page.content()
                low = html.lower()
                blocked = "captcha-delivery.com" in low or "please enable js and disable any ad blocker" in low
                soup = BeautifulSoup(html, "html.parser")
                cards = len(soup.select("div.result_listing,div[class*='result_listing'],article.listing-card"))
                links = len(soup.select("a[href*='listing_id=']"))
                status = response.status if response else None
                print(f"{url} status={status} blocked={blocked} cards={cards} listing_links={links}")
            except Exception as exc:
                print(f"{url} error={str(exc)[:120]}")
        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

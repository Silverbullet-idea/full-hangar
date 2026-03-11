import asyncio

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright


async def main() -> None:
    url = "https://www.trade-a-plane.com/search/advanced/aircraft"
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
        response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(3000)
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        print("status", response.status if response else None)
        for sel in ("select[name='category_level1']", "select#category_level1", "select[name*='category']"):
            options = soup.select(f"{sel} option")
            if not options:
                continue
            print("selector", sel, "option_count", len(options))
            for option in options:
                label = option.get_text(" ", strip=True)
                value = (option.get("value") or "").strip()
                if value:
                    print(f"{label} => {value}")
        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

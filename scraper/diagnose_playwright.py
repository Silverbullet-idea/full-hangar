# Full-Hangar - Controller.com Playwright Diagnostic
# Uses a real Chrome browser to bypass bot detection.
# Run with your full python path, e.g.:
# C:/Users/rdale/AppData/Local/Python/bin/python.exe diagnose_playwright.py
# Output: diagnose_playwright_cards.txt + diagnose_playwright.html

import re
import asyncio
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

URL = "https://www.controller.com/listings/aircraft/for-sale/list/category/airplanes/manufacturer/cessna"

def print_emoji_safe(message: str, ascii_fallback: str) -> None:
    """Print unicode status text, fallback to ASCII on cp1252 consoles."""
    try:
        print(message)
    except UnicodeEncodeError:
        print(ascii_fallback)


async def main():
    print("Launching browser...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )

        page = await context.new_page()

        # Hide automation signals
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        """)

        print(f"Fetching: {URL}")
        await page.goto(URL, wait_until="domcontentloaded", timeout=30000)

        # Wait a moment for JS to render
        await page.wait_for_timeout(8000)

        # Check what we got
        title = await page.title()
        print(f"Page title: {title}")
        content_lower = (await page.content()).lower()
        block_terms = ["captcha", "pardon", "interrupted", "blocked", "verify", "distil"]
        title_lower = title.lower()
        if any(term in title_lower or term in content_lower for term in block_terms):
            print("CAPTCHA detected - please solve it in the browser window, then press ENTER here to continue...")
            input()
            # Give post-challenge redirects/render time to settle.
            await page.wait_for_timeout(5000)

        html = await page.content()

        # Save full HTML
        with open("diagnose_playwright.html", "w", encoding="utf-8") as f:
            f.write(html)
        print_emoji_safe(
            "✅ Full HTML saved to diagnose_playwright.html",
            "OK: Full HTML saved to diagnose_playwright.html",
        )

        soup = BeautifulSoup(html, "html.parser")

        # ── Most common CSS classes ──
        print("\n" + "="*60)
        print("Most common CSS classes")
        print("="*60)
        class_counts = {}
        for el in soup.find_all(True):
            for cls in el.get("class", []):
                class_counts[cls] = class_counts.get(cls, 0) + 1
        for cls, count in sorted(class_counts.items(), key=lambda x: -x[1])[:40]:
            print(f"  {count:3d}x  .{cls}")

        # ── Link patterns ──
        print("\n" + "="*60)
        print("Link patterns (looking for listing URLs)")
        print("="*60)
        link_patterns = {}
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            pattern = re.sub(r'\d+', 'N', href)[:80]
            link_patterns[pattern] = link_patterns.get(pattern, 0) + 1
        for pat, count in sorted(link_patterns.items(), key=lambda x: -x[1])[:20]:
            print(f"  {count:3d}x  {pat}")

        # ── Find listing cards ──
        print("\n" + "="*60)
        print("Candidate listing cards")
        print("="*60)

        cards = []
        for el in soup.find_all(["div", "article", "li", "section"]):
            text = el.get_text()
            if re.search(r"\$\d{3,}", text) and re.search(r"\d{4}\s+[A-Z]", text.upper()):
                if 100 < len(el.get_text()) < 3000:
                    cards.append(el)

        # Deduplicate
        unique_cards = []
        for card in cards:
            is_child = any(card in c.descendants for c in cards if c is not card)
            if not is_child:
                unique_cards.append(card)

        print(f"Found {len(unique_cards)} unique candidate cards\n")

        with open("diagnose_playwright_cards.txt", "w", encoding="utf-8") as f:
            for i, card in enumerate(unique_cards[:4]):
                header = f"\n{'='*60}\nCARD #{i+1} — <{card.name}> classes={card.get('class')}\n{'='*60}\n"
                f.write(header)
                f.write(card.prettify())
                print(header)
                print(card.prettify()[:1200])
                if len(card.prettify()) > 1200:
                    print("  ... [see diagnose_playwright_cards.txt for full card]")

        await browser.close()

        print("\n" + "="*60)
        print_emoji_safe(
            "✅ Done! Upload diagnose_playwright_cards.txt to the chat.",
            "OK: Done! Upload diagnose_playwright_cards.txt to the chat.",
        )
        print("="*60)
        return True

asyncio.run(main())

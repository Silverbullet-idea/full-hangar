"""
Full-Hangar — Controller.com Diagnostic Script
Fetches Controller.com search results and dumps HTML structure
so we can identify the correct CSS selectors before building the scraper.

Run: py -3.12 diagnose_controller.py
Output: diagnose_controller_cards.txt + diagnose_controller.html
"""

import re
import time
import random
import requests
from bs4 import BeautifulSoup

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
]

# Controller.com Cessna search URL
URL = "https://www.controller.com/listings/aircraft/for-sale/list/category/airplanes/manufacturer/cessna"

def fetch(url):
    session = requests.Session()
    session.headers.update({
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
    })
    print(f"Fetching: {url}")
    resp = session.get(url, timeout=25)
    print(f"Status: {resp.status_code}")

    if resp.status_code == 403:
        print("Got 403 — waiting 12s and retrying with different UA...")
        time.sleep(12)
        session.headers["User-Agent"] = random.choice(USER_AGENTS)
        resp = session.get(url, timeout=25)
        print(f"Retry status: {resp.status_code}")

    return resp

def main():
    resp = fetch(URL)

    if resp.status_code != 200:
        print(f"\nERROR: Could not fetch page (status {resp.status_code})")
        print("Try opening the URL in your browser to confirm it works:")
        print(URL)
        return

    # Save full HTML
    with open("diagnose_controller.html", "w", encoding="utf-8") as f:
        f.write(resp.text)
    print("✅ Full HTML saved to diagnose_controller.html")

    soup = BeautifulSoup(resp.text, "html.parser")

    # ── 1. Most common link patterns ──
    print("\n" + "="*60)
    print("STEP 1: Link patterns (looking for listing detail URLs)")
    print("="*60)
    link_patterns = {}
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        pattern = re.sub(r'\d+', 'N', href)[:80]
        link_patterns[pattern] = link_patterns.get(pattern, 0) + 1
    for pat, count in sorted(link_patterns.items(), key=lambda x: -x[1])[:20]:
        print(f"  {count:3d}x  {pat}")

    # ── 2. Most common CSS classes ──
    print("\n" + "="*60)
    print("STEP 2: Most common CSS classes")
    print("="*60)
    class_counts = {}
    for el in soup.find_all(True):
        for cls in el.get("class", []):
            class_counts[cls] = class_counts.get(cls, 0) + 1
    for cls, count in sorted(class_counts.items(), key=lambda x: -x[1])[:50]:
        print(f"  {count:3d}x  .{cls}")

    # ── 3. Find listing cards ──
    print("\n" + "="*60)
    print("STEP 3: Candidate listing cards")
    print("="*60)

    cards = []
    for el in soup.find_all(["div", "article", "li", "section"]):
        text = el.get_text()
        if re.search(r"\$\d{3,}", text) and re.search(r"\d{4}\s+[A-Z]", text.upper()):
            if 100 < len(el.get_text()) < 3000:
                cards.append(el)

    # Deduplicate by removing cards that contain other cards
    unique_cards = []
    for card in cards:
        is_child = any(card in c.descendants for c in cards if c is not card)
        if not is_child:
            unique_cards.append(card)

    print(f"Found {len(unique_cards)} unique candidate cards\n")

    with open("diagnose_controller_cards.txt", "w", encoding="utf-8") as f:
        for i, card in enumerate(unique_cards[:4]):
            header = f"\n{'='*60}\nCARD #{i+1} — <{card.name}> classes={card.get('class')}\n{'='*60}\n"
            f.write(header)
            f.write(card.prettify())
            f.write("\n")
            print(header)
            print(card.prettify()[:1200])
            if len(card.prettify()) > 1200:
                print(f"  ... [truncated — full card in diagnose_controller_cards.txt]")

    print("\n" + "="*60)
    print("✅ Done! Upload diagnose_controller_cards.txt to the chat.")
    print("="*60)

if __name__ == "__main__":
    main()

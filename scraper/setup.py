"""
Full-Hangar.com — Scraper Setup & Verification Script
Run this once to install all required packages and verify everything is working.
Usage: py setup.py
"""

import subprocess
import sys

REQUIRED_PACKAGES = [
    ("beautifulsoup4",  "bs4"),
    ("playwright",     "playwright"),
    ("supabase",       "supabase"),
    ("python-dotenv",  "dotenv"),
]

def install_packages():
    print("=" * 55)
    print("  Full-Hangar Scraper — Dependency Installer")
    print("=" * 55)
    print(f"\n  Python: {sys.version}\n")

    all_good = True

    for install_name, import_name in REQUIRED_PACKAGES:
        try:
            __import__(import_name)
            print(f"  ✅  {install_name:20s} already installed")
        except ImportError:
            print(f"  📦  {install_name:20s} installing...", end=" ", flush=True)
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", install_name],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                print("done ✅")
            else:
                print("FAILED ❌")
                print(f"      Error: {result.stderr.strip()}")
                all_good = False

    print("\n" + "=" * 55)

    if all_good:
        print("\n  Installing Playwright browsers (Chromium)...")
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
        print("\n  🚀  All packages ready! You're good to go.\n")
        print("  NEXT STEPS:")
        print("  1. Make sure your .env file exists in this folder with:")
        print("       SUPABASE_URL=https://your-project.supabase.co")
        print("       SUPABASE_SERVICE_KEY=your-service-key-here")
        print()
        print("  2. Run a dry run to test the scraper:")
        print("       py scraper.py --make Cessna --dry-run")
        print()
        print("  3. If that looks good, run the full scrape:")
        print("       py scraper.py --make Cessna Piper Beechcraft Cirrus")
    else:
        print("\n  ⚠️  Some packages failed to install.")
        print("  Try running this as Administrator, or paste the")
        print("  error above into the chat for help.\n")

    print("=" * 55 + "\n")

if __name__ == "__main__":
    install_packages()

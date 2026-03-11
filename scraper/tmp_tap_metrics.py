from scraper_base import get_supabase


FIELDS = [
    "asking_price",
    "n_number",
    "description",
    "total_time_airframe",
    "state",
    "seller_name",
    "seller_type",
]


def main() -> None:
    supabase = get_supabase()
    total = (
        supabase.table("aircraft_listings")
        .select("id", count="exact")
        .eq("source_site", "trade_a_plane")
        .execute()
        .count
        or 0
    )
    print(f"total {total}")
    for field in FIELDS:
        count = (
            supabase.table("aircraft_listings")
            .select("id", count="exact")
            .eq("source_site", "trade_a_plane")
            .not_.is_(field, "null")
            .execute()
            .count
            or 0
        )
        pct = (count / total * 100) if total else 0.0
        print(f"{field}: {count}/{total} ({pct:.1f}%)")


if __name__ == "__main__":
    main()

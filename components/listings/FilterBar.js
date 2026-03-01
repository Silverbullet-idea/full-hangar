export default function FilterBar({ searchParams }) {
  return (
    <form className="filters" action="/listings" method="get">
      <input name="make" placeholder="Make (e.g. Cessna)" defaultValue={searchParams.get("make") || ""} />
      <select name="risk" defaultValue={searchParams.get("risk") || ""}>
        <option value="">Any risk</option>
        <option value="LOW">LOW</option>
        <option value="MODERATE">MODERATE</option>
        <option value="HIGH">HIGH</option>
        <option value="CRITICAL">CRITICAL</option>
      </select>
      <input
        name="minScore"
        type="number"
        min="0"
        max="100"
        placeholder="Min score"
        defaultValue={searchParams.get("minScore") || ""}
      />
      <input name="minPrice" type="number" min="0" placeholder="Min price" defaultValue={searchParams.get("minPrice") || ""} />
      <input name="maxPrice" type="number" min="0" placeholder="Max price" defaultValue={searchParams.get("maxPrice") || ""} />
      <select name="sort" defaultValue={searchParams.get("sort") || "value_desc"}>
        <option value="value_desc">Sort: Value Score</option>
        <option value="price_asc">Sort: Price (Low to High)</option>
        <option value="deferred_desc">Sort: Deferred (High to Low)</option>
        <option value="newest">Sort: Newest</option>
      </select>
      <button className="button-link" type="submit">
        Apply
      </button>
    </form>
  )
}

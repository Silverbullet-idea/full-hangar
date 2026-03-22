"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"

const PLACEHOLDER = "Search aircraft — N-number, make, model..."
const NAV_LOADING_START_EVENT = "fullhangar:navigation-loading-start"

export default function HeaderSearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState("")

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(NAV_LOADING_START_EVENT))
    }

    const trimmed = query.trim()
    if (!trimmed) {
      router.push("/listings")
      return
    }

    router.push(`/listings?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fh-header-search-form"
      role="search"
      aria-label="Search aircraft listings"
    >
      <label htmlFor="header-search" className="sr-only">
        Search aircraft
      </label>
      <button type="submit" className="fh-header-search-icon-btn" aria-label="Search listings">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" focusable="false">
          <path
            d="M11 4a7 7 0 1 0 4.47 12.39l4.57 4.57 1.41-1.41-4.57-4.57A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <input
        id="header-search"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={PLACEHOLDER}
        className="fh-header-search-input"
      />
      <a href="/listings" className="fh-header-search-filter" aria-label="Browse listings and filters" title="Filters">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            d="M3 4h18l-7 8v6l-4 2v-8L3 4z"
          />
        </svg>
      </a>
    </form>
  )
}

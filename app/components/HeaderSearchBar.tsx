"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"

const EXAMPLE_PLACEHOLDER = "Try: Cessna 172, Piper Meridian, N12345"

export default function HeaderSearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [placeholder, setPlaceholder] = useState(EXAMPLE_PLACEHOLDER)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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
      className="flex w-full max-w-[560px] min-w-0 items-center rounded-md border border-brand-dark bg-[#141c27] sm:min-w-[320px]"
      role="search"
      aria-label="Search aircraft listings"
    >
      <label htmlFor="header-search" className="sr-only">
        Search aircraft
      </label>
      <input
        id="header-search"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setPlaceholder("")}
        onBlur={() => {
          if (!query.trim()) setPlaceholder(EXAMPLE_PLACEHOLDER)
        }}
        placeholder={placeholder}
        className="h-10 w-full bg-transparent px-4 text-sm text-brand-white placeholder:text-[#9AA4B2] focus:outline-none"
      />
      <button
        type="submit"
        className="flex h-10 w-12 items-center justify-center text-[#C2CBD7] transition-colors hover:text-brand-orange"
        aria-label="Search listings"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false">
          <path
            d="M11 4a7 7 0 1 0 4.47 12.39l4.57 4.57 1.41-1.41-4.57-4.57A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </form>
  )
}

"use client"

import { useEffect, useRef } from "react"

function animateCounter(id: string, target: number, duration: number) {
  const el = document.getElementById(id)
  if (!el) return
  let start = 0
  const step = target / (duration / 16)
  const timer = setInterval(() => {
    start = Math.min(start + step, target)
    el.textContent = Math.round(start).toLocaleString()
    if (start >= target) clearInterval(timer)
  }, 16)
}

export default function HomeStatsBar() {
  const statsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animateCounter("s-listings", 10574, 1200)
          animateCounter("s-faa", 310196, 1400)
          const tbo = document.getElementById("s-tbo")
          if (tbo) tbo.textContent = "110+"
          animateCounter("s-sources", 8, 600)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={statsRef} className="border-y border-brand-dark bg-card-bg py-8">
      <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-6 px-6 lg:grid-cols-4">
        <div>
          <div id="s-listings" className="text-[2.2rem] font-extrabold leading-none text-brand-orange">
            0
          </div>
          <p className="mt-1 text-xs text-brand-muted">Live listings tracked</p>
        </div>
        <div>
          <div id="s-faa" className="text-[2.2rem] font-extrabold leading-none text-brand-orange">
            0
          </div>
          <p className="mt-1 text-xs text-brand-muted">FAA registry records</p>
        </div>
        <div>
          <div id="s-tbo" className="text-[2.2rem] font-extrabold leading-none text-brand-orange">
            0
          </div>
          <p className="mt-1 text-xs text-brand-muted">Engine TBO references</p>
        </div>
        <div>
          <div id="s-sources" className="text-[2.2rem] font-extrabold leading-none text-brand-orange">
            0
          </div>
          <p className="mt-1 text-xs text-brand-muted">Data sources scraped daily</p>
        </div>
      </div>
    </section>
  )
}

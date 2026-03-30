"use client"

import type { HeroExampleCarouselSlide } from "@/lib/home/heroExampleFallbackSlides"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"

const ROTATE_MS = 5200

export type HeroExampleCarouselProps = {
  slides: readonly HeroExampleCarouselSlide[]
  /** Accessible name for the carousel (no visible caption). */
  ariaLabel: string
}

export default function HeroExampleCarousel({ slides, ariaLabel }: HeroExampleCarouselProps) {
  const [active, setActive] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const pausedRef = useRef(false)
  const n = slides.length

  useEffect(() => {
    setActive(0)
  }, [slides])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const advance = useCallback(() => {
    if (n <= 0) return
    setActive((i) => (i + 1) % n)
  }, [n])

  useEffect(() => {
    if (reducedMotion || n <= 1) return
    const id = window.setInterval(() => {
      if (!pausedRef.current) advance()
    }, ROTATE_MS)
    return () => window.clearInterval(id)
  }, [reducedMotion, n, advance])

  const goTo = (i: number) => {
    if (n <= 0) return
    setActive(((i % n) + n) % n)
  }

  const onCarouselKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault()
      advance()
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      goTo(active - 1)
    }
  }

  if (n === 0) return null

  return (
    <figure
      className="overflow-hidden rounded-2xl border border-[#2B3444] outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121923]"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onCarouselKeyDown}
      onMouseEnter={() => {
        pausedRef.current = true
      }}
      onMouseLeave={() => {
        pausedRef.current = false
      }}
    >
      <div className="relative aspect-[4/3] w-full bg-[#0d1117]">
        {slides.map((slide, i) => (
          <Image
            key={`${slide.src}-${i}`}
            src={slide.src}
            alt={i === active ? slide.alt : ""}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className={`absolute inset-0 object-cover transition-opacity duration-700 ease-in-out ${
              i === active ? "z-[1] opacity-100" : "pointer-events-none z-0 opacity-0"
            }`}
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : undefined}
            unoptimized={slide.src.includes("/api/image-proxy")}
            aria-hidden={i !== active}
          />
        ))}
      </div>
      <figcaption className="sr-only">
        {slides.length} photos. Use left and right arrow keys to move between images.
        {reducedMotion ? " Automatic rotation is disabled when reduced motion is on." : " Photos rotate automatically."}
      </figcaption>
    </figure>
  )
}

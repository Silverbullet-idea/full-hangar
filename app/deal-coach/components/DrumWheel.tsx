"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type DrumWheelProps = {
  items: string[]
  defaultIndex: number
  label: string
  onChange: (value: string) => void
}

const ROW = 44
const VISIBLE = 176

export default function DrumWheel({ items, defaultIndex, label, onChange }: DrumWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(() => Math.min(Math.max(0, defaultIndex), items.length - 1))
  const dragging = useRef(false)
  const startY = useRef(0)
  const startScroll = useRef(0)

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = scrollRef.current
      if (!el) return
      const clamped = Math.min(Math.max(0, i), items.length - 1)
      el.scrollTo({ top: clamped * ROW, behavior: "smooth" })
      setIndex(clamped)
      onChange(items[clamped] ?? "")
    },
    [items, onChange]
  )

  useEffect(() => {
    scrollToIndex(Math.min(Math.max(0, defaultIndex), items.length - 1))
  }, [defaultIndex, items.length, scrollToIndex])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const i = Math.round(el.scrollTop / ROW)
    const clamped = Math.min(Math.max(0, i), items.length - 1)
    if (clamped !== index) {
      setIndex(clamped)
      onChange(items[clamped] ?? "")
    }
  }, [index, items, onChange])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      el.scrollTop += e.deltaY
      requestAnimationFrame(onScroll)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [onScroll])

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--fh-text-dim)]">{label}</span>
      <div className="relative" style={{ height: VISIBLE }}>
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 z-[1] -mt-[22px] rounded-md border-2 border-[#FF9900]/70 bg-[#FF9900]/5"
          style={{ height: ROW }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-12 bg-gradient-to-b from-[#0d1117] to-transparent [data-theme=light]:from-slate-100"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-12 bg-gradient-to-t from-[#0d1117] to-transparent [data-theme=light]:from-slate-100"
        />
        <div
          ref={scrollRef}
          role="listbox"
          aria-label={label}
          className="relative z-0 h-full overflow-y-auto overflow-x-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: "y mandatory" }}
          onScroll={onScroll}
          onMouseDown={(e) => {
            dragging.current = true
            startY.current = e.clientY
            startScroll.current = scrollRef.current?.scrollTop ?? 0
          }}
          onMouseMove={(e) => {
            if (!dragging.current || !scrollRef.current) return
            scrollRef.current.scrollTop = startScroll.current - (e.clientY - startY.current)
            onScroll()
          }}
          onMouseUp={() => {
            dragging.current = false
            scrollToIndex(Math.round((scrollRef.current?.scrollTop ?? 0) / ROW))
          }}
          onMouseLeave={() => {
            if (dragging.current) {
              dragging.current = false
              scrollToIndex(Math.round((scrollRef.current?.scrollTop ?? 0) / ROW))
            }
          }}
          onTouchStart={(e) => {
            dragging.current = true
            startY.current = e.touches[0]?.clientY ?? 0
            startScroll.current = scrollRef.current?.scrollTop ?? 0
          }}
          onTouchMove={(e) => {
            if (!dragging.current || !scrollRef.current) return
            const y = e.touches[0]?.clientY ?? startY.current
            scrollRef.current.scrollTop = startScroll.current - (y - startY.current)
            onScroll()
          }}
          onTouchEnd={() => {
            dragging.current = false
            scrollToIndex(Math.round((scrollRef.current?.scrollTop ?? 0) / ROW))
          }}
        >
          <div style={{ height: (VISIBLE - ROW) / 2 }} aria-hidden />
          {items.map((item, i) => (
            <div
              key={`${item}-${i}`}
              role="option"
              aria-selected={i === index}
              className="flex items-center justify-center text-center"
              style={{
                height: ROW,
                scrollSnapAlign: "center",
                fontSize: i === index ? 17 : 14,
                fontWeight: i === index ? 700 : 400,
                color: i === index ? "var(--fh-text)" : "var(--fh-text-dim)",
                fontFamily: "var(--font-dm-mono), ui-monospace, monospace",
              }}
            >
              {item}
            </div>
          ))}
          <div style={{ height: (VISIBLE - ROW) / 2 }} aria-hidden />
        </div>
      </div>
    </div>
  )
}

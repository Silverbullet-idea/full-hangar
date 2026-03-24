"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDealTierMeta } from "../../../../lib/listings/dealTier";

type ListingImageGalleryProps = {
  title: string;
  imageUrls: string[];
  dealTier?: string | null;
  /** When true, show PRICE UNDISCLOSED on hero (belt-and-suspenders vs stale deal_tier). */
  priceUndisclosed?: boolean;
  fallbackImageUrl?: string | null;
  /** Taller hero, synced main/thumb selection, compact thumbs (listing detail overhaul). */
  layoutVariant?: "default" | "detailHero";
};

const SWIPE_THRESHOLD_PX = 40;

function toProxySrc(url: string): string {
  if (url.startsWith("/")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export default function ListingImageGallery({
  title,
  imageUrls,
  dealTier = null,
  priceUndisclosed = false,
  fallbackImageUrl = null,
  layoutVariant = "default",
}: ListingImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const safeImageUrls = useMemo(
    () => imageUrls.map((value) => String(value || "").trim()).filter(Boolean),
    [imageUrls]
  );
  const failedUrlSet = useMemo(() => new Set(failedUrls), [failedUrls]);
  const displayImageUrls = useMemo(
    () => safeImageUrls.filter((url) => !failedUrlSet.has(url)),
    [safeImageUrls, failedUrlSet]
  );
  const fallbackUrl = String(fallbackImageUrl || "").trim();
  const effectiveImageUrls = displayImageUrls.length > 0 ? displayImageUrls : (fallbackUrl ? [fallbackUrl] : []);
  const hasMultipleImages = effectiveImageUrls.length > 1;
  const isDetailHero = layoutVariant === "detailHero";
  const mainIndex = isDetailHero ? activeIndex : 0;
  const heroUrl = effectiveImageUrls[mainIndex] ?? effectiveImageUrls[0] ?? "";
  const dealTierMeta = getDealTierMeta(dealTier);
  const dealTierBadgeClass = dealTierMeta
    ? dealTierMeta.tone === "green"
      ? "border-[#16a34a] bg-[#16a34a1f] text-[#16a34a]"
      : dealTierMeta.tone === "blue"
        ? "border-[#2563eb] bg-[#2563eb1f] text-[#2563eb]"
        : dealTierMeta.tone === "amber"
          ? "border-[#d97706] bg-[#d977061f] text-[#d97706]"
          : "border-[#dc2626] bg-[#dc26261f] text-[#dc2626]"
    : "";
  const controlButtonStyle = {
    border: "1px solid var(--brand-dark)",
    background: "var(--card-bg)",
    color: "var(--brand-white)",
  } as const;
  const counterPillStyle = {
    border: "1px solid var(--brand-dark)",
    background: "color-mix(in srgb, var(--card-bg) 88%, transparent)",
    color: "var(--brand-white)",
  } as const;

  const jumpToIndex = (nextIndex: number) => {
    if (!displayImageUrls.length) return;
    const bounded = (nextIndex + displayImageUrls.length) % displayImageUrls.length;
    setActiveIndex(bounded);
  };

  const markFailed = (url: string) => {
    if (!url) return;
    setFailedUrls((previous) => (previous.includes(url) ? previous : [...previous, url]));
  };

  const openModalAt = (index: number) => {
    if (!hasMultipleImages) return;
    jumpToIndex(index);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        jumpToIndex(activeIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        jumpToIndex(activeIndex - 1);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen, activeIndex, displayImageUrls.length]);

  useEffect(() => {
    setFailedUrls([]);
  }, [safeImageUrls]);

  useEffect(() => {
    if (!effectiveImageUrls.length) {
      setActiveIndex(0);
      if (isModalOpen) setIsModalOpen(false);
      return;
    }
    if (activeIndex >= effectiveImageUrls.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, effectiveImageUrls.length, isModalOpen]);

  if (!heroUrl) {
    return (
      <div
        className={`hero-image hero-placeholder ${isDetailHero ? "rounded-t-xl" : ""}`}
        style={isDetailHero ? { minHeight: 420, maxHeight: 420 } : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M22 16.5v-2l-8-5V4a2 2 0 0 0-4 0v5.5l-8 5v2l8-2.5V20l-2 1.5V23l4-1 4 1v-1.5L14 20v-6z"
          />
        </svg>
      </div>
    );
  }

  const heroFrameClass = isDetailHero
    ? "relative block min-h-[44px] w-full overflow-hidden rounded-t-xl text-left"
    : "relative block min-h-[44px] w-full text-left";

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => openModalAt(isDetailHero ? activeIndex : 0)}
          className={`${heroFrameClass} ${hasMultipleImages ? "cursor-zoom-in" : "cursor-default"}`}
          title={hasMultipleImages ? "Open image carousel" : undefined}
          aria-label={hasMultipleImages ? "Open image carousel" : "Listing image"}
        >
          {isDetailHero ? (
            <span className="relative block h-[420px] w-full max-h-[420px] min-h-[280px] bg-[var(--surface-muted)] sm:min-h-[420px] sm:max-h-[420px]">
              <Image
                className="object-cover"
                src={toProxySrc(heroUrl)}
                alt={title || "Aircraft listing"}
                fill
                sizes="(max-width: 1024px) 100vw, 65vw"
                unoptimized
                priority
                fetchPriority="high"
                onError={() => markFailed(heroUrl)}
              />
            </span>
          ) : (
            <Image
              className="hero-image"
              src={toProxySrc(heroUrl)}
              alt={title || "Aircraft listing"}
              width={1200}
              height={720}
              sizes="(max-width: 980px) 100vw, 50vw"
              unoptimized
              priority
              fetchPriority="high"
              onError={() => markFailed(heroUrl)}
            />
          )}
          {dealTierMeta ? (
            <span className={`absolute right-3 top-3 inline-flex rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur-sm ${dealTierBadgeClass}`}>
              {dealTierMeta.label}
            </span>
          ) : priceUndisclosed ? (
            <span className="absolute right-3 top-3 inline-flex rounded border border-[rgba(122,138,158,0.45)] bg-[rgba(0,0,0,0.65)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#d1d5db] backdrop-blur-sm">
              Price undisclosed
            </span>
          ) : null}
          {hasMultipleImages ? (
            <span className="absolute bottom-3 right-3 rounded px-2 py-1 text-[11px] font-semibold" style={counterPillStyle}>
              {`${isDetailHero ? activeIndex + 1 : 1} / ${effectiveImageUrls.length}`}
            </span>
          ) : null}
        </button>
      </div>

      {effectiveImageUrls.length > 1 ? (
        <div
          className={
            isDetailHero
              ? "mt-2 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] px-1"
              : "mt-2 flex gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory md:mt-[0.8rem] md:grid md:max-w-none md:grid-cols-3 md:gap-[0.6rem] md:overflow-visible md:pb-0"
          }
        >
          {(isDetailHero ? effectiveImageUrls : effectiveImageUrls.slice(1)).map((url, index) => {
            const thumbIndex = isDetailHero ? index : index + 1;
            const isActive = isDetailHero && index === activeIndex;
            return (
              <button
                key={`${url}-${thumbIndex}`}
                type="button"
                onClick={() => {
                  if (isDetailHero) {
                    setActiveIndex(index);
                  } else {
                    openModalAt(thumbIndex);
                  }
                }}
                onDoubleClick={() => {
                  if (isDetailHero) openModalAt(index);
                }}
                className={`relative shrink-0 cursor-zoom-in snap-start ${
                  isDetailHero
                    ? `h-[50px] w-[60px] overflow-hidden rounded-md border ${isActive ? "border-[#ff9900] ring-2 ring-[#ff9900]/40" : "border-[var(--brand-dark)]"}`
                    : "block w-72 md:w-auto md:shrink"
                }`}
                title={isDetailHero ? `Show image ${index + 1}` : `Open image ${thumbIndex + 1}`}
                aria-label={isDetailHero ? `Show image ${index + 1}` : `Open image ${thumbIndex + 1}`}
                aria-current={isActive ? "true" : undefined}
              >
                <Image
                  className={isDetailHero ? "h-full w-full object-cover" : "gallery-thumb"}
                  src={toProxySrc(url)}
                  alt={`${title || "Aircraft"} gallery image ${thumbIndex + 1}`}
                  width={isDetailHero ? 60 : 320}
                  height={isDetailHero ? 50 : 176}
                  sizes={isDetailHero ? "60px" : "(max-width: 980px) 33vw, 16vw"}
                  unoptimized
                  loading="lazy"
                  onError={() => markFailed(url)}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Image carousel"
        >
          <div
            className="relative w-full max-w-6xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute right-2 top-2 z-10 rounded px-2 py-1 text-sm font-semibold"
              style={controlButtonStyle}
            >
              Close
            </button>
            <div
              className="relative h-[70vh] w-full overflow-hidden rounded-lg"
              style={{
                border: "1px solid var(--brand-dark)",
                background: "var(--surface-muted)",
              }}
              onTouchStart={(event) => {
                const firstTouch = event.touches[0];
                touchStartXRef.current = firstTouch.clientX;
                touchStartYRef.current = firstTouch.clientY;
              }}
              onTouchEnd={(event) => {
                const firstTouch = event.changedTouches[0];
                const startX = touchStartXRef.current;
                const startY = touchStartYRef.current;
                if (startX === null || startY === null) return;
                const deltaX = firstTouch.clientX - startX;
                const deltaY = firstTouch.clientY - startY;
                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
                  if (deltaX < 0) jumpToIndex(activeIndex + 1);
                  if (deltaX > 0) jumpToIndex(activeIndex - 1);
                }
                touchStartXRef.current = null;
                touchStartYRef.current = null;
              }}
            >
              <Image
                src={toProxySrc(effectiveImageUrls[activeIndex])}
                alt={`${title || "Aircraft listing"} image ${activeIndex + 1}`}
                fill
                sizes="100vw"
                unoptimized
                className="object-contain"
                priority
                onError={() => markFailed(effectiveImageUrls[activeIndex] ?? "")}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => jumpToIndex(activeIndex - 1)}
                className="rounded px-3 py-1.5 text-sm font-semibold"
                style={controlButtonStyle}
              >
                Prev
              </button>
              <div className="text-sm font-semibold" style={{ color: "var(--brand-white)" }}>
                {`${activeIndex + 1} / ${effectiveImageUrls.length}`}
              </div>
              <button
                type="button"
                onClick={() => jumpToIndex(activeIndex + 1)}
                className="rounded px-3 py-1.5 text-sm font-semibold"
                style={controlButtonStyle}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

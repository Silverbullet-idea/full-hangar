"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDealTierMeta } from "../../../../lib/listings/dealTier";

type ListingImageGalleryProps = {
  title: string;
  imageUrls: string[];
  dealTier?: string | null;
};

const SWIPE_THRESHOLD_PX = 40;

function toProxySrc(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export default function ListingImageGallery({ title, imageUrls, dealTier = null }: ListingImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const safeImageUrls = useMemo(
    () => imageUrls.map((value) => String(value || "").trim()).filter(Boolean),
    [imageUrls]
  );
  const hasMultipleImages = safeImageUrls.length > 1;
  const heroUrl = safeImageUrls[0] ?? "";
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
    if (!safeImageUrls.length) return;
    const bounded = (nextIndex + safeImageUrls.length) % safeImageUrls.length;
    setActiveIndex(bounded);
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
  }, [isModalOpen, activeIndex, safeImageUrls.length]);

  if (!heroUrl) {
    return (
      <div className="hero-image hero-placeholder">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M22 16.5v-2l-8-5V4a2 2 0 0 0-4 0v5.5l-8 5v2l8-2.5V20l-2 1.5V23l4-1 4 1v-1.5L14 20v-6z"
          />
        </svg>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => openModalAt(0)}
          className={`relative block w-full text-left ${hasMultipleImages ? "cursor-zoom-in" : "cursor-default"}`}
          title={hasMultipleImages ? "Open image carousel" : undefined}
          aria-label={hasMultipleImages ? "Open image carousel" : "Listing image"}
        >
          <Image
            className="hero-image"
            src={toProxySrc(heroUrl)}
            alt={title || "Aircraft listing"}
            width={1200}
            height={720}
            sizes="(max-width: 980px) 100vw, 50vw"
            unoptimized
            priority
          />
          {dealTierMeta ? (
            <span className={`absolute right-3 top-3 inline-flex rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur-sm ${dealTierBadgeClass}`}>
              {dealTierMeta.label}
            </span>
          ) : null}
          {hasMultipleImages ? (
            <span className="absolute bottom-2 right-2 rounded px-2 py-1 text-[11px] font-semibold" style={counterPillStyle}>
              {`1 / ${safeImageUrls.length}`}
            </span>
          ) : null}
        </button>
      </div>

      {safeImageUrls.length > 1 ? (
        <div className="image-gallery-grid">
          {safeImageUrls.slice(1).map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => openModalAt(index + 1)}
              className="relative block cursor-zoom-in"
              title={`Open image ${index + 2}`}
              aria-label={`Open image ${index + 2}`}
            >
              <Image
                className="gallery-thumb"
                src={toProxySrc(url)}
                alt={`${title || "Aircraft"} gallery image ${index + 2}`}
                width={320}
                height={176}
                sizes="(max-width: 980px) 33vw, 16vw"
                unoptimized
                loading="lazy"
              />
            </button>
          ))}
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
                src={toProxySrc(safeImageUrls[activeIndex])}
                alt={`${title || "Aircraft listing"} image ${activeIndex + 1}`}
                fill
                sizes="100vw"
                unoptimized
                className="object-contain"
                priority
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
                {`${activeIndex + 1} / ${safeImageUrls.length}`}
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

"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildSellerSubmissionPayload,
  CA_PROVINCE_OPTIONS,
  FRACTIONAL_SHARE_OPTIONS,
  initialSellerFormData,
  SELLER_COUNTRY_OPTIONS,
  SellerFormData,
  TIME_STATUS_OPTIONS,
  US_STATE_OPTIONS,
  type SellerCondition,
  type SellerSaleType,
  type SellerType,
  type UsefulLoadUnit,
} from "@/lib/sell/sellerFormTypes"

const INPUT =
  "h-11 w-full rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-3 text-[var(--fh-text)] [data-theme=light]:bg-white [data-theme=light]:text-slate-900"
const INPUT_MONO = `${INPUT} font-[family-name:var(--font-dm-mono)] text-sm`
const LABEL = "mb-1 block text-xs font-medium text-[var(--fh-text-dim)]"
const SECTION_TITLE = "text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
const CARD = "rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 [data-theme=light]:bg-white"
const BTN_ORANGE =
  "rounded-lg bg-[var(--fh-orange)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
const BTN_GHOST =
  "rounded-lg border border-[var(--fh-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--fh-text)] hover:bg-[var(--fh-bg3)]"

function barlowClass() {
  return { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--fh-border)] py-3 last:border-b-0">
      <span className="text-sm text-[var(--fh-text)]">{label}</span>
      <div className="flex shrink-0 rounded-lg border border-[var(--fh-border)] p-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${
            value ? "bg-[var(--fh-orange)] text-black" : "text-[var(--fh-text-dim)] hover:text-[var(--fh-text)]"
          } ${disabled ? "opacity-40" : ""}`}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${
            !value ? "bg-[var(--fh-bg3)] text-[var(--fh-text)]" : "text-[var(--fh-text-dim)] hover:text-[var(--fh-text)]"
          } ${disabled ? "opacity-40" : ""}`}
        >
          No
        </button>
      </div>
    </div>
  )
}

const STEPS = [
  { n: 1, label: "Aircraft identity" },
  { n: 2, label: "Hours & condition" },
  { n: 3, label: "Listing copy" },
  { n: 4, label: "Contact" },
  { n: 5, label: "Photos & logs" },
  { n: 6, label: "Pricing" },
] as const

const IMAGE_TYPE_OPTIONS = [
  { value: "exterior", label: "Exterior" },
  { value: "interior", label: "Interior" },
  { value: "panel", label: "Panel" },
  { value: "other", label: "Other" },
] as const

const LOG_TYPE_OPTIONS = [
  { value: "", label: "Select type" },
  { value: "airframe", label: "Airframe log" },
  { value: "engine", label: "Engine log" },
  { value: "prop", label: "Prop log" },
  { value: "ad_compliance", label: "AD compliance" },
  { value: "maintenance", label: "Maintenance records" },
  { value: "other", label: "Other" },
] as const

export default function SellerIntakeClient() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<SellerFormData>(() => ({ ...initialSellerFormData }))
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({})
  const [logFiles, setLogFiles] = useState<Record<string, File>>({})
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [submittedJson, setSubmittedJson] = useState<string | null>(null)
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Record<string, string>>({})
  const photoInputRef = useRef<HTMLInputElement>(null)
  const logInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const id of Object.keys(photoFiles)) {
      const f = photoFiles[id]
      if (f) next[id] = URL.createObjectURL(f)
    }
    setPhotoPreviewUrls(next)
    return () => {
      for (const u of Object.values(next)) URL.revokeObjectURL(u)
    }
  }, [photoFiles])

  const update = useCallback(<K extends keyof SellerFormData>(key: K, value: SellerFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const usOrCa = form.country === "United States" || form.country === "Canada"
  const stateOptions = form.country === "Canada" ? CA_PROVINCE_OPTIONS : US_STATE_OPTIONS

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return
    setForm((prev) => {
      const next = { ...prev, photos: [...prev.photos], photo_types: { ...prev.photo_types }, photo_captions: { ...prev.photo_captions } }
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file.type.startsWith("image/")) continue
        const id = crypto.randomUUID()
        next.photos.push({ id, name: file.name, size: file.size })
        next.photo_types[id] = "exterior"
        next.photo_captions[id] = ""
        setPhotoFiles((pf) => ({ ...pf, [id]: file }))
      }
      return next
    })
  }

  const removePhoto = (id: string) => {
    setForm((prev) => {
      const { [id]: _t, ...restTypes } = prev.photo_types
      const { [id]: _c, ...restCaps } = prev.photo_captions
      return {
        ...prev,
        photos: prev.photos.filter((p) => p.id !== id),
        photo_types: restTypes,
        photo_captions: restCaps,
      }
    })
    setPhotoFiles((pf) => {
      const { [id]: _, ...rest } = pf
      return rest
    })
    if (selectedPhotoId === id) setSelectedPhotoId(null)
  }

  const addLogs = (files: FileList | null) => {
    if (!files?.length) return
    setForm((prev) => {
      const next = { ...prev, logs: [...prev.logs], log_types: { ...prev.log_types } }
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const id = crypto.randomUUID()
        next.logs.push({ id, name: file.name, size: file.size })
        next.log_types[id] = ""
        setLogFiles((lf) => ({ ...lf, [id]: file }))
      }
      return next
    })
  }

  const removeLog = (id: string) => {
    setForm((prev) => {
      const { [id]: _, ...rest } = prev.log_types
      return { ...prev, logs: prev.logs.filter((l) => l.id !== id), log_types: rest }
    })
    setLogFiles((lf) => {
      const { [id]: __, ...rest } = lf
      return rest
    })
  }

  const submit = () => {
    const json = JSON.stringify(buildSellerSubmissionPayload(form), null, 2)
    setSubmittedJson(json)
    if (typeof console !== "undefined" && console.log) {
      console.log("[seller-intake] submission payload", buildSellerSubmissionPayload(form))
    }
  }

  const saleTypeRadios: { value: SellerSaleType; label: string }[] = [
    { value: "for_sale", label: "For sale" },
    { value: "for_lease", label: "For lease" },
    { value: "fractional", label: "Fractional" },
  ]

  const conditionRadios: { value: SellerCondition; label: string }[] = [
    { value: "used", label: "Used" },
    { value: "new", label: "New" },
    { value: "project", label: "Project" },
    { value: "not_specified", label: "Not specified" },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <Link href="/" className="text-sm text-[var(--fh-orange)] no-underline hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlowClass()}>
        List your aircraft
      </h1>
      <p className="mt-2 text-sm text-[var(--fh-text-dim)]">
        One intake form — structured for Trade-A-Plane, Controller, ASO, and future cross-post.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setStep(s.n)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              step === s.n
                ? "bg-[var(--fh-orange)] text-black"
                : "border border-[var(--fh-border)] text-[var(--fh-text-dim)] hover:text-[var(--fh-text)]"
            }`}
          >
            {s.n}. {s.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {step === 1 && (
          <div className="space-y-6">
            <h2 className={SECTION_TITLE} style={barlowClass()}>
              Aircraft identity
            </h2>
            <div className={`grid gap-4 sm:grid-cols-2 ${CARD}`}>
              <div>
                <label className={LABEL}>Year</label>
                <input
                  type="number"
                  className={INPUT_MONO}
                  value={form.year ?? ""}
                  onChange={(e) => update("year", e.target.value === "" ? null : parseInt(e.target.value, 10))}
                  placeholder="1979"
                />
              </div>
              <div>
                <label className={LABEL}>Make</label>
                <input type="text" className={INPUT} value={form.make} onChange={(e) => update("make", e.target.value)} placeholder="Cessna" />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Model</label>
                <input type="text" className={INPUT} value={form.model} onChange={(e) => update("model", e.target.value)} placeholder="172N" />
              </div>
              <div>
                <label className={LABEL}>Registration (N-number)</label>
                <input
                  type="text"
                  className={INPUT_MONO}
                  value={form.n_number}
                  onChange={(e) => update("n_number", e.target.value.toUpperCase())}
                  placeholder="N12345"
                />
              </div>
              <div>
                <label className={LABEL}>Serial number</label>
                <input type="text" className={INPUT_MONO} value={form.serial_number} onChange={(e) => update("serial_number", e.target.value)} />
              </div>
            </div>

            <div className={CARD}>
              <p className={`mb-3 text-sm font-semibold text-[var(--fh-text)]`}>Sale type</p>
              <div className="flex flex-wrap gap-3">
                {saleTypeRadios.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fh-text)]">
                    <input
                      type="radio"
                      name="sale_type"
                      checked={form.sale_type === o.value}
                      onChange={() => {
                        update("sale_type", o.value)
                        if (o.value !== "fractional") update("fractional_share", null)
                      }}
                      className="accent-[var(--fh-orange)]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            <div className={CARD}>
              <p className={`mb-3 text-sm font-semibold text-[var(--fh-text)]`}>Condition</p>
              <div className="flex flex-wrap gap-3">
                {conditionRadios.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fh-text)]">
                    <input
                      type="radio"
                      name="condition"
                      checked={form.condition === o.value}
                      onChange={() => update("condition", o.value)}
                      className="accent-[var(--fh-orange)]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            <div className={CARD}>
              <label className={LABEL}>Model suffix (optional)</label>
              <input
                type="text"
                maxLength={32}
                className={INPUT}
                value={form.model_suffix}
                onChange={(e) => update("model_suffix", e.target.value.slice(0, 32))}
                placeholder='e.g. "w/ GTN 650" or "Refurbished 2023"'
              />
              <p className="mt-1 text-xs text-[var(--fh-text-dim)]">Optional. Shown in listing title on some platforms.</p>
            </div>

            {form.sale_type === "fractional" && (
              <div className={CARD}>
                <label className={LABEL}>Fractional share</label>
                <select
                  className={INPUT}
                  value={form.fractional_share ?? ""}
                  onChange={(e) => update("fractional_share", e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">None</option>
                  {FRACTIONAL_SHARE_OPTIONS.filter((x) => x !== "none").map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={CARD}>
              <p className={`mb-3 text-sm font-semibold text-[var(--fh-text)]`} style={barlowClass()}>
                Location
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL}>City</label>
                  <input type="text" className={INPUT} value={form.city} onChange={(e) => update("city", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Country</label>
                  <select className={INPUT} value={form.country} onChange={(e) => update("country", e.target.value)}>
                    {SELLER_COUNTRY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {usOrCa ? (
                  <div>
                    <label className={LABEL}>{form.country === "Canada" ? "Province" : "State"}</label>
                    <select className={INPUT} value={form.state} onChange={(e) => update("state", e.target.value)}>
                      <option value="">Select…</option>
                      {stateOptions.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Region / province</label>
                    <input
                      type="text"
                      className={INPUT}
                      value={form.region_or_province}
                      onChange={(e) => update("region_or_province", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className={CARD}>
              <p className={`mb-3 text-sm font-semibold text-[var(--fh-text)]`}>Seller type</p>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    { value: "private" as SellerType, label: "Private owner" },
                    { value: "broker" as SellerType, label: "Broker / dealer" },
                  ] as const
                ).map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fh-text)]">
                    <input
                      type="radio"
                      name="seller_type"
                      checked={form.seller_type === o.value}
                      onChange={() => update("seller_type", o.value)}
                      className="accent-[var(--fh-orange)]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className={SECTION_TITLE} style={barlowClass()}>
              Hours & condition
            </h2>
            <div className={CARD}>
              <label className={LABEL}>Total time airframe (hrs)</label>
              <input
                type="number"
                className={INPUT_MONO}
                value={form.total_time_airframe ?? ""}
                onChange={(e) => update("total_time_airframe", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
            </div>

            <div className={CARD}>
              <p className="mb-3 text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
                Engine 1
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL}>Make / model</label>
                  <input type="text" className={INPUT} value={form.engine1_make_model} onChange={(e) => update("engine1_make_model", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Serial #</label>
                  <input type="text" className={INPUT_MONO} value={form.engine1_serial} onChange={(e) => update("engine1_serial", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Time status</label>
                  <select className={INPUT} value={form.engine1_time_status} onChange={(e) => update("engine1_time_status", e.target.value)}>
                    {TIME_STATUS_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Hours</label>
                  <input
                    type="number"
                    className={INPUT_MONO}
                    value={form.engine1_hours ?? ""}
                    onChange={(e) => update("engine1_hours", e.target.value === "" ? null : parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className={LABEL}>TBO</label>
                  <input
                    type="number"
                    className={INPUT_MONO}
                    value={form.engine1_tbo ?? ""}
                    onChange={(e) => update("engine1_tbo", e.target.value === "" ? null : parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className={LABEL}>Engine program</label>
                <input
                  type="text"
                  className={INPUT}
                  value={form.engine1_program}
                  onChange={(e) => update("engine1_program", e.target.value)}
                  placeholder="e.g. Lycoming MSP Gold, Continental PowerAdvantage"
                />
                <p className="mt-1 text-xs text-[var(--fh-text-dim)]">
                  Enrollment in a factory engine program is a buyer trust signal.
                </p>
              </div>
            </div>

            {!form.show_engine2 ? (
              <button type="button" className={`${BTN_GHOST} text-[var(--fh-orange)]`} onClick={() => update("show_engine2", true)}>
                + Add engine 2
              </button>
            ) : (
              <div className={CARD}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
                    Engine 2
                  </p>
                  <button type="button" className="text-xs text-[var(--fh-text-dim)] underline" onClick={() => update("show_engine2", false)}>
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Make / model</label>
                    <input type="text" className={INPUT} value={form.engine2_make_model} onChange={(e) => update("engine2_make_model", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Serial #</label>
                    <input type="text" className={INPUT_MONO} value={form.engine2_serial} onChange={(e) => update("engine2_serial", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Time status</label>
                    <select className={INPUT} value={form.engine2_time_status} onChange={(e) => update("engine2_time_status", e.target.value)}>
                      {TIME_STATUS_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Hours</label>
                    <input
                      type="number"
                      className={INPUT_MONO}
                      value={form.engine2_hours ?? ""}
                      onChange={(e) => update("engine2_hours", e.target.value === "" ? null : parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>TBO</label>
                    <input
                      type="number"
                      className={INPUT_MONO}
                      value={form.engine2_tbo ?? ""}
                      onChange={(e) => update("engine2_tbo", e.target.value === "" ? null : parseFloat(e.target.value))}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className={LABEL}>Engine program</label>
                  <input
                    type="text"
                    className={INPUT}
                    value={form.engine2_program}
                    onChange={(e) => update("engine2_program", e.target.value)}
                    placeholder="e.g. Lycoming MSP Gold, Continental PowerAdvantage"
                  />
                  <p className="mt-1 text-xs text-[var(--fh-text-dim)]">
                    Enrollment in a factory engine program is a buyer trust signal.
                  </p>
                </div>
              </div>
            )}

            <div className={CARD}>
              <p className="mb-3 text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
                Propeller 1
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL}>Make / model</label>
                  <input type="text" className={INPUT} value={form.prop_make_model} onChange={(e) => update("prop_make_model", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Serial #</label>
                  <input type="text" className={INPUT_MONO} value={form.prop_serial} onChange={(e) => update("prop_serial", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Time status</label>
                  <select className={INPUT} value={form.prop_time_status} onChange={(e) => update("prop_time_status", e.target.value)}>
                    {TIME_STATUS_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Hours</label>
                  <input
                    type="number"
                    className={INPUT_MONO}
                    value={form.prop_hours ?? ""}
                    onChange={(e) => update("prop_hours", e.target.value === "" ? null : parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className={LABEL}>TBO</label>
                  <input
                    type="number"
                    className={INPUT_MONO}
                    value={form.prop_tbo ?? ""}
                    onChange={(e) => update("prop_tbo", e.target.value === "" ? null : parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {!form.show_prop2 ? (
              <button type="button" className={`${BTN_GHOST} text-[var(--fh-orange)]`} onClick={() => update("show_prop2", true)}>
                + Add prop 2
              </button>
            ) : (
              <div className={CARD}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
                    Propeller 2
                  </p>
                  <button type="button" className="text-xs text-[var(--fh-text-dim)] underline" onClick={() => update("show_prop2", false)}>
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Make / model</label>
                    <input type="text" className={INPUT} value={form.prop2_make_model} onChange={(e) => update("prop2_make_model", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Serial #</label>
                    <input type="text" className={INPUT_MONO} value={form.prop2_serial} onChange={(e) => update("prop2_serial", e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL}>Time status</label>
                    <select className={INPUT} value={form.prop2_time_status} onChange={(e) => update("prop2_time_status", e.target.value)}>
                      {TIME_STATUS_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Hours</label>
                    <input
                      type="number"
                      className={INPUT_MONO}
                      value={form.prop2_hours ?? ""}
                      onChange={(e) => update("prop2_hours", e.target.value === "" ? null : parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>TBO</label>
                    <input
                      type="number"
                      className={INPUT_MONO}
                      value={form.prop2_tbo ?? ""}
                      onChange={(e) => update("prop2_tbo", e.target.value === "" ? null : parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            )}

            {!form.show_apu ? (
              <button type="button" className={`${BTN_GHOST} text-[var(--fh-orange)]`} onClick={() => update("show_apu", true)}>
                + Add APU
              </button>
            ) : (
              <div className={CARD}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
                    APU
                  </p>
                  <button type="button" className="text-xs text-[var(--fh-text-dim)] underline" onClick={() => update("show_apu", false)}>
                    Remove
                  </button>
                </div>
                <div>
                  <label className={LABEL}>APU make / model</label>
                  <input type="text" className={INPUT} value={form.apu_make_model} onChange={(e) => update("apu_make_model", e.target.value)} />
                </div>
                <div className="mt-4">
                  <label className={LABEL}>APU notes</label>
                  <textarea
                    className={`${INPUT} min-h-[100px] py-2`}
                    maxLength={350}
                    value={form.apu_notes}
                    onChange={(e) => update("apu_notes", e.target.value.slice(0, 350))}
                  />
                </div>
              </div>
            )}

            <div className={CARD}>
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[160px] flex-1">
                  <label className={LABEL}>Useful load</label>
                  <input
                    type="number"
                    className={INPUT_MONO}
                    value={form.useful_load ?? ""}
                    onChange={(e) => update("useful_load", e.target.value === "" ? null : parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className={`${LABEL} sr-only`}>Unit</label>
                  <div className="flex rounded-lg border border-[var(--fh-border)] p-0.5">
                    {(["lb", "kg"] as UsefulLoadUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => update("useful_load_unit", u)}
                        className={`rounded-md px-3 py-2 text-xs font-semibold font-[family-name:var(--font-dm-mono)] ${
                          form.useful_load_unit === u ? "bg-[var(--fh-orange)] text-black" : "text-[var(--fh-text-dim)]"
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={CARD}>
              <label className={LABEL}>Annual due (month / note)</label>
              <input type="text" className={INPUT} value={form.annual_due_month} onChange={(e) => update("annual_due_month", e.target.value)} placeholder="e.g. March 2026" />
              <div className="mt-4">
                <ToggleRow label="Damage history reported" value={form.damage_history} onChange={(v) => update("damage_history", v)} />
                {form.damage_history && (
                  <textarea
                    className={`${INPUT} mt-2 min-h-[80px] py-2`}
                    value={form.damage_notes}
                    onChange={(e) => update("damage_notes", e.target.value)}
                    placeholder="Brief disclosure…"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className={SECTION_TITLE} style={barlowClass()}>
              Listing copy
            </h2>
            <div className={CARD}>
              <label className={LABEL}>Description</label>
              <textarea
                className={`${INPUT} min-h-[180px] py-2`}
                value={form.listing_description}
                onChange={(e) => update("listing_description", e.target.value)}
                placeholder="Airframe history, upgrades, how it flies…"
              />
            </div>
            <div className={CARD}>
              <label className={LABEL}>Avionics highlights</label>
              <textarea
                className={`${INPUT} min-h-[100px] py-2`}
                value={form.avionics_highlights}
                onChange={(e) => update("avionics_highlights", e.target.value)}
                placeholder="GTN 650, GTX 345, G5 HSI…"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className={SECTION_TITLE} style={barlowClass()}>
              Contact
            </h2>
            <div className={CARD}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL}>Seller / contact name</label>
                  <input type="text" className={INPUT} value={form.seller_name} onChange={(e) => update("seller_name", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Email</label>
                  <input type="email" className={INPUT} value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Phone</label>
                  <input type="tel" className={INPUT_MONO} value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Phone 2</label>
                  <input type="tel" className={INPUT_MONO} value={form.contact_phone2} onChange={(e) => update("contact_phone2", e.target.value)} />
                </div>
                {form.seller_type === "broker" && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Company / dealership</label>
                      <input type="text" className={INPUT} value={form.company_name} onChange={(e) => update("company_name", e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Web address</label>
                      <input type="url" className={INPUT} value={form.web_address} onChange={(e) => update("web_address", e.target.value)} placeholder="https://…" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Fax</label>
                      <input type="tel" className={INPUT_MONO} value={form.fax} onChange={(e) => update("fax", e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <h2 className={SECTION_TITLE} style={barlowClass()}>
              Photos & service logs
            </h2>
            <div className={CARD}>
              <p className="mb-2 text-sm font-semibold text-[var(--fh-text)]">Photos</p>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              <button type="button" className={BTN_GHOST} onClick={() => photoInputRef.current?.click()}>
                Upload photos
              </button>
              <div className="mt-4 flex flex-wrap gap-3">
                {form.photos.map((p) => {
                  const src = photoPreviewUrls[p.id] ?? ""
                  const selected = selectedPhotoId === p.id
                  return (
                    <div key={p.id} className="w-[120px]">
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoId(selected ? null : p.id)}
                        className={`relative block h-[90px] w-full overflow-hidden rounded-lg border-2 ${
                          selected ? "border-[var(--fh-orange)]" : "border-[var(--fh-border)]"
                        } bg-[var(--fh-bg3)]`}
                      >
                        {src ? (
                          <img src={src} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-[var(--fh-text-dim)]">Preview</span>
                        )}
                      </button>
                      <button type="button" className="mt-1 text-[10px] text-[var(--fh-text-dim)] underline" onClick={() => removePhoto(p.id)}>
                        Remove
                      </button>
                      {selected && (
                        <div className="mt-2 space-y-2 rounded-md border border-[var(--fh-border)] bg-[var(--fh-bg)] p-2">
                          <div>
                            <label className="text-[10px] text-[var(--fh-text-dim)]">Image type</label>
                            <select
                              className="mt-0.5 h-9 w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-2 text-xs text-[var(--fh-text)]"
                              value={form.photo_types[p.id] ?? "exterior"}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, photo_types: { ...prev.photo_types, [p.id]: e.target.value } }))
                              }
                            >
                              {IMAGE_TYPE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-[var(--fh-text-dim)]">Caption (max 25)</label>
                            <input
                              type="text"
                              maxLength={25}
                              className="mt-0.5 h-9 w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-2 text-xs font-[family-name:var(--font-dm-mono)] text-[var(--fh-text)]"
                              value={form.photo_captions[p.id] ?? ""}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  photo_captions: { ...prev.photo_captions, [p.id]: e.target.value.slice(0, 25) },
                                }))
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={CARD}>
              <p className="mb-2 text-sm font-semibold text-[var(--fh-text)]">Service logs</p>
              <input ref={logInputRef} type="file" multiple className="hidden" onChange={(e) => addLogs(e.target.files)} />
              <button type="button" className={BTN_GHOST} onClick={() => logInputRef.current?.click()}>
                Upload log files
              </button>
              <ul className="mt-3 space-y-2">
                {form.logs.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="max-w-[140px] truncate font-[family-name:var(--font-dm-mono)] text-xs text-[var(--fh-text)]">{l.name}</span>
                    <select
                      className="h-9 flex-1 min-w-[160px] rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-2 text-xs text-[var(--fh-text)]"
                      value={form.log_types[l.id] ?? ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, log_types: { ...prev.log_types, [l.id]: e.target.value } }))}
                    >
                      {LOG_TYPE_OPTIONS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="text-xs text-[var(--fh-text-dim)] underline" onClick={() => removeLog(l.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className={CARD}>
              <p className="mb-1 text-sm font-semibold text-[var(--fh-text)]">Listing privacy</p>
              <ToggleRow
                label="Show registration in listing"
                value={form.show_registration_in_listing}
                onChange={(v) => update("show_registration_in_listing", v)}
              />
              <ToggleRow label="Pre-buy inspection available" value={form.pre_buy_available} onChange={(v) => update("pre_buy_available", v)} />
            </div>

            <div className={CARD}>
              <p className="mb-1 text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
                Privacy preferences
              </p>
              <p className="mb-2 text-xs text-[var(--fh-text-dim)]">Control what syndicated marketplaces may display.</p>
              <ToggleRow label="Display seller name" value={form.display_seller_name} onChange={(v) => update("display_seller_name", v)} />
              <ToggleRow
                label="Display serial number"
                value={form.display_serial_number}
                onChange={(v) => update("display_serial_number", v)}
              />
              <ToggleRow
                label="Display web address"
                value={form.display_web_address}
                onChange={(v) => update("display_web_address", v)}
              />
              <ToggleRow
                label="Display contact button"
                value={form.display_contact_button}
                onChange={(v) => update("display_contact_button", v)}
              />
              <ToggleRow label="Display phone 2" value={form.display_phone2} onChange={(v) => update("display_phone2", v)} />
              {form.seller_type === "broker" ? (
                <ToggleRow label="Display fax" value={form.display_fax} onChange={(v) => update("display_fax", v)} />
              ) : null}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <h2 className={SECTION_TITLE} style={barlowClass()}>
              Pricing
            </h2>
            <div className={CARD}>
              <label className={LABEL}>Asking price (USD)</label>
              <input
                type="number"
                className={INPUT_MONO}
                value={form.asking_price ?? ""}
                onChange={(e) => update("asking_price", e.target.value === "" ? null : parseFloat(e.target.value))}
              />
              <div className="mt-3">
                <ToggleRow label="Price negotiable" value={form.price_negotiable} onChange={(v) => update("price_negotiable", v)} />
              </div>
              <div className="mt-4">
                <label className={LABEL}>Price extension</label>
                <input
                  type="text"
                  className={INPUT}
                  value={form.price_extension}
                  onChange={(e) => update("price_extension", e.target.value)}
                  placeholder='e.g. "OBO", "Firm"'
                />
              </div>
              {form.sale_type === "for_lease" && (
                <div className="mt-4">
                  <label className={LABEL}>Monthly lease price</label>
                  <input
                    type="number"
                    className={INPUT_MONO}
                    value={form.monthly_lease_price ?? ""}
                    onChange={(e) => update("monthly_lease_price", e.target.value === "" ? null : parseFloat(e.target.value))}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <button type="button" className={BTN_GHOST} disabled={step <= 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
          Back
        </button>
        {step < 6 ? (
          <button type="button" className={BTN_ORANGE} onClick={() => setStep((s) => Math.min(6, s + 1))}>
            Continue
          </button>
        ) : (
          <button type="button" className={BTN_ORANGE} onClick={submit}>
            Review payload
          </button>
        )}
      </div>

      {submittedJson && (
        <div className="mt-8 rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 [data-theme=light]:bg-white">
          <p className="text-sm font-semibold text-[var(--fh-text)]" style={barlowClass()}>
            Submission payload (JSON)
          </p>
          <p className="mt-1 text-xs text-[var(--fh-text-dim)]">
            API wiring pending — extras live under <code className="font-[family-name:var(--font-dm-mono)]">description_intelligence.seller_form_extras</code>.
          </p>
          <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg bg-[var(--fh-bg)] p-3 text-[11px] font-[family-name:var(--font-dm-mono)] text-[var(--fh-text)]">
            {submittedJson}
          </pre>
        </div>
      )}

      {/* Dev-only: live payload parity check */}
      {process.env.NODE_ENV === "development" && (
        <p className="mt-6 text-[10px] text-[var(--fh-text-muted)]">
          Dev: payload keys merged — photo/log files kept client-side ({Object.keys(photoFiles).length} photos, {Object.keys(logFiles).length}{" "}
          logs).
        </p>
      )}
    </div>
  )
}

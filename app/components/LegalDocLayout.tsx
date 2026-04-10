import Link from "next/link"
import type { ReactNode } from "react"

type Props = {
  title: string
  description: string
  lastUpdated: string
  children: ReactNode
  otherDoc: { href: string; label: string }
}

export function LegalDocLayout({ title, description, lastUpdated, children, otherDoc }: Props) {
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <nav className="mb-6 text-sm text-[#8b949e] [data-theme=light]:text-slate-600">
        <Link href="/" className="text-[#FF9900] hover:underline">
          Home
        </Link>
        <span className="mx-2 text-[#6e7681]">/</span>
        <span className="text-[#e6edf3] [data-theme=light]:text-slate-900">{title}</span>
      </nav>

      <header className="mb-10 border-b border-[#30363d] pb-8 [data-theme=light]:border-slate-200">
        <h1 className="font-[family-name:var(--font-barlow-condensed)] text-3xl font-bold uppercase tracking-wide text-white [data-theme=light]:text-slate-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#8b949e] [data-theme=light]:text-slate-600">{description}</p>
        <p className="mt-4 text-xs text-[#6e7681] [data-theme=light]:text-slate-500">Last updated: {lastUpdated}</p>
      </header>

      <article className="legal-prose space-y-8 text-sm leading-relaxed text-[#e6edf3] [data-theme=light]:text-slate-800 [&_h2]:font-[family-name:var(--font-barlow-condensed)] [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-white [&_h2]:[data-theme=light]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1.5 [&_a]:text-[#FF9900] [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </article>

      <p className="mt-12 border-t border-[#30363d] pt-8 text-center text-sm text-[#8b949e] [data-theme=light]:border-slate-200 [data-theme=light]:text-slate-600">
        <Link href={otherDoc.href} className="font-medium text-[#FF9900] hover:underline">
          {otherDoc.label}
        </Link>
      </p>
    </div>
  )
}

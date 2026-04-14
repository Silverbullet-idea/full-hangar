import Link from "next/link";
import WaitlistForm from "../components/WaitlistForm";

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const;

export const metadata = {
  title: "Full Hangar | Aircraft market intelligence",
  description:
    "Full Hangar scores every aircraft listing across the market — surfacing deferred maintenance, true cost of ownership, and undervalued deals.",
};

type PageProps = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = sp.status;
  const status = Array.isArray(raw) ? raw[0] : raw;
  const isPending = status === "pending";

  return (
    <div className="-mx-4 -mt-6 min-h-[calc(100vh-5rem)] bg-[#0d1117] pb-24 pt-2 sm:-mx-6">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-1 py-4">
        <Link href="/" className="block shrink-0" aria-label="Full Hangar home">
          {/* Plain img: avoids /_next/image optimizer issues in some deploys; same asset as HeaderNavBrand dark fallback */}
          <img
            src="/branding/FullHangarDark.png"
            alt="Full Hangar"
            width={220}
            height={52}
            className="h-auto w-[220px] max-w-[min(220px,70vw)]"
            loading="eager"
            decoding="async"
          />
        </Link>
        <span
          className="rounded-full border border-[#FF9900]/35 bg-[#FF9900]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#FF9900]"
          style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
        >
          Private Beta
        </span>
      </nav>

      {isPending ? (
        <div
          className="mx-auto mb-8 max-w-2xl rounded-lg border px-4 py-3 text-center text-sm text-[#e3b565]"
          style={{
            backgroundColor: "#1a1200",
            borderColor: "rgba(255, 153, 0, 0.3)",
          }}
        >
          Your account is pending approval. We&apos;ll email you when you&apos;re in.
        </div>
      ) : null}

      {!isPending ? (
        <section className="mx-auto max-w-[700px] px-2 py-14 text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF9900]"
            style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
          >
            Aircraft market intelligence
          </p>
          <h1
            className="mt-4 text-[2.65rem] font-extrabold leading-[1.05] text-white sm:text-[3.25rem]"
            style={barlow}
          >
            The{" "}
            <span className="text-[#FF9900]" style={barlow}>
              Carfax
            </span>{" "}
            for General Aviation
          </h1>
          <p
            className="mx-auto mt-5 max-w-[640px] text-base leading-relaxed text-[#8b949e]"
            style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
          >
            Full Hangar scores every aircraft listing across the market — surfacing deferred maintenance, true cost of ownership, and undervalued deals
            before anyone else sees them.
          </p>

          <div className="mx-auto mt-10 max-w-[480px] text-left">
            <WaitlistForm />
          </div>
        </section>
      ) : null}

      <section
        className={`mx-auto max-w-[700px] border-t border-[#30363d] px-2 pt-10 ${isPending ? "mt-4 border-t-0 pt-6" : "mt-4"}`}
      >
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-4">
          <StatBlock num="8,400+" label="Listings tracked" />
          <StatBlock num="310K" label="FAA records" />
          <StatBlock num="110+" label="Engine TBO refs" />
        </div>
      </section>
    </div>
  );
}

function StatBlock({ num, label }: { num: string; label: string }) {
  return (
    <div className="text-center">
      <div
        className="text-2xl font-semibold text-[#FF9900] sm:text-[1.65rem]"
        style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
      >
        {num}
      </div>
      <div
        className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b949e]"
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        {label}
      </div>
    </div>
  );
}

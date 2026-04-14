import WaitlistManager from "@/app/components/admin/WaitlistManager";
import InternalAccessRequestsNav from "@/app/components/internal/InternalAccessRequestsNav";
import { fetchAdminWaitlistFromApi } from "@/lib/waitlist/adminWaitlistServer";

export const dynamic = "force-dynamic";

export default async function InternalWaitlistPage() {
  const { rows, pendingCount, error } = await fetchAdminWaitlistFromApi();

  return (
    <main className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InternalAccessRequestsNav pendingCount={pendingCount} />
        <a
          href="/internal/admin"
          className="rounded border border-brand-dark px-3 py-2 text-sm text-brand-muted hover:border-brand-orange hover:text-brand-orange"
        >
          Admin
        </a>
      </div>

      <WaitlistManager initialRows={rows} loadError={error} />
    </main>
  );
}

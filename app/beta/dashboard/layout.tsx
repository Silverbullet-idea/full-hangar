import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BETA_SESSION_COOKIE } from "@/lib/beta/session";

export default async function BetaDashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(BETA_SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/beta/join?error=session_expired");
  }
  return children;
}

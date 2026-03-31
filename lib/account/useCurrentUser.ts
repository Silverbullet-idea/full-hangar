"use client"

import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { createBrowserSupabase } from "@/lib/supabase/browser"

export interface UserProfileRow {
  display_name: string | null
  avatar_url: string | null
  role: string
}

interface CurrentUser {
  user: User | null
  profile: UserProfileRow | null
  isAdmin: boolean
  isLoading: boolean
}

function emptyState(loading: boolean): CurrentUser {
  return { user: null, profile: null, isAdmin: false, isLoading: loading }
}

async function loadProfile(userId: string) {
  const supabase = createBrowserSupabase()
  const { data } = await supabase
    .from("user_profiles")
    .select("display_name,avatar_url,role")
    .eq("id", userId)
    .single()
  return data as UserProfileRow | null
}

export function useCurrentUser(): CurrentUser {
  const [state, setState] = useState<CurrentUser>(() => emptyState(true))

  useEffect(() => {
    let cancelled = false
    const supabase = createBrowserSupabase()

    const applySession = async (user: User | null) => {
      if (!user) {
        if (!cancelled) setState(emptyState(false))
        return
      }
      const profile = await loadProfile(user.id)
      if (cancelled) return
      setState({
        user,
        profile,
        isAdmin: profile?.role === "admin",
        isLoading: false,
      })
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        if (!cancelled) setState(emptyState(false))
        return
      }
      if (!cancelled) setState((s) => ({ ...s, isLoading: true }))
      void applySession(session.user)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return state
}

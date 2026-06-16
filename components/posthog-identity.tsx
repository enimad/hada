"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const hasPostHogToken = Boolean(process.env.NEXT_PUBLIC_POSTHOG_TOKEN);

export function PostHogIdentity() {
  useEffect(() => {
    if (!hasPostHogToken) return;

    const supabase = createSupabaseBrowserClient();
    let identifiedUserId: string | null = null;

    function syncIdentity(session: Session | null) {
      const user = session?.user;

      if (!user) {
        if (identifiedUserId) {
          posthog.reset();
          identifiedUserId = null;
        }
        return;
      }

      if (identifiedUserId === user.id) return;

      identifiedUserId = user.id;
      posthog.identify(user.id, {
        email: user.email,
        auth_provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : undefined
      });
    }

    void supabase.auth.getSession().then(({ data }) => syncIdentity(data.session));

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncIdentity(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}

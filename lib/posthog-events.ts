"use client";

import posthog from "posthog-js";

type EventProperties = Record<string, boolean | number | string | null | undefined>;

export function captureHadaEvent(eventName: string, properties: EventProperties = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_TOKEN) return;

  posthog.capture(eventName, {
    product: "hada",
    ...properties
  });
}

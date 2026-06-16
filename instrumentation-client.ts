import posthog from "posthog-js";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-01-30",
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: true,
    disable_session_recording: false,
    mask_personal_data_properties: true,
    session_recording: {
      maskAllInputs: true
    },
    loaded: (client) => {
      if (process.env.NODE_ENV === "development") {
        client.debug();
      }
    }
  });
}

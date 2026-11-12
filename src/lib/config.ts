/** Values that change when the app ships. Set them in Vercel's environment settings, not here. */
const env = import.meta.env;

export const site = {
  name: "Half Pour",
  tagline: "Cut back, not out.",
  description:
    "Half Pour is an iPhone app for people who want to cut back on drinking, not quit. Plan the night, log each drink in one tap, and wake up to an honest, kind recap.",
  url: (env.PUBLIC_SITE_URL as string | undefined) || "https://halfpour.life",
  /** Empty until the app is on the App Store; the badge shows "coming soon" while it is. */
  appStoreUrl: (env.PUBLIC_APP_STORE_URL as string | undefined) || "",
  issuesUrl: "https://github.com/asaleem9/half-pour-site/issues",
  newIssueUrl: "https://github.com/asaleem9/half-pour-site/issues/new",
  /** Shown on the legal pages. Update when either page changes. */
  legalUpdated: "10 November 2026",
} as const;

export const isLive = site.appStoreUrl.length > 0;

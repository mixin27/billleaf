export const siteConfig = {
  name: "Billleaf",
  tagline: "Your work. Your business. One place.",
  description:
    "An all-in-one workspace for freelancers to manage clients, agreements, projects, time, and finances.",
  /** Shown on the legal pages and the footer; set NEXT_PUBLIC_SUPPORT_EMAIL. */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
  /** Date the Terms and Privacy Policy last changed (update with the text). */
  legalUpdated: "15 November 2026",
} as const

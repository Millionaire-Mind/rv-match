/**
 * Central branding configuration.
 *
 * The product name "RV Match" is a working name — change it here, not by
 * hunting through the codebase, to rebrand globally.
 */
export const brand = {
  name: "RV Match",
  shortName: "RVMatch",
  tagline: "Watch RVs. Like what you love. Pass on what you don't.",
  description:
    "RV Match learns what fits you by watching how you react to real RVs, then connects you with dealers who have it in stock.",
  domain: "rvmatch.app",
  supportEmail: "support@rvmatch.app",
  social: {
    instagram: "https://instagram.com/rvmatch",
    tiktok: "https://tiktok.com/@rvmatch",
    youtube: "https://youtube.com/@rvmatch",
  },
  legalEntityName: "RV Match, Inc.",
  themeColor: "#0f172a",
  colors: {
    accent: "#ff6a3d",
  },
} as const;

export type Brand = typeof brand;

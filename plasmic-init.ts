import { initPlasmicLoader } from "@plasmicapp/loader-nextjs";

const projectId = process.env.PLASMIC_PROJECT_ID || "a1fFQhwqi4XTCQmGu8QoR6";
const projectToken =
  process.env.PLASMIC_PROJECT_TOKEN ||
  "EA8w809ypMK3dThEjicphyiq4CSyUlYeTc3mR6MtX6GPl2YmldFi3yzaEu8M0PSzVH3rONfqxFdzoxt00g";

// Preview mode should never be enabled in production.
const preview =
  process.env.NODE_ENV !== "production" &&
  (process.env.PLASMIC_PREVIEW === "1" || process.env.PLASMIC_PREVIEW === "true");

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: projectId,
      token: projectToken,
    },
  ],
  preview,
});

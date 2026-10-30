/**
 * The Lab: harmless, deliberately silly interface experiments. Every experiment is a self-contained
 * demo with fake data; none of them touch real settings, purchases, sign-in or subscriptions.
 * To add one, give it an entry here and a component in `components/lab/experiments`.
 */
export type LabExperiment = { id: string; title: string; blurb: string; tags: readonly string[] };

export const LAB_EXPERIMENTS = [
  {
    id: "uphill-volume",
    title: "Uphill Volume",
    blurb: "A volume slider on a hill. Louder means pushing the knob uphill, and gravity has opinions.",
    tags: ["slider", "physics", "sound"],
  },
  {
    id: "runaway-button",
    title: "The Shy Button",
    blurb: "A button that would really rather not be clicked. It gets tired eventually.",
    tags: ["button", "chase", "pointer"],
  },
  {
    id: "cancel-maze",
    title: "Cancel Anything",
    blurb: "Cancel three made-up subscriptions through the most persuasive retention flow ever built.",
    tags: ["forms", "dark patterns", "parody"],
  },
  {
    id: "awkward-date",
    title: "Date of Birth, Eventually",
    blurb: "A date picker with a year stepper, a spinning month wheel and days entered in binary.",
    tags: ["date", "forms", "binary"],
  },
  {
    id: "password-gauntlet",
    title: "Password Gauntlet",
    blurb: "Invent a pretend password that satisfies an ever-growing list of unreasonable rules.",
    tags: ["text", "rules", "parody"],
  },
] as const satisfies readonly LabExperiment[];

export type LabExperimentId = (typeof LAB_EXPERIMENTS)[number]["id"];

export const findLabExperiment = (id: string) => LAB_EXPERIMENTS.find((experiment) => experiment.id === id) ?? null;

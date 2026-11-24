// All help text in one place (FR-22): the first-run tour and its on/off switch. driver.js draws the tour.
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const STEPS: [string, string, string][] = [
  ["[data-tour=stepper]", "Seven stages", "Brief to Export, left to right. Locked stages open after each gate."],
  ["[data-tour=deck]", "One card at a time", 'Press 1 to 4 to answer, ← → to move. "Not sure" is always fine.'],
  [
    "[data-tour=model]",
    "Model picker",
    "If a model hits a rate limit, Joules falls back down the list and logs which one answered.",
  ],
  [
    "[data-tour=drawer]",
    "Evidence and trace",
    "Every requirement cites a document, section and page. The trace logs each call live.",
  ],
  ["[data-tour=mini]", "More room", "Compress the side panels when you need space."],
  ["[data-tour=theme]", "Theme", "Dark by default. Light is here."],
  ["[data-tour=help]", "Help", "Replay this tour or switch it off from this menu."],
];

export const tourOn = () => localStorage.getItem("joules-tour") !== "off";
export const setTourOn = (on: boolean) => localStorage.setItem("joules-tour", on ? "on" : "off");

export function startTour() {
  driver({
    showProgress: true,
    popoverClass: "jtour",
    steps: STEPS.map(([element, title, description]) => ({
      element,
      skipMissingElement: true,
      popover: { title, description },
    })),
  }).drive();
}

/** First visit to a workspace: run once, unless switched off in the help menu. */
export function firstRunTour() {
  if (!tourOn() || localStorage.getItem("joules-toured")) return;
  localStorage.setItem("joules-toured", "1");
  setTimeout(startTour, 800);
}

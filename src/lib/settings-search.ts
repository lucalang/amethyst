import { SHORTCUT_ACTIONS } from "@/lib/preferences";
import { SHORTCUT_LABELS } from "@/lib/shortcuts";

export type SettingsArea = "Settings" | "Customization";
type SearchSetting = { label: string; target: string; keywords?: string; path?: string };
type SearchSection = {
  area: SettingsArea;
  section: string;
  path: string;
  keywords?: string;
  settings: readonly SearchSetting[];
};

export const SETTINGS_SEARCH_SECTIONS: readonly SearchSection[] = [
  {
    area: "Settings", section: "General", path: "/settings", keywords: "account security notifications", settings: [
      { label: "Startup destination", target: "startup-label-setting", keywords: "opening home first page collection" },
      { label: "Time zone", target: "time-zone-label-setting", keywords: "timezone date day my day tasks midnight clock region" },
      { label: "Achievement celebrations", target: "achievement-notifications-label-setting", keywords: "notification popup confetti" },
      { label: "New password", target: "password", path: "/settings/password", keywords: "change password security login sign in" },
      { label: "Confirm password", target: "confirm", path: "/settings/password", keywords: "change password repeat confirmation security" },
      { label: "Sign out", target: "security", keywords: "logout account device" },
    ],
  },
  {
    area: "Customization", section: "Profile", path: "/customization/profile", keywords: "account identity avatar", settings: [
      { label: "Display name", target: "displayName", keywords: "nickname greeting" },
      { label: "Picture", target: "settings-avatar-picture", keywords: "avatar photo image upload" },
      { label: "Avatar decoration", target: "settings-avatar-decoration", keywords: "border cosmetic" },
      { label: "Motto", target: "motto", keywords: "bio welcome tagline" },
    ],
  },
  {
    area: "Customization", section: "Themes", path: "/customization/themes", keywords: "color colour font style background corners", settings: [
      { label: "App theme", target: "theme", keywords: "light dark oled palette accent" },
    ],
  },
  {
    area: "Customization", section: "Artwork frames", path: "/customization/frames", keywords: "art cover border decoration", settings: [
      { label: "Artwork frame", target: "frame", keywords: "default portrait square animated" },
    ],
  },
  {
    area: "Customization", section: "Appearance", path: "/customization/appearance", keywords: "effects library layout", settings: [
      { label: "Animation intensity", target: "motion-label-setting", keywords: "motion animate reduced movement" },
      { label: "Opening animation", target: "intro-frequency-label-setting", keywords: "intro logo frequency replay startup" },
      { label: "Card shine", target: "shine-label-setting", keywords: "hover reflection light effect" },
      { label: "Hover scaling", target: "hover-scale-label-setting", keywords: "zoom grow cover size" },
      { label: "Library density", target: "density-label-setting", keywords: "compact comfortable cover spacing size" },
      { label: "Cover details", target: "pin-style-label-setting", keywords: "pins progress clean artwork" },
      { label: "Card information", target: "card-info-label-setting", keywords: "title labels tags progress metadata" },
      { label: "Card title", target: "cardTitle-switch", keywords: "information name cover text" },
      { label: "Card labels", target: "cardLabels-switch", keywords: "information tags cover" },
      { label: "Card progress", target: "cardProgress-switch", keywords: "information status cover" },
    ],
  },
  {
    area: "Settings", section: "Editor", path: "/settings/editor", keywords: "notes writing text checklist", settings: [
      { label: "Writing font", target: "editor-font-label-setting", keywords: "typeface serif mono sans typography" },
      { label: "Text size", target: "editor-size-label-setting", keywords: "font larger smaller" },
      { label: "Line spacing", target: "editor-spacing-label-setting", keywords: "line height" },
      { label: "Document width", target: "editor-width-label-setting", keywords: "note wide narrow" },
      { label: "Heading colors", target: "heading-colors-label-setting", keywords: "colour h1 h2 h3 h4 h5 h6" },
      { label: "Completed tasks", target: "checklist-mode-label-setting", keywords: "checked checklist bottom in place" },
    ],
  },
  {
    area: "Settings", section: "Shortcuts", path: "/settings/shortcuts", keywords: "keyboard hotkeys keybindings", settings:
      SHORTCUT_ACTIONS.map((action) => ({ label: SHORTCUT_LABELS[action].title, target: `shortcut-${action}`, keywords: "keyboard shortcut rebind" })),
  },
  {
    area: "Settings", section: "Collections", path: "/settings/collections", keywords: "library name description icon color banner layout order arrange default template create delete", settings: [],
  },
  {
    area: "Settings", section: "Templates", path: "/settings/templates", keywords: "starter workspace folders notes checklists create default", settings: [],
  },
  {
    area: "Settings", section: "Labels", path: "/settings/labels", keywords: "tags categories rename merge delete create", settings: [],
  },
  {
    area: "Settings", section: "Version history", path: "/version-history", keywords: "commits catalog historical demos milestones releases sha reset", settings: [],
  },
];

export const SETTINGS_SEARCH_ITEMS = SETTINGS_SEARCH_SECTIONS.flatMap(({ area, section, path, keywords, settings }) =>
  ([{ label: section, target: "settings-section-title", keywords }, ...settings] satisfies SearchSetting[]).map((setting: SearchSetting) => ({
    area,
    section,
    label: setting.label,
    href: `${setting.path ?? path}#${setting.target}`,
    target: setting.target,
    text: `${area} ${section} ${setting.label} ${setting.keywords ?? ""}`.toLowerCase(),
  })),
);

export type SettingsSearchItem = (typeof SETTINGS_SEARCH_ITEMS)[number];

export function searchSettings(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTINGS_SEARCH_ITEMS
    .filter((item) => words.every((word) => item.text.includes(word)))
    .sort((first, second) => {
      const score = (item: SettingsSearchItem) => item.label.toLowerCase().includes(query.trim().toLowerCase()) ? 0 : 1;
      return score(first) - score(second);
    });
}
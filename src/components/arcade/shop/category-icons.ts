import type { ComponentType } from "react";
import { Apple, Bird, BookOpen, Brush, Building2, Columns3, Crown, Droplets, Flame, Gem, Ghost, Grid3x3, Highlighter, Image as ImageIcon, Map as MapIcon, Mountain, Orbit, Palette, PartyPopper, Rocket, Route, Sparkles, Sun, Sword, Tag, Type, Wind, Zap } from "lucide-react";
import type { CategoryIcon } from "@/lib/game-cosmetics";

export const CATEGORY_ICONS: Record<CategoryIcon, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  palette: Palette,
  map: MapIcon,
  sparkles: Sparkles,
  brush: Brush,
  grid: Grid3x3,
  type: Type,
  bird: Bird,
  wind: Wind,
  columns: Columns3,
  mountain: Mountain,
  book: BookOpen,
  highlighter: Highlighter,
  sword: Sword,
  apple: Apple,
  image: ImageIcon,
  droplets: Droplets,
  building: Building2,
  gem: Gem,
  ghost: Ghost,
  rocket: Rocket,
  flame: Flame,
  zap: Zap,
  orbit: Orbit,
  route: Route,
  tag: Tag,
  party: PartyPopper,
  sun: Sun,
  crown: Crown,
};

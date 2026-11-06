import type { ComponentType } from "react";
import { Apple, Bird, BookOpen, Brush, Building2, Columns3, Droplets, Grid3x3, Highlighter, Image as ImageIcon, Map as MapIcon, Mountain, Palette, Sparkles, Sword, Type, Wind } from "lucide-react";
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
};

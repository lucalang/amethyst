/**
 * Corner radius for buttons and button-like controls, following the Button Shape preference.
 * `--control-round` is 1 for Soft (exactly the previous rounded-md / rounded-lg) and 0.5 for Square
 * (set on <html data-button-shape="square">, see globals.css). Themes still scale it with `--radius-unit`.
 * Written as arbitrary values so class merging treats them as border radius and `rounded-full` etc. still override.
 */
export const CONTROL_RADIUS = "rounded-[calc(6px*var(--radius-unit,1)*var(--control-round,1))]";
/** The larger control radius (button groups, tab lists): matches rounded-lg in Soft. */
export const CONTROL_RADIUS_LG = "rounded-[calc(8px*var(--radius-unit,1)*var(--control-round,1))]";

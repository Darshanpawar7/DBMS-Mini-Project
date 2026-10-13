// Validated categorical slots 1-3 (blue, orange, aqua) for a light surface.
// Kept in a plain module so both server pages and client charts can import it.
// Aqua is under 3:1 contrast against the surface, so every chart ships a table view.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
export const BAR_COLOR = SERIES_COLORS[0];

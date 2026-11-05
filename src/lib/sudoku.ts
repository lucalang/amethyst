export const SUDOKU_SIZES = ["mini", "normal", "xxl"] as const;
export type SudokuSize = (typeof SUDOKU_SIZES)[number];
export const SUDOKU_CONFIG = {
  mini: { label: "Mini", side: 4, region: 2, cells: 16, mask: 15, symbols: "1234" },
  normal: { label: "Normal", side: 9, region: 3, cells: 81, mask: 511, symbols: "123456789" },
  xxl: { label: "XXL", side: 16, region: 4, cells: 256, mask: 65535, symbols: "123456789ABCDEFG" },
} as const;
export const sudokuSymbol = (digit: number) => digit === 0 ? "0" : "123456789ABCDEFG"[digit - 1];
export const sudokuDigit = (symbol: string) => "0123456789ABCDEFG".indexOf(symbol.toUpperCase());
export const sudokuVariant = (size: SudokuSize, difficulty: string) => size === "normal" ? difficulty : `${size}-${difficulty}`;
export const sudokuSlotKey = (slot: "regular" | "daily", size: SudokuSize) => slot === "daily" ? "daily" : size;
export function sudokuProgressValid(size: SudokuSize, entries: string, notes: number[]) {
  const config = SUDOKU_CONFIG[size];
  return entries.length === config.cells && [...entries].every(symbol => symbol === "0" || config.symbols.includes(symbol))
    && notes.length === config.cells && notes.every(mask => Number.isInteger(mask) && mask >= 0 && mask <= config.mask);
}
export function sudokuPeers(size: SudokuSize) {
  const { side, region, cells } = SUDOKU_CONFIG[size];
  const row = (cell: number) => Math.floor(cell / side);
  const box = (cell: number) => Math.floor(row(cell) / region) * region + Math.floor((cell % side) / region);
  return Array.from({ length: cells }, (_, cell) => Array.from({ length: cells }, (_, other) => other)
    .filter(other => other !== cell && (row(cell) === row(other) || cell % side === other % side || box(cell) === box(other))));
}
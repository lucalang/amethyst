import type { TourChapterId } from "../chapters";
import { arcade, game2048, gameFlutter, gameFruitSlice, gameSnake, gameStacker, gameSudoku, slots } from "./arcade";
import { archive, closing, opening, todo } from "./core";
import type { PieceBuilder } from "./kit";
import { lab, sanctum, vault } from "./secrets";
import { achievements, customization } from "./style";

/** One 3D set piece per chapter; a new chapter needs an entry here and in `chapters.ts`. */
export const PIECES: Record<TourChapterId, PieceBuilder> = {
  opening,
  archive,
  todo,
  arcade,
  "game-2048": game2048,
  "game-flutter": gameFlutter,
  "game-snake": gameSnake,
  "game-sudoku": gameSudoku,
  "game-fruit-slice": gameFruitSlice,
  "game-stacker": gameStacker,
  slots,
  vault,
  lab,
  sanctum,
  customization,
  achievements,
  closing,
};

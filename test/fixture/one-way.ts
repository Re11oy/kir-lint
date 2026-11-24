import type { a } from "./loop-a";
import { type b } from "./loop-b";
export type T = typeof a | typeof b;
export const lazy = () => import("./loop-a");

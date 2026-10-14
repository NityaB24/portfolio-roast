import type { CSSProperties } from "react";

/** Index for the `.reveal` entrance animation delay. */
export const stagger = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;

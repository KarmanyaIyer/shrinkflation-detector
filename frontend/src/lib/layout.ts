// Below this width the story stacks: the graphic pins to the top of the screen and the step
// cards scroll under it. Keep in step with the stacked media query in global.css.
export const STACKED_QUERY = "(max-width: 960px)";

// A touch screen: the graphic's first tap names a dot and the second opens it.
export function coarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

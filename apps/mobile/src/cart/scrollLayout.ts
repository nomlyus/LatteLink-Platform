/** Automatic UIKit insets sit outside content height; counting them twice creates empty scrolling. */
export function cartContentMinimumHeight(viewportHeight: number, headerHeight: number, insets: { top: number; bottom: number }) {
  return Math.max(0, viewportHeight - Math.max(headerHeight, insets.top) - insets.bottom);
}

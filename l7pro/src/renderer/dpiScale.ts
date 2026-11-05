/** Values selectable with the slider: classic doublings (400, 800, 1600...) and midpoints. All within 200..26000. */
const STEPS = [200, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800, 19200, 26000];

/** Maximum slider position (one tick per value). */
export const SLIDER_MAX = STEPS.length - 1;

export function sliderToDpi(pos: number): number {
  return STEPS[Math.min(SLIDER_MAX, Math.max(0, Math.round(pos)))];
}

/** Tick closest to any value (even off-scale, like 1229 read from the mouse). */
export function dpiToSlider(dpi: number): number {
  let best = 0;
  for (let i = 1; i < STEPS.length; i++) {
    if (Math.abs(STEPS[i] - dpi) < Math.abs(STEPS[best] - dpi)) best = i;
  }
  return best;
}

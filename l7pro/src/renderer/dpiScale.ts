/** Valori selezionabili con lo slider: raddoppi classici (400, 800, 1600...) e punti di mezzo. Tutti entro 200..26000. */
const STEPS = [200, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800, 19200, 26000];

/** Posizione massima dello slider (una tacca per ogni valore). */
export const SLIDER_MAX = STEPS.length - 1;

export function sliderToDpi(pos: number): number {
  return STEPS[Math.min(SLIDER_MAX, Math.max(0, Math.round(pos)))];
}

/** Tacca piu' vicina a un valore qualsiasi (anche fuori scala, come 1229 letto dal mouse). */
export function dpiToSlider(dpi: number): number {
  let best = 0;
  for (let i = 1; i < STEPS.length; i++) {
    if (Math.abs(STEPS[i] - dpi) < Math.abs(STEPS[best] - dpi)) best = i;
  }
  return best;
}

import { describe, expect, it } from "vitest";
import { SLIDER_MAX, dpiToSlider, sliderToDpi } from "../src/renderer/dpiScale.js";

const all = Array.from({ length: SLIDER_MAX + 1 }, (_, i) => sliderToDpi(i));

describe("dpiScale", () => {
  it("offre solo valori puliti: raddoppi e punti di mezzo", () => {
    expect(all).toEqual([200, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800, 19200, 26000]);
    expect(SLIDER_MAX).toBe(13);
  });

  it("e' crescente e ogni valore e' ammesso dal mouse (200..26000)", () => {
    all.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(200);
      expect(v).toBeLessThanOrEqual(26000);
      if (i > 0) expect(v).toBeGreaterThan(all[i - 1]);
    });
  });

  it("dpiToSlider e sliderToDpi sono l'uno l'inverso dell'altro sui valori della scala", () => {
    all.forEach((v, i) => expect(dpiToSlider(v)).toBe(i));
  });

  it("un valore fuori scala va alla tacca piu' vicina", () => {
    expect(sliderToDpi(dpiToSlider(1229))).toBe(1200);
    expect(sliderToDpi(dpiToSlider(1720))).toBe(1600);
    expect(sliderToDpi(dpiToSlider(1164))).toBe(1200);
    expect(sliderToDpi(dpiToSlider(50))).toBe(200);
    expect(sliderToDpi(dpiToSlider(99999))).toBe(26000);
  });

  it("sliderToDpi limita gli indici fuori scala", () => {
    expect(sliderToDpi(-5)).toBe(200);
    expect(sliderToDpi(9999)).toBe(26000);
  });
});

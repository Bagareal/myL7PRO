// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

async function open(snapshot = connectedSnapshot()) {
  const api = installFakeApi(snapshot);
  render(<App />);
  fireEvent.click(await screen.findByRole("tab", { name: "Performance" }));
  return api;
}
const toggle = (name: string) => screen.getByRole("switch", { name }) as HTMLInputElement;
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;
const release = (el: Element) => fireEvent.pointerUp(el);

describe("Performance tab: values read", () => {
  it("shows the values of the active profile with the descriptions", async () => {
    await open();
    expect(radio("1 mm").checked).toBe(true);
    expect(radio("2 mm").checked).toBe(false);
    expect(toggle("Motion Sync").checked).toBe(true);
    expect(toggle("Ripple Control").checked).toBe(false);
    expect(toggle("Angle Snapping").checked).toBe(false);
    expect(slider("Key debounce time").value).toBe("6");
    expect(slider("Sleep timer").value).toBe("3");
    expect((screen.getByRole("checkbox", { name: "Never sleep" }) as HTMLInputElement).checked).toBe(false);
    expect(slider("Rotate").value).toBe("0");
    expect(screen.getByText("Lift-off Distance (mm)")).toBeTruthy();
    expect(screen.getByText(/The mouse will make linear corrections when moving/)).toBeTruthy();
    expect(screen.getByText(/The distance at which the mouse stops tracking/)).toBeTruthy();
  });

  it("sleep 0 = Never sleep checked and the slider still", async () => {
    const s = connectedSnapshot();
    s.state = { ...s.state!, sleep: 0 };
    await open(s);
    expect((screen.getByRole("checkbox", { name: "Never sleep" }) as HTMLInputElement).checked).toBe(true);
    expect(slider("Sleep timer").disabled).toBe(true);
  });

  it("does not show the mode selection", async () => {
    await open();
    expect(screen.queryByText("Performance Mode")).toBeNull();
    expect(screen.queryByText(/Mode selection/)).toBeNull();
  });

  it("opening it writes nothing", async () => {
    const api = await open();
    expect(api.calls).toEqual([]);
  });
});

describe("Performance tab: polling rate", () => {
  const rate = (hz: number) => screen.getByRole("radio", { name: `${hz} Hz` }) as HTMLInputElement;

  it("offers only the dongle's frequencies and marks the current one", async () => {
    await open(connectedSnapshot({ pollingRates: [125, 500, 1000] }));
    expect(screen.getAllByRole("radio", { name: /Hz$/ }).map((r) => r.getAttribute("aria-label"))).toEqual(["125 Hz", "500 Hz", "1000 Hz"]);
    expect(rate(1000).checked).toBe(true);
    expect(rate(500).checked).toBe(false);
  });

  it("choosing a frequency writes it right away, without a dialog", async () => {
    const api = await open();
    fireEvent.click(rate(500));
    await waitFor(() => expect(api.calls).toEqual([["setPolling", 500]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the selection moves right away, without waiting for the mouse to confirm", async () => {
    await open();
    window.l7.setPolling = () => new Promise<void>(() => {});
    fireEvent.click(rate(500));
    expect(rate(500).checked).toBe(true);
    expect(rate(1000).checked).toBe(false);
  });

  it("if the write fails the selection goes back to the mouse's value", async () => {
    await open();
    window.l7.setPolling = async () => {
      throw new Error("Mouse not connected");
    };
    fireEvent.click(rate(500));
    await screen.findByRole("alert");
    expect(rate(1000).checked).toBe(true);
  });

  it.each([4000, 8000])("warns when the current frequency is %s Hz", async (hz) => {
    const s = connectedSnapshot();
    s.state = { ...s.state!, usbRateIndex: s.pollingRates.indexOf(hz), wirelessRateIndex: s.pollingRates.indexOf(hz) };
    await open(s);
    expect(screen.getByText("Higher power use and CPU load")).toBeTruthy();
  });

  it("no warning at 2000 Hz", async () => {
    await open();
    expect(screen.queryByText("Higher power use and CPU load")).toBeNull();
  });
});

describe("Performance tab: writes", () => {
  it("the switches write right away, without a dialog", async () => {
    const api = await open();
    fireEvent.click(toggle("Ripple Control"));
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { rippleControl: true }]]));
    fireEvent.click(toggle("Motion Sync"));
    await waitFor(() => expect(api.calls[1]).toEqual(["setSensor", { motionSync: false }]));
    fireEvent.click(toggle("Angle Snapping"));
    await waitFor(() => expect(api.calls[2]).toEqual(["setSensor", { angleSnapping: true }]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches and LOD move right away, before the mouse confirms", async () => {
    await open();
    window.l7.setSensor = () => new Promise<void>(() => {});
    fireEvent.click(toggle("Ripple Control"));
    expect(toggle("Ripple Control").checked).toBe(true);
    fireEvent.click(radio("2 mm"));
    expect(radio("2 mm").checked).toBe(true);
  });

  it("the LOD writes right away", async () => {
    const api = await open();
    fireEvent.click(radio("2 mm"));
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { lodMm: 2 }]]));
  });

  it("debounce: moving does not write, releasing does", async () => {
    const api = await open();
    fireEvent.change(slider("Key debounce time"), { target: { value: "9" } });
    expect(screen.getByText("9 ms")).toBeTruthy();
    expect(api.calls).toEqual([]);
    release(slider("Key debounce time"));
    await waitFor(() => expect(api.calls).toEqual([["setDebounce", 9]]));
  });

  it("sleep: releasing writes the minutes; Never sleep writes 0 and unchecking it goes back to the last value", async () => {
    const api = await open();
    fireEvent.change(slider("Sleep timer"), { target: { value: "10" } });
    release(slider("Sleep timer"));
    await waitFor(() => expect(api.calls).toEqual([["setSleep", 10]]));
    fireEvent.click(screen.getByRole("checkbox", { name: "Never sleep" }));
    await waitFor(() => expect(api.calls[1]).toEqual(["setSleep", 0]));
  });

  it("rotate: releasing the slider writes the angle", async () => {
    const api = await open();
    fireEvent.change(slider("Rotate"), { target: { value: "-7" } });
    expect(screen.getByText("-7°")).toBeTruthy();
    expect(api.calls).toEqual([]);
    release(slider("Rotate"));
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { rotate: -7 }]]));
  });

  it("rotate: several clicks on + and - become a single write", async () => {
    const api = await open();
    const plus = screen.getByRole("button", { name: "Rotate +1" });
    const minus = screen.getByRole("button", { name: "Rotate -1" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(minus);
    expect(screen.getByText("2°")).toBeTruthy();
    await waitFor(() => expect(api.calls).toEqual([["setSensor", { rotate: 2 }]]));
  });

  it("a write error is shown", async () => {
    await open();
    window.l7.setSensor = async () => {
      throw new Error("Mouse not connected");
    };
    fireEvent.click(toggle("Ripple Control"));
    expect((await screen.findByRole("alert")).textContent).toContain("Mouse not connected");
  });
});

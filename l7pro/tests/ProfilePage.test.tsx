// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App.js";
import { absentSnapshot, connectedSnapshot, installFakeApi } from "./snapshots.js";

afterEach(cleanup);

const openProfile = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const nav = () => screen.getByRole("navigation");

describe("Barra: profili", () => {
  it("ha i tre profili, Trigger e Settings, e non le vecchie voci", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    const labels = Array.from(nav().querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(["Default1", "TheFinals", "Default3", "Trigger", "Settings"]);
  });

  it("il pallino 'Active on mouse' sta sul profilo attivo e si sposta con lo snapshot", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    const dots = () => Array.from(nav().querySelectorAll('[role="img"][aria-label="Active on mouse"]'));
    expect(dots()).toHaveLength(1);
    expect(dots()[0].parentElement!.textContent).toBe("Default1");

    const next = connectedSnapshot();
    next.state = { ...next.state!, profile: 1 };
    act(() => api.emit(next));
    expect(dots()).toHaveLength(1);
    expect(dots()[0].parentElement!.textContent).toBe("TheFinals");
  });

  it("aprire una voce la segna aria-current e non scrive niente sul mouse", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    openProfile("TheFinals");
    expect(screen.getByRole("button", { name: "TheFinals" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Default1" }).getAttribute("aria-current")).toBeNull();
    openProfile("Trigger");
    openProfile("Settings");
    openProfile("Default3");
    expect(api.calls).toEqual([]);
  });

  it("senza mouse mostra Profile 1, Profile 2, Profile 3", async () => {
    installFakeApi(absentSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    const labels = Array.from(nav().querySelectorAll("button")).map((b) => b.textContent);
    expect(labels.slice(0, 3)).toEqual(["Profile 1", "Profile 2", "Profile 3"]);
  });
});

describe("Pagina profilo attivo", () => {
  it("parte dal profilo attivo: titolo, etichetta, schede e livelli DPI con il polling", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe("Default1");
    expect(screen.getByText("Active on mouse")).toBeTruthy();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["DPI", "Performance", "Keys", "Macros"]);
    expect(screen.getByText("1229")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch" })).toBeNull();
  });

  it("Macros dice 'Not available yet'", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Macros" }));
    expect(screen.getByText("Not available yet")).toBeTruthy();
  });
});

describe("Pagina profilo non attivo", () => {
  it("mostra la fascia con Switch e NON i valori del profilo sbagliato", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    openProfile("TheFinals");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TheFinals");
    expect(screen.getByText("The mouse is on Default1. Switch to TheFinals to edit it.")).toBeTruthy();
    expect(screen.queryByText("Active on mouse")).toBeNull();
    expect(screen.queryByText("1229")).toBeNull();
    expect(screen.queryByLabelText("Polling rate")).toBeNull();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(api.calls).toEqual([]);
  });

  it("Switch chiama setProfile(slot) una volta, senza dialogo", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    openProfile("TheFinals");
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(api.calls).toEqual([["setProfile", 1]]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Switch che rifiuta mostra l'errore e la fascia resta", async () => {
    installFakeApi(connectedSnapshot());
    window.l7.setProfile = async () => {
      throw new Error("Write sent but not verified: timeout");
    };
    render(<App />);
    await screen.findByRole("navigation");
    openProfile("TheFinals");
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Write sent but not verified");
    expect(screen.getByRole("button", { name: "Switch" })).toBeTruthy();
  });

  it("se il mouse passa da solo al profilo aperto la fascia sparisce e compaiono i valori", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    openProfile("TheFinals");
    const next = connectedSnapshot();
    next.state = { ...next.state!, profile: 1 };
    act(() => api.emit(next));
    expect(screen.queryByRole("button", { name: "Switch" })).toBeNull();
    expect(screen.getByText("Active on mouse")).toBeTruthy();
    expect(screen.getByText("1229")).toBeTruthy();
  });

  it("se il mouse lascia il profilo aperto compare la fascia e i valori spariscono", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByText("1229");
    openProfile("Default1");
    const next = connectedSnapshot();
    next.state = { ...next.state!, profile: 2 };
    act(() => api.emit(next));
    expect(screen.getByText("The mouse is on Default3. Switch to Default1 to edit it.")).toBeTruthy();
    expect(screen.queryByText("1229")).toBeNull();
  });
});

describe("Pagina iniziale", () => {
  it("finche' non scelgo niente la pagina segue il profilo attivo del mouse", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByText("1229");
    const next = connectedSnapshot();
    next.state = { ...next.state!, profile: 2 };
    act(() => api.emit(next));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Default3");
    expect(screen.getByText("Active on mouse")).toBeTruthy();
  });
});

describe("Pagina profilo senza mouse", () => {
  it("niente Switch ne' controlli, solo il messaggio", async () => {
    installFakeApi(absentSnapshot());
    render(<App />);
    expect(await screen.findByText("Mouse not connected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch" })).toBeNull();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Rename", () => {
  it("Invio salva subito il nome del profilo aperto, senza dialogo", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    await screen.findByRole("navigation");
    openProfile("TheFinals");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Profile name" }) as HTMLInputElement;
    expect(input.value).toBe("TheFinals");
    expect(input.maxLength).toBe(16);
    fireEvent.change(input, { target: { value: "Gioco" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(api.calls).toEqual([["renameProfile", 1, "Gioco"]]));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc annulla senza inviare niente", async () => {
    const api = installFakeApi(connectedSnapshot());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Profile name" });
    fireEvent.change(input, { target: { value: "Altro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("se il mouse rifiuta il nome mostra l'errore e resta in modifica", async () => {
    installFakeApi(connectedSnapshot());
    window.l7.renameProfile = async () => {
      throw new Error("The name can only contain letters");
    };
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Profile name" });
    fireEvent.change(input, { target: { value: "x$" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain("The name can only contain letters");
    expect(screen.getByRole("textbox", { name: "Profile name" })).toBeTruthy();
  });

  it("cambiando pagina la modifica in corso si annulla", async () => {
    installFakeApi(connectedSnapshot());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Profile name" })).toBeTruthy();
    openProfile("TheFinals");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

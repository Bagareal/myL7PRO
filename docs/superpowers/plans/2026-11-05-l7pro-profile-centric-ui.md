# Interfaccia centrata sul profilo - Piano

> **Per chi esegue:** esecuzione inline task per task con ledger (`ledger-l7pro-profile-ui.md`), come da CLAUDE.md. Niente sottoagenti senza richiesta dell'utente. I passi usano la sintassi a caselle.

**Goal:** ogni impostazione sta dentro la pagina di un profilo (scelto dalla barra a sinistra); si vede sempre su quale profilo si lavora; Automation diventa Trigger.

**Architecture:** `App` tiene una vista (`{ kind: "profile", slot } | "trigger" | "settings"`) e disegna la barra con i tre profili. La pagina profilo (`ProfilePage`) ha intestazione (nome, Rename, etichetta), fascia Switch se il profilo non e' quello attivo e schede. Il mouse espone i parametri solo del profilo attivo: per un profilo non attivo le schede NON mostrano valori (sarebbero quelli di un altro profilo) ma solo la fascia con Switch. Nessun comando nuovo sul mouse.

**Tech Stack:** TypeScript, React, Electron, vitest + testing-library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-05-l7pro-profile-centric-ui-design.md`

## Global Constraints

- Testi dell'interfaccia in INGLESE, niente emoji, nessun dialogo di conferma per azioni normali e reversibili (Switch, Rename, DPI, polling).
- Aprire una pagina o cliccare una voce della barra non invia MAI niente al mouse; solo Switch, Rename, Apply scrivono.
- Solo comandi gia' verificati (0x11 0x58, 0x12 0x59, 0x12 0x40, 0x11 0x41). Nessuna scrittura nuova.
- Il codice interno `automation` e i canali IPC non cambiano: cambia solo il testo mostrato.
- Fine di ogni fase: `npm test`, `npm run check`, `npm run build` verdi, poi prova con l'utente; fermarsi.
- Nessun repository git: niente commit, il registro e' il ledger.

## Review Focus

1. Mouse assente o in sleep: la barra mostra comunque i profili (nomi letti prima, o `Profile N`), la pagina profilo non mostra controlli attivi e dice che il mouse non e' collegato.
2. Il profilo attivo cambia da solo mentre si guarda una pagina (tasto del mouse, trigger): etichetta e fascia si aggiornano subito; una modifica DPI non applicata si riallinea.
3. Switch che fallisce: errore visibile, la pagina resta com'e', nessuna chiamata ripetuta.
4. Pagina di un profilo non attivo: nessun valore DPI/polling del profilo sbagliato, controlli assenti o disattivati.
5. Nomi non ancora letti (`profileNames` null) e nome appena rinominato: la barra e le intestazioni usano `Profile N` / il nuovo nome senza saltare.
6. Cliccare le voci della barra, aprire schede o pagine non produce nessuna chiamata di scrittura.

---

## File Structure

- `src/renderer/App.tsx`: vista corrente, barra, intestazione globale. Modifica.
- `src/renderer/screens/ProfilePage.tsx`: intestazione del profilo, fascia Switch, schede. Nuovo.
- `src/renderer/screens/ProfileHeader.tsx`: nome, Rename (logica gia' scritta in `Profiles.tsx`), etichetta. Nuovo.
- `src/renderer/screens/DpiTab.tsx`: contenuto di `SensorDpi.tsx` senza titolo e senza il testo "To edit another profile". Rinominato da `SensorDpi.tsx`.
- `src/renderer/screens/PerformanceTab.tsx`: fase 2. Nuovo.
- `src/renderer/screens/Profiles.tsx`, `SensorDpi.tsx`: eliminati a fine fase 1.
- `src/renderer/screens/Automation.tsx`, `src/main/trayTemplate.ts`, `Settings.tsx`: solo testi visibili.
- `src/core/protocol.ts`: `parseSensor` (fase 2).

---

## FASE 1: barra, pagina profilo, Trigger

### Task 1: Barra con i profili e vista corrente

**Files:**
- Modify: `src/renderer/App.tsx`
- Test: `tests/App.test.tsx`

**Interfaces:**
- Produces: `type View = { kind: "profile"; slot: number } | { kind: "trigger" } | { kind: "settings" }`; la barra rende un pulsante per ogni slot 0..2 con nome `snap.profileNames?.[i] ?? "Profile N"`, `aria-current="page"` sulla voce aperta, e un elemento con `aria-label="Active on mouse"` (pallino) accanto al profilo `snap.state?.profile`; poi "Trigger" e "Settings". Vista iniziale: lo slot attivo del mouse se noto, altrimenti 0.

- [ ] **Step 1: test rossi in `tests/App.test.tsx`:** "la barra ha i tre profili, Trigger e Settings e non ha Sensor & DPI, Buttons, Macros, Lighting"; "il pallino 'Active on mouse' e' accanto a Default1 e si sposta su TheFinals quando lo snapshot cambia profilo"; "cliccare TheFinals lo segna aria-current e non chiama nessuna scrittura (api.calls vuoto)"; "senza mouse la barra mostra Profile 1, Profile 2, Profile 3".
- [ ] **Step 2:** `npx vitest run tests/App.test.tsx`; atteso: FAIL sui test nuovi (voci mancanti).
- [ ] **Step 3:** implementare in `App.tsx` il tipo `View`, la barra e il rendering: `profile` -> `<ProfilePage snap slot />` (per ora un segnaposto che stampa il nome, sostituito dal Task 2), `trigger` -> `<Automation snap />`, `settings` -> `<Settings />`. Aggiornare i test esistenti di App che cercavano le vecchie voci.
- [ ] **Step 4:** `npm test`; atteso: verde.

### Task 2: Pagina profilo, fascia Switch, DPI e polling dentro

**Files:**
- Create: `src/renderer/screens/ProfilePage.tsx`, `src/renderer/screens/ProfileHeader.tsx`
- Rename: `src/renderer/screens/SensorDpi.tsx` -> `DpiTab.tsx`
- Delete: `src/renderer/screens/Profiles.tsx`
- Modify: `src/renderer/App.tsx`, `src/renderer/styles.css`
- Test: `tests/ProfilePage.test.tsx` (nuovo, sostituisce `Profiles.test.tsx`), `tests/DpiTab.test.tsx` (sostituisce `SensorDpi.test.tsx`)

**Interfaces:**
- Consumes: `View` (Task 1); `window.l7.setProfile(slot)`, `renameProfile(slot, name)`, `setDpiLevel`, `setLevelCount`, `removeLevel`, `setPolling`.
- Produces: `ProfilePage({ snap, slot }: { snap: Snapshot; slot: number })`; `ProfileHeader({ snap, slot }: ...)` (nome in `h2`, pulsante `Rename`, campo `Profile name` con Invio/Esc e `maxLength={PROFILE_NAME_MAX}`, testo `Active on mouse` solo se `snap.state?.profile === slot`); `DpiTab({ snap }: { snap: Snapshot })` identico al vecchio `SensorDpi` senza `<h2>`.

- [ ] **Step 1: test rossi (`ProfilePage.test.tsx`)**, riprendendo i test di Rename da `Profiles.test.tsx` (Invio salva, Esc annulla, errore e resta in modifica, disabilitato senza mouse) e aggiungendo: "profilo attivo: mostra 'Active on mouse', le schede DPI/Performance/Keys/Macros e i livelli DPI (1229) con il polling"; "profilo non attivo: mostra la fascia 'The mouse is on Default1. Switch to TheFinals to edit it.' con il pulsante Switch, e NON mostra i livelli DPI ne' il polling"; "Switch chiama setProfile(slot) una volta, senza dialogo"; "Switch che rifiuta mostra l'errore (role alert) e la fascia resta"; "senza mouse: nessun pulsante Switch ne' controlli, testo 'Mouse not connected'"; "aprire la pagina non produce chiamate (calls vuoto)".
- [ ] **Step 2:** `npx vitest run tests/ProfilePage.test.tsx`; atteso: FAIL (componenti mancanti).
- [ ] **Step 3:** creare `ProfileHeader` spostando la logica di rename da `Profiles.tsx` (stato `editing`, `saveName`). Creare `ProfilePage`: intestazione, poi se `connection !== "connesso"` il messaggio, se `state.profile !== slot` la fascia Switch (stesso `cleanError` per gli errori), altrimenti le schede (stato locale `tab`, default DPI): DPI -> `DpiTab`, Performance/Keys/Macros -> `ComingSoon`-style con "Not available yet" (Performance e' riempita dal Task 4). Rinominare `SensorDpi` in `DpiTab` togliendo titolo e frase "To edit another profile, activate it first". Collegare in `App.tsx`. Eliminare `Profiles.tsx` e i test vecchi, portando in `DpiTab.test.tsx` i test del vecchio `SensorDpi.test.tsx` con il solo cambio di import e render.
- [ ] **Step 4:** `npm test` e `npm run check`; atteso: verde.
- [ ] **Step 5:** verifica visiva io: `L7_SHOT` con la pagina del profilo attivo e di uno non attivo (cartella dati nuova, nessuna regola), guardare gli screenshot.

### Task 3: Automation diventa Trigger

**Files:**
- Modify: `src/renderer/screens/Automation.tsx` (titoli, testo "No rules yet..."), `src/main/trayTemplate.ts` e `Settings.tsx` solo se mostrano la parola Automation all'utente; `tests/Automation.test.tsx`, `tests/Settings.test.tsx`, `tests/tray.test.ts` per i testi.

**Interfaces:** nessuna firma cambia.

- [ ] **Step 1:** `Grep` di "Automation" e "automation" nei testi mostrati (stringhe JSX, label del tray, `Settings.tsx`) per elencare cosa e' visibile; aggiornare PRIMA i test: titolo `Trigger`, frase "No rules yet. Triggers do nothing until you add one.", e ogni altro testo trovato; verificare che falliscano.
- [ ] **Step 2:** cambiare i testi (nessun identificatore).
- [ ] **Step 3:** `npm test`, `npm run check`, `npm run build`; atteso: verde.
- [ ] **Step 4: Prova con l'utente (fine fase 1):** `npm run app`: barra con i tre profili, pallino sul profilo attivo, aprire TheFinals (fascia Switch, nessun cambio sul mouse), premere Switch, cambiare un DPI e il polling nella scheda DPI, Rename, voce Trigger con le regole ancora al loro posto. Fermarsi.

---

## FASE 2: scheda Performance in sola lettura

### Task 4: parseSensor e scheda Performance

**Files:**
- Modify: `src/core/protocol.ts`, `src/renderer/screens/ProfilePage.tsx`, `PROTOCOL.md` (10.12)
- Create: `src/renderer/screens/PerformanceTab.tsx`
- Test: `tests/protocol.test.ts`, `tests/PerformanceTab.test.tsx`

**Interfaces:**
- Produces: `parseSensor(byte: number): { lodMm: 1 | 2; rippleControl: boolean; angleSnapping: boolean; motionSync: boolean }`; `PerformanceTab({ snap })` mostra in sola lettura LOD, ripple, angle snapping, motion sync, debounce (ms, `state.debounce`) e sleep (minuti, `state.sleep`, 0 = "Never"), senza nessun controllo di scrittura.

- [ ] **Step 1:** ricavare la mappa dei bit dal codice di M HUB (`work/main.pretty.js`, solo lettura) e da PROTOCOL.md 4.1/10.12. Dato certo: sensore 0x11 = LOD 1 mm, motion sync acceso, ripple e angle snapping spenti. Test rosso: `parseSensor(0x11)` restituisce esattamente questo; aggiungere un secondo caso con un byte diverso SOLO se la mappa e' certa dal codice, altrimenti segnarlo nel ledger come non verificato.
- [ ] **Step 2:** implementare `parseSensor` e `PerformanceTab` (test: valori mostrati per il profilo attivo del `FakeLink`: LOD 1 mm, Motion Sync On, Ripple Off, Angle snapping Off, Debounce 6 ms, Sleep 3 min; sleep 0 -> "Never"; nessun `button` o `input` di scrittura).
- [ ] **Step 3:** `npm test`, `npm run check`.
- [ ] **Step 4: Prova con l'utente:** confrontare, per ciascun profilo attivato, i valori dell'app con la scheda Performance di M HUB (e i valori che M HUB mostra per LOD, ripple, angle snapping, motion sync). Se un profilo non coincide, correggere la mappa dei bit prima di chiudere. Fermarsi.

---

## FASE 3: About in Settings

### Task 5: Sezione About

**Files:**
- Modify: `src/renderer/screens/Settings.tsx`
- Test: `tests/Settings.test.tsx`

**Interfaces:**
- Consumes: `snap.firmware`, `snap.battery`. `Settings` riceve `snap: Snapshot` (oggi non lo riceve: aggiornare la chiamata in `App.tsx`).
- Produces: sezione `About` con "Mouse firmware 5.12.5.0", "Receiver firmware 5.7.6.0", "Battery 90%"; senza mouse "-" al posto dei valori.

- [ ] **Step 1:** test rossi con `connectedSnapshot()` (valori del finto mouse) e con `absentSnapshot()` ("-").
- [ ] **Step 2:** implementare; `npm test`, `npm run check`, `npm run build`.
- [ ] **Step 3: Prova con l'utente:** aprire Settings e controllare le versioni. Fermarsi; poi aggiornare CLAUDE.md, ledger e inventario.

---

## Self-review

- **Copertura della spec:** barra e pallino (Task 1); pagina profilo, Rename, etichetta, fascia Switch, DPI e polling dentro, Lighting/Buttons/Macros fuori dalla barra e Keys/Macros come segnaposto (Task 1-2); Trigger (Task 3); Performance in sola lettura (Task 4); About (Task 5).
- **Coerenza dei tipi:** `View`, `ProfilePage`, `ProfileHeader`, `DpiTab`, `PerformanceTab`, `parseSensor` definiti una volta e usati con gli stessi nomi.
- **Review Focus:** 1 -> Task 1-2; 2 -> Task 1-2 (test snapshot che cambia); 3 -> Task 2; 4 -> Task 2; 5 -> Task 1; 6 -> Task 1-2.
- **Proporzione:** cinque task per una spec di una pagina.

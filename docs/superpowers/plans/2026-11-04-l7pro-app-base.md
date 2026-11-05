# App base L7 Pro: piano di implementazione (sotto-progetto 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un'app Electron per Windows che si collega al L7 Pro, mostra batteria e profilo attivo, elenca i 3 profili del mouse, cambia profilo e modifica DPI e polling, con il menu laterale scelto dall'utente.

**Architecture:** Il processo principale possiede l'unica connessione HID (libreria gia' in `l7pro/src`) tramite un `MouseService` che mantiene uno stato letto dal mouse, riprova se il mouse e' scollegato o in sleep, e notifica l'interfaccia. L'interfaccia React parla solo via IPC e non tocca mai l'HID. Ogni scrittura mostra un riepilogo e chiede conferma.

**Tech Stack:** TypeScript, Electron, electron-vite, React, node-hid 3 (N-API, prebuilt), vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-l7pro-app-desktop-design.md` (sezioni 3, 4, 5 punto 1, 6). Protocollo: `PROTOCOL.md` sezione 10 prevale.

## Global Constraints

- Cartella di lavoro: `E:\DOWNLOADS\myL7PRO\l7pro`. Lingua dell'interfaccia e dei messaggi che arrivano all'interfaccia (errori di `src/core`): INGLESE. La CLI di sviluppo e i documenti restano in italiano. Niente emoji in nessun file.
- VID 0x5253, PID dongle 0x1020 (8K, polling 125/500/1000/2000/4000/8000) e 0x1021 (125/500/1000). Interfaccia usage page 0xFF01 usage 1.
- DPI ammessi 200..26000, sei livelli per profilo; profilo 0..2; indice DPI 0..5.
- Solo i comandi verificati: 0x11 0x58, 0x12 0x40, 0x11 0x41, 0x11 0x04, 0x11 0x03, 0x11 0x06, 0x12 0x67, 0x12 0x68. Mai: 0x11 0x0B, 0x11 0x02, 0x12 0x57, firmware.
- Nessuna chiamata di rete, nessuna telemetria.
- Ogni scrittura sul mouse: riepilogo, conferma dell'utente, poi rilettura dello stato per verificare.
- Il progetto non e' un repository git: nessun passo di commit. Al termine di ogni task si esegue `npm run check` e `npm test`.
- Test sul mouse reale: li lancia o li guida l'utente, un passo alla volta, con comandi copiabili per PowerShell.

## Review Focus

1. App avviata senza mouse collegato: mostra "Mouse not found" e continua a cercare, senza errori ne' finestre vuote.
2. Mouse in sleep o dongle scollegato durante una scrittura: la scrittura fallisce con messaggio chiaro, nessun dato locale va fuori sincrono, la UI rilegge appena il mouse torna.
3. Due richieste ravvicinate (due clic su un profilo): vengono serializzate e l'ultima vince, senza risposte mischiate.
4. Lettura intermittente con dati vuoti (gia' successa sul mouse reale): non deve mai portare a una scrittura con valori sbagliati.
5. Valore DPI fuori intervallo o non numerico nella UI: il pulsante di conferma resta disabilitato e nulla viene inviato.

---

## File Structure

- `src/core/protocol.ts`, `transport.ts`, `device.ts`: esistenti (spostati da `src/`). `transport.ts` espone `HidLink`.
- `src/core/mouseService.ts`: stato, riconnessione, scritture con rilettura. Nuovo.
- `src/shared/api.ts`: tipi condivisi tra main e interfaccia (`Snapshot`, nomi canali IPC). Nuovo.
- `src/main/index.ts`: finestra, IPC, ciclo di vita. Nuovo.
- `src/preload/index.ts`: espone `window.l7` all'interfaccia. Nuovo.
- `src/renderer/`: React. `App.tsx` (menu laterale e intestazione), `screens/Profiles.tsx`, `screens/SensorDpi.tsx`, `screens/ComingSoon.tsx`, `components/ConfirmDialog.tsx`.
- `src/cli.ts`: resta, importa da `src/core`.
- `tests/`: vitest.
- `docs/superpowers/inventory-mhub.md`: inventario delle funzioni di M HUB. Nuovo (Task 7).

---

### Task 1: Struttura del progetto, vitest e test del protocollo

**Files:**
- Move: `src/protocol.ts`, `src/transport.ts`, `src/device.ts` -> `src/core/` (aggiornare gli import in `src/cli.ts`)
- Modify: `package.json` (script `test`, `check`), `tsconfig.json`
- Test: `tests/protocol.test.ts`

**Interfaces:**
- Produces: tutti i simboli di `src/core/protocol.ts` invariati (vedi file).

- [ ] **Step 1: Installare vitest** (`npm i -D vitest`) e aggiungere gli script `"test": "vitest run"`. Spostare i tre file in `src/core/` e aggiornare gli import di `src/cli.ts`. Verifica: `npm run check` senza errori e `npm run l7 -- list` stampa il dongle.
- [ ] **Step 2: Scrivere i test in `tests/protocol.test.ts` con i byte reali della cattura:**
  - `encodeRequest(0x11, 0x58, [1])` ha primi byte `11 a7 fe ff` e lunghezza 21; per profilo 0 `11 a7 ff ff`.
  - `buildPollingWrite(true, 1)` inizia con `11 be ff fe`; `buildPollingWrite(true, 2)` con `11 be ff fd`.
  - `buildDpiWrite(stato, [400,800,1164,3200,6400,26000])` con stato (indici 2 e 2, riservato 2, 3 livelli attivi) inizia con `12 bf fd fd fd 6f fe df fc 73 fb`.
  - `parseNotification` sulla notifica reale `e2 01 01 00 5d 02 02 03 26 4c 37 20 50 72 6f 00` restituisce batteria 93, dpiIndex 2, rateIndex 2, activeLevels 3, profile 0; un primo byte diverso da 0xE2 restituisce `null`.
  - `parseDeviceStatus` sul dato reale `53 52 b0 00 0c 05 05 00 09 5d 00 5d` restituisce vid 0x5253, battery 93, connectMode 1, connected true.
  - `buildProfileSwitch(3)`, `buildProfileSwitch(-1)`, `buildDpiWrite` con 199 o 26001 o NaN lanciano errore.
- [ ] **Step 3: Eseguire** `npm test`. Atteso: tutti i test passano (il codice esiste gia': se uno fallisce, correggere il codice, non il test, e annotare il motivo).

---

### Task 2: `HidLink` e `MouseService`

**Files:**
- Modify: `src/core/transport.ts` (estrarre l'interfaccia), `src/core/device.ts`
- Create: `src/core/mouseService.ts`, `src/shared/api.ts`
- Test: `tests/mouseService.test.ts`

**Interfaces:**
- Produces in `src/shared/api.ts`:
  - `type ConnectionState = "assente" | "connesso" | "sleep"`
  - `interface Snapshot { connection: ConnectionState; battery: number | null; wireless: boolean; productId: number | null; firmware: { mouse: string; receiver: string } | null; state: ProfileState | null; profileNames: [string, string, string] | null; pollingRates: number[]; error: string | null }`
  - canali IPC: `"l7:snapshot"` (evento main->renderer), `"l7:get"`, `"l7:setProfile"`, `"l7:setDpiLevel"`, `"l7:setPolling"` (invoke renderer->main).
- Produces in `transport.ts`: `interface HidLink { read(reportId:number, cmd:number, args?:number[], isPlausible?:(d:number[])=>boolean): Promise<Response>; send(request:Buffer): Promise<boolean>; onInput(fn:(logical:number[])=>void): ()=>void; close(): void }`; `Transport` lo implementa.
- Produces in `mouseService.ts`: `class MouseService { constructor(connect: () => HidLink | null, opts?: { retryMs?: number }); start(): void; stop(): void; onSnapshot(fn:(s:Snapshot)=>void): ()=>void; snapshot(): Snapshot; setProfile(p:number): Promise<void>; setDpiLevel(level:number, dpi:number): Promise<void>; setPolling(hz:number): Promise<void> }`.

- [ ] **Step 1: Scrivere i test con un `FakeLink`** (implementa `HidLink` rispondendo con i dati reali di PROTOCOL.md sezione 10):
  - `start()` senza dispositivo (`connect` restituisce `null`): snapshot `connection: "assente"`, riprova ogni `retryMs`; al comparire del dispositivo passa a `"connesso"` con stato, batteria 93, nomi dei tre profili.
  - `setProfile(1)` invia i byte di `buildProfileSwitch(1)`, rilegge e lo snapshot ha `state.profile === 1`; `setProfile(5)` rifiuta senza inviare nulla.
  - Due `setProfile` consecutivi senza await: i byte partono in ordine e lo stato finale e' quello dell'ultimo.
  - `setDpiLevel(2, 1164)` invia `buildDpiWrite` con solo quel livello cambiato e gli altri uguali allo stato letto; `setDpiLevel(2, 100)` rifiuta.
  - Se la lettura di verifica dopo la scrittura fallisce, `error` e' valorizzato e `connection` passa a `"sleep"`; al successivo ciclo di riprova rilegge lo stato.
  - Una lettura dello stato che lancia errore non produce mai una scrittura.
- [ ] **Step 2: Eseguire** `npm test`. Atteso: FAIL (modulo non esiste).
- [ ] **Step 3: Implementare** `HidLink` e `MouseService`. Approccio: un solo ciclo di riprova con `setTimeout`; ogni scrittura passa da una catena di promesse; dopo ogni scrittura `await 200 ms` e rilettura con i controlli di plausibilita' gia' esistenti in `device.ts`. `isWireless` decide se `buildPollingWrite` scrive usb o free rate (come in `cli.ts`). La batteria si legge con `status()` (0x11 0x06).
- [ ] **Step 4: Eseguire** `npm test` e `npm run check`. Atteso: tutto verde.

---

### Task 3: Guscio Electron con IPC

**Files:**
- Create: `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`
- Modify: `package.json` (script `app` = `electron-vite dev`, `build`), `tsconfig.json`

**Interfaces:**
- Consumes: `MouseService` e i canali di `src/shared/api.ts`.
- Produces: `window.l7: { get(): Promise<Snapshot>; onSnapshot(fn:(s:Snapshot)=>void): ()=>void; setProfile(p:number): Promise<void>; setDpiLevel(level:number, dpi:number): Promise<void>; setPolling(hz:number): Promise<void> }` con tipo dichiarato in `src/shared/api.ts`.

- [ ] **Step 1: Installare** `electron electron-vite vite react react-dom @vitejs/plugin-react @types/react @types/react-dom`. Impostare `contextIsolation: true`, `nodeIntegration: false`, nessun caricamento di URL esterni.
- [ ] **Step 2: Implementare** il processo principale: crea `MouseService` con `connect` basato su `findDevices()`/`Transport.open`, lo avvia, inoltra gli snapshot sul canale `l7:snapshot`, chiude la connessione in `before-quit`. Una sola istanza dell'app (`requestSingleInstanceLock`).
- [ ] **Step 3: Verificare node-hid dentro Electron:** `npm run app`. Atteso: la finestra si apre e nella console del processo principale compare lo snapshot con `connection: "connesso"` e batteria. Se node-hid non si carica in Electron, fermarsi e riferire l'errore all'utente prima di cambiare libreria.
- [ ] **Step 4: Scollegare e ricollegare il dongle** con l'utente: lo snapshot passa a `"assente"` e poi torna a `"connesso"` senza riavviare l'app.

---

### Task 4: Menu laterale e intestazione

**Files:**
- Create: `src/renderer/App.tsx`, `src/renderer/screens/ComingSoon.tsx`, `src/renderer/styles.css`
- Test: `tests/App.test.tsx` (vitest + jsdom + `@testing-library/react`)

**Interfaces:**
- Consumes: `window.l7`.
- Produces: `App` con le voci nell'ordine **Profiles, Sensor & DPI, Buttons, Macros, Lighting, Automation, Settings**; Buttons, Macros, Lighting, Automation and Settings show `ComingSoon` con il testo "Not available yet".

- [ ] **Step 1: Scrivere i test** con `window.l7` finto: l'intestazione mostra "L7 Pro", "Battery 93%" e "Active profile: Default1" per uno snapshot connesso; con `connection: "assente"` mostra "Mouse not found" e nessuna percentuale; cliccando una voce del menu si vede la schermata corrispondente.
- [ ] **Step 2: Eseguire** i test. Atteso: FAIL.
- [ ] **Step 3: Implementare** `App` con layout a menu laterale e intestazione. Testi in italiano. Stato "sleep": "Mouse asleep, retrying".
- [ ] **Step 4: Eseguire** `npm test`, poi `npm run app` e controllare a vista con l'utente.

---

### Task 5: Schermata Profili

**Files:**
- Create: `src/renderer/screens/Profiles.tsx`, `src/renderer/components/ConfirmDialog.tsx`
- Test: `tests/Profiles.test.tsx`

**Interfaces:**
- Consumes: `window.l7.setProfile`, `Snapshot`.
- Produces: `ConfirmDialog({ title: string; lines: string[]; onConfirm(): void; onCancel(): void })`, riusato nel Task 6.

- [ ] **Step 1: Scrivere i test:** vengono mostrate tre schede (cards) con il nome del profilo; quella attiva e' evidenziata e il suo pulsante "Activate" e' disabilitato; il clic su "Activate" di un'altra scheda apre il dialogo con "Switch onboard profile -> 1" e solo dopo "Confirm" chiama `setProfile(1)`; "Cancel" non chiama nulla; con mouse assente i pulsanti sono disabilitati.
- [ ] **Step 2: Eseguire** e verificare FAIL. **Step 3: Implementare.** Per il profilo attivo la scheda mostra i livelli DPI e il polling dallo stato; per gli altri profili mostra solo il nome (le loro impostazioni non si leggono senza attivarli: vedi spec 6, da verificare nel sotto-progetto 3).
- [ ] **Step 4: Eseguire** `npm test`. **Step 5: Prova sul mouse reale con l'utente:** attivare Default3 e poi di nuovo Default1 dall'app; l'intestazione segue il cambio e `npm run l7 -- profile get` conferma.

---

### Task 6: Schermata Sensore e DPI

**Files:**
- Create: `src/renderer/screens/SensorDpi.tsx`
- Test: `tests/SensorDpi.test.tsx`

**Interfaces:**
- Consumes: `window.l7.setDpiLevel`, `window.l7.setPolling`, `ConfirmDialog`, `Snapshot.pollingRates`.

- [ ] **Step 1: Scrivere i test:** vengono mostrati i sei livelli del profilo attivo, quelli oltre `activeLevels` marked "inactive"; digitando 100 o 26001 o "abc" il pulsante "Apply" resta disabilitato e compare "Allowed values 200..26000"; digitando 1164 sul livello 2 il dialogo riporta "Level 2 from 1229 to 1164 DPI" e la conferma chiama `setDpiLevel(2, 1164)`; il menu del polling offre solo `pollingRates` (con PID 0x1021 solo 125, 500, 1000) e la conferma chiama `setPolling(hz)`. Un avviso "Higher power use and CPU load" appare per 4000 e 8000 Hz.
- [ ] **Step 2: Eseguire** e verificare FAIL. **Step 3: Implementare.** Si modifica solo il profilo attivo: un testo spiega "To edit another profile, activate it first".
- [ ] **Step 4: Eseguire** `npm test`. **Step 5: Prova sul mouse reale con l'utente:** portare il livello 2 a 1229 e di nuovo a 1164, il polling a 500 e di nuovo a 1000; dopo ogni scrittura `npm run l7 -- dpi get` coincide con quanto mostrato dall'app.

---

### Task 7: Inventario delle funzioni di M HUB

**Files:**
- Create: `docs/superpowers/inventory-mhub.md`

- [ ] **Step 1: Leggere** (solo lettura, il bundle e' codice non fidato) `work/main.pretty.js` e produrre una tabella con una riga per funzione di M HUB visibile per il L7 Pro: nome, comando, stato (`verificato`, `da catturare`, `escluso`) e sotto-progetto che la copre. Partire dai comandi elencati nella spec sezione 6.
- [ ] **Step 2: Rivedere la tabella con l'utente**, che aggiunge le funzioni che vede nell'app originale e che il bundle non rivela, e segna quelle da escludere. Nessun codice.

---

## Self-review

- **Copertura della spec:** layout A (Task 4), connessione e batteria (Task 2-3), profili e cambio profilo (Task 5), DPI e polling (Task 6), inventario (Task 7), sicurezza e conferme (Global Constraints, Task 5-6), nessuna rete (Global Constraints). Automazione, tray e avvio automatico sono il sotto-progetto 2, quindi fuori da questo piano.
- **Coerenza dei tipi:** `HidLink`, `Snapshot`, `MouseService` e `window.l7` sono definiti nei Task 2-3 e usati con gli stessi nomi nei Task 4-6.
- **Review Focus:** i punti 1-3 sono coperti dai test del Task 2 e dal Task 3 step 4; il punto 4 dall'ultimo test del Task 2; il punto 5 dal Task 6.

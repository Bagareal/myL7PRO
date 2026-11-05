# Cambio profilo automatico, tray, avvio automatico e rinomina: piano di implementazione (sotto-progetto 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il mouse cambia profilo da solo seguendo l'app in primo piano, l'app vive nella barra di sistema e parte con Windows, e i 3 profili si possono rinominare.

**Architecture:** Un motore `Automation` nel processo principale riceve il programma in primo piano (funzione iniettata), sceglie lo slot con regole pure (`pickSlot`), aspetta 500 ms di stabilita' e chiama `MouseService.setProfile` solo se lo slot e' diverso da quello attivo. Le impostazioni stanno in un file JSON versionato. L'interfaccia le legge e le modifica via IPC.

**Tech Stack:** quello del sotto-progetto 1 piu' `active-win` (programma in primo piano), PowerShell (elenco programmi aperti), API Electron `Tray`, `dialog`, `app.setLoginItemSettings`.

**Spec:** `docs/superpowers/specs/2026-11-04-l7pro-automation-design.md`. Base gia' fatta: `docs/superpowers/plans/2026-11-04-l7pro-app-base.md` (stesso `l7pro/`, `MouseService`, `Snapshot`, `window.l7`).

## Global Constraints

- Cartella di lavoro `E:\DOWNLOADS\myL7PRO\l7pro`. UI e messaggi in INGLESE; documenti e CLI in italiano. Niente emoji.
- Slot del mouse 0..2. Profilo normale predefinito: slot 0 (Default1).
- Il programma in primo piano si confronta per nome del file `.exe`, senza maiuscole/minuscole (`r5apex.exe`).
- Stabilita' del programma in primo piano prima di agire: 500 ms. Controllo ogni 1000 ms.
- Nessuna chiamata di rete. Nessun dialogo di conferma per azioni normali.
- Solo comandi verificati. La rinomina (0x12 0x59) si scrive SOLO dopo la cattura reale del Task 8.
- Il progetto non e' un repository git: nessun passo di commit; a fine task `npm run check` e `npm test`.
- Prove sul mouse reale con l'utente, un passo alla volta, comandi copiabili per PowerShell.
- Le istanze dell'app in sviluppo non ricaricano il preload: dopo modifiche a `src/preload` o `src/main` l'utente chiude la finestra con la X e rilancia `npm run app`.

## Review Focus

1. File delle impostazioni mancante, vuoto o corrotto: si parte con le impostazioni di fabbrica, il vecchio file diventa `.bak`, nessun crash.
2. Programma in primo piano sconosciuto (`null`: blocco schermo, UAC) o la finestra di L7 Pro stessa: il profilo non cambia.
3. Regole con slot fuori da 0..2 o con lo stesso programma due volte nel file: ripulite al caricamento (la prima vince, slot non validi scartati).
4. A -> B -> A entro 500 ms: nessun comando inviato.
5. Mouse in sleep mentre cambia l'app, poi risveglio dopo altri cambi: si applica una sola volta lo slot giusto per l'app di quel momento.
6. Cambio profilo manuale (dall'app o dal tasto del mouse): l'automazione non lo annulla finche' non cambia l'app in primo piano.

---

## File Structure

- `src/core/settings.ts`: tipi, valori di fabbrica, pulizia e `SettingsStore` (lettura/scrittura file). Nuovo.
- `src/core/rules.ts`: `pickSlot`. Nuovo.
- `src/core/automation.ts`: motore. Nuovo.
- `src/main/foreground.ts`: programma in primo piano, elenco programmi aperti, scelta del file. Nuovo.
- `src/main/tray.ts`: menu del tray (`trayTemplate` puro) e creazione. Nuovo.
- `src/shared/api.ts`: tipi e canali di automazione. Modifica.
- `src/main/index.ts`, `src/preload/index.ts`: collegamento. Modifica.
- `src/renderer/screens/Automation.tsx`, `Settings.tsx`; `Profiles.tsx` (rinomina). Nuovi/modifica.
- `tests/`: un file per modulo.

---

### Task 1: Impostazioni su file

**Files:**
- Create: `src/core/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface Rule { id: string; exe: string; label: string; slot: number }`
  - `interface Settings { version: 1; defaultSlot: number; rules: Rule[]; autostart: boolean }`
  - `const DEFAULT_SETTINGS: Settings` (`defaultSlot: 0`, `rules: []`, `autostart: false`)
  - `sanitizeSettings(raw: unknown): Settings` (mai lancia errori)
  - `class SettingsStore { constructor(dir: string); load(): Settings; save(s: Settings): void }` (file `settings.json` in `dir`)

- [ ] **Step 1: Scrivere i test** con una cartella temporanea (`fs.mkdtempSync`): file assente -> `DEFAULT_SETTINGS`; `save` poi `load` restituisce gli stessi dati; file con JSON non valido -> `load` restituisce i valori di fabbrica e crea `settings.json.bak` con il contenuto vecchio; `sanitizeSettings` scarta regole con slot fuori da 0..2, con `exe` vuoto o non stringa, tiene solo la prima di due regole con lo stesso `exe` (confronto senza maiuscole), porta `defaultSlot` non valido a 0, `autostart` non booleano a `false`, ignora `version` sconosciute senza lanciare errori; `exe` viene salvato in minuscolo.
- [ ] **Step 2: Eseguire** `npm test -- settings`. Atteso: FAIL (modulo mancante).
- [ ] **Step 3: Implementare** `src/core/settings.ts`. `save` scrive prima su `settings.json.tmp` e poi rinomina. `load` non lancia mai.
- [ ] **Step 4: Eseguire** `npm test -- settings` e `npm run check`. Atteso: PASS.

---

### Task 2: Scelta dello slot

**Files:**
- Create: `src/core/rules.ts`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Consumes: `Rule`, `Settings` (Task 1).
- Produces: `interface Match { slot: number; rule: Rule | null }`; `pickSlot(exe: string | null, s: Pick<Settings, "defaultSlot" | "rules">): Match` (con `exe` nullo restituisce `{ slot: s.defaultSlot, rule: null }`; il confronto ignora maiuscole e un eventuale percorso davanti al nome).

- [ ] **Step 1: Scrivere i test:** nessuna regola -> slot normale; `R5Apex.EXE` corrisponde a `r5apex.exe`; percorso completo `C:\Games\r5apex.exe` corrisponde; due regole che corrispondono -> vince la prima; nessuna corrispondenza -> slot normale e `rule: null`.
- [ ] **Step 2: Eseguire** `npm test -- rules`. Atteso: FAIL.
- [ ] **Step 3: Implementare** `pickSlot` in `src/core/rules.ts`.
- [ ] **Step 4: Eseguire** `npm test -- rules`. Atteso: PASS.

---

### Task 3: Motore di automazione

**Files:**
- Create: `src/core/automation.ts`
- Test: `tests/automation.test.ts` (tempi simulati con `vi.useFakeTimers`)

**Interfaces:**
- Consumes: `Snapshot` (`src/shared/api.ts`), `Settings`, `pickSlot`.
- Produces:
  - `interface ProfileMouse { snapshot(): Snapshot; onSnapshot(fn: (s: Snapshot) => void): () => void; setProfile(p: number): Promise<void> }`
  - `interface AutomationState { foreground: string | null; match: Match; hold: boolean }`
  - `class Automation { constructor(deps: { mouse: ProfileMouse; getForeground: () => Promise<string | null>; getSettings: () => Settings; ignoreExes: string[] }, opts?: { pollMs?: number; stableMs?: number }); start(): void; stop(): void; state(): AutomationState; onState(fn: (s: AutomationState) => void): () => void; noteManualChange(): void }`

- [ ] **Step 1: Scrivere i test** con un `ProfileMouse` finto e `getForeground` controllabile:
  - il programma `r5apex.exe` in primo piano per piu' di 500 ms con regola -> slot 2: `setProfile(2)` chiamato una sola volta; finche' resta li' nessun altro comando;
  - se il profilo attivo e' gia' lo slot richiesto: nessun comando;
  - A -> B -> A entro 500 ms: nessun comando;
  - programma senza regola -> `setProfile(defaultSlot)`;
  - `getForeground` restituisce `null` o un nome in `ignoreExes` (`electron.exe`): nessun comando e `state().foreground` resta quello precedente;
  - mouse `assente` o `sleep` mentre cambia l'app: nessun comando; quando lo snapshot torna `connesso` si applica una sola volta lo slot per l'app di quel momento (anche se nel frattempo l'app e' cambiata piu' volte);
  - `noteManualChange()` poi stessa app in primo piano: nessun comando e `state().hold === true`; quando cambia l'app (stabile) `hold` torna `false` e il profilo segue la regola;
  - un cambio di `state.profile` nello snapshot non causato da noi (nessuna richiesta in corso, slot diverso da quello chiesto per ultimo) imposta `hold`;
  - `setProfile` che rifiuta non ferma il motore: al giro successivo riprova se serve.
- [ ] **Step 2: Eseguire** `npm test -- automation`. Atteso: FAIL.
- [ ] **Step 3: Implementare** `Automation` in `src/core/automation.ts`. Approccio: un timer ogni `pollMs` che legge `getForeground`; un candidato diventa stabile dopo `stableMs` di letture uguali; l'applicazione e' in una funzione `reconcile()` richiamata sia dal timer sia dagli snapshot.
- [ ] **Step 4: Eseguire** `npm test` e `npm run check`. Atteso: tutto verde.

---

### Task 4: Programma in primo piano, elenco programmi e scelta del file

**Files:**
- Create: `src/main/foreground.ts`
- Test: `tests/foreground.test.ts`

**Interfaces:**
- Produces: `interface OpenApp { exe: string; title: string }`; `getForegroundExe(): Promise<string | null>` (nome del file `.exe` in minuscolo); `parseOpenApps(json: string): OpenApp[]` (puro); `listOpenApps(): Promise<OpenApp[]>`; `pickExe(parent: BrowserWindow | null): Promise<{ exe: string; label: string } | null>`.

- [ ] **Step 1: Scrivere i test su `parseOpenApps`:** l'output di PowerShell `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json` (oggetto singolo oppure array) diventa `{ exe: "nome.exe", title }` senza duplicati per `exe`, ordinato per nome, scartando titoli vuoti, ignorando `L7Pro` e `electron`; JSON vuoto o non valido -> lista vuota.
- [ ] **Step 2: Eseguire** `npm test -- foreground`. Atteso: FAIL.
- [ ] **Step 3: Implementare** `parseOpenApps` e `listOpenApps` (esegue PowerShell con `execFile`, senza shell, argomenti fissi, timeout 5 s). `getForegroundExe`: installare `active-win` (`npm i active-win`), leggere `owner.path`, restituire il nome del file in minuscolo, `null` se assente o in caso di errore. `pickExe`: `dialog.showOpenDialog` con filtro `.exe`, restituisce il nome del file e come etichetta il nome senza estensione.
- [ ] **Step 4: Eseguire** `npm test -- foreground` e `npm run check`. Atteso: PASS.
- [ ] **Step 5: Prova nell'app vera** (senza il mouse in mezzo): con `L7_SHOT`/`L7_EVAL` o uno script di prova stampare `getForegroundExe()` mentre una finestra nota e' in primo piano. Se `active-win` non funziona dentro Electron su Windows 11, fermarsi e riferire l'errore all'utente prima di scegliere un'altra libreria.

---

### Task 5: Collegamento in `main`, `preload` e API

**Files:**
- Modify: `src/shared/api.ts`, `src/main/index.ts`, `src/preload/index.ts`
- Test: `tests/automationApi.test.ts` (gestori IPC estratti in funzioni pure, es. `makeAutomationApi(store, automation)`)

**Interfaces:**
- Consumes: `SettingsStore`, `Automation`, `listOpenApps`, `pickExe`, `MouseService`.
- Produces in `src/shared/api.ts`: `interface AutomationView { settings: Settings; state: AutomationState }`; `L7Api.automation: { get(): Promise<AutomationView>; onChange(fn: (v: AutomationView) => void): () => void; setDefaultSlot(slot: number): Promise<void>; addRule(r: { exe: string; label: string; slot: number }): Promise<void>; removeRule(id: string): Promise<void>; setRuleSlot(id: string, slot: number): Promise<void>; moveRule(id: string, dir: "up" | "down"): Promise<void>; listApps(): Promise<OpenApp[]>; pickExe(): Promise<{ exe: string; label: string } | null> }` e `L7Api.setAutostart(on: boolean): Promise<void>`; il `setProfile` esistente chiama anche `automation.noteManualChange()`.

- [ ] **Step 1: Scrivere i test** di `makeAutomationApi` con un `SettingsStore` su cartella temporanea e un `Automation` finto: `addRule` crea un `id`, normalizza `exe` in minuscolo e salva; rifiuta slot non valido e `exe` vuoto o gia' presente; `removeRule`, `setRuleSlot`, `moveRule` (non esce dai limiti dell'elenco) salvano; `setDefaultSlot` rifiuta slot non valido; ogni modifica emette `onChange`.
- [ ] **Step 2: Eseguire** `npm test -- automationApi`. Atteso: FAIL.
- [ ] **Step 3: Implementare** `makeAutomationApi` e collegare i canali IPC in `main` (`automation:*`), con la validazione lato `main` di ogni argomento. In `main` all'avvio: `SettingsStore` in `app.getPath("userData")`, `Automation` con `ignoreExes` = nome del file dell'app in esecuzione (`path.basename(process.execPath).toLowerCase()`), `automation.start()`; `before-quit`: `automation.stop()`.
- [ ] **Step 4: Eseguire** `npm test` e `npm run check`. Atteso: verde.
- [ ] **Step 5: Prova reale con l'utente** (solo letture e cambio profilo): l'utente riavvia l'app con `npm run app`; il file `settings.json` compare nella cartella dati; con la regola aggiunta a mano nel file (comando copiabile fornito) per un programma gia' aperto, il mouse cambia profilo quando quel programma va in primo piano e torna a Default1 con un altro programma. Lo script di prova ripristina il profilo di partenza.

---

### Task 6: Schermata Automation

**Files:**
- Create: `src/renderer/screens/Automation.tsx`
- Modify: `src/renderer/App.tsx` (voce "Automation")
- Test: `tests/Automation.test.tsx`

**Interfaces:**
- Consumes: `window.l7.automation`, `Snapshot.profileNames`.

- [ ] **Step 1: Scrivere i test** (jsdom, `window.l7.automation` finto): mostra "When no rule matches, use:" con il menu dei tre profili (nomi reali) e il valore corrente; ogni regola mostra etichetta, nome del programma, menu del profilo e pulsante rimozione; cambiare un menu chiama `setDefaultSlot` o `setRuleSlot` subito, senza dialogo; i pulsanti su/giu' chiamano `moveRule`; "Add app" apre un pannello con la lista di `listApps()` e un campo di ricerca che filtra per nome o titolo, un pulsante "Browse..." chiama `pickExe`, la scelta di un programma chiama `addRule` con slot 0 e chiude il pannello; programmi gia' presenti nelle regole sono segnati e non aggiungibili; la riga "Right now: <programma> -> <profilo>" segue `state()` e, con `hold`, mostra "(manual change, waiting for next app)"; senza mouse i menu dei profili restano usabili (le regole sono dati del PC) e compare "Mouse not found".
- [ ] **Step 2: Eseguire** `npm test -- Automation`. Atteso: FAIL.
- [ ] **Step 3: Implementare** la schermata. Testi in inglese. Nessun campo di testo per il nome del programma.
- [ ] **Step 4: Eseguire** `npm test` e `npm run check`. Atteso: verde.
- [ ] **Step 5: Verifica nell'app vera** con `L7_SHOT`/`L7_EVAL` (schermata, nessun errore in console), poi prova con l'utente: aggiunge The Finals con "Add app", Alt+Tab verso VS Code e ritorno, il profilo segue.

---

### Task 7: Tray, chiusura nel tray e avvio automatico

**Files:**
- Create: `src/main/tray.ts`, `src/renderer/screens/Settings.tsx`
- Modify: `src/main/index.ts`, `src/renderer/App.tsx`
- Test: `tests/tray.test.ts`, `tests/Settings.test.tsx`

**Interfaces:**
- Produces: `trayTemplate(snap: Snapshot, actions: { open(): void; setProfile(p: number): void; quit(): void }): Array<{ label: string; type?: "radio" | "separator"; checked?: boolean; enabled?: boolean; click?: () => void }>`; `createTray(...)` in `tray.ts`.

- [ ] **Step 1: Scrivere i test** di `trayTemplate`: voci "Open L7 Pro", un separatore, tre voci radio con i nomi dei profili e `checked` solo per quello attivo, `enabled: false` se il mouse non e' connesso, separatore, "Quit"; click su un profilo chiama `setProfile` con lo slot. Test di `Settings`: la casella "Start with Windows" riflette `settings.autostart` e chiama `setAutostart`.
- [ ] **Step 2: Eseguire** `npm test -- tray Settings`. Atteso: FAIL.
- [ ] **Step 3: Implementare.** Tray con icona dell'app (generare un'icona semplice) che si aggiorna con gli snapshot; chiudere la finestra la nasconde (`close` -> `preventDefault` + `hide`, salvo `app.quit()` esplicito dal menu); doppio clic sull'icona riapre; `setAutostart` salva in `settings.json` e chiama `app.setLoginItemSettings({ openAtLogin, args: ["--hidden"] })`; con `--hidden` la finestra non si mostra all'avvio.
- [ ] **Step 4: Eseguire** `npm test` e `npm run check`. Atteso: verde.
- [ ] **Step 5: Prova con l'utente:** chiudere la finestra con la X, l'icona resta e l'automazione continua a funzionare; dal menu dell'icona si cambia profilo; "Quit" chiude davvero; con "Start with Windows" attiva e riavvio di Windows l'app parte nascosta.

---

### Task 8: Rinomina dei profili (cattura, poi implementazione)

**Files:**
- Modify: `PROTOCOL.md` (sezione 10.13), `src/core/protocol.ts`, `src/core/mouseService.ts`, `src/shared/api.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/screens/Profiles.tsx`
- Test: `tests/protocol.test.ts`, `tests/mouseService.test.ts`, `tests/Profiles.test.tsx`

**Interfaces:**
- Produces: `buildProfileRename(slot: number, name: string): Buffer` (report 0x12, comando 0x59, formato dai byte catturati); `MouseService.renameProfile(slot: number, name: string): Promise<void>`; `L7Api.renameProfile(slot: number, name: string): Promise<void>`.

- [ ] **Step 1: Cattura guidata con l'utente** (un passo alla volta): attivare il logger HID di M HUB come in Fase 1 (PROTOCOL.md sezione 8), rinominare lo slot 2 da "Default3" a "Default3x" dal menu a tre puntini e poi rimetterlo a "Default3"; salvare i `TX` del comando 0x59 (due invii) e le letture 0x68 successive. Incollare i byte in `PROTOCOL.md` sezione 10.13 (struttura, lunghezza massima del nome, codifica, formato `nome$sorgente$id` e cosa succede se il nome contiene `$`). Se i byte non coincidono con il formato ipotizzato, fermarsi e riferire.
- [ ] **Step 2: Scrivere i test** con i byte catturati: `buildProfileRename(2, "Default3x")` produce esattamente il TX osservato; nomi vuoti, piu' lunghi del massimo catturato o con caratteri non ammessi (incluso `$`) vengono rifiutati; `MouseService.renameProfile` invia, rilegge i nomi con 0x68 e lo snapshot ha il nome nuovo (il finto `FakeLink` impara a rispondere a 0x59); un nome rifiutato non invia nulla; la scheda del profilo mostra un'icona matita che apre un campo di testo con Invio per salvare ed Esc per annullare, senza dialogo.
- [ ] **Step 3: Eseguire** `npm test`. Atteso: FAIL sui test nuovi.
- [ ] **Step 4: Implementare** `buildProfileRename`, `renameProfile` (invalida e rilegge `profileNames` dopo la scrittura), il canale IPC e la UI.
- [ ] **Step 5: Eseguire** `npm test` e `npm run check`. Atteso: verde.
- [ ] **Step 6: Prova con l'utente:** rinominare lo slot 2 in "Default3x" dall'app, controllare in M HUB (o con `npm run l7 -- profile get`) che il nome sia cambiato, poi rimetterlo a "Default3".

---

### Task 9: Prova di insieme con l'utente

**Files:** nessuno.

- [ ] **Step 1:** con regole per The Finals (TheFinals) e Apex (Default3), profilo normale Default1: aprire il gioco -> il mouse passa al profilo giusto; Alt+Tab verso VS Code -> torna a Default1; Alt+Tab veloce avanti e indietro (meno di mezzo secondo) -> nessun cambio; chiudere il gioco -> Default1.
- [ ] **Step 2:** aprire l'app L7 Pro mentre il gioco e' in secondo piano: il profilo non cambia; cambiare profilo a mano nell'app, tornare al gioco e uscire: dopo il cambio di app il profilo segue le regole.
- [ ] **Step 3:** mouse in sleep (lasciarlo fermo finche' dorme), cambiare app, muovere il mouse: dopo il risveglio il profilo e' quello giusto per l'app in primo piano.
- [ ] **Step 4:** riavviare Windows con "Start with Windows": l'app e' nel tray e l'automazione funziona senza aprire la finestra.

---

## Self-review

- **Copertura della spec:** comportamento sempre-segue-l'app e profilo normale (Task 2-3), finestre da ignorare (Task 3), Add app lista piu' file (Task 4-6), file impostazioni a prova di corruzione (Task 1), tray e avvio automatico (Task 7), rinomina dopo cattura (Task 8), verifica con prove reali (Task 5-9). Linux, regole per titolo e profili illimitati sono non obiettivi.
- **Coerenza dei tipi:** `Rule`, `Settings`, `Match`, `AutomationState`, `ProfileMouse`, `OpenApp`, `AutomationView` sono definiti nei Task 1-5 e usati con gli stessi nomi nei Task 6-7.
- **Review Focus:** punto 1 -> Task 1; 2 -> Task 3; 3 -> Task 1; 4 -> Task 3; 5 -> Task 3; 6 -> Task 3.
- **Proporzione:** nove task per una spec di una pagina: ogni task si ferma a firme e test, i corpi li scrive chi costruisce.

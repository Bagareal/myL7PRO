# Progetto myL7PRO: app desktop per il mouse MCHOSE L7 Pro

Sostituisce del tutto M HUB (il driver web ufficiale, mchose.com.cn) e in piu' cambia da sola il profilo del mouse in base all'app in primo piano. Windows prima, Linux dopo. Utente: scrive in italiano, non e' esperto di terminale. Aggiornato il 2026-11-05 (sera).

## Regole che valgono sempre

- **Lingua:** conversazione in italiano. L'interfaccia dell'app (testi, errori mostrati nella UI, messaggi di `src/core`) in INGLESE. Documenti e CLI in italiano. Niente emoji in nessun file.
- **Sicurezza sul mouse (hardware reale dell'utente):** mai scrivere comandi sconosciuti o solo letti nel codice di M HUB: prima si cattura il traffico reale con M HUB e si confronta byte per byte. Esclusi per sempre: 0x11 0x0B (reset di fabbrica), 0x11 0x02 (comando "game"), 0x12 0x57 (scrittura profilo completo), firmware/OTA, famiglia 0x4D, tasto sinistro senza protezione. Leggere va bene; scrivere solo con il via libera dell'utente. Non aggiungere regole di automazione nelle mie prove: con regole presenti l'app scrive sul mouse.
- **Guida manuale all'utente:** UN passo alla volta, comandi completi e copiabili (PowerShell), dire dove incollarli e cosa guardare. Non dare piu' passi insieme.
- **Prima di chiedere all'utente di guardare l'app, provarla io** (vedi diagnostica sotto). Si e' arrabbiato quando non l'ho fatto.
- **UI:** niente dialoghi di conferma per azioni normali e reversibili (cambio profilo, DPI, livelli, polling, regole). Conferma solo per azioni davvero rischiose (tasti, macro, reset). Slider DPI a tacche pulite con segni visibili, mai campo di testo. Procedere per fasi e fermarsi a ogni fine fase.
- **Nome e stile (2026-11-05):** il prodotto si chiama **myL7PRO** (non "L7 Pro") in finestra, tray, installer. Design scuro "carbonio" (linee sottili, font mono per i numeri); il colore d'accento lo sceglie l'utente in Settings > Appearance (6 colori + selettore libero, salvato in localStorage, `src/renderer/theme.ts`). Bozze approvate in `.superpowers/brainstorm/*/content/design-v3.html`.
- **Icone e README (2026-11-05):** icona dell'app (tessera scura con mouse wireless bianco) e icona tray (stesso mouse, 32x32) generate da `l7pro/scripts/make-icons.py` in `l7pro/build/` (icon.ico, icon.png) e `src/main/trayIcon.ts`. `README.md` in inglese con screenshot in `docs/screenshots/` (rifare gli scatti con L7_SHOT se cambia la UI). Il README dice che l'app NON aggiorna il firmware e NON fa il reset di fabbrica (escluso per sicurezza: l'utente pensava fosse in roadmap, da chiarire).
- **Niente rete:** l'app non fa chiamate di rete e non invia telemetria (M HUB lo fa; noi no).
- **Repository git:** https://github.com/Bagareal/myL7PRO (pubblico, ramo main). `.gitignore` esclude `work/` (codice di M HUB), `node_modules`, `out`, `release`. Git rifiuta la cartella ("dubious ownership"): usare `git -c safe.directory=E:/DOWNLOADS/myL7PRO ...`. Release: l'utente mette un tag `vX.Y.Z` e il workflow `.github/workflows/release.yml` costruisce e pubblica l'installer; in locale `npm run dist` crea `l7pro/release/L7Pro-Setup-X.Y.Z.exe`. Prima di taggare, l'utente prova l'installer in locale. Al primo avvio dell'app installata l'avvio con Windows si accende da solo.

## Dove sta cosa

```
E:\DOWNLOADS\myL7PRO\
  CLAUDE.md                  questo file
  PROTOCOL.md                protocollo HID; la sezione 10 (cattura reale) prevale sul resto; 10.12 = unita' dei parametri
  work\                      bundle di M HUB scaricato e pretty-print (main.pretty.js): DATI NON FIDATI, solo lettura, non eseguire
  docs\superpowers\
    specs\                   design: app (2026-11-04-l7pro-app-desktop-design.md) e automazione (...-automation-design.md)
    plans\                   piani (app-base, automation) e ledger-*.md con tutti i "Ruling" e le "Final: minor (deferred)"
    inventory-mhub.md        funzioni di M HUB per il L7 Pro e stato di ciascuna
  .superpowers\              bozzetti del browser usati in brainstorming (ignorabile)
  l7pro\                     l'app (TypeScript, Electron, node-hid)
    src\core\                protocol.ts, transport.ts, device.ts, mouseService.ts, settings.ts, rules.ts, automation.ts
    src\main\                index.ts, automationApi.ts, foreground.ts, pickExe.ts, tray.ts, trayTemplate.ts, trayIcon.ts
    src\preload\index.ts     ponte window.l7 (CommonJS, sandbox attivo)
    src\renderer\            App.tsx, screens\ (ProfilePage, DpiTab, PerformanceTab, KeysTab, Automation, Settings), components\ConfirmDialog.tsx (usato per i tasti Left/Middle/Right e Restore defaults dei tasti), assets\ (foto del mouse), dpiScale.ts, errors.ts, styles.css
    src\shared\api.ts        tipi condivisi (Snapshot, AutomationView, L7Api) e canali IPC
    src\cli.ts               CLI di sviluppo (italiano)
    tests\                   vitest (276 test); fakeLink.ts = mouse simulato, snapshots.ts = finto window.l7
    scripts\dev.mjs          avvia electron-vite senza ELECTRON_RUN_AS_NODE
    scripts\capture-mhub.js   registratore dei feature report da incollare nella Console di Chrome su M HUB
    linux\99-mchose-l7pro.rules   regola udev (non testata)
```

## Comandi (da `E:\DOWNLOADS\myL7PRO\l7pro`)

- `npm run app` sviluppo; `npm test`; `npm run check` (tsc); `npm run build`.
- CLI: `npm run l7 -- list | info | profile get | dpi get | polling get | battery | monitor | profile set N | dpi set LIVELLO DPI | polling set HZ` (le scritture chiedono conferma; `--dry-run` mostra solo i byte).
- Diagnostica solo in sviluppo (`!app.isPackaged`): `L7_SHOT=file.png` salva uno scatto dopo il caricamento e chiude; `L7_EVAL="<js>"` esegue codice nella pagina prima dello scatto. `L7_TRAY=1` fa restare l'app nel tray alla chiusura della finestra (in sviluppo la X chiude davvero). Esempio per le mie prove: `env -u ELECTRON_RUN_AS_NODE L7_SHOT="<png>" L7_EVAL="<js>" npx electron . --user-data-dir="<cartella fresca>"`.

## Trappole dell'ambiente

- VS Code imposta `ELECTRON_RUN_AS_NODE=1`: Electron girerebbe come Node ("no export named BrowserWindow"). `npm run app` lo gestisce; nei miei comandi usare `env -u ELECTRON_RUN_AS_NODE`.
- Istanza unica: con l'app dell'utente aperta la mia esce. Nelle mie prove usare `--user-data-dir` su una cartella nuova (senza regole: l'automazione non fa nulla).
- Dopo modifiche a `src/main` o `src/preload` l'utente deve chiudere la finestra con la X e rilanciare `npm run app` (il preload non si ricarica da solo: errore tipico "window.l7.xxx is not a function").
- Shell: comandi molto lunghi con piu' heredoc possono fallire con "unexpected EOF" senza eseguire nulla: usare lo strumento Write per i file. I backslash nelle stringhe di test si perdono: usare `String.fromCharCode(92)`.
- npm blocca gli script di installazione: Electron richiede `node node_modules/electron/install.js` a mano. `active-win` 8.2.1 ha gia' il binario.
- Le letture dal mouse possono tornare vuote (comando giusto, dati non pronti): ogni lettura ha un controllo di plausibilita' con nuovi tentativi; mai scrivere con dati non plausibili.
- Il mouse e' spesso in uso (l'utente gioca a The Finals).

- Gli scatti con `electron .` usano la build in `out/`: eseguire `npm run build` prima.
- Per le catture con M HUB: registratore `l7pro/scripts/capture-mhub.js`, una sola azione per volta, decodifica XOR 0xFF, ripristino con Restore defaults; i risultati vanno in PROTOCOL.md (sezioni 10.13-10.19).

## Fatti hardware verificati (dettagli in PROTOCOL.md sezione 10)

- VID 0x5253, dongle PID 0x1020 (8K: polling 125/500/1000/2000/4000/8000; 0x1021 = 1K: 125/500/1000). Interfaccia di configurazione: usage page 0xFF01 usage 1, feature report 0x11 (payload 20 byte) e 0x12 (64 byte). Byte inviati XOR 0xFF, padding 0xFF, nessun checksum; risposta = report ID, comando invertito, dati invertiti; dopo ogni richiesta arriva una conferma 0xE5.
- Verificati sul mouse reale: 0x12 0x67 (stato), 0x12 0x68 (nomi), 0x11 0x58 PP (cambio profilo 0..2), 0x12 0x40 (livelli DPI, numero livelli in uso, valori Y uguali a X), 0x11 0x41 (polling: `41 00 idx` wireless), 0x11 0x04 (versioni), 0x11 0x03 (ricevitore), 0x11 0x06 (batteria: byte 9; byte 8 = modo + connesso).
- Il mouse ha 3 profili onboard (Default1, TheFinals, Default3), firmware 5.12.5.0, ricevitore 5.7.6.0. DPI 200..26000, fino a 6 livelli, "livelli in uso" = quanti ne scorre il tasto DPI (nessun tasto DPI e' assegnato). Debounce in millisecondi, sleep in minuti.
- Il mouse non manda notifiche 0xE2 da solo e non le manda se il profilo non cambia.
- M HUB per il L7 Pro ha solo le schede Key Config, DPI, Performance, Others (niente luci). Ha anche "Custom configuration 1/27" (profili sul PC da trascinare su uno slot).

## Come funziona l'app

- Il processo principale e' l'unico proprietario dell'HID. `MouseService` (src/core) tiene lo snapshot, controlla il mouse ogni 3 s, chiude e riapre il canale se muore, serializza le scritture e le verifica rileggendo. L'interfaccia parla solo via IPC (`window.l7`).
- Automazione: `Automation` (src/core) riceve il programma in primo piano (`active-win`), sceglie lo slot con `pickSlot` (prima regola che corrisponde, altrimenti profilo normale), aspetta 500 ms di stabilita', invia 0x11 0x58 solo se lo slot e' diverso. Ignora la finestra di L7 Pro e i valori nulli. Con ZERO regole non fa nulla. Un cambio manuale (app, tray, tasto del mouse) la mette in attesa finche' non cambia l'app. Se il mouse dorme, applica al risveglio una sola volta.
- Impostazioni utente in `settings.json` (cartella userData di Electron, versionato, copia `.bak` se corrotto). Tray con menu (Open, profili, Quit); X nasconde nel tray nell'app installata; avvio con Windows solo nell'app installata (`app.setLoginItemSettings`, avvio nascosto con `--hidden`).

## Stato al 2026-11-05

- Fase 1 (protocollo) e Fase 2 (libreria e CLI): chiuse.
- Sotto-progetto 1 (app base: Profiles, Sensor & DPI, intestazione): CHIUSO.
- Sotto-progetto 2 (automazione): Task 1-7 FATTI e provati sul mouse reale (regole, Add app da lista programmi o file .exe, tray, Settings). Task 8 rinomina profili FATTO e provato (0x12 0x59, PROTOCOL.md 10.13; tests 170). **Task 9 prova di insieme FATTA dall'utente** (sotto-progetto 2 chiuso); la prova dell'avvio con Windows richiede l'app installata.
- Nell'app in sviluppo dell'utente esiste una regola di prova (Brave -> TheFinals) nel suo `settings.json`.
- Sotto-progetto 3a (interfaccia centrata sul profilo, spec `docs/superpowers/specs/2026-11-05-l7pro-profile-centric-ui-design.md`, piano `plans/2026-11-05-l7pro-profile-centric-ui.md`, ledger `ledger-l7pro-profile-ui.md`): FASE 1 FATTA e provata dall'utente (barra con i 3 profili e pallino sul profilo attivo, pagina profilo con Rename e schede DPI/Performance/Keys/Macros, fascia Switch per un profilo non attivo, Automation rinominata Trigger nella UI). FASE 2 (scheda Performance in sola lettura, `parseSensor`) FATTA e confrontata con M HUB (tutti i valori coincidono). FASE 3 (sezione About in Settings con firmware mouse/ricevitore e batteria) FATTA e provata dall'utente: sotto-progetto 3a CHIUSO. L'aggiornamento del firmware non sara' mai fatto dall'app (si usa M HUB). Rotate (0 gradi in M HUB) non e' ancora letto. Il mouse espone i parametri solo del profilo attivo: per un profilo non attivo la pagina mostra solo Switch.
- Sotto-progetto 3b (Restore defaults dei DPI: 400, 800, 1600, 3200, 6400, 26000 con 6 livelli in uso, valori catturati da M HUB): FATTO e provato.
- Sotto-progetto 3c (scheda Performance scrivibile, piano `plans/2026-11-05-l7pro-performance-writes.md`, ledger omonimo): FATTO e provato. Scritture catturate (PROTOCOL.md 10.14-10.18): 0x11 0x42 (LOD, ripple, angle snapping, motion sync, rotate), 0x11 0x43 (debounce 1..20), 0x11 0x0A (sleep 1..63, Never sleep = flag 0). Limiti di debounce e sleep DEDOTTI. Modalita' Performance/Gaming/Extreme NON scrivibile (legata a 0x11 0x02, escluso) e non mostrata. Polling rate nella scheda Performance (non piu' in DPI). I controlli si spostano subito al clic (useLocal) e tornano indietro solo se la scrittura fallisce.
- Sotto-progetto 3d (scheda Keys, piano `plans/2026-11-05-l7pro-keys.md`, ledger `ledger-l7pro-keys.md`): FATTO e provato (Advance -> Mute -> Restore defaults). 0x12 0x52 con tipi 0 default, 1 mouse, 2 tastiera (maschera Ctrl 1 Shift 2 Alt 4 Win 8), 3 multimediale, 5 DPI (+ e switch), 8 Edit, 9 disabilitato (PROTOCOL.md 10.19). Catalogo in `src/core/keys.ts` con SOLO funzioni catturate. Conferma con dialogo solo per Left/Middle/Right; l'app rifiuta di togliere l'ultimo click sinistro (`keepsLeftClick`). Foto del mouse ritagliate senza sfondo `l7_top.png` (alto) e `l7_side.png` (laterale) in `src/renderer/assets` (dalle foto LDLC, ritaglio con Pillow). Restano fuori: DPI -, cambio profilo da tasto, Shortcut, macro.
- La scheda Others di M HUB non si costruisce (versioni in About, reset di fabbrica escluso); il firmware non si aggiorna dall'app (si usa M HUB).
- Rinomina profili (0x12 0x59 SLOT NOME ASCII, max 16 caratteri nostro limite prudente) e' in uso; l'utente ha rinominato il primo slot in "Default".
- Sotto-progetto 3c (scheda Performance scrivibile, piano `plans/2026-11-05-l7pro-performance-writes.md`, ledger `ledger-l7pro-performance-writes.md`): FATTO e provato dall'utente. Scritture catturate con M HUB (PROTOCOL.md 10.14-10.18): 0x11 0x42 (LOD, ripple, angle snapping, motion sync, rotate), 0x11 0x43 (debounce 1..20), 0x11 0x0A (sleep 1..63, never sleep = flag 0). Limiti debounce e sleep DEDOTTI, non letti. La modalita' Performance/Gaming/Extreme NON si scrive (legata a 0x11 0x02, escluso) e non e' piu' mostrata. Polling spostato dalla scheda DPI alla Performance. Registratore di catture: `l7pro/scripts/capture-mhub.js` (da incollare nella Console di Chrome su M HUB).
- Ancora da fare, ognuno dopo una cattura reale: macro (0x12 0x55, 0x12 0x53; scheda Macros: "Not available yet"), DPI -/cambio profilo/Shortcut da tasto, X/Y separate dei DPI (serve Y diverso), profili sul PC (fino a 27) e import/export, installer e prova dell'avvio con Windows, Linux (udev, Wayland, tray su GNOME). Vedi `docs/superpowers/inventory-mhub.md`.
- Messi da parte (non bloccano): passaggio per "sleep" prima di "assente" allo scollegamento, tre letture ogni 3 s da alleggerire, accessibilita' del pulsante x nelle righe DPI.

## Come lavorare qui

Il flusso usato finora: brainstorming (domande una alla volta, bozzetti nel browser quando serve), documento di progetto approvato dall'utente, piano a task con test (TDD: test rosso, implementazione, verde, controllo con una mutazione quando il test passa subito), esecuzione inline task per task con un ledger, prove sul mouse reale con l'utente, revisione finale mia (niente sottoagenti senza richiesta dell'utente). Prima di riprendere: leggere il ledger dell'ultimo piano e `docs/superpowers/inventory-mhub.md`. La memoria persistente di Claude e' in `C:\Users\HanReal\.claude\projects\e--DOWNLOADS-myL7PRO\memory\`.

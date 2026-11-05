# Inventario delle funzioni di M HUB per il L7 Pro

Data: 2026-11-04. Fonte: lettura del bundle `work/main.pretty.js` (solo lettura, codice non fidato), PROTOCOL.md e prove sul mouse reale.
Stato: `fatto` = implementato e provato sul mouse reale nell'app; `verificato` = comando visto in una cattura reale ma non ancora nell'app; `da catturare` = struttura nota dal codice ma mai vista sul mouse, serve una cattura prima di scrivere; `escluso` = non si implementa per regola di sicurezza; `da chiedere` = serve la tua decisione.

Un'app e' "finita" (obiettivo 1 del progetto) quando ogni riga e' `fatto` o `escluso`.

## Funzioni del mouse

| Funzione | Comando | Stato | Sotto-progetto |
|---|---|---|---|
| Stato mouse (profilo, DPI, polling, sensore, debounce, sleep) | 0x12 0x67 | fatto (lettura) | 1 |
| Batteria e stato di carica | 0x11 0x06 | fatto | 1 |
| Versione firmware mouse e ricevitore | 0x11 0x04 | fatto | 1 |
| Info ricevitore (PID, collegato) | 0x11 0x03 | fatto | 1 |
| Cambio profilo del mouse (3 slot) | 0x11 0x58 | fatto | 1 |
| Nomi dei profili (lettura) | 0x12 0x68 | fatto | 1 |
| Livelli DPI: valore di ogni livello | 0x12 0x40 | fatto | 1 |
| Livelli DPI: numero di livelli in uso, aggiungi e togli | 0x12 0x40 | fatto | 1 |
| X/Y separate settings (DPI asse Y separato dall'asse X) | 0x12 0x40 (campo Y, gia' letto) | da catturare: serve una scrittura con Y diverso da X (M HUB lo ha, interruttore spento di default) | 3 |
| Restore defaults dei DPI | 0x12 0x40 | fatto (2026-11-05): 400, 800, 1600, 3200, 6400, 26000 con 6 livelli in uso, valori catturati da M HUB | 3 |
| Pallino colorato accanto a ogni livello DPI (rosso sul livello 1) | non chiaro | da capire: colore del led del livello o solo grafica | 8 |
| Selettore "Number of Levels" da 1 a 6 | 0x12 0x40 | fatto (da noi con Add level e x su ogni livello) | 1 |
| Livello DPI attivo (quale dei livelli e' selezionato) | 0x12 0x40 | verificato (non esposto nella UI) | 1 |
| Polling rate | 0x11 0x41 | fatto | 1 |
| Rinomina profilo | 0x12 0x59 | fatto (provato sul mouse reale) | 2 |
| Scheda Others: versioni firmware di mouse e ricevitore | 0x11 0x04 | fatto (sezione About in Settings); la scheda Others non si costruisce | 3 |
| Scheda Others: pulsante firmware "Latest" (aggiornamento) | OTA | escluso | |
| Scheda Others: "Restore factory settings" / Reset | 0x11 0x0B | escluso dalle tue regole di sicurezza; si riconsidera solo se lo decidi tu | |
| LOD (Lift-off Distance): 1 mm o 2 mm | 0x11 0x42 | fatto (3c) | 3 |
| Ripple Control (interruttore) | 0x11 0x42 | fatto (3c) | 3 |
| Angle Snapping (interruttore) | 0x11 0x42 | fatto (3c) | 3 |
| Motion Sync (interruttore) | 0x11 0x42 | fatto (3c) | 3 |
| Mode selection: Performance, Gaming, Extreme | 0x11 0x42 (game mode) | escluso in scrittura (legato a 0x11 0x02); non mostrato | 3 |
| Rotate: angolo del sensore da -30 a +30 gradi | 0x11 0x42 (rotateOpen, rotateVal) | fatto (3c) | 3 |
| Key debounce time, in millisecondi | 0x11 0x43 | fatto (3c), limiti 1..20 dedotti | 4 |
| Sleep Timer in minuti e casella "Never sleep" | 0x11 0x0A | fatto (3c), limiti 1..63 dedotti | 4 |
| Assegnazione dei tasti (5 tasti) | 0x12 0x52 | fatto (3d) per mouse, DPI +/switch, multimediale, Edit, tastiera con modificatori, Disabled, default; protezione del click sinistro. Mancano DPI -, cambio profilo, Shortcut | 5 |
| Nomi dei tasti e delle macro | 0x12 0x63 | da catturare | 5 |
| Macro (scrittura, lettura, nome) | 0x12 0x55, 0x12 0x53, 0x12 0x65, 0x12 0x77 | da catturare | 7 |
| Illuminazione (modalita' semplice e a piu' colori) | 0x11 0x1B, 0x11 0x2B, 0x12 0x2D | escluso: M HUB non ha nessuna scheda luci per il L7 Pro (le schede sono solo Key Config, DPI, Performance, Others); il sotto-progetto 8 cade, salvo che compaia nelle impostazioni | (8 annullato) |

## Funzioni dell'app M HUB (non del mouse)

| Funzione | Stato | Note |
|---|---|---|
| Importa/esporta profilo come JSON | da fare | formato `{nome dispositivo: template}`, sotto-progetto 9 |
| Modelli cloud, account, negozio di configurazioni | escluso | l'app non usa la rete |
| Tracciamento/telemetria | escluso | l'app non invia nulla |
| Aggiornamento firmware (OTA) | escluso | regola di sicurezza |
| Cambio profilo automatico per app | da fare | non esiste in M HUB: sotto-progetto 2 |

## Esclusi per sicurezza (non si implementano mai)

| Comando | Perche' |
|---|---|
| 0x11 0x0B (dati 0x0101 e 0xAA00) | reset di fabbrica di tasti e impostazioni |
| 0x11 0x02 | comando "game" non documentato, il driver lo manda a zero |
| 0x12 0x57 | scrittura del profilo completo: ordine dei nibble non verificato, rischio di alterare i tasti |
| comandi OTA e famiglia 0x4D | firmware e altra famiglia di mouse |

## Dalla schermata reale di M HUB (screenshot dell'utente, scheda Key Config)

Struttura vista:
- Intestazione del mouse: nome, batteria (90%), tipo di collegamento (2.4G), e una voce "Manual" (significato da capire).
- Colonna sinistra: pulsanti Create, Cloud, Import; "Onboard configuration" con i 3 slot del mouse (Default1, TheFinals, Default3), ciascuno con un menu a tre puntini; sotto, "Custom configuration 1/27" con schede Custom e Cloud, un pulsante Batch (cancellazione multipla) e il testo "Drag config above to activate": sono profili salvati sul PC (fino a 27) che si trascinano su uno slot del mouse per attivarli.
- Quattro schede: Key Config, DPI, Performance, Others.
- Key Config: disegno del mouse con i tasti Left button, Right button, Middle button, Advance, Back; pannello a destra con ricerca e categorie System, keyboard, Hotkey, Shortcut; voci Mouse (Left, Right, Middle, Advance, Back, Wheel up, Wheel down) e DPI (DPI +, ...).
- In alto a destra: account, un'icona a forma di maglietta (aspetto o skin, da capire), impostazioni, Download Client.

| Funzione vista nello screenshot | Stato | Sotto-progetto |
|---|---|---|
| Profili salvati sul PC (fino a 27) da trascinare su uno slot del mouse | da chiedere: e' il "profili illimitati" gia' rimandato; M HUB ce l'ha, quindi serve per la parita' | dopo il 2 |
| Menu a tre puntini di ogni profilo (probabilmente rinomina, esporta, elimina) | da catturare | 6 |
| Create, Import (nuovo profilo, importa da file) | da fare | 9 |
| Cloud (profili online di MCHOSE) | escluso (nessuna rete) | |
| Account e icona maglietta | escluso, finche' non e' chiaro cosa fa | |
| Voce "Manual" accanto al 2.4G | da capire | |
| Tasti: ricerca, categorie System, keyboard, Hotkey, Shortcut | da catturare | 5 |
| Schede DPI, Performance, Others | contenuto da vedere | 3, 4 |

## Da completare con te

Visto: scheda Performance (sezioni Performance & Response, Tracking & Calibration, Power & System, Motion Optimization). Vista anche la scheda Others (firmware e reset). Visto anche il tab DPI (Number of Levels 1-6, X/Y separate settings, Restore defaults, slider a marcatori 200/1200/2200/3200/4200/26000 con valore a destra). Restano da vedere, quando arriviamo ai rispettivi sotto-progetti: il menu a tre puntini di un profilo, l'icona delle impostazioni e le schede keyboard, Hotkey e Shortcut del pannello dei tasti (per capire dove stanno le macro).

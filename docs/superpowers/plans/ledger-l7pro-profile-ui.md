# Ledger - plan: docs/superpowers/plans/2026-11-05-l7pro-profile-centric-ui.md

Ruling: nessun repository git; registro = questo file. Esecuzione inline, revisione finale mia (nessun sottoagente senza richiesta dell'utente).
Ruling: per un profilo non attivo le schede non mostrano valori (il mouse espone solo il profilo attivo) - costo: per vedere i DPI di un altro profilo serve Switch.
Pre-flight: Task 1 produce View/barra, Task 2 la consuma (ProfilePage); Task 3 tocca solo testi. Nessun conflitto.
Task 1+2: Ruling: eseguiti insieme (la barra e la pagina profilo si reggono a vicenda: togliere le vecchie schermate a meta' avrebbe rotto la suite) - costo: nessuno. Test scritti prima e visti rossi (46 falliti), poi verdi.
Task 1+2: Ruling: finche' l'utente non sceglie una voce, la pagina segue il profilo attivo del mouse (serve all'avvio, quando i dati arrivano dopo); dopo il primo clic la scelta resta - costo: se il profilo cambia da solo prima del primo clic, la pagina si sposta.
Task 1+2: Ruling: i test "senza mouse: pulsanti DPI disabilitati" del vecchio SensorDpi sono stati sostituiti da "Mouse not connected, nessun controllo" (come da piano, nessun controllo senza mouse) - costo: nessuno.
Task 1+2: Ruling: ComingSoon.tsx eliminato (non piu' usato); Keys e Macros mostrano "Not available yet" dentro la scheda - costo: nessuno.
Task 1+2: nota: un test era instabile (effetto al cambio slot che azzerava il Rename in gara con il primo render): sostituito con key={slot}; 6 esecuzioni di fila verdi.
Task 1+2: complete (tests: npm test -> 175/175; npm run check ok; npm run build ok; screenshot dell'app vera: pagina profilo attivo e non attivo).
Task 3: complete (titolo e testo "Trigger" in Automation.tsx e nella barra; nel tray e in Settings non c'erano testi con la parola Automation; test aggiornati; suite 175/175).
FASE 1: pronta per la prova con l'utente.
FASE 1: provata dall'utente sul mouse reale (barra, Switch, pallino, intestazione, Trigger con le regole): ok.
Task 4: Ruling: la modalita' (Performance/Gaming/Extreme) e' mostrata solo con firmware >= 5.12.4.4 (supportsGameMode), come da PROTOCOL.md 4.1.1 - costo: se la soglia fosse sbagliata, la riga manca o e' sbagliata sui firmware vecchi (il nostro e' 5.12.5.0).
Task 4: tests: npm test -> 185/185; npm run check e build ok; mappa dei bit da PROTOCOL.md 4.1.1 e dal codice di M HUB (ripple 4, line 8, motionSync 16, gameMode 128/192), confermata dall'unico campione reale 0x11. Letto dall'app sul profilo Default: LOD 1 mm, motion sync Off, ripple Off, angle snapping Off, Performance, debounce 8 ms, sleep 3 min. DA CONFRONTARE con M HUB (prova dell'utente).
FASE 2: confrontata dall utente con la scheda Performance di M HUB (profilo Default): tutti i valori coincidono (Performance, LOD 1 mm, debounce 8, sleep 3 min, motion sync/ripple/angle snapping Off). Fase chiusa. Rotate (0 gradi in M HUB) non ancora letto dall app.
Task 5: complete (sezione About in Settings: firmware mouse/ricevitore e batteria, "-" senza mouse; Settings riceve snap; tests 187/187, check e build ok). DA PROVARE dall utente.
FASE 3: provata dall utente (versioni giuste). Sotto-progetto 3a chiuso. CLAUDE.md aggiornato.
Sotto-progetto 3b (parte 1): Restore defaults DPI: valori di fabbrica M HUB catturati dall utente (400,800,1600,3200,6400,26000, 6 livelli in uso), un unico 0x12 0x40 (restoreDpiDefaults, DPI_FACTORY); tests 190/190, check e build ok. Scheda Others non costruita (versioni gia in About, reset di fabbrica escluso). X/Y separate rimandato: serve una cattura con Y diverso. DA PROVARE dall utente.
Restore defaults DPI: provato dall utente sul mouse reale, funziona. Spaziatura tra i pulsanti sistemata (css).

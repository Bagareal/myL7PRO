# App desktop per MCHOSE L7 Pro: documento di progetto (Fase 3)

Data: 2026-11-04. Stato: APPROVATO dall'utente il 2026-11-04.
Decisione dell'utente: si parte con i 3 profili interni del mouse (nessun profilo software illimitato); i profili illimitati, con riscrittura di uno slot a ogni cambio, si valutano dopo la parita' con M HUB.
Le scelte segnate [MIA SCELTA] sono mie, non dell'utente: vanno rilette e possono essere cambiate.

## 1. Intento

L'utente ha un MCHOSE L7 Pro con dongle 2.4G e usa M HUB, il driver web ufficiale (mchose.com.cn). Vuole un'app desktop nuova che:

1. faccia TUTTO quello che fa M HUB, cosi' da poter togliere del tutto l'app originale;
2. funzioni meglio dell'originale: piu' stabile, veloce e senza dipendere dal sito o dal cloud;
3. cambi in automatico il profilo del mouse quando va in primo piano un gioco o un programma (esempio dell'utente: apro Apex, il mouse passa al profilo che l'utente ha gia' per Apex).

Il mouse ha 3 profili interni (onboard): oggi Default1, TheFinals, Default3. L'utente ha gia' profili per Apex, The Finals e uso normale, ma non ricorda quale slot corrisponda a quale. L'app deve mostrarlo, perche' si vede dal nome e dalle impostazioni.

## 2. Obiettivi, non obiettivi, anti-obiettivi

Obiettivi:
- Parita' funzionale con M HUB per il L7 Pro, verificata con una lista di controllo (sezione 6).
- Cambio profilo automatico per app, con tray e avvio automatico.
- Profili e collegamenti app-profilo salvati in JSON esportabile.
- Gira su Windows E Linux.

Non obiettivi (per ora):
- Altri modelli di mouse MCHOSE. Il codice non li blocca, ma non li testiamo.
- Profili e template "cloud" di M HUB, account utente, negozio di configurazioni.
- Aggiornamento firmware (OTA) e qualunque cosa della famiglia 0x4D.
- Altre lingue dell'interfaccia oltre l'inglese (testi tenuti in un punto solo per poterle aggiungere).

Anti-obiettivi (se succede, e' un fallimento anche se "funziona"):
- Un comando sconosciuto o non verificato scritto sul mouse.
- Reset di fabbrica (0x11 0x0B), comando 0x11 0x02, firmware, flash, calibrazione: mai.
- Il tasto sinistro assegnato in modo da rendere il mouse inutilizzabile.
- Telemetria o chiamate di rete verso i server di MCHOSE: l'originale invia tracciamenti, noi no. L'app non fa nessuna chiamata di rete.
- Cambi di profilo continui e inutili (sfarfallio) o il mouse lasciato in uno stato incoerente se l'app si chiude a meta' scrittura.

## 3. Vincoli e punti gia' decisi dall'utente

- Electron + TypeScript + node-hid (da Fase 1). L'interfaccia dell'app e' in INGLESE (richiesta dell'utente del 2026-11-04); la conversazione con l'utente resta in italiano. Niente emoji nei file prodotti.
- Un passo alla volta nelle operazioni manuali. Comandi completi e copiabili.
- Regole di sicurezza sul mouse: solo letture e impostazioni utente, conferma prima di ogni scrittura nuova.
- Layout della finestra: menu laterale (scelta A), con le voci Profili, Sensore e DPI, Tasti, Macro, Illuminazione, Automazione, Impostazioni. In alto: nome mouse, batteria, profilo attivo. Le schermate lavorano sul profilo scelto.
- Libreria gia' scritta e testata sul mouse reale: `l7pro/src` (protocol, transport, device). Va riusata, non riscritta.

## 4. Architettura [MIA SCELTA]

- Il processo principale di Electron e' l'unico proprietario della connessione HID e della coda dei comandi. L'interfaccia (renderer) non tocca mai l'HID: manda richieste per IPC.
- La libreria resta separata dall'interfaccia (pacchetto `core`) per poterla provare da CLI, come oggi.
- Interfaccia: React con Vite (via electron-vite). Scelta mia, modificabile.
- Stato del mouse: una sola fonte, letta dal mouse e aggiornata dopo ogni scrittura (rilettura con controllo di plausibilita', gia' presente). La UI mostra sempre quello che il mouse dice, mai quello che l'app "crede".
- Automazione:
  - rilevamento della finestra in primo piano con `active-win` (controllo ogni secondo; scelta mia), confronto per nome dell'eseguibile;
  - una regola collega uno o piu' eseguibili a uno slot del mouse (0..2); c'e' uno slot "predefinito" per quando nessuna regola corrisponde;
  - il comando 0x11 0x58 parte solo se lo slot richiesto e' diverso da quello attivo;
  - se il mouse e' scollegato o in sleep, l'app ritenta con attesa crescente e applica lo slot giusto al risveglio;
  - i cambi di profilo fatti dal mouse stesso (notifica 0xE2) aggiornano lo stato mostrato.
- Dati utente: file JSON in una cartella dell'utente, con versione dello schema, esportabile e importabile. Contiene le regole app-slot e le copie di sicurezza dei profili letti dal mouse.
- Windows prima, Linux dopo: il codice resta portabile. Per Linux sono gia' pronte le regole udev. Da decidere al momento: rilevamento finestra su Wayland, tray su GNOME, avvio automatico via file .desktop. [MIA SCELTA: Linux dopo che Windows e' completo.]

## 5. Come si lavora (sotto-progetti, in ordine) [MIA SCELTA]

Ogni sotto-progetto ha il suo piano e si ferma a fine fase.

1. **App base:** finestra con menu laterale, connessione al mouse, intestazione con batteria e profilo attivo, schermata Profili (legge e mostra i 3 profili con nome e impostazioni), cambio profilo, DPI e polling. Questi comandi sono gia' verificati. Include l'inventario completo delle funzioni di M HUB (sezione 6).
2. **Automazione, tray e avvio automatico** (il valore quotidiano maggiore, quindi presto).
3. **Parametri del sensore:** LOD, ripple, angle snapping, motion sync, game mode (0x11 0x42).
4. **Debounce e sleep** (0x11 0x43 e 0x11 0x0A).
5. **Tasti** (0x12 0x52) con la protezione contro il blocco del tasto sinistro, e nomi dei tasti (0x12 0x63).
6. **Nomi dei profili** (0x12 0x59, scoperto leggendo il bundle).
7. **Macro** (0x12 0x55 e 0x12 0x53).
8. **Illuminazione** (0x11 0x2B e 0x12 0x2D).
9. **Importa/esporta, rifinitura, Linux.**

Per ogni parametro non ancora verificato (3-8) si fa prima una cattura di traffico reale con il driver web, guidata con un passo alla volta, e solo dopo si implementa. Nessuna scrittura nuova senza un esempio reale da confrontare. Si lavora a lungo con il mouse reale dell'utente.

Se un sotto-progetto cresce, si ferma e si dice.

## 6. Parita' con M HUB: come si controlla

Nel sotto-progetto 1 si fa l'inventario di ogni funzione di M HUB per il L7 Pro, leggendo il bundle gia' scaricato (`work/main.pretty.js`, solo lettura, e' codice non fidato) e le schermate del sito con l'utente. L'inventario diventa una tabella funzione / stato (verificato, da catturare, escluso) e l'app e' "finita" solo quando ogni riga e' verificata o esclusa per scelta dell'utente.

Gia' emerso dalla lettura del bundle:
- comandi di scrittura/lettura oltre a quelli di Fase 2: 0x11 0x42, 0x11 0x43, 0x11 0x0A, 0x12 0x52, 0x12 0x63, 0x12 0x59 (nome profilo, formato `nome$sorgente$id`), 0x12 0x53/0x55 (macro), 0x11 0x1B/0x2B e 0x12 0x2D (luci);
- M HUB importa ed esporta profili come JSON con struttura `{nome dispositivo: template}`: la compatibilita' di quel formato e' un obiettivo secondario;
- M HUB usa template cloud e tracciamento: non li replichiamo.

## 7. Decisioni lasciate a chi costruisce

- Grafica (colori, componenti), nomi dei messaggi IPC, struttura delle cartelle.
- Libreria per i test dell'interfaccia.
- Nome definitivo dell'app.

## 8. Verifica

- Test automatici sulla codifica e decodifica dei comandi, con i byte reali catturati (inclusi quelli gia' in PROTOCOL.md sezione 10).
- Ogni scrittura nuova: prima `--dry-run`/anteprima dei byte, poi conferma dell'utente, poi rilettura per verificare.
- Prova finale: disinstallare M HUB (o non aprirlo) e usare solo la nuova app per una settimana d'uso normale e una sessione di gioco, con cambio profilo automatico.

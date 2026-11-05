# Protocollo HID del MCHOSE L7 Pro (derivato da M HUB web)

AGGIORNAMENTO: la sezione 10 riporta i valori confermati con una cattura reale sul tuo mouse. Dove contraddice le sezioni precedenti (VID, usage page, indici di risposta), prevale la sezione 10.

Stato: Fase 1, ricavato solo dalla lettura statica del bundle `main-B_prkphY.js` (pretty-print in `work/main.pretty.js`). Nessun traffico reale ancora verificato sul tuo mouse. Ogni sezione ha un livello di certezza:

- CERTO: scritto esplicitamente nel codice del driver.
- PROBABILE: dedotto dal codice, coerente, ma da confermare con una cattura.
- INCERTO: ambiguo o contraddittorio nel codice, serve una cattura o una lettura sul mouse reale.

## 1. Famiglia di protocollo

Il driver contiene due protocolli per mouse diversi:

1. Famiglia "nuova" (report 0x4D, comandi a 16 bit tipo 0x0103). Usata da mouse con PID 4116, 4120, 16437 eccetera. Il L7 Pro NON compare in questa famiglia.
2. Famiglia "cz/vecchia" (feature report 0x11 e 0x12, byte invertiti). Il L7 Pro compare nella tabella `mouseDiffConfig$1` (riga 71183 del pretty-print) e usa i comandi `readCommand("0x12 0x67")`, `setCommand("0x11 0x58")` eccetera. Questo documento descrive solo questa famiglia.

Nota: la descrizione del L7 Pro+ (PID 16405) e del L7 Ultra sono nella stessa tabella; hanno comportamento quasi uguale ma non vanno assunti identici.

## 2. Identificazione del dispositivo

Dalla tabella `mouseDiffConfig$1["MCHOSE L7 Pro"]` (CERTO per i numeri, PROBABILE per l'interpretazione):

| Campo | Valore |
|---|---|
| pids | 176 (0x00B0), 4129 (0x1021), 4128 (0x1020) |
| dpiMax | 26000 |
| LOD | 1 mm, 2 mm |
| lista polling con cavo (pids[0]) | 125, 500, 1000, 2000, 4000, 8000 |
| lista polling dongle PID 4129 (pids[1]) | 125, 500, 1000 |
| lista polling dongle PID 4128 (pids[2]) | 125, 500, 1000, 2000, 4000, 8000 |

Interpretazione (PROBABILE): pids[0] e' il PID quando collegato via cavo, 4129 e 4128 sono i PID del dongle 2.4G (versione 1K e 8K). Il codice usa l'indice del PID in `pids` per scegliere quale lista di polling mostrare, e tratta 4129/4128 come "ricevitori" (li esclude quando ci sono due dispositivi con lo stesso nome).

Vendor ID: 14391 = 0x3837 (CERTO per la famiglia MCHOSE nel resto del bundle, PROBABILE per il L7 Pro).

Usage page / interfaccia HID: INCERTO. Per il L7 Pro il bundle non contiene un filtro statico: i filtri vengono dalla configurazione remota `https://cdn.mchose.com.cn/configCenter/custom/cardList.json`, che non ho potuto scaricare (host irraggiungibile da qui). Per i mouse vicini (L7 Pro+, A7 Ultra eccetera) le usage page sono 0xFF81 (65281) e 0xFF8B (65291). Va verificato enumerando le interfacce reali (comando `list` della CLI in Fase 2, oppure `chrome://device-log`).

Un mouse espone piu' interfacce HID (mouse standard, tastiera, vendor). I comandi vanno inviati all'interfaccia vendor che espone i report ID 0x11 e 0x12 come feature report.

## 3. Trasporto

Tutte le comunicazioni di configurazione usano feature report (CERTO).

| Report ID | Dimensione payload (senza report ID) | Uso |
|---|---|---|
| 0x11 | 20 byte | comandi brevi (batteria, versione, impostazioni singole) |
| 0x12 | 64 byte | comandi lunghi (profilo completo, DPI, tasti, macro) |

Dettagli (CERTO salvo dove indicato):

- Ogni byte del payload inviato e' invertito: `byte_su_filo = byte_logico XOR 0xFF`. Il padding finale e' 0xFF (cioe' zero logico).
- Il primo byte logico del payload e' il codice comando (es. 0x58). Il report ID e' fuori dal payload.
- Lettura: si invia un feature report con il codice comando (resto zero logico), poi si legge il feature report con lo stesso report ID. Nella risposta, il byte all'indice 1 e' il comando invertito (usato per verificare che la risposta sia quella attesa) e i dati utili iniziano all'indice 2, anche questi invertiti. Questi indici si riferiscono a `receiveFeatureReport` di WebHID, che non include il report ID. Con hidapi/node-hid il buffer restituito include il report ID in posizione 0, quindi tutti gli indici slittano di 1 (INCERTO finche' non lo verifico sul mouse).
- Il driver riprova la lettura fino a ~6 volte se il byte comando non coincide (le risposte possono arrivare in ritardo o mischiate).
- Dopo una scrittura il mouse manda un input report di conferma (vedi sezione 6). Il driver usa timeout brevi (150-200 ms) e ritrasmette.
- Esiste una coda globale: comandi serializzati, uno alla volta. Va replicata, altrimenti le risposte si mischiano.

Checksum: nessun checksum nella famiglia 0x11/0x12 (CERTO: non c'e' codice di CRC nei percorsi di lettura/scrittura). Il CRC esiste solo nella famiglia wireless di altri dispositivi (tastiere) e non e' usato qui.

## 4. Comandi di lettura

Formato dell'ordine di lettura (logico, prima dell'inversione): `<report> <cmd> 00 00 ...` riempito a lunghezza payload.

### 4.1 Stato completo profilo: 0x12 0x67 (CERTO la struttura, INCERTO alcuni campi)

Payload logico di risposta (dopo l'indice 2, little endian). Offset relativi all'inizio dei dati utili:

| Offset | Campo | Note |
|---|---|---|
| 0 | profileIndex | profilo onboard attivo, 0..2 |
| 1 | gDpiIndex (nibble) + gRateIndex (nibble) | vedi incertezza sotto |
| 2 | usbDpiIndex (nibble) + usbRateIndex (nibble) | vedi incertezza sotto |
| 3 | reserved | |
| 4-5 | dpi0 | uint16 LE, valore DPI diretto (PROBABILE) |
| 6-7 | dpi1 | |
| 8-9 | dpi2 | |
| 10-11 | dpi3 | |
| 12-13 | dpi4 | |
| 14-15 | dpi5 | |
| 16 | dpiSum | numero di livelli DPI attivi, 1..6 |
| 17 | sensor | bitfield, vedi 4.1.1 |
| 18 | keyDebounce | tempo di debounce, unita' INCERTA |
| 19 | sleep | 0 = sleep disabilitato, altrimenti valore (unita' INCERTA, default del driver 3) |
| 20-23 | tasto 1 (sinistro) | 1 byte (tipo e indice nibble) + 3 byte valore |
| 24-27 | tasto 2 | |
| 28-31 | tasto 3 | |
| 32-35 | tasto 4 | |
| 36-39 | tasto 5 | |
| 40-43 | tasto 6 (DPI, se presente) | |
| 44-48 | reserved1..5 | |
| 49 | rotateVal | angle snapping, con segno (valori > 127 trattati come negativi dal driver, `ii > 30 ? ii-256`) |
| 50 | val | usato dal driver come marker (impostato a 255 in scrittura profilo) |
| 51-62 | dpiVal0..5 | uint16 LE, DPI asse Y (se asse Y separato) |

Incertezza sui nibble (INCERTO): nella lettura il parser dichiara `gDpiIndex, gRateIndex, usbDpiIndex, usbRateIndex` come quattro `bit4` consecutivi; nella scrittura completa (0x12 0x57) l'ordine e' `usbRateIndex, usbDpiIndex, gRateIndex, gDpiIndex`. L'ordine dei nibble dentro il byte dipende dalla libreria `binary-parser` (non verificata) e i due ordini sembrano scambiare quale coppia sta nel primo byte. Non scrivo mai questi byte con 0x12 0x57 finche' non li ho verificati leggendo. Significato: "usb" = collegamento con cavo, "g" = senza fili (2.4G) (PROBABILE, il driver usa `gRateIndex` quando `connectMode == 1`).

#### 4.1.1 Campo sensor (PROBABILE, dal codice di lettura)

Bit numerati da 0 (meno significativo):

| Bit | Significato |
|---|---|
| 0-1 | LOD. Per L7 Pro: bit0=1,bit1=0 -> 1 mm; bit0=0,bit1=1 -> 2 mm |
| 2 | ripple control |
| 3 | angle snapping ("line") |
| 4 | motion sync |
| 6-7 | modalita' prestazioni (game mode), solo firmware >= 5.12.4.4 per L7 Pro |

### 4.2 Info dispositivo e batteria: 0x11 0x06 (CERTO struttura)

Risposta (little endian): vid uint16, pid uint16, fwVersion uint32, connectMode (3 bit), connectStatus (1 bit), reserved (4 bit), batteryLevel uint8, chargeStatus uint8.

Dettagli INCERTI: significato numerico di connectMode (il codice tratta 1 = wireless), range di batteryLevel (il driver considera il dato inattendibile se il livello e' 0 o > 100 e mostra "disconnesso"), valori di chargeStatus.

### 4.3 Versione firmware: 0x11 0x04 (CERTO)

Risposta: lunghezza uint8 poi stringa ASCII. L'ordine di lettura e' `11 04 00...` per il mouse e `11 04 AA 00...` per leggere la versione del ricevitore (selezionato dal driver con `changeMouseVersionInfo(2)`). Il valore AA sta nel payload di richiesta, e' un selettore di sola lettura (PROBABILE).

### 4.4 Info ricevitore: 0x11 0x03 (CERTO struttura)

Risposta: bond uint8, vid uint16, pid uint16, connect uint8, game uint8. Serve a sapere il PID del ricevitore collegato (e quindi quale lista di polling usare).

### 4.5 Altre letture

| Comando | Contenuto | Certezza |
|---|---|---|
| 0x12 0x68 NN (NN = 00, 01, 02) | nome del profilo onboard NN: primo byte di intestazione, poi nome UTF-8 con zeri finali. Formato nome del driver: `nome$sorgente$id` | PROBABILE |
| 0x12 0x63 NN | nome di un tasto/macro per il tasto NN: buttonIndex uint8, nameSize uint8, nome | PROBABILE |
| 0x12 0x65 01 00 / 0x12 0x77 01 01 | contenuto macro (testata + 52 o 58 byte di dati) | INCERTO |
| 0x11 0x1B | impostazioni luce: enable, id, useIndependent, brightness, lightSetting, closeTime, speed, openRandomColor, red, green, blue, red2, green2, blue2, changeDirect (tutti uint8) | CERTO struttura, INCERTO valori |

## 5. Comandi di scrittura

Il primo byte logico e' il codice comando. Elenco con classificazione per la nostra libreria.

Legenda classificazione: SICURO = impostazione utente, reversibile, previsto nella CLI; DA CONFERMARE = impostazione utente ma con strutture incerte o rischio di lasciare il mouse inutilizzabile (es. tasto sinistro); ESCLUSO = non lo implemento.

### 5.1 Cambio profilo onboard: 0x11 0x58 (SICURO, CERTO)

Payload logico: `58 PP` con PP = indice profilo 0, 1, 2.

Il driver aspetta ~200 ms dopo il comando e poi rilegge 0x12 0x67 per conoscere DPI e polling del nuovo profilo. E' il comando fondamentale per il cambio profilo automatico.

### 5.2 DPI e livelli: 0x12 0x40 (SICURO dopo conferma, CERTO struttura)

Payload logico (dopo il codice comando 0x40):

| Offset | Campo |
|---|---|
| 1 | usbDpiIndex (livello attivo, 0..5) |
| 2 | gDpiIndex (livello attivo wireless, 0..5) |
| 3 | reserved (0) |
| 4-15 | dpi0..dpi5, uint16 little endian ciascuno |
| 16 | sum (numero livelli attivi) |
| 17 | diff, il driver manda sempre 255 (significato INCERTO) |
| 18-29 | dpiVal0..dpiVal5 uint16 LE (DPI asse Y; se l'asse Y non e' separato il driver ripete gli stessi valori di X) |

Il driver imposta sempre insieme usbDpiIndex e gDpiIndex allo stesso valore (CERTO), poi rilegge 0x12 0x67. Intervallo DPI per L7 Pro: 200..26000 (CERTO, `DPI_SLIDER_MIN$1 = 200`, `dpiMax = 26000`). Il driver non valida altro: la libreria dovra' limitare i valori a questo intervallo.

Esiste anche 0x11 0x40 (versione corta, stessi campi senza asse Y, report 0x11). Non la uso: il driver per L7 Pro usa 0x12 0x40.

### 5.3 Polling rate: 0x11 0x41 (SICURO, CERTO struttura, INCERTO mappatura)

Payload logico: `41 usbRate freeRate`. Il driver manda `{usbRate: idx, freeRate: 0}` se collegato con cavo e `{usbRate: 0, freeRate: idx}` se wireless, dove `idx` e' la posizione del valore scelto nella lista di polling della connessione (sezione 2). Esempio: wireless con dongle 8K, 1000 Hz -> idx 2.

Rischio noto: il driver mostra un avviso per 4000 e 8000 Hz (consumo e carico CPU), ma non sono pericolosi per il mouse.

### 5.4 LOD, ripple, angle snapping, motion sync, game mode, angolo: 0x11 0x42 (DA CONFERMARE)

Payload logico: `42 lod ripple line motionSync reserved reserved2 gameMode rotateOpen rotateVal`.

Valori dedotti dal codice del driver (PROBABILE): per ripple/line/motionSync 1 = on, 2 = off; per gameMode 1, 2, 3 = modalita'; per lod 1 = 1 mm, 2 = 2 mm (L7 Pro); per rotateOpen 1 = attivo, rotateVal = angolo con segno. I campi non passati vengono mandati come zero e si ipotizza che 0 significhi "non cambiare" (INCERTO, il driver manda quasi sempre un solo campo per volta ma aggiunge sempre `lod`). Va verificato con una cattura prima di scriverlo.

### 5.5 Debounce: 0x11 0x43 (DA CONFERMARE)

Payload logico: `43 time`. Unita' e intervallo ammesso INCERTI.

### 5.6 Sleep: 0x11 0x0A (DA CONFERMARE)

Payload logico: `0A sleepStatus sleep`. Il driver manda sleepStatus 1 e sleep = valore scelto per abilitare, sleepStatus 0 e sleep 0 per disabilitare (default quando riabilitato: 3). Unita' INCERTA (minuti o passi di tempo).

### 5.7 Assegnazione tasto singolo: 0x12 0x52 (DA CONFERMARE, rischio)

Payload logico: `52 buttonIndex 00 buttonType valore(3 byte)`.

- buttonIndex: 0 = sinistro, 1 = centrale, 2 = destro, 3 = avanti, 4 = indietro (CERTO, `buttonIndexMap$1`). Un eventuale tasto DPI usa l'indice 5 (PROBABILE).
- buttonType (CERTO dalla tabella del driver): 1 = mouse, 2 = tastiera, 3 = consumer (multimedia), 4 = macro, 5 = DPI, 7 = tasto fuoco, 8 = scorciatoia di sistema, 9 = disabilitato, 10 = cambio profilo onboard.
- valore a 3 byte (big endian, come scritto dal driver):

| Funzione | Tipo | Valore |
|---|---|---|
| tasto sinistro | 1 | 0x010000 |
| tasto destro | 1 | 0x020000 |
| tasto centrale | 1 | 0x040000 |
| avanti | 1 | 0x100000 |
| indietro | 1 | 0x080000 |
| rotella su | 1 | 0x000200 |
| rotella giu | 1 | 0x00FE00 |
| DPI switch / DPI+ / DPI- | 5 | 0x010000 / 0x020000 / 0x030000 |
| disabilita | 9 | 0xFFFFFF |
| profilo onboard 1, 2, 3 | 10 | 0x010000, 0x020000, 0x030000 |
| ciclo profili | 10 | 0x040000 (o 0x040100 quando il driver lo propaga a tutti i profili) |
| tastiera | 2 | 0x00KK00 con KK = usage HID (es. A = 0x000400, Invio = 0x002800). Posizione dei modificatori INCERTA |
| scorciatoie sistema | 8 | copia 0x070106, taglia 0x07011B, incolla 0x070119, luminosita' 0x0C6F00 / 0x0C7000 |

Rischio: assegnare male il tasto sinistro puo' rendere il mouse quasi inutilizzabile. Il driver ufficiale blocca la modifica del tasto sinistro se e' l'unico tasto sinistro rimasto e contiene codice di recupero per questo caso. Se lo implemento, impongo la stessa protezione e non permetto di rimuovere l'ultimo "click sinistro".

### 5.8 Scrittura profilo completo: 0x12 0x57 (ESCLUSO per ora)

Riscrive in un colpo DPI, polling, sleep, debounce, sensor e sei tasti. Siccome l'ordine dei nibble e' INCERTO (sezione 4.1) e un errore puo' alterare i tasti, non lo uso. I profili dell'app verranno applicati con una sequenza di comandi singoli (0x11 0x58, 0x12 0x40, 0x11 0x41, ...) oppure con il solo cambio profilo onboard.

### 5.9 Macro: 0x12 0x55 e 0x12 0x53 (DA CONFERMARE, bassa priorita')

0x12 0x55: scrive i dati della macro in pacchetti da 64 byte (testata `55 buttonIndex moreData offset(2) length trigger condition(2) time(2) count`, poi 52 byte di eventi da 4 byte). Per macro lunghe usa pacchetti di continuazione da 58 byte. 0x12 0x53: scrive il nome della macro. Gli eventi sono quadruple di byte invertiti (tasto giu/su, pausa, mouse, rotella). Struttura completa INCERTA, da verificare con cattura prima di implementare.

### 5.10 Illuminazione: 0x11 0x2B e 0x12 0x2D (DA CONFERMARE)

0x11 0x2B: stessi campi di 0x11 0x1B (enable, id, useIndependent, brightness, lightSetting, closeTime, speed, openRandomColor, rgb, rgb2, changeDirect). 0x12 0x2D: modalita' "indipendente" con molti colori. Valori e intervalli INCERTI.

### 5.11 Comandi ESCLUSI (reset e simili)

| Comando | Perche' |
|---|---|
| 0x11 0x0B con data 0x0101 | reset di tutti i tasti ai valori di fabbrica |
| 0x11 0x0B con data 0xAA00 | reset completo delle impostazioni |
| 0x11 0x02 | comando "game" che il driver manda a zero prima di leggere/scrivere profili (significato INCERTO) |
| qualunque comando di aggiornamento firmware | fuori ambito per regola |
| comandi della famiglia 0x4D (OTA, reset, MagDock) | altra famiglia, fuori ambito |

## 6. Notifiche dal mouse (input report)

Il driver ascolta gli input report del dispositivo e li interpreta cosi' (dati invertiti, PROBABILE):

- Ignora i report con report ID 44 e 45.
- Primo byte logico 0xE2 = notifica di stato. Byte 1 e 2: `00 01` o `01 01` indicano cambio livello DPI (byte 1 distingue cavo e wireless); `01 02` indica che il mouse risulta scollegato/in sleep (quando in wireless). Byte 3 = stato carica (cifre decimali), byte 4 = batteria, byte 5 = nuovo indice DPI, byte 8 con bit 7 alto = cambio profilo onboard.
- Primo byte logico 0xE5 = conferma di un comando; byte 1 = codice del comando confermato.

Tutti gli indici sono ricavati da `slice` su stringhe esadecimali. Vanno confermati con una cattura. Queste notifiche saranno utili per il rilevamento di sleep/risveglio e per capire se il profilo attivo e' cambiato dal mouse stesso.

## 7. Cosa NON ho verificato

1. VID, PID e usage page esatti del tuo L7 Pro e del tuo dongle (sezione 2).
2. Indici reali di `receiveFeatureReport` con hidapi (sezione 3).
3. Ordine dei nibble e dei byte "usb/g" in 0x12 0x67 (sezione 4.1).
4. Unita' di sleep e debounce, intervalli ammessi.
5. Comportamento dei campi a zero in 0x11 0x42.
6. Formato esatto delle notifiche 0xE2 e 0xE5.
7. Macro e illuminazione.
8. Comportamento a mouse in sleep: il driver mostra "disconnesso" e ritenta; non ho ricavato un comando di "wake".

## 8. Come catturare il traffico reale

Il driver ha un logger HID integrato, attivato da `localStorage["__HID__"]`. Stampa ogni feature report inviato e ricevuto e ogni input report (messaggi `[webHID:invio Feature]`, `[webHID:ricezione Feature]`, `[webHID:ricezione Input]`, in cinese nel codice).

Poiche' la tua sostituzione di `HIDDevice.prototype.sendReport` non ha intercettato nulla, e' probabile che il driver giri in un frame con origine diversa (nel bundle c'e' un controllo su `cdn.mchose.com.cn/customPage/prod/index.html`) e che il L7 Pro usi `sendFeatureReport`, non `sendReport`. Il `localStorage` e' per origine, quindi va impostato nel contesto giusto.

Passi esatti (Chrome o Edge):

1. Apri https://www.mchose.com.cn, vai nel driver e collega il mouse (autorizzazione HID gia' data).
2. Premi F12 e vai alla scheda Console.
3. In alto a sinistra della Console c'e' un menu a tendina con scritto `top`. Aprilo e, se vedi una voce con `cdn.mchose.com.cn` o un iframe, selezionala. Se vedi solo `top`, lascia `top`.
4. Incolla ed esegui:

```
localStorage.setItem("__HID__", "true"); location.href
```

   Annota l'indirizzo che stampa: serve a capire in quale origine sei.
5. Ricarica la pagina con F5. Dopo il ricaricamento la Console deve scrivere `[webHID] IO logger installed`. Se non lo scrive, torna al punto 3 e prova l'altro contesto del menu.
6. Nel filtro livelli della Console (accanto al menu) abilita "Verbose", altrimenti i `console.debug` non si vedono.
7. Esegui una azione alla volta, con una pausa di qualche secondo tra una e l'altra, in questo ordine, annotando l'ora di ciascuna:
   a. non toccare nulla: lascia che il driver legga lo stato iniziale;
   b. cambia il profilo onboard 1 -> 2 -> 1 dall'interfaccia;
   c. cambia il livello DPI attivo, poi cambia il valore di un livello (es. 800 -> 1600) e rimettilo com'era;
   d. cambia polling rate (poi rimettilo com'era);
   e. attiva e disattiva ripple, angle snapping, motion sync; cambia LOD e rimettilo;
   f. cambia sleep e debounce e rimettili com'erano;
   g. premi il pulsante DPI fisico sul mouse due volte;
   h. lascia il mouse a riposo finche' non va in sleep, poi muovilo.
8. Nella Console, tasto destro su un messaggio -> "Save as..." salva tutto il log, oppure seleziona e copia. Mandami il testo.
9. Quando hai finito, disattiva il logger con: `localStorage.removeItem("__HID__")`.

Alternativa se il logger non parte: scheda Sources, Ctrl+Shift+F, cerca `sendFeatureReport(`, apri il risultato dentro `main-B_prkphY.js` con pretty-print (pulsante `{}`), clic destro sul numero di riga della chiamata -> "Add logpoint" con l'espressione `"TX", arguments`. Ripeti per `receiveFeatureReport(`.

Non serve toccare i tasti assegnati ne' i profili: le azioni sopra sono tutte reversibili.

## 9. Note per le fasi successive (Windows e Linux)

- Accesso HID: node-hid su Windows non richiede driver. Su Linux serve una regola udev perche' l'utente possa aprire `/dev/hidraw*`. La scrivero' in Fase 2 una volta noti VID/PID reali (il VID 0x3837 e' PROBABILE).
- Il dongle e il mouse via cavo hanno PID diversi (sezione 2): la libreria deve cercare tutti e tre e scegliere l'interfaccia che espone feature report 0x11/0x12.
- Con hidapi il buffer di un feature report include il report ID come primo byte, sia in invio sia in ricezione.

## 10. Verifiche con cattura reale (2026-11-03, L7 Pro via dongle 2.4G)

### 10.1 Identificazione (CERTO, da navigator.hid.getDevices)

| Campo | Valore |
|---|---|
| Vendor ID | 21075 = 0x5253 (NON 0x3837) |
| Product ID dongle | 4128 = 0x1020 (lista polling 8K) |
| Interfaccia 1, collection A | usage page 0xFF0B, usage 260; feature 42,43; input 42,44,45; output 42,45 (non usata per la configurazione) |
| Interfaccia 1, collection B | usage page 0xFF01, usage 1; feature 0x11, 0x12, 0x14; input 0x11, 0x12; output 0x13, 0x14. QUESTA e' l'interfaccia di configurazione |
| Interfaccia 2 | usage page 0x0C (consumer), report 12: ignorare |

Ricevitore (risposta a 0x11 0x03): bond 1, vid 0x5253, pid 0x1020, connect 1, game 0. Firmware mouse 5.12.5.0, firmware ricevitore 5.7.6.0.

### 10.2 Trasporto (CERTO)

- Invio: feature report, payload senza report ID (20 byte per 0x11, 64 per 0x12), byte invertiti XOR 0xFF, padding 0xFF. Con hidapi si antepone il report ID.
- Dopo ogni richiesta, anche di sola lettura, arriva un input report di conferma: Chrome lo riporta con report ID 0x13 (19); dati: 0x1A (cioe' 0xE5 invertito), poi il comando invertito, poi padding. Il resto e' zero.
- Risposta ai comandi di lettura: `receiveFeatureReport(id)` restituisce un buffer che INCLUDE il report ID come primo byte; poi il comando invertito, poi i dati invertiti. Quindi indice 0 = ID, 1 = comando, 2.. = dati, come assumeva il driver.
- Sequenza di lettura osservata: invio richiesta, conferma 0x13, lettura feature report.

### 10.3 Cambio profilo (CERTO)

Invio: report 0x11, payload `a7 fe ff ff ...` = comando 0x58, profilo 1. Per il profilo 0: `a7 ff ff ...`. Conferma `1a a7 ...` e subito una notifica 0xE2. Il driver poi rilegge versione, 0x67 e 0x03.

### 10.4 Letture decodificate (CERTO)

- 0x11 0x04: `11 fb f7 ca d1 ce cd d1 ca d1 cf` -> lunghezza 8, stringa "5.12.5.0". Con selettore `55` (0xAA logico) nel payload di richiesta: "5.7.6.0" (ricevitore).
- 0x12 0x67 (valori decodificati dai due profili letti):
  - byte 0: profilo (1 per TheFinals, 0 per Default1);
  - byte 1 e 2: nibble basso = indice DPI attivo, nibble alto = indice polling. Osservato 0x20/0x30 (profilo 1, indice DPI 0) e 0x22/0x22 (profilo 0, indice DPI 2). Quale dei due byte sia cavo e quale wireless NON e' ancora confermato (serve il test di cambio polling);
  - byte 3 riservato; byte 4-15 sei livelli DPI uint16 little endian (profilo 1: 1600, 800, 1600, 3200, 6400, 26000; profilo 0: 400, 800, 1164, 3200, 6400, 26000);
  - byte 16 numero livelli attivi (1 nel profilo 1, 3 nel profilo 0);
  - byte 17 sensor = 0x11 in entrambi (LOD 1 mm, motion sync attivo);
  - byte 18 debounce (6 e 8), byte 19 sleep (3);
  - byte 20-43 sei tasti da 4 byte: nibble alto = indice tasto 0..5, nibble basso = tipo, poi 3 byte di valore. Tutti a tipo 0 e valore 0 = funzione predefinita (coerente col controllo del driver che si aspetta buttonValue1 == 0);
  - byte 44-49 riservati e rotateVal (0); byte 50 = 0x80; byte 51-62 sei valori DPI Y (uguali a quelli X).
- 0x11 0x03: vedi 10.1.

### 10.5 Notifiche 0xE2 (PROBABILE, due esempi)

Dopo il cambio profilo arriva un input report con dati invertiti `e2 01 01 00 5d ...`. Byte 4 = 0x5D (93, probabile batteria in percentuale), byte 5 = indice DPI attivo (0 per profilo 1, 2 per profilo 0), byte 15 = indice profilo (1, poi 0). Byte 9-14 contengono la stringa ASCII "L7 Pro". Gli altri byte sono da interpretare.

### 10.6 Scrittura DPI 0x12 0x40 (CERTO)

Payload logico di 64 byte: `40 usbDpiIdx gDpiIdx reserved dpi0..dpi5(uint16 LE) sum 0xFF dpiY0..dpiY5(uint16 LE)` poi zero. Osservato: indici 2 e 2, reserved 2 (il driver rimanda il valore letto), livelli 400, 800, 2183, 3200, 6400, 26000, sum 3, valori Y uguali ai X. Dopo la conferma il driver rilegge 0x04, 0x04+AA, 0x67, 0x03.

### 10.7 Scrittura polling 0x11 0x41 (CERTO)

Payload logico `41 usbRate freeRate`. Con dongle: `41 00 01` = 500 Hz, `41 00 02` = 1000 Hz (indice nella lista 125, 500, 1000, 2000, 4000, 8000). Con il mouse in wireless si scrive freeRate e usbRate resta 0.

### 10.8 Byte di 0x67 per cavo e wireless (CERTO, chiude l'incertezza della sezione 4.1)

Byte 1 = cavo (usb): nibble alto indice polling, nibble basso indice DPI. Byte 2 = wireless (g): stessa struttura. Prova: portando il wireless a 500 Hz e' cambiato solo il byte 2 (0xDD -> 0xED invertito, cioe' 0x22 -> 0x12). L'ordine corrisponde alla struttura del comando 0x12 0x57, quindi i nomi del parser di lettura nel driver sono invertiti. Il driver non applica correzioni di indice per questo mouse.

### 10.9 Notifica 0xE2 (PROBABILE, ora con piu' campioni)

Byte logici (dopo l'inversione): 0 = 0xE2; 1 e 2 = 01 01; 4 = batteria (0x5D); 5 = indice DPI attivo; 6 = indice polling della connessione corrente (1 dopo il passaggio a 500 Hz); 7 = numero di livelli DPI attivi; 9-14 = "L7 Pro"; 15 = indice profilo. Arriva dopo un cambio di profilo o di polling effettuato dal driver.

### 10.10 Comando 0x11 0x02

Il driver lo manda subito dopo aver letto lo stato: payload logico `02 00`. Non e' una impostazione utente documentata; la libreria non lo inviera'.

### 10.11 Ancora da catturare

LOD, ripple, angle snapping, motion sync (0x11 0x42), debounce (0x11 0x43), sleep (0x11 0x0A), assegnazione tasti (0x12 0x52), lettura 0x11 0x06 (batteria dedicata). Nessuno serve alla CLI minima della Fase 2 (batteria, DPI, profilo).

### 10.12 Unita' e significato dei parametri di 0x67 (da screenshot di M HUB, 2026-11-04, CERTO)

La scheda Performance di M HUB mostra, per il profilo TheFinals, gli stessi valori letti dal byte 17-19 di 0x67:
- byte 18 (debounce) = 6: "Key debounce time (milliseconds)" = 6, quindi l'unita' e' il millisecondo.
- byte 19 (sleep) = 3: "Sleep Timer (min)" = 3, quindi l'unita' e' il minuto; la casella "Never sleep" corrisponde probabilmente a sleep = 0 (da confermare con una cattura).
- byte 17 (sensor) = 0x11: LOD 1 mm (1mm selezionato) e Motion Sync attivo, Ripple Control e Angle Snapping spenti (bit 4 attivo, bit 2 e 3 spenti, bit 0 attivo).
- Polling nella scheda Performance: 125, 500, 1000, 2000, 4000, 8000 con 2000 selezionato, come indice 3 letto nel byte wireless.
- Mode selection: Performance Mode, Gaming Mode ("faster response for esports"), Extreme Mode (">20K scan rate for peak performance"): sono le tre modalita' del campo gameMode (bit 6-7 del sensore, solo firmware >= 5.12.4.4).
- Rotate: da -30 a +30 gradi (rotateVal, byte 49).
Le scritture (0x11 0x42, 0x43, 0x0A) restano da catturare prima di implementarle.

### 10.13 Rinomina profilo 0x12 0x59 (cattura reale di M HUB, 2026-11-05, CERTO)

Catturata con un registratore su `HIDDevice.prototype.sendFeatureReport` in M HUB (Chrome), rinominando lo slot 2 da Default3 a Default3x e di nuovo a Default3. Due soli feature report, nessun altro traffico:

- Default3x: `12 a6 fd bb 9a 99 9e 8a 93 8b cc 87 ff ...`
- Default3:  `12 a6 fd bb 9a 99 9e 8a 93 8b cc ff ff ...`

Decodifica (XOR 0xFF): report 0x12, comando 0x59, slot (0..2), poi il nome in ASCII in chiaro. Nessun byte di lunghezza e nessun suffisso `$sorgente$id`; il riempimento 0xFF (zero logico) fa da terminatore. Non e' stata catturata nessuna lettura di conferma. Non verificati: lunghezza massima e caratteri non ASCII (la libreria si limita a 16 caratteri ASCII stampabili, senza `$`). Implementato in `buildProfileRename` e `MouseService.renameProfile`.

### 10.14 Scrittura LOD 0x11 0x42 (cattura reale di M HUB, 2026-11-05, CERTO per il solo LOD)

Registratore su `HIDDevice.prototype.sendFeatureReport` (l7pro/scripts/capture-mhub.js), scheda Performance, profilo Default: 2 mm poi 1 mm. Report 0x11 (XOR 0xFF):

- 2 mm: `bd fd ff ff ...` = comando 0x42, primo argomento 0x02, tutti gli altri argomenti 0.
- 1 mm: `bd fe ff ff ...` = comando 0x42, primo argomento 0x01, tutti gli altri 0.

Gli altri parametri del sensore (ripple, angle snapping, motion sync, modalita') sono rimasti invariati: per il LOD "0 = non cambiare" e' confermato. Dopo ogni scrittura M HUB rilegge soltanto (0x11 0x04, 0x11 0x04 0xAA, 0x12 0x67, 0x11 0x03). Alla prima scrittura e' comparso anche un 0x11 0x02 isolato (comando "game", ESCLUSO: non lo mandiamo mai). Da catturare ancora, uno per volta: motion sync, ripple, angle snapping, modalita', rotate, debounce, sleep.

### 10.15 Motion sync, ripple, angle snapping 0x11 0x42 (cattura reale di M HUB, 2026-11-05, CERTO)

Sei scritture consecutive (acceso, spento per ciascuno), ordine: motion sync, ripple, angle snapping. Payload logico dopo XOR: `42 lod ripple line motionSync 0 0 ...`. M HUB manda sempre anche `lod` (qui 1, il valore attuale) e a zero i campi che non cambia.

- Ripple: acceso `42 01 01 00 00`, spento `42 01 02 00 00`.
- Angle snapping (line): acceso `42 01 00 01 00`, spento `42 01 00 02 00`.
- Motion sync: i due campioni sono `42 01 00 00 02` (primo clic) e `42 01 00 00 01` (secondo clic). Sul mouse dell'utente motion sync era GIA' acceso, quindi il primo clic l'ha spento: spento = 2, acceso = 1, come ripple e angle snapping (conferma dell'utente). Resta da riverificare con la rilettura del bit 16 di 0x67 alla prima scrittura dall'app.
- Dopo ogni scrittura M HUB rilegge soltanto (0x04, 0x04 0xAA, 0x67, 0x03).
- Modalita' (Performance/Gaming/Extreme): NON catturata e non la scriviamo (legata al comando "game" 0x11 0x02, escluso). Resta in sola lettura.

### 10.16 Debounce 0x11 0x43 (cattura reale di M HUB, 2026-11-05, CERTO)

Slider "Key debounce time" trascinato da 4 verso 13 e riportato a 4. Report 0x11 (XOR 0xFF): `bc f3`, `bc fa`, `bc fb` = comando 0x43 con un solo argomento: 12, 5, 4 (millisecondi, il valore dello slider; il trascinamento invia solo alcuni valori intermedi). Resto del payload a zero. Dopo ogni scrittura M HUB rilegge soltanto.

### 10.17 Sleep timer 0x11 0x0A (cattura reale di M HUB, 2026-11-05, CERTO per il valore)

Slider "Sleep Timer (min)" trascinato e riportato a 3. Report 0x11 (XOR 0xFF): `f5 fe c0`, `f5 fe fa`, `f5 fe fc` = comando 0x0A, primo argomento 0x01 (fisso nei tre campioni; significato non confermato, forse "sleep attivo"), secondo argomento = minuti: 63, 5, 3. Resto a zero. "Never sleep": da catturare (non assumere che sia 0).

Never sleep (cattura reale, stessa data, CERTO): attivato `f5 ff ff` = comando 0x0A, flag 0, minuti 0; disattivato `f5 fe fc` = flag 1, minuti 3 (il valore dello slider). Quindi il primo argomento e' il flag "sleep attivo" (1 = timer, 0 = never sleep) e con never sleep lo slider va a zero.

### 10.18 Rotate 0x11 0x42 (cattura reale di M HUB, 2026-11-05, CERTO)

Payload logico dopo XOR: `42 lod 0 0 0 0 0 0 rotateOpen rotateVal ...` (indici: lod 1, rotateOpen 8, rotateVal 9; i byte 2..7 a zero, quindi anche gameMode a 0 = invariato). rotateOpen vale 1 anche a 0 gradi. rotateVal e' un intero a 8 bit con segno: 0 = 0 gradi, 0xFF = -1, 0xFE = -2, 0x02 = +2; un clic = 1 grado, intervallo mostrato da M HUB -30..+30. Campioni in ordine: trascinamento a -7 (0xF9; l'utente stimava -6), 0, -1, -2, +2 (quattro clic su + inviati come una sola scrittura), 0. Dopo ogni scrittura M HUB rilegge soltanto.

Riepilogo scritture catturate: LOD (10.14), ripple/angle snapping/motion sync (10.15), debounce (10.16), sleep (10.17), rotate (questa). Regola comune di 0x11 0x42: M HUB manda sempre il LOD attuale e a 0 tutto cio' che non cambia.

### 10.19 Assegnazione tasto 0x12 0x52 (cattura reale di M HUB, 2026-11-05, CERTO per questi due casi)

Tasto Advance (indice 3) assegnato a Mute, poi "Restore defaults". Report 0x12 (XOR 0xFF), payload logico:

- Mute: `52 03 00 03 e2 00 00` = comando 0x52, indice tasto 3, 0, tipo 3 (multimediale), valore `e2 00 00` (usage consumer 0xE2; i tre byte sono scritti nell'ordine e2 00 00, NON come 0x00E200).
- Restore defaults: `52 03 00 00 00 00 00` = indice 3, tipo 0, valore 0 = funzione predefinita (come i tasti letti in 0x67, tipo 0 valore 0). M HUB scrive solo i tasti che differiscono dal predefinito (qui uno solo, nessun 0x57).
- Dopo ogni scrittura M HUB rilegge soltanto 0x04, 0x04 0xAA, 0x67, 0x03.
- Tasti visibili in M HUB per il L7 Pro: Left, Right, Middle, Advance (indice 3), Back (indice 4). Elenco funzioni: Mouse (Left, Right, Middle, Advance, Back, Wheel up, Wheel down), DPI (+, -, switch), Edit (Cut, Copy, Paste), Multimedia (Play/Pause, Mute, Stop, Previous, Next, Volume +/-), tastiera, Hotkey, Shortcut.

Altre assegnazioni catturate sul tasto 3 (Advance), stesso formato `52 idx 00 tipo v1 v2 v3` (CERTO, coincidono con la tabella 5.7 letta byte per byte):

- Back: `52 03 00 01 08 00 00`
- Wheel up: `52 03 00 01 00 02 00`
- DPI +: `52 03 00 05 02 00 00`
- DPI switch: `52 03 00 05 01 00 00`
- Restore defaults: `52 03 00 00 00 00 00`

Ancora da catturare: tastiera (tipo 2, con modificatori), Hotkey, Shortcut (tipo 8), disabilitato (tipo 9), cambio profilo (tipo 10), macro (tipo 4); il tasto sinistro e il destro non si toccano senza la protezione.

Tastiera (tipo 2), tasto 3 (CERTO): A `52 03 00 02 00 04 00`, Invio `52 03 00 02 00 28 00`, F5 `52 03 00 02 00 3e 00`. Valore = `00 KK 00` con KK = usage HID della pagina tastiera; il primo byte (a zero) e' probabilmente dei modificatori, DA CATTURARE con una combinazione (scheda Hotkey).

Modificatori (tipo 2), tasto 3 (CERTO per Ctrl e Shift): Ctrl+C `52 03 00 02 01 06 00`, Ctrl+Shift+Esc `52 03 00 02 03 29 00`. Valore = `MM KK 00`: MM = maschera dei modificatori (Ctrl = 0x01, Shift = 0x02 confermati; Alt = 0x04 e Windows = 0x08 sono PROBABILI dallo standard HID, DA CONFERMARE), KK = usage HID. M HUB offre solo combinazioni predefinite (scheda Hotkey: LWindows+D, Ctrl+Esc, Alt+Tab, Alt+F4, Alt+Esc, ...) e la voce "Disable" in "Others".

Confermati (CERTO, tasto 3): Alt+Tab `52 03 00 02 04 2b 00` (Alt = 0x04), LWindows+D `52 03 00 02 08 07 00` (Windows = 0x08), Disable `52 03 00 09 ff ff ff`. Maschera modificatori completa per ora: Ctrl 01, Shift 02, Alt 04, Windows 08 (i destri 10..80 non catturati).

Multimediale (tipo 3, valore = usage consumer in un byte + `00 00`) e scorciatoie di sistema (tipo 8), tasto 3: Play/Pause `52 03 00 03 cd 00 00`, Volume + `52 03 00 03 e9 00 00`, Next song `52 03 00 03 b5 00 00`, Mute `52 03 00 03 e2 00 00` (CERTO); Copy `52 03 00 08 07 01 06` (CERTO, tipo 8: `07` pagina tastiera, `01` Ctrl, `06` tasto C). PROBABILI (standard HID, non catturati): Volume - ea, Previous b6, Stop b7, Cut `07 01 1b`, Paste `07 01 19`.

Catturati anche (CERTO, tasto 3, 2026-11-05): Left `52 03 00 01 01 00 00`, Right `... 01 02 00 00`, Middle `... 01 04 00 00`, Advance `... 01 10 00 00`, Wheel down `... 01 00 fe 00`, Volume - `... 03 ea 00 00`, Previous `... 03 b6 00 00`, Stop `... 03 b7 00 00`, Cut `... 08 07 01 1b`, Paste `... 08 07 01 19`. Quindi la tabella 5.7 e' confermata per tutte le funzioni Mouse, Multimedia, Edit, tastiera (con Ctrl/Shift/Alt/Windows) e Disable. NON catturati: DPI - (probabile `05 03 00 00`), cambio profilo (tipo 10), Shortcut, luminosita', macro, tasto Hotkey con modificatori destri.
Indici tasto: 0 sinistro, 1 centrale, 2 destro, 3 Advance, 4 Back (da buttonIndexMap del driver, confermati per 3).

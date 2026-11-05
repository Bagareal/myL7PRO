# Sotto-progetto 2: cambio profilo automatico, tray, avvio automatico, rinomina profili

Data: 2026-11-04. Stato: APPROVATO dall'utente il 2026-11-04.
Fa parte di `2026-11-04-l7pro-app-desktop-design.md` (sezioni 4 e 5, punto 2 e punto 6). Le scelte [MIA SCELTA] sono mie, non dell'utente.

## 1. Intento

L'utente gioca (Apex, The Finals) e usa il PC normalmente. Vuole che il mouse cambi da solo profilo quando cambia l'app in primo piano, senza toccare niente. Esempio dell'utente: apro Apex, il mouse passa al profilo di Apex.

## 2. Comportamento deciso dall'utente

- Il profilo segue SEMPRE l'app in primo piano: se esci dal gioco o fai Alt+Tab verso un'altra app, il mouse cambia di nuovo. Risposta esplicita dell'utente: "deve cambiare in continuazione se no non ha senso".
- Il profilo "normale", usato quando l'app in primo piano non ha nessuna regola, e' **Default1** (slot 0). Deve essere configurabile nell'app.
- I profili del mouse si devono poter **rinominare** dall'app.
- L'app resta in esecuzione in background e parte con Windows [dalla richiesta generale: "tray, avvio automatico"].

## 3. Obiettivi, non obiettivi, anti-obiettivi

Obiettivi:
- Schermata **Automation** (voce gia' presente nel menu): profilo normale, elenco di regole "programma -> profilo", pulsante Add app, indicazione di quale regola sta vincendo adesso.
- Cambio profilo affidabile anche con mouse in sleep o scollegato.
- Icona nella barra di sistema, chiusura della finestra che lascia l'app attiva, avvio automatico con Windows.
- Rinomina dei 3 profili.

Non obiettivi (per ora): Linux e Wayland, regole per titolo di finestra o per URL, profili illimitati sul PC (altro sotto-progetto), cattura "premi Start e porta il gioco in primo piano" (scelta B dei bozzetti).

Anti-obiettivi (un fallimento anche se "funziona"):
- Il mouse che cambia profilo a raffica per colpa di finestre di passaggio di Windows (Alt+Tab, barra delle applicazioni, notifiche).
- Un comando di cambio profilo inviato quando il profilo richiesto e' gia' quello attivo.
- Il cambio automatico che resta indietro dopo che il mouse e' tornato dal sonno.
- Una regola che cambia il profilo del mouse mentre l'utente lo ha scelto a mano nell'app e l'app in primo piano non e' cambiata.
- Un nome di profilo scritto con un comando non verificato.

## 4. Come funziona [MIA SCELTA, salvo dove scritto altrimenti]

- **Riconoscimento dell'app:** il nome del programma in primo piano (es. `r5apex.exe`), senza distinguere maiuscole e minuscole. Controllo ogni secondo, con la libreria `active-win` (da verificare che funzioni su Windows 11 e dentro Electron; alternativa: chiamata nativa alle API di Windows).
- **Finestre da ignorare:** la finestra dell'app stessa (L7 Pro) e le finestre senza programma (blocco schermo, UAC) NON cambiano il profilo: il mouse resta com'e'. Altrimenti aprire l'app per configurarla riporterebbe il mouse a Default1.
- **Stabilita':** il programma in primo piano deve restare lo stesso per almeno 500 ms prima di applicare il profilo, per ignorare le finestre di passaggio.
- **Regole:** elenco ordinato; la prima che corrisponde vince; ogni regola ha il nome del programma, un'etichetta leggibile e lo slot (0..2). Se nessuna corrisponde, vale il profilo normale.
- **Applicazione:** solo se lo slot richiesto e' diverso da quello attivo letto dal mouse. Usa `MouseService.setProfile` (gia' serializzato e verificato).
- **Sonno e scollegamento:** l'app ricorda lo slot desiderato; quando il mouse torna `connesso` lo applica se e' diverso.
- **Cambio manuale:** se l'utente cambia profilo dall'app (Profiles), l'automazione non lo annulla finche' non cambia l'app in primo piano. Un cambio fatto dal mouse stesso (tasto del mouse) segue la stessa regola.
- **Aggiungere un'app:** pulsante Add app con due modi: (A) lista dei programmi aperti (nome del programma e titolo della finestra, con ricerca) e (C) scelta di un file `.exe` con la finestra di Windows. Niente campo di testo da riempire a mano.
- **Dati:** file JSON nella cartella dati dell'utente (`app.getPath("userData")`), con numero di versione dello schema: profilo normale, regole. Se il file e' illeggibile, si parte con le impostazioni di fabbrica senza cancellarlo (si salva una copia `.bak`).
- **Tray:** icona con menu (Open, profilo attivo con i tre slot cliccabili, Quit); chiudere la finestra la nasconde; un solo avvio dell'app (gia' presente).
- **Avvio automatico:** casella in Settings, con `app.setLoginItemSettings`, attiva di default solo se l'utente la spunta [MIA SCELTA: spenta di fabbrica]. Si avvia nascosta nel tray.
- **Rinomina dei profili:** comando 0x12 0x59 con payload `59 <slot> <nome ASCII>` e formato del nome `nome$sorgente$id` come letto da 0x12 0x68. Struttura nota solo dal codice di M HUB: NON si scrive finche' non e' catturata dal vivo con M HUB (si rinomina un profilo e lo si rimette com'era) e confrontata byte per byte, come per i DPI.

## 5. Vincoli

- Windows prima; il codice non deve impedire Linux dopo.
- UI in inglese, niente dialoghi di conferma per azioni normali, nessuna chiamata di rete.
- Solo comandi verificati; la rinomina entra solo dopo la cattura.
- Sul mouse dell'utente si prova un passo alla volta, con comandi copiabili.

## 6. Lasciato a chi costruisce

Aspetto della schermata Automation, nomi dei canali IPC, struttura delle cartelle, libreria per l'elenco dei programmi aperti, formato esatto del file delle impostazioni, icona del tray.

## 7. Verifica

- Test automatici: scelta della regola (priorita', maiuscole, nessuna corrispondenza), stabilita' di 500 ms con tempi simulati, nessun comando se lo slot e' gia' attivo, ripresa dopo sonno, nessun annullamento del cambio manuale, file delle impostazioni corrotto.
- Prova reale con l'utente: Default1 -> apre The Finals -> TheFinals -> Alt+Tab su VS Code -> Default1 -> chiude il gioco; mouse in sleep e risveglio; finestra chiusa con l'app nel tray; riavvio di Windows con avvio automatico.
- Rinomina: cattura in M HUB, test sui byte, poi prova con un nome e ripristino.

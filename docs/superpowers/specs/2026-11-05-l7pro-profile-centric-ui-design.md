# Interfaccia centrata sul profilo (sotto-progetto 3a)

Data: 2026-11-05. Approvato a voce dall'utente nella conversazione del 2026-11-05.

## Perche'

Oggi Sensor & DPI, Buttons, Macros agiscono sul profilo attivo ma non dicono quale sia: per saperlo bisogna tornare in Profiles. Le app per mouse normali funzionano al contrario: si sceglie un profilo e dentro ci sono tutti i suoi parametri. Obiettivo: ogni impostazione sta dentro un profilo, e a colpo d'occhio si vede su quale profilo si lavora.

## Vincolo tecnico

Il mouse legge e scrive i parametri solo del profilo attivo (0x12 0x67 non ha un parametro profilo). Per modificare un profilo non attivo il mouse deve prima passare a quel profilo (0x11 0x58, gia' verificato). Nessun comando nuovo.

## Struttura

- **Barra a sinistra:** i tre profili (nomi letti dal mouse) come voci cliccabili, con un pallino sul profilo attivo del mouse; sotto, Trigger e Settings. Spariscono le voci Sensor & DPI, Buttons, Macros, Lighting (Lighting non esiste in M HUB per il L7 Pro).
- **Pagina di un profilo:** intestazione con nome, Rename ed etichetta "Active on mouse" se e' il profilo in uso. Schede: DPI (livelli e slider, polling), Performance (sola lettura: LOD, ripple, angle snapping, motion sync, debounce, sleep), Keys e Macros ("coming soon").
- **Profilo non attivo:** fascia in cima "The mouse is on X. Switch to Y to edit it" con un pulsante Switch (nessun dialogo di conferma, azione reversibile); controlli visibili ma disattivati finche' non si preme. Lo Switch segnala all'automazione un cambio manuale (come oggi `setProfile`). Aprire una pagina non cambia mai il profilo da solo.
- **Trigger:** la schermata oggi chiamata Automation si chiama Trigger nell'interfaccia (barra, titolo, tray, testi). Il codice interno (`automation`, canali IPC) non cambia.
- **Settings:** aggiunge una sezione About con versioni firmware di mouse e ricevitore e batteria (dati globali, non di profilo).

## Fasi

1. Barra, pagina profilo, fascia Switch, DPI e polling spostati dentro la pagina, Rename nell'intestazione, rinomina Automation -> Trigger.
2. Scheda Performance in sola lettura.
3. Sezione About in Settings.
Si ferma a ogni fine fase per la prova con l'utente.

## Non obiettivi

Modificare un profilo senza passare il mouse a quel profilo (richiederebbe copie sul PC e 0x12 0x57, escluso). Scritture di sensore, debounce, sleep, tasti, macro: restano da catturare. Profili sul PC, import/export.

## Decisioni mie (da controllare)

- La voce Lighting sparisce del tutto invece di restare "coming soon".
- Le schede Keys e Macros restano come segnaposto dentro il profilo.
- L'etichetta della barra e' "Trigger" (singolare, come l'ha scritto l'utente).

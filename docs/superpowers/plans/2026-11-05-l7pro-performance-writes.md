# Piano: scheda Performance scrivibile (sotto-progetto 3c)

Base: catture PROTOCOL.md 10.14-10.18. Layout come M HUB (riquadri Performance & Response, Tracking & Calibration, Power & System, Motion Optimization, con descrizioni e quadrante Rotate). Interruttori e LOD scrivono al clic; slider (debounce, sleep, rotate) scrivono al rilascio; niente Apply, niente dialoghi. La modalita' (Performance/Gaming/Extreme) e il polling restano come sono (modalita' sola lettura, polling gia' nella scheda DPI).

- Task 1: protocol.ts: `rotate` in ProfileState (0x67 byte 49, con segno), `buildSensorWrite` (0x11 0x42), `buildDebounceWrite` (0x43, 1..20, dedotto dallo slider), `buildSleepWrite` (0x0A, 1..63 oppure never = flag 0). Test.
- Task 2: MouseService: setSensor, setDebounce, setSleep (+ FakeLink). Test.
- Task 3: IPC (api, preload, main) e finto window.l7.
- Task 4: PerformanceTab scrivibile, layout M HUB. Test e prova dell'utente.

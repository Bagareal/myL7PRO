// Da incollare nella Console di Chrome (F12) sulla pagina di M HUB, PRIMA di fare le azioni.
// Registra solo i feature report inviati al mouse (non legge nulla dal mouse e non scrive nulla da solo).
// Per vedere il risultato: copy(window.__cap.join("\n"))  poi incollare nel messaggio.
(() => {
  window.__cap = [];
  const orig = HIDDevice.prototype.sendFeatureReport;
  HIDDevice.prototype.sendFeatureReport = function (id, data) {
    const bytes = Array.from(new Uint8Array(data.buffer ? data.buffer : data))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const line = new Date().toISOString().slice(11, 23) + " id=" + id + " " + bytes;
    window.__cap.push(line);
    console.log("[cap]", line);
    return orig.apply(this, arguments);
  };
  console.log("[cap] registratore attivo");
})();

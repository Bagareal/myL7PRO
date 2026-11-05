// Paste into the Chrome Console (F12) on the M HUB page, BEFORE doing the actions.
// Records only the feature reports sent to the mouse (it reads nothing from the mouse and writes nothing by itself).
// To see the result: copy(window.__cap.join("\n"))  then paste it into the message.
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

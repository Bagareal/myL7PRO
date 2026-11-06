import { createInterface } from "node:readline/promises";
import { L7Pro } from "./core/device.js";
import { findDevices } from "./core/transport.js";
import { parseNotification, DPI_LEVELS } from "./core/protocol.js";

const HELP = `Usage: npm run l7 -- <command>

Reads:
  list                          configuration interfaces found
  info                          versions, receiver, active profile
  profile get                   active profile and the names of the 3 profiles
  dpi get                       DPI levels of the active profile
  polling get                   wireless and wired polling rate
  battery                       battery (0x11 0x06 read)
  monitor                       prints the raw bytes of the input reports (Ctrl+C to quit)

Writes (ask for confirmation; with --dry-run they only show the bytes):
  profile set <0-2>
  dpi set <level 0-5> <value 200-26000>
  polling set <Hz>
`;

const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function confirm(summary: string, request: Buffer, dryRun: boolean): Promise<boolean> {
  console.log(summary);
  console.log(`Bytes on the wire (report ID + payload): ${hex(request.subarray(0, 12))} ...`);
  if (dryRun) {
    console.log("--dry-run: nothing sent.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Send to the mouse? [y/N] ")).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function printState(s: Awaited<ReturnType<L7Pro["state"]>>, rates: number[]) {
  console.log(`Active profile: ${s.profile}`);
  console.log(
    `Active DPI: level ${s.usbDpiIndex} (wired), ${s.wirelessDpiIndex} (wireless); levels in use: ${s.activeLevels}`,
  );
  s.dpi.forEach((v, i) => {
    const mark = i < s.activeLevels ? "" : " (not in use)";
    console.log(`  level ${i}: ${v}${mark}`);
  });
  console.log(`Wireless polling: ${rates[s.wirelessRateIndex] ?? "?"} Hz (index ${s.wirelessRateIndex})`);
  console.log(`Wired polling: ${rates[s.usbRateIndex] ?? "?"} Hz (index ${s.usbRateIndex})`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [cmd, sub, ...rest] = args.filter((a) => a !== "--dry-run");

  if (!cmd || cmd === "help") return console.log(HELP);

  if (cmd === "list") {
    const found = findDevices();
    if (!found.length) console.log("No device found.");
    for (const d of found) console.log(`PID 0x${d.productId.toString(16)}  ${d.product ?? ""}  ${d.path}`);
    return;
  }

  const mouse = L7Pro.connect();
  try {
    if (cmd === "info") {
      const [mv, rv, ri, st] = [
        await mouse.mouseVersion(),
        await mouse.receiverVersion(),
        await mouse.receiverInfo(),
        await mouse.state(),
      ];
      console.log(`Mouse firmware: ${mv}`);
      console.log(`Receiver firmware: ${rv}`);
      console.log(
        `Receiver: VID 0x${ri.vid.toString(16)} PID 0x${ri.pid.toString(16)} connect ${ri.connect} bond ${ri.bond}`,
      );
      console.log(`Profilo attivo: ${st.profile}`);
    } else if (cmd === "profile" && sub === "get") {
      const st = await mouse.state();
      console.log(`Profilo attivo: ${st.profile}`);
      for (let i = 0; i < 3; i++) console.log(`  ${i}: ${await mouse.profileName(i)}`);
    } else if (cmd === "dpi" && sub === "get") {
      printState(await mouse.state(), mouse.pollingRates());
    } else if (cmd === "polling" && sub === "get") {
      const st = await mouse.state();
      const rates = mouse.pollingRates();
      console.log(`Wireless polling: ${rates[st.wirelessRateIndex] ?? "?"} Hz`);
      console.log(`Wired polling: ${rates[st.usbRateIndex] ?? "?"} Hz`);
      console.log(`Allowed values: ${rates.join(", ")}`);
    } else if (cmd === "battery") {
      const { status, raw } = await mouse.status();
      console.log(`Raw bytes (logical): ${hex(raw)}`);
      console.log(`Battery: ${status.battery}% (charge: ${status.charge}, mode: ${status.connectMode}, connected: ${status.connected})`);
    } else if (cmd === "monitor") {
      mouse.transport.listen?.();
      mouse.transport.onInput((l) => console.log(hex(l)));
      console.log("Input reports (logical bytes). Ctrl+C to quit.");
      await new Promise(() => undefined);
    } else if (cmd === "profile" && sub === "set") {
      const target = Number(rest[0]);
      const req = mouse.buildProfileSwitch(target);
      if (await confirm(`Onboard profile switch -> ${target}`, req, dryRun)) {
        mouse.transport.listen?.();
        const stop = mouse.transport.onInput((l) => {
          const n = parseNotification(l);
          console.log(`Input report: ${hex(l.slice(0, 20))}`);
          if (n) console.log(`  0xE2 notification: battery ${n.battery}%, profile ${n.profile}, DPI index ${n.dpiIndex}`);
        });
        await mouse.transport.send(req);
        await sleep(800);
        stop();
        console.log(`Active profile now: ${(await mouse.state()).profile}`);
      }
    } else if (cmd === "dpi" && sub === "set") {
      const level = Number(rest[0]);
      const value = Number(rest[1]);
      if (!Number.isInteger(level) || level < 0 || level >= DPI_LEVELS) throw new Error("Invalid DPI level (0-5)");
      const st = await mouse.state();
      const next = [...st.dpi];
      next[level] = value;
      const req = mouse.buildDpiWrite(st, next);
      if (await confirm(`Profile ${st.profile}: level ${level} from ${st.dpi[level]} to ${value} DPI`, req, dryRun)) {
        await mouse.transport.send(req);
        await sleep(200);
        printState(await mouse.state(), mouse.pollingRates());
      }
    } else if (cmd === "polling" && sub === "set") {
      const hz = Number(rest[0]);
      const rates = mouse.pollingRates();
      const idx = rates.indexOf(hz);
      if (idx < 0) throw new Error(`Polling not allowed: ${rest[0]} (allowed ${rates.join(", ")})`);
      const wireless = await mouse.isWireless();
      const req = mouse.buildPollingWrite(wireless, idx);
      if (await confirm(`Polling ${wireless ? "wireless" : "wired"} -> ${hz} Hz`, req, dryRun)) {
        await mouse.transport.send(req);
        await sleep(200);
        const st = await mouse.state();
        console.log(`Polling now: ${rates[wireless ? st.wirelessRateIndex : st.usbRateIndex]} Hz`);
      }
    } else {
      console.log(HELP);
    }
  } finally {
    mouse.close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  },
);

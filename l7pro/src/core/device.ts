import {
  DPI_LEVELS,
  DPI_MAX,
  DPI_MIN,
  POLLING_RATES,
  PROFILE_COUNT,
  VENDOR_ID,
  REPORT_LONG,
  REPORT_SHORT,
  buildDpiWrite,
  buildPollingWrite,
  buildProfileSwitch,
  parseDeviceStatus,
  parseProfileName,
  parseProfileState,
  parseReceiverInfo,
  parseVersion,
  type DeviceStatus,
  type ProfileState,
  type ReceiverInfo,
} from "./protocol.js";
import { Transport, findDevices, type HidLink } from "./transport.js";

/** Scarta le risposte vuote o incomplete (arrivano quando il mouse non ha ancora pronto il dato). */
function isPlausibleState(d: number[]): boolean {
  const s = parseProfileState(d);
  return (
    s.profile < PROFILE_COUNT &&
    s.activeLevels >= 1 &&
    s.activeLevels <= DPI_LEVELS &&
    s.dpi.every((v) => v >= DPI_MIN && v <= DPI_MAX) &&
    s.dpiY.every((v) => v >= DPI_MIN && v <= DPI_MAX)
  );
}

export class L7Pro {
  constructor(
    readonly transport: HidLink,
    public productId: number = 0x1020,
  ) {}

  static connect(): L7Pro {
    const found = findDevices();
    if (found.length === 0) throw new Error("Dongle not found (VID 0x5253, interface 0xFF01). Is it plugged in?");
    return new L7Pro(Transport.open(found[0].path), found[0].productId);
  }

  close(): void {
    this.transport.close();
  }

  async mouseVersion(): Promise<string> {
    return parseVersion((await this.transport.read(REPORT_SHORT, 0x04, [], (d) => d[0] > 0 && d[0] < 16)).data);
  }

  async receiverVersion(): Promise<string> {
    return parseVersion((await this.transport.read(REPORT_SHORT, 0x04, [0xaa], (d) => d[0] > 0 && d[0] < 16)).data);
  }

  async receiverInfo(): Promise<ReceiverInfo> {
    return parseReceiverInfo((await this.transport.read(REPORT_SHORT, 0x03, [], (d) => parseReceiverInfo(d).vid === VENDOR_ID)).data);
  }

  /** Lettura 0x11 0x06 (batteria). Restituisce anche i dati grezzi per la verifica. */
  async status(): Promise<{ status: DeviceStatus; raw: number[] }> {
    const { data } = await this.transport.read(REPORT_SHORT, 0x06, [], (d) => parseDeviceStatus(d).vid === VENDOR_ID);
    return { status: parseDeviceStatus(data), raw: data.slice(0, 12) };
  }

  async state(): Promise<ProfileState> {
    return parseProfileState((await this.transport.read(REPORT_LONG, 0x67, [], isPlausibleState)).data);
  }

  async profileName(index: number): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await this.transport.read(REPORT_LONG, 0x68, [index]);
      const name = parseProfileName(data);
      if (data[0] === index && name) return name;
    }
    throw new Error(`Cannot read the name of profile ${index}`);
  }

  pollingRates(): number[] {
    return POLLING_RATES[this.productId] ?? POLLING_RATES[0x1020];
  }

  /** Con il dongle il mouse e' wireless se connect == 1. */
  async isWireless(): Promise<boolean> {
    return (await this.receiverInfo()).connect === 1;
  }

  buildProfileSwitch = buildProfileSwitch;
  buildPollingWrite = buildPollingWrite;
  buildDpiWrite = buildDpiWrite;
}

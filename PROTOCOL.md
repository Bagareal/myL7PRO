# MCHOSE L7 Pro HID protocol (derived from the M HUB web driver)

UPDATE: section 10 lists the values confirmed with a real capture on the actual mouse. Where it contradicts the earlier sections (VID, usage page, answer indexes), section 10 wins.

Origin: sections 1-9 come from static reading of the M HUB driver bundle (`main-B_prkphY.js`, kept locally pretty-printed; it is MCHOSE property and is not distributed). Each statement carries a level of certainty:

- CERTAIN: written explicitly in the driver code, or confirmed by a real capture.
- PROBABLE: deduced from the code, consistent, but to be confirmed with a capture.
- UNCERTAIN: ambiguous or contradictory in the code; needs a capture or a read on the real mouse.

## 1. Protocol family

The driver contains two protocols for different mice:

1. "New" family (report 0x4D, 16-bit commands such as 0x0103). Used by mice with PID 4116, 4120, 16437 and others. The L7 Pro does NOT appear in this family.
2. "cz/old" family (feature reports 0x11 and 0x12, inverted bytes). The L7 Pro appears in the `mouseDiffConfig$1` table and uses commands such as `readCommand("0x12 0x67")` and `setCommand("0x11 0x58")`. This document only describes this family.

Note: the L7 Pro+ (PID 16405) and the L7 Ultra are in the same table; they behave almost the same but must not be assumed identical.

## 2. Device identification

From the `mouseDiffConfig$1["MCHOSE L7 Pro"]` table (CERTAIN for the numbers, PROBABLE for the interpretation):

| Field | Value |
|---|---|
| pids | 176 (0x00B0), 4129 (0x1021), 4128 (0x1020) |
| dpiMax | 26000 |
| LOD | 1 mm, 2 mm |
| polling list when wired (pids[0]) | 125, 500, 1000, 2000, 4000, 8000 |
| polling list, dongle PID 4129 (pids[1]) | 125, 500, 1000 |
| polling list, dongle PID 4128 (pids[2]) | 125, 500, 1000, 2000, 4000, 8000 |

Interpretation (PROBABLE): pids[0] is the PID when wired, 4129 and 4128 are the PIDs of the 2.4G dongle (1K and 8K versions). The driver uses the index of the PID in `pids` to choose which polling list to show, and treats 4129/4128 as "receivers".

The vendor ID, usage page and interface are confirmed in section 10 (vendor ID 0x5253, configuration interface on usage page 0xFF01).

A mouse exposes several HID interfaces (standard mouse, keyboard, vendor). Commands must be sent to the vendor interface that exposes report IDs 0x11 and 0x12 as feature reports.

## 3. Transport

All configuration traffic uses feature reports (CERTAIN).

| Report ID | Payload size (without report ID) | Use |
|---|---|---|
| 0x11 | 20 bytes | short commands (battery, version, single settings) |
| 0x12 | 64 bytes | long commands (full profile, DPI, buttons, macros) |

Details (CERTAIN unless noted):

- Every payload byte that is sent is inverted: `wire_byte = logical_byte XOR 0xFF`. Trailing padding is 0xFF (that is, logical zero).
- The first logical payload byte is the command code (for example 0x58). The report ID is outside the payload.
- Read: send a feature report with the command code (rest logical zero), then read the feature report with the same report ID. In the answer, the byte at index 1 is the inverted command (used to check that the answer is the expected one) and the useful data starts at index 2, also inverted. With hidapi/node-hid the returned buffer includes the report ID at position 0 (confirmed in section 10.2).
- The driver retries the read up to ~6 times if the command byte does not match (answers can arrive late or mixed up).
- After a write the mouse sends a confirmation input report (see section 6). The driver uses short timeouts (150-200 ms) and retransmits.
- A global queue serializes commands, one at a time. It must be replicated, otherwise answers get mixed up.

Checksum: none in the 0x11/0x12 family (CERTAIN: there is no CRC code in the read/write paths). CRC only exists in the wireless family of other devices (keyboards) and is not used here.

## 4. Read commands

Format of a read order (logical, before inversion): `<report> <cmd> 00 00 ...` padded to the payload length.

### 4.1 Full profile state: 0x12 0x67 (CERTAIN structure, some fields UNCERTAIN)

Logical answer payload (after index 2, little endian). Offsets are relative to the start of the useful data:

| Offset | Field | Notes |
|---|---|---|
| 0 | profileIndex | active onboard profile, 0..2 |
| 1 | wired (usb) rate + DPI nibbles | see 10.8 |
| 2 | wireless (g) rate + DPI nibbles | see 10.8 |
| 3 | reserved | |
| 4-5 | dpi0 | uint16 LE, direct DPI value |
| 6-7 | dpi1 | |
| 8-9 | dpi2 | |
| 10-11 | dpi3 | |
| 12-13 | dpi4 | |
| 14-15 | dpi5 | |
| 16 | dpiSum | number of DPI levels in use, 1..6 |
| 17 | sensor | bit field, see 4.1.1 |
| 18 | keyDebounce | debounce time in milliseconds (10.12) |
| 19 | sleep | sleep timer in minutes (10.12); 0 = never sleep |
| 20-23 | button 1 (left) | 1 byte (index nibble and type nibble) + 3 value bytes |
| 24-27 | button 2 | |
| 28-31 | button 3 | |
| 32-35 | button 4 | |
| 36-39 | button 5 | |
| 40-43 | button 6 (DPI, if present) | |
| 44-48 | reserved1..5 | |
| 49 | rotateVal | sensor angle, signed (values > 127 are negative: `ii > 30 ? ii-256`) |
| 50 | val | used by the driver as a marker (set to 255 on full-profile write) |
| 51-62 | dpiVal0..5 | uint16 LE, Y axis DPI (when the Y axis is separate) |

Nibble order caveat (resolved in 10.8): in the read parser the driver declares `gDpiIndex, gRateIndex, usbDpiIndex, usbRateIndex` as four consecutive `bit4`; in the full write (0x12 0x57) the order is `usbRateIndex, usbDpiIndex, gRateIndex, gDpiIndex`. The real mouse follows the write order, so the read parser names in the driver are swapped. Meaning: "usb" = wired, "g" = wireless (2.4G).

#### 4.1.1 Sensor field (PROBABLE, from the read code, confirmed in 10.12 and 10.14-10.18)

Bits are numbered from 0 (least significant):

| Bit | Meaning |
|---|---|
| 0-1 | LOD. For the L7 Pro: bit0=1,bit1=0 -> 1 mm; bit0=0,bit1=1 -> 2 mm |
| 2 | ripple control |
| 3 | angle snapping ("line") |
| 4 | motion sync |
| 6-7 | performance mode (game mode), only firmware >= 5.12.4.4 on the L7 Pro |

### 4.2 Device info and battery: 0x11 0x06 (CERTAIN structure)

Answer (little endian): vid uint16, pid uint16, fwVersion uint32, connectMode (3 bits), connectStatus (1 bit), reserved (4 bits), batteryLevel uint8, chargeStatus uint8.

UNCERTAIN details: numeric meaning of connectMode (the code treats 1 = wireless), range of batteryLevel (the driver considers the value unreliable if the level is 0 or > 100 and shows "disconnected"), values of chargeStatus. The battery value is reported by the mouse as it is; its behavior while charging has not been characterized yet.

### 4.3 Firmware version: 0x11 0x04 (CERTAIN)

Answer: uint8 length, then an ASCII string. The read order is `11 04 00...` for the mouse and `11 04 AA 00...` to read the receiver version (selected by the driver with `changeMouseVersionInfo(2)`). The AA value is in the request payload; it is a read-only selector (PROBABLE).

### 4.4 Receiver info: 0x11 0x03 (CERTAIN structure)

Answer: bond uint8, vid uint16, pid uint16, connect uint8, game uint8. It tells the PID of the connected receiver (and therefore which polling list to use).

### 4.5 Other reads

| Command | Content | Certainty |
|---|---|---|
| 0x12 0x68 NN (NN = 00, 01, 02) | name of onboard profile NN: one header byte, then a UTF-8 name with trailing zeros. Driver name format: `name$source$id` | PROBABLE |
| 0x12 0x63 NN | name of a button/macro for button NN: buttonIndex uint8, nameSize uint8, name | PROBABLE |
| 0x12 0x65 01 00 / 0x12 0x77 01 01 | macro content (header + 52 or 58 data bytes) | UNCERTAIN |
| 0x11 0x1B | light settings: enable, id, useIndependent, brightness, lightSetting, closeTime, speed, openRandomColor, red, green, blue, red2, green2, blue2, changeDirect (all uint8) | CERTAIN structure, UNCERTAIN values |

## 5. Write commands

The first logical byte is the command code. List with the classification for our library.

Classification legend: SAFE = reversible user setting, planned in the CLI; TO CONFIRM = user setting but with uncertain structures or a risk of leaving the mouse unusable (for example the left button); EXCLUDED = not implemented.

### 5.1 Onboard profile switch: 0x11 0x58 (SAFE, CERTAIN)

Logical payload: `58 PP` with PP = profile index 0, 1, 2.

The driver waits ~200 ms after the command and then reads 0x12 0x67 again to learn the DPI and polling of the new profile. This is the key command for automatic profile switching.

### 5.2 DPI and levels: 0x12 0x40 (SAFE after confirmation, CERTAIN structure)

Logical payload (after the command code 0x40):

| Offset | Field |
|---|---|
| 1 | usbDpiIndex (active level, 0..5) |
| 2 | gDpiIndex (wireless active level, 0..5) |
| 3 | reserved (0) |
| 4-15 | dpi0..dpi5, uint16 little endian each |
| 16 | sum (number of levels in use) |
| 17 | diff, the driver always sends 255 (meaning UNCERTAIN) |
| 18-29 | dpiVal0..dpiVal5 uint16 LE (Y axis DPI; if the Y axis is not separate the driver repeats the X values) |

The driver always sets usbDpiIndex and gDpiIndex to the same value (CERTAIN), then reads 0x12 0x67 again. DPI range for the L7 Pro: 200..26000 (CERTAIN, `DPI_SLIDER_MIN$1 = 200`, `dpiMax = 26000`). The driver validates nothing else: the library must clamp values to this range.

A short version 0x11 0x40 also exists (same fields without the Y axis, report 0x11). It is not used: the driver uses 0x12 0x40 for the L7 Pro.

### 5.3 Polling rate: 0x11 0x41 (SAFE, CERTAIN structure)

Logical payload: `41 usbRate freeRate`. The driver sends `{usbRate: idx, freeRate: 0}` when wired and `{usbRate: 0, freeRate: idx}` when wireless, where `idx` is the position of the chosen value in the polling list of the connection (section 2). Example: wireless with the 8K dongle, 1000 Hz -> idx 2.

Known risk: the driver shows a warning for 4000 and 8000 Hz (power use and CPU load), but they are not dangerous for the mouse.

### 5.4 LOD, ripple, angle snapping, motion sync, game mode, angle: 0x11 0x42 (confirmed in 10.14-10.18, except game mode)

Logical payload: `42 lod ripple line motionSync reserved reserved2 gameMode rotateOpen rotateVal`.

Values (confirmed by captures): for ripple/line/motionSync 1 = on, 2 = off; for lod 1 = 1 mm, 2 = 2 mm (L7 Pro); for rotateOpen 1 = active, rotateVal = signed angle. Fields that are not passed are sent as zero, and zero means "do not change". The game mode field is never written by this project.

### 5.5 Debounce: 0x11 0x43 (confirmed in 10.16)

Logical payload: `43 time`, in milliseconds.

### 5.6 Sleep: 0x11 0x0A (confirmed in 10.17)

Logical payload: `0A sleepStatus sleep`. sleepStatus 1 and sleep = minutes to enable; sleepStatus 0 and sleep 0 for never sleep.

### 5.7 Single button assignment: 0x12 0x52 (confirmed in 10.19, risk)

Logical payload: `52 buttonIndex 00 buttonType value(3 bytes)`.

- buttonIndex: 0 = left, 1 = middle, 2 = right, 3 = forward (Advance), 4 = back (CERTAIN, `buttonIndexMap$1`). A DPI button, if present, uses index 5 (PROBABLE).
- buttonType (CERTAIN from the driver table): 1 = mouse, 2 = keyboard, 3 = consumer (multimedia), 4 = macro, 5 = DPI, 7 = fire key, 8 = system shortcut, 9 = disabled, 10 = onboard profile switch.
- 3-byte value (big endian, as written by the driver):

| Function | Type | Value |
|---|---|---|
| left button | 1 | 0x010000 |
| right button | 1 | 0x020000 |
| middle button | 1 | 0x040000 |
| forward | 1 | 0x100000 |
| back | 1 | 0x080000 |
| wheel up | 1 | 0x000200 |
| wheel down | 1 | 0x00FE00 |
| DPI switch / DPI+ / DPI- | 5 | 0x010000 / 0x020000 / 0x030000 |
| disable | 9 | 0xFFFFFF |
| onboard profile 1, 2, 3 | 10 | 0x010000, 0x020000, 0x030000 |
| profile cycle | 10 | 0x040000 (or 0x040100 when the driver propagates it to all profiles) |
| keyboard | 2 | 0xMMKK00 with MM = modifier mask, KK = HID usage (see 10.19) |
| system shortcuts | 8 | copy 0x070106, cut 0x07011B, paste 0x070119, brightness 0x0C6F00 / 0x0C7000 |

Risk: assigning the left button badly can make the mouse almost unusable. The official driver blocks changing the left button when it is the only remaining left button and contains recovery code for this case. This project enforces the same protection and never allows removing the last "left click".

### 5.8 Full profile write: 0x12 0x57 (EXCLUDED)

Rewrites DPI, polling, sleep, debounce, sensor and six buttons in one shot. Because a mistake can alter the buttons, it is not used. Profiles are applied with a sequence of single commands (0x11 0x58, 0x12 0x40, 0x11 0x41, ...) or with the onboard profile switch alone.

### 5.9 Macros: 0x12 0x55 and 0x12 0x53 (TO CONFIRM, low priority)

0x12 0x55: writes the macro data in 64-byte packets (header `55 buttonIndex moreData offset(2) length trigger condition(2) time(2) count`, then 52 bytes of 4-byte events). For long macros it uses 58-byte continuation packets. 0x12 0x53: writes the macro name. Events are quadruples of inverted bytes (key down/up, pause, mouse, wheel). The full structure is UNCERTAIN and must be verified with a capture before implementing.

### 5.10 Lighting: 0x11 0x2B and 0x12 0x2D (not applicable)

0x11 0x2B: same fields as 0x11 0x1B. 0x12 0x2D: "independent" mode with many colors. M HUB has no lighting tab for the L7 Pro, so these are not implemented.

### 5.11 EXCLUDED commands (reset and similar)

| Command | Why |
|---|---|
| 0x11 0x0B with data 0x0101 | resets all buttons to factory values |
| 0x11 0x0B with data 0xAA00 | full settings reset |
| 0x11 0x02 | "game" command that the driver sends as zero before reading/writing profiles (meaning UNCERTAIN) |
| any firmware update command | out of scope by rule |
| commands of the 0x4D family (OTA, reset, MagDock) | another family, out of scope |

## 6. Notifications from the mouse (input reports)

The driver listens to the device input reports and interprets them like this (inverted data, PROBABLE):

- It ignores reports with report ID 44 and 45.
- First logical byte 0xE2 = status notification. Bytes 1 and 2: `00 01` or `01 01` mean a DPI level change (byte 1 tells wired from wireless); `01 02` means the mouse appears unplugged/asleep (when wireless). Byte 3 = charge state (decimal digits), byte 4 = battery, byte 5 = new DPI index, byte 8 with bit 7 high = onboard profile change.
- First logical byte 0xE5 = confirmation of a command; byte 1 = code of the confirmed command.

All indexes come from `slice` on hexadecimal strings and must be confirmed with a capture (see section 10 for the confirmed cases).

## 7. What has not been verified

1. Behavior of the battery value while charging (4.2).
2. Exact format of the 0xE2 and 0xE5 notifications beyond the samples in section 10.
3. Macros.
4. Behavior with the mouse asleep: the driver shows "disconnected" and retries; no "wake" command was found.

## 8. How to capture real traffic

The driver has a built-in HID logger, enabled by `localStorage["__HID__"]`, but the recorder in `l7pro/scripts/capture-mhub.js` is the tool used for the captures in section 10. It wraps `HIDDevice.prototype.sendFeatureReport` and only records the feature reports sent to the mouse (it reads nothing from the mouse and writes nothing by itself).

Steps (Chrome or Edge):

1. Open the M HUB web driver and connect the mouse (HID permission already granted).
2. Press F12 and go to the Console tab.
3. Paste the contents of `capture-mhub.js` BEFORE doing any action.
4. Do one action at a time, with a pause of a few seconds between them, and note what you did.
5. To see the result, run `copy(window.__cap.join("\n"))` and paste it where needed.
6. Decode each report with XOR 0xFF.

All the actions listed (profile switch, DPI level and value, polling, ripple, angle snapping, motion sync, LOD, sleep, debounce) are reversible; restore the original value after each capture.

## 9. Notes for later phases (Windows and Linux)

- HID access: node-hid on Windows needs no driver. On Linux a udev rule is needed so the user can open `/dev/hidraw*` (a draft is in `l7pro/linux/99-mchose-l7pro.rules`, untested).
- The dongle and the wired mouse have different PIDs (section 2): the library must look for all three and choose the interface that exposes feature reports 0x11/0x12.
- With hidapi the buffer of a feature report includes the report ID as the first byte, both when sending and when receiving.

## 10. Verification with real captures (2026-11-03, L7 Pro through the 2.4G dongle)

### 10.1 Identification (CERTAIN, from navigator.hid.getDevices)

| Field | Value |
|---|---|
| Vendor ID | 21075 = 0x5253 (NOT 0x3837) |
| Dongle product ID | 4128 = 0x1020 (8K polling list) |
| Interface 1, collection A | usage page 0xFF0B, usage 260; feature 42,43; input 42,44,45; output 42,45 (not used for configuration) |
| Interface 1, collection B | usage page 0xFF01, usage 1; feature 0x11, 0x12, 0x14; input 0x11, 0x12; output 0x13, 0x14. THIS is the configuration interface |
| Interface 2 | usage page 0x0C (consumer), report 12: ignore |

Receiver (answer to 0x11 0x03): bond 1, vid 0x5253, pid 0x1020, connect 1, game 0. Mouse firmware 5.12.5.0, receiver firmware 5.7.6.0.

### 10.2 Transport (CERTAIN)

- Send: feature report, payload without the report ID (20 bytes for 0x11, 64 for 0x12), bytes inverted XOR 0xFF, padding 0xFF. With hidapi the report ID is prepended.
- After every request, even a read-only one, a confirmation input report arrives: Chrome reports it with report ID 0x13 (19); data: 0x1A (that is 0xE5 inverted), then the inverted command, then padding. The rest is zero.
- Answer to read commands: `receiveFeatureReport(id)` returns a buffer that INCLUDES the report ID as the first byte; then the inverted command, then the inverted data. So index 0 = ID, 1 = command, 2.. = data, as the driver assumed.
- Observed read sequence: send the request, confirmation 0x13, read the feature report.

### 10.3 Profile switch (CERTAIN)

Send: report 0x11, payload `a7 fe ff ff ...` = command 0x58, profile 1. For profile 0: `a7 ff ff ...`. Confirmation `1a a7 ...` and right after, a 0xE2 notification. The driver then reads the version, 0x67 and 0x03 again.

### 10.4 Decoded reads (CERTAIN)

- 0x11 0x04: `11 fb f7 ca d1 ce cd d1 ca d1 cf` -> length 8, string "5.12.5.0". With selector `55` (logical 0xAA) in the request payload: "5.7.6.0" (receiver).
- 0x12 0x67 (values decoded from two profiles that were read):
  - byte 0: profile (1 for the second profile, 0 for the first);
  - bytes 1 and 2: low nibble = active DPI index, high nibble = polling index. Observed 0x20/0x30 (profile 1, DPI index 0) and 0x22/0x22 (profile 0, DPI index 2). Which byte is wired and which is wireless is settled in 10.8;
  - byte 3 reserved; bytes 4-15 six DPI levels uint16 little endian (profile 1: 1600, 800, 1600, 3200, 6400, 26000; profile 0: 400, 800, 1164, 3200, 6400, 26000);
  - byte 16 number of levels in use (1 in profile 1, 3 in profile 0);
  - byte 17 sensor = 0x11 in both (LOD 1 mm, motion sync on);
  - byte 18 debounce (6 and 8), byte 19 sleep (3);
  - bytes 20-43 six buttons of 4 bytes: high nibble = button index 0..5, low nibble = type, then 3 value bytes. All at type 0 and value 0 = default function (consistent with the driver check that expects buttonValue1 == 0);
  - bytes 44-49 reserved and rotateVal (0); byte 50 = 0x80; bytes 51-62 six Y DPI values (equal to the X ones).
- 0x11 0x03: see 10.1.

### 10.5 0xE2 notifications (PROBABLE, two samples)

After a profile switch an input report arrives with inverted data `e2 01 01 00 5d ...`. Byte 4 = 0x5D (93, probably the battery percentage), byte 5 = active DPI index (0 for profile 1, 2 for profile 0), byte 15 = profile index (1, then 0). Bytes 9-14 contain the ASCII string "L7 Pro". The other bytes are still to be interpreted.

### 10.6 DPI write 0x12 0x40 (CERTAIN)

64-byte logical payload: `40 usbDpiIdx gDpiIdx reserved dpi0..dpi5(uint16 LE) sum 0xFF dpiY0..dpiY5(uint16 LE)` then zero. Observed: indexes 2 and 2, reserved 2 (the driver sends back the value that was read), levels 400, 800, 2183, 3200, 6400, 26000, sum 3, Y values equal to X. After the confirmation the driver reads 0x04, 0x04+AA, 0x67, 0x03 again.

### 10.7 Polling write 0x11 0x41 (CERTAIN)

Logical payload `41 usbRate freeRate`. With the dongle: `41 00 01` = 500 Hz, `41 00 02` = 1000 Hz (index in the list 125, 500, 1000, 2000, 4000, 8000). With the mouse wireless, freeRate is written and usbRate stays 0.

### 10.8 Bytes of 0x67 for wired and wireless (CERTAIN, settles the uncertainty of section 4.1)

Byte 1 = wired (usb): high nibble polling index, low nibble DPI index. Byte 2 = wireless (g): same structure. Proof: moving the wireless link to 500 Hz changed only byte 2 (0xDD -> 0xED inverted, that is 0x22 -> 0x12). The order matches the structure of the 0x12 0x57 command, so the read parser names in the driver are swapped. The driver applies no index corrections for this mouse.

### 10.9 0xE2 notification (PROBABLE, now with more samples)

Logical bytes (after inversion): 0 = 0xE2; 1 and 2 = 01 01; 4 = battery (0x5D); 5 = active DPI index; 6 = polling index of the current connection (1 after switching to 500 Hz); 7 = number of DPI levels in use; 9-14 = "L7 Pro"; 15 = profile index. It arrives after a profile or polling change made by the driver.

### 10.10 Command 0x11 0x02

The driver sends it right after reading the state: logical payload `02 00`. It is not a documented user setting; the library never sends it.

### 10.11 Still to capture

Battery behavior while charging (0x11 0x06), macros, DPI -, profile switch from a button, Shortcut.

### 10.12 Units and meaning of the 0x67 parameters (from an M HUB screenshot, 2026-11-04, CERTAIN)

The Performance tab of M HUB shows, for one profile, the same values read from bytes 17-19 of 0x67:
- byte 18 (debounce) = 6: "Key debounce time (milliseconds)" = 6, so the unit is the millisecond.
- byte 19 (sleep) = 3: "Sleep Timer (min)" = 3, so the unit is the minute; the "Never sleep" checkbox corresponds to sleep = 0 (confirmed in 10.17).
- byte 17 (sensor) = 0x11: LOD 1 mm (1mm selected) and Motion Sync on, Ripple Control and Angle Snapping off (bit 4 on, bits 2 and 3 off, bit 0 on).
- Polling in the Performance tab: 125, 500, 1000, 2000, 4000, 8000 with 2000 selected, as index 3 read in the wireless byte.
- Mode selection: Performance Mode, Gaming Mode ("faster response for esports"), Extreme Mode (">20K scan rate for peak performance"): these are the three modes of the gameMode field (bits 6-7 of the sensor, only firmware >= 5.12.4.4).
- Rotate: from -30 to +30 degrees (rotateVal, byte 49).

### 10.13 Profile rename 0x12 0x59 (real M HUB capture, 2026-11-05, CERTAIN)

Captured with a recorder on `HIDDevice.prototype.sendFeatureReport` in M HUB (Chrome), renaming slot 2 from Default3 to Default3x and back to Default3. Only two feature reports, no other traffic:

- Default3x: `12 a6 fd bb 9a 99 9e 8a 93 8b cc 87 ff ...`
- Default3:  `12 a6 fd bb 9a 99 9e 8a 93 8b cc ff ff ...`

Decoding (XOR 0xFF): report 0x12, command 0x59, slot (0..2), then the name in plain ASCII. No length byte and no `$source$id` suffix; the 0xFF padding (logical zero) acts as terminator. No confirmation read was captured. Not verified: maximum length and non-ASCII characters (the library limits itself to 16 printable ASCII characters, without `$`). Implemented in `buildProfileRename` and `MouseService.renameProfile`.

### 10.14 LOD write 0x11 0x42 (real M HUB capture, 2026-11-05, CERTAIN for the LOD only)

Recorder on `HIDDevice.prototype.sendFeatureReport` (l7pro/scripts/capture-mhub.js), Performance tab: 2 mm then 1 mm. Report 0x11 (XOR 0xFF):

- 2 mm: `bd fd ff ff ...` = command 0x42, first argument 0x02, all other arguments 0.
- 1 mm: `bd fe ff ff ...` = command 0x42, first argument 0x01, all others 0.

The other sensor parameters (ripple, angle snapping, motion sync, mode) stayed unchanged: for the LOD "0 = do not change" is confirmed. After each write M HUB only reads back (0x11 0x04, 0x11 0x04 0xAA, 0x12 0x67, 0x11 0x03). On the first write an isolated 0x11 0x02 also appeared (the "game" command, EXCLUDED: never sent).

### 10.15 Motion sync, ripple, angle snapping 0x11 0x42 (real M HUB capture, 2026-11-05, CERTAIN)

Six consecutive writes (on, off for each), order: motion sync, ripple, angle snapping. Logical payload after XOR: `42 lod ripple line motionSync 0 0 ...`. M HUB always also sends `lod` (here 1, the current value) and zero for the fields it does not change.

- Ripple: on `42 01 01 00 00`, off `42 01 02 00 00`.
- Angle snapping (line): on `42 01 00 01 00`, off `42 01 00 02 00`.
- Motion sync: the two samples are `42 01 00 00 02` (first click) and `42 01 00 00 01` (second click). On the tested mouse motion sync was ALREADY on, so the first click turned it off: off = 2, on = 1, like ripple and angle snapping.
- After each write M HUB only reads back (0x04, 0x04 0xAA, 0x67, 0x03).
- Mode (Performance/Gaming/Extreme): NOT captured and not written (tied to the "game" command 0x11 0x02, excluded). It stays read-only.

### 10.16 Debounce 0x11 0x43 (real M HUB capture, 2026-11-05, CERTAIN)

"Key debounce time" slider dragged from 4 toward 13 and back to 4. Report 0x11 (XOR 0xFF): `bc f3`, `bc fa`, `bc fb` = command 0x43 with a single argument: 12, 5, 4 (milliseconds, the slider value; dragging only sends a few intermediate values). The rest of the payload is zero. After each write M HUB only reads back.

### 10.17 Sleep timer 0x11 0x0A (real M HUB capture, 2026-11-05, CERTAIN)

"Sleep Timer (min)" slider dragged and returned to 3. Report 0x11 (XOR 0xFF): `f5 fe c0`, `f5 fe fa`, `f5 fe fc` = command 0x0A, first argument 0x01 (fixed in the three samples), second argument = minutes: 63, 5, 3. The rest is zero.

Never sleep (real capture, same date, CERTAIN): enabled `f5 ff ff` = command 0x0A, flag 0, minutes 0; disabled `f5 fe fc` = flag 1, minutes 3 (the slider value). So the first argument is the "sleep active" flag (1 = timer, 0 = never sleep) and with never sleep the slider goes to zero. The limits 1..63 are inferred from the slider, not read.

### 10.18 Rotate 0x11 0x42 (real M HUB capture, 2026-11-05, CERTAIN)

Logical payload after XOR: `42 lod 0 0 0 0 0 0 rotateOpen rotateVal ...` (indexes: lod 1, rotateOpen 8, rotateVal 9; bytes 2..7 at zero, so gameMode is also 0 = unchanged). rotateOpen is 1 even at 0 degrees. rotateVal is a signed 8-bit integer: 0 = 0 degrees, 0xFF = -1, 0xFE = -2, 0x02 = +2; one click = 1 degree, the range shown by M HUB is -30..+30. Samples in order: drag to -7 (0xF9), 0, -1, -2, +2 (four clicks on + sent as a single write), 0. After each write M HUB only reads back.

Summary of captured writes: LOD (10.14), ripple/angle snapping/motion sync (10.15), debounce (10.16), sleep (10.17), rotate (this one). Common rule of 0x11 0x42: M HUB always sends the current LOD and zero for everything that does not change.

### 10.19 Button assignment 0x12 0x52 (real M HUB capture, 2026-11-05, CERTAIN for these cases)

The Advance button (index 3) assigned to Mute, then "Restore defaults". Report 0x12 (XOR 0xFF), logical payload:

- Mute: `52 03 00 03 e2 00 00` = command 0x52, button index 3, 0, type 3 (multimedia), value `e2 00 00` (consumer usage 0xE2; the three bytes are written in the order e2 00 00, NOT as 0x00E200).
- Restore defaults: `52 03 00 00 00 00 00` = index 3, type 0, value 0 = default function (like the buttons read in 0x67, type 0 value 0). M HUB writes only the buttons that differ from the default (here just one, no 0x57).
- After each write M HUB only reads back 0x04, 0x04 0xAA, 0x67, 0x03.
- Buttons visible in M HUB for the L7 Pro: Left, Right, Middle, Advance (index 3), Back (index 4). Function list: Mouse (Left, Right, Middle, Advance, Back, Wheel up, Wheel down), DPI (+, -, switch), Edit (Cut, Copy, Paste), Multimedia (Play/Pause, Mute, Stop, Previous, Next, Volume +/-), keyboard, Hotkey, Shortcut.

Other assignments captured on button 3 (Advance), same format `52 idx 00 type v1 v2 v3` (CERTAIN, they match table 5.7 byte for byte):

- Back: `52 03 00 01 08 00 00`
- Wheel up: `52 03 00 01 00 02 00`
- DPI +: `52 03 00 05 02 00 00`
- DPI switch: `52 03 00 05 01 00 00`
- Restore defaults: `52 03 00 00 00 00 00`

Keyboard (type 2), button 3 (CERTAIN): A `52 03 00 02 00 04 00`, Enter `52 03 00 02 00 28 00`, F5 `52 03 00 02 00 3e 00`. Value = `00 KK 00` with KK = HID usage of the keyboard page; the first byte is the modifier mask.

Modifiers (type 2), button 3 (CERTAIN for Ctrl and Shift): Ctrl+C `52 03 00 02 01 06 00`, Ctrl+Shift+Esc `52 03 00 02 03 29 00`. Value = `MM KK 00`: MM = modifier mask (Ctrl = 0x01, Shift = 0x02), KK = HID usage. M HUB only offers predefined combinations (Hotkey tab: LWindows+D, Ctrl+Esc, Alt+Tab, Alt+F4, Alt+Esc, ...) and the "Disable" entry in "Others".

Confirmed (CERTAIN, button 3): Alt+Tab `52 03 00 02 04 2b 00` (Alt = 0x04), LWindows+D `52 03 00 02 08 07 00` (Windows = 0x08), Disable `52 03 00 09 ff ff ff`. Full modifier mask for now: Ctrl 01, Shift 02, Alt 04, Windows 08 (the right-hand ones 10..80 not captured).

Multimedia (type 3, value = consumer usage in one byte + `00 00`) and system shortcuts (type 8), button 3: Play/Pause `52 03 00 03 cd 00 00`, Volume + `52 03 00 03 e9 00 00`, Next song `52 03 00 03 b5 00 00`, Mute `52 03 00 03 e2 00 00` (CERTAIN); Copy `52 03 00 08 07 01 06` (CERTAIN, type 8: `07` keyboard page, `01` Ctrl, `06` key C).

Also captured (CERTAIN, button 3, 2026-11-05): Left `52 03 00 01 01 00 00`, Right `... 01 02 00 00`, Middle `... 01 04 00 00`, Advance `... 01 10 00 00`, Wheel down `... 01 00 fe 00`, Volume - `... 03 ea 00 00`, Previous `... 03 b6 00 00`, Stop `... 03 b7 00 00`, Cut `... 08 07 01 1b`, Paste `... 08 07 01 19`. So table 5.7 is confirmed for all Mouse, Multimedia, Edit and keyboard functions (with Ctrl/Shift/Alt/Windows) and Disable. NOT captured: DPI - (probably `05 03 00 00`), profile switch (type 10), Shortcut, brightness, macros, Hotkey with right-hand modifiers.

Button indexes: 0 left, 1 middle, 2 right, 3 Advance, 4 Back (from the driver's buttonIndexMap, confirmed for 3).

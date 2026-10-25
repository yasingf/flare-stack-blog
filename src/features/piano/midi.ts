export type PianoInput = {
  type: "on" | "off" | "pedal" | "reset";
  pitch: number;
  velocity: number;
  channel: number;
};

export function decodeMidi(data: ArrayLike<number>): PianoInput | undefined {
  const command = data[0] & 0xf0,
    channel = data[0] & 15;
  if ((command === 0x90 || command === 0x80) && data.length >= 3)
    return {
      type: command === 0x90 && data[2] > 0 ? "on" : "off",
      pitch: data[1],
      velocity: data[2] / 127,
      channel,
    };
  if (command === 0xb0 && data.length >= 3 && data[1] === 64)
    return {
      type: "pedal",
      pitch: 0,
      velocity: data[2] >= 64 ? 1 : 0,
      channel,
    };
  if (command === 0xb0 && [120, 123].includes(data[1]))
    return { type: "reset", pitch: 0, velocity: 0, channel };
  return undefined;
}

// BLE MIDI packets contain a header and timestamps in addition to MIDI bytes.
// Running status is valid within a packet, but not carried across packets.
export function decodeBleMidi(data: DataView): PianoInput[] {
  const events: PianoInput[] = [];
  if (data.byteLength < 3 || !(data.getUint8(0) & 0x80)) return events;
  let i = 1,
    status = 0;
  while (i < data.byteLength) {
    if (data.getUint8(i) & 0x80) i++; // timestamp low
    if (i >= data.byteLength) break;
    const first = data.getUint8(i);
    // System real-time events do not cancel channel running status.
    if (first >= 0xf8) {
      i++;
      continue;
    }
    if (first & 0x80) {
      status = first;
      i++;
    }
    if (status >= 0xf0) {
      status = 0;
      while (i < data.byteLength && data.getUint8(i) < 0x80) i++;
      continue;
    }
    if (!status) break;
    const length = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
    if (i + length > data.byteLength) break;
    const bytes = [status];
    for (let n = 0; n < length; n++) bytes.push(data.getUint8(i++));
    if (bytes.slice(1).some((v) => v >= 0x80)) {
      status = 0;
      continue;
    }
    const event = decodeMidi(bytes);
    if (event) events.push(event);
  }
  return events;
}

type MidiPort = EventTarget & {
  id: string;
  name?: string;
  state: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
  close(): Promise<void>;
};
type MidiAccess = EventTarget & {
  inputs: Map<string, MidiPort>;
  onstatechange: (() => void) | null;
};
type BleCharacteristic = EventTarget & {
  value?: DataView;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
};
type BleDevice = EventTarget & {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{
        getCharacteristic(uuid: string): Promise<BleCharacteristic>;
      }>;
    }>;
    disconnect(): void;
  };
};
const BLE_SERVICE = "03b80e5a-ede8-4b33-a751-6ce34ec4c700";
const BLE_CHARACTERISTIC = "7772e5db-3868-4112-a1a9-f2669d106bf3";

export class MidiConnection {
  private access?: MidiAccess;
  private selected?: MidiPort;
  private ble?: BleDevice;
  private characteristic?: BleCharacteristic;
  private notify?: EventListener;
  private bleDisconnect?: EventListener;
  constructor(
    private onInput: (event: PianoInput) => void,
    private onDevices: (devices: { id: string; name: string }[]) => void,
    private onStatus: (status: string) => void,
  ) {}
  async connectUsb() {
    await this.disconnectBle();
    const nav = navigator as unknown as {
      requestMIDIAccess?: (options: { sysex: boolean }) => Promise<MidiAccess>;
    };
    if (!nav.requestMIDIAccess)
      throw new Error(
        "此浏览器不支持 Web MIDI。请用桌面版 Chrome / Edge；蓝牙设备也可先在系统 MIDI 设置中配对。",
      );
    this.access ??= await nav.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.refresh();
    this.refresh();
    const first = [...this.access.inputs.values()].find(
      (p) => p.state === "connected",
    );
    if (first) this.select(first.id);
    else
      this.onStatus(
        "未发现 MIDI 输入，请连接 USB 钢琴，或先在系统中连接蓝牙 MIDI。",
      );
  }
  private refresh() {
    const devices = [...(this.access?.inputs.values() || [])]
      .filter((p) => p.state === "connected")
      .map((p) => ({ id: p.id, name: p.name || "MIDI 键盘" }));
    this.onDevices(devices);
    if (this.selected?.state === "disconnected") {
      this.selected.onmidimessage = null;
      this.selected = undefined;
      this.onInput({ type: "reset", pitch: 0, velocity: 0, channel: 0 });
      this.onStatus("MIDI 设备已断开，练习已暂停。");
    }
  }
  select(id: string) {
    void this.disconnectBle();
    if (this.selected) this.selected.onmidimessage = null;
    this.onInput({ type: "reset", pitch: 0, velocity: 0, channel: 0 });
    this.selected = this.access?.inputs.get(id);
    if (this.selected) {
      this.selected.onmidimessage = (event) => {
        const input = decodeMidi(event.data);
        if (input) this.onInput(input);
      };
      this.onStatus(`已连接 · ${this.selected.name || "MIDI 键盘"}`);
    }
  }
  async connectBluetooth() {
    const nav = navigator as unknown as {
      bluetooth?: { requestDevice(options: unknown): Promise<BleDevice> };
    };
    if (!nav.bluetooth)
      throw new Error(
        "此浏览器不支持直接连接蓝牙。请先在系统 MIDI 设置中配对，然后点击“USB / 系统 MIDI”。macOS 可使用“音频 MIDI 设置 → MIDI 工作室 → 配置蓝牙”。",
      );
    await this.disconnectBle();
    this.ble = await nav.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE] }],
    });
    const server = await this.ble.gatt?.connect();
    if (!server) throw new Error("蓝牙 MIDI 连接失败。");
    const service = await server.getPrimaryService(BLE_SERVICE);
    this.characteristic = await service.getCharacteristic(BLE_CHARACTERISTIC);
    this.notify = () => {
      if (this.characteristic?.value)
        for (const event of decodeBleMidi(this.characteristic.value))
          this.onInput(event);
    };
    this.characteristic.addEventListener(
      "characteristicvaluechanged",
      this.notify,
    );
    await this.characteristic.startNotifications();
    this.bleDisconnect = () => {
      this.onInput({ type: "reset", pitch: 0, velocity: 0, channel: 0 });
      this.onStatus("蓝牙 MIDI 已断开，练习已暂停。");
    };
    this.ble.addEventListener("gattserverdisconnected", this.bleDisconnect);
    if (this.selected) {
      this.selected.onmidimessage = null;
      this.selected = undefined;
    }
    this.onStatus(`蓝牙已连接 · ${this.ble.name || "MIDI 键盘"}`);
  }
  private async disconnectBle() {
    if (this.notify)
      this.characteristic?.removeEventListener(
        "characteristicvaluechanged",
        this.notify,
      );
    if (this.bleDisconnect)
      this.ble?.removeEventListener(
        "gattserverdisconnected",
        this.bleDisconnect,
      );
    try {
      await this.characteristic?.stopNotifications();
    } catch {
      /* Disconnected device. */
    }
    this.ble?.gatt?.disconnect();
    this.ble = undefined;
    this.characteristic = undefined;
  }
  async disconnect() {
    if (this.access) this.access.onstatechange = null;
    if (this.selected) {
      this.selected.onmidimessage = null;
      await this.selected.close();
    }
    this.selected = undefined;
    await this.disconnectBle();
    this.onInput({ type: "reset", pitch: 0, velocity: 0, channel: 0 });
    this.onStatus("未连接 MIDI");
  }
}

export interface FirmwareDevice {
  Device: string;
  InstalledVersion: string;
}

export interface Firmwares {
  Firmware: Record<string, FirmwareDevice>;
}

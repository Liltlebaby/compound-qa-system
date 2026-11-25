/** Flexible records at the existing API boundary; feature props are declared explicitly. */
export type DataRecord = Record<string, any>;
export type AppView = 'dashboard' | 'stations' | 'reports' | 'alarms' | 'qr' | 'settings';
export interface Scope {
  factory: string;
  shift: string;
}

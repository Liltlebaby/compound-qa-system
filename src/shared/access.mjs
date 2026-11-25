export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function requireSupervisor(user) {
  if (user?.role !== 'supervisor') throw new ApiError(403, 'เฉพาะหัวหน้างานเท่านั้น');
}
export function requireFactory(user, factory) {
  if (user?.role !== 'supervisor' && !(user?.factories || []).includes(factory))
    throw new ApiError(403, 'คุณไม่มีสิทธิ์โรง ' + factory);
}
export function requireStation(user, station) {
  if (user?.role !== 'supervisor' && !(user?.stations || []).includes(station))
    throw new ApiError(403, 'คุณไม่มีสิทธิ์กรอกจุดตรวจนี้');
}
export function requireStationScope(user, scope, stationId) {
  const pin = user?.stationScope;
  if (!pin) return;
  if (
    scope.factory !== pin.factory ||
    scope.shift !== pin.shift ||
    (scope.line !== undefined && scope.line !== pin.line) ||
    (stationId !== undefined && stationId !== pin.stationId)
  )
    throw new ApiError(403, 'บัญชี QR นี้ใช้ได้เฉพาะโรง กะ ไลน์ และจุดตรวจตามป้ายที่สแกน');
}

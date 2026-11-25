import { randomBytes, createHash, scryptSync } from 'node:crypto';
import { DEFAULT_CONFIG, STATIONS, stationQrScope } from '../shared/domain.mjs';
import { ApiError } from '../shared/access.mjs';
// Scannable station links grant only station access; passwords/admin access aren't embedded in QR.
export async function stationAccount(database, input) {
  let scope;
  try {
    scope = stationQrScope(
      new URLSearchParams({
        factory: input.factory || '',
        shift: input.shift || '',
        line: input.line || '',
        station: input.stationId || '',
      }).toString(),
    );
  } catch {
    throw new ApiError(422, 'QR ไม่ถูกต้อง กรุณาสแกน QR ที่ระบุโรง กะ ไลน์ และจุดตรวจครบถ้วน');
  }
  if (scope.line.length > 100) throw new ApiError(422, 'ไลน์ไม่ถูกต้อง');
  const workspace = await database.prepare('SELECT config FROM workspace WHERE id=1').get();
  if (!workspace)
    throw new ApiError(
      409,
      'ให้หัวหน้าตั้งค่าผู้ดูแลครั้งแรกบนคอมเซิร์ฟเวอร์ก่อน จากนั้น QA สแกน QR ได้โดยไม่ต้องล็อกอิน',
    );
  const saved = JSON.parse(workspace.config),
    plan =
      saved.profiles?.[scope.factory + '|' + scope.shift] ||
      (scope.factory === 'AJ2' && scope.shift === 'กะเช้า' ? saved : DEFAULT_CONFIG);
  const inPlan = plan.line === scope.line && plan.requiredStations.includes(scope.stationId);
  const historical =
    !inPlan &&
    (
      await database
        .prepare('SELECT snapshot FROM rounds WHERE factory=? AND shift=? AND line=?')
        .all(scope.factory, scope.shift, scope.line)
    ).some((r) => JSON.parse(r.snapshot).requiredStations.includes(scope.stationId));
  if (!inPlan && !historical)
    throw new ApiError(403, 'จุดตรวจหรือไลน์ใน QR นี้ไม่ได้อยู่ในแผนที่เปิดใช้งาน');
  const key = createHash('sha256').update(JSON.stringify(scope)).digest('hex').slice(0, 32),
    id = 'station-' + key;
  const existing = await database
    .prepare('SELECT m.active FROM station_accounts a JOIN members m ON m.id=a.id WHERE a.id=?')
    .get(id);
  if (existing) {
    if (!existing.active)
      throw new ApiError(403, 'บัญชีประจำจุดนี้ถูกปิดใช้งาน กรุณาติดต่อหัวหน้า');
    return { id, scope };
  }
  const username = 'qr_' + key,
    email = username + '@station.qa.local',
    salt = randomBytes(16).toString('hex'),
    passwordHash = scryptSync(randomBytes(32), salt, 64).toString('hex');
  const name =
    'QA ' +
    STATIONS.find((s) => s.id === scope.stationId).name +
    ' · ' +
    scope.factory +
    ' · ' +
    scope.shift;
  await database.transaction(async () => {
    const raced = await database
      .prepare('SELECT m.active FROM station_accounts a JOIN members m ON m.id=a.id WHERE a.id=?')
      .get(id);
    if (raced) {
      if (!raced.active) throw new ApiError(403, 'บัญชีประจำจุดนี้ถูกปิดใช้งาน กรุณาติดต่อหัวหน้า');
      return;
    }

    await database
      .prepare('INSERT INTO auth_users VALUES (?,?,?,?,?)')
      .run(id, username, email, salt, passwordHash);
    await database
      .prepare(
        'INSERT INTO members (id,email,name,role,stations,active,factories) VALUES (?,?,?,?,?,1,?)',
      )
      .run(
        id,
        email,
        name,
        'qa',
        JSON.stringify([scope.stationId]),
        JSON.stringify([scope.factory]),
      );
    await database
      .prepare('INSERT INTO station_accounts VALUES (?,?,?,?,?)')
      .run(id, scope.factory, scope.shift, scope.line, scope.stationId);
    await database
      .prepare('INSERT INTO settings_audits VALUES (?,?,?,?,?)')
      .run(
        'create-' + id,
        id,
        new Date().toISOString(),
        'station-account-created',
        JSON.stringify(scope),
      );
  }, ['station:' + id]);
  return { id, scope };
}

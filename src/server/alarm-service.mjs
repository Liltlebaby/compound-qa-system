import { reviewIssues, qaAlarmId, isOvenClosed } from '../shared/domain.mjs';
export async function alarmStatements(db, round, order, station, payload, at, requestId, user) {
  const { results: before } = await db
    .prepare('SELECT * FROM qa_alarms WHERE round_id=? AND order_id=? AND station_id=?')
    .bind(round.id, order.id, station)
    .all();
  const active = reviewIssues(station, payload, round.snapshot, order),
    ids = new Set(active.map((i) => qaAlarmId(round, order, station, i))),
    writes = [];
  const guard = 'EXISTS (SELECT 1 FROM submissions WHERE last_request_id=?)';
  const event = (id, action, note) =>
    db
      .prepare('INSERT INTO qa_alarm_events SELECT ?,?,?,?,?,?,? WHERE ' + guard)
      .bind(
        requestId + ':' + action + ':' + id,
        id,
        at,
        user.id,
        user.name,
        action,
        note,
        requestId,
      );
  for (const issue of active) {
    const id = qaAlarmId(round, order, station, issue),
      details = JSON.stringify(issue),
      prior = before.find((a) => a.id === id),
      changed =
        !prior ||
        (prior.status === 'resolved' && prior.resolution_method !== 'manual') ||
        prior.details !== details;
    const reset = [
      'acknowledged_by',
      'acknowledged_name',
      'acknowledged_at',
      'ack_note',
      'ack_request_id',
      'resolved_at',
      'resolution_method',
      'resolved_by',
      'resolved_name',
      'resolution_note',
      'resolution_request_id',
    ];
    writes.push(
      db
        .prepare(
          'INSERT INTO qa_alarms (id,round_id,order_id,station_id,field_key,kind,severity,status,message,details,first_seen_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ' +
            guard +
            " ON CONFLICT(id) DO UPDATE SET message=excluded.message,details=excluded.details,severity=excluded.severity,updated_at=excluded.updated_at,status=CASE WHEN ?=1 THEN 'open' ELSE qa_alarms.status END," +
            reset.map((k) => k + '=CASE WHEN ?=1 THEN NULL ELSE qa_alarms.' + k + ' END').join(','),
        )
        .bind(
          id,
          round.id,
          order.id,
          station,
          issue.fieldKey,
          issue.kind,
          issue.severity,
          'open',
          issue.message,
          details,
          at,
          at,
          requestId,
          ...Array(1 + reset.length).fill(changed ? 1 : 0),
        ),
    );
    if (changed) writes.push(event(id, prior ? 'reopened' : 'opened', issue.message));
  }
  for (const prior of before.filter((a) => a.status !== 'resolved' && !ids.has(a.id))) {
    const burner = prior.field_key?.split('_')[0];
    const resolution =
      station === 'oven' && isOvenClosed(payload, burner)
        ? 'เตา ' + burner + ' ปิดในรอบนี้ จึงไม่ใช้เกณฑ์ค่าตรวจของเตานี้'
        : 'ส่งค่าตรวจใหม่แล้ว ไม่พบข้อผิดปกตินี้ในรอบเดิม';
    writes.push(
      db
        .prepare(
          "UPDATE qa_alarms SET status='resolved',resolved_at=?,updated_at=?,resolution_method='data',resolved_by=?,resolved_name=?,resolution_note=? WHERE id=? AND " +
            guard,
        )
        .bind(at, at, user.id, user.name, resolution, prior.id, requestId),
    );
    writes.push(event(prior.id, 'resolved', resolution));
  }
  return writes;
}

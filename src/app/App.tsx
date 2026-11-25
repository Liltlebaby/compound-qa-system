import { NAV } from './navigation';
import * as domain from '../shared/domain.mjs';
import type { DataRecord as Obj } from '../shared/types';
import AlarmCenter, { AlarmBanner } from '../features/alarms/AlarmCenter';
import DashboardPage from '../features/dashboard/DashboardPage';
import HistoryModal from '../features/qa/HistoryModal';
import QAForm from '../features/qa/QAForm';
import StationsPage from '../features/qa/StationsPage';
import QRLabels from '../features/qr/QRLabels';
import ReportsPage from '../features/reports/ReportsPage';
import AddOrderModal from '../features/rounds/AddOrderModal';
import BackfillModal from '../features/rounds/BackfillModal';
import HistoryDateModal from '../features/rounds/HistoryDateModal';
import { demoForScope, firstRound } from '../features/rounds/round-state';
import RoundModal from '../features/rounds/RoundModal';
import SettingsPage from '../features/settings/SettingsPage';
import { api, removeLocal } from '../shared/api/client';
import { time } from '../shared/format/time';
import Select from '../shared/ui/Select';
import CompanyLogo from '../shared/ui/CompanyLogo';
import { Badge, Button, Empty, Icon, Notice, PageHeading } from '../shared/ui/ui';
import { useQaWorkspace } from './useQaWorkspace';
const D: any = domain;

export default function App() {
  const {
    followCurrent,
    viewingDateRef,
    viewingDate,
    calendarOpen,
    setCalendarOpen,
    runtime,
    realtimeConnected,
    backfillPoint,
    setBackfillPoint,
    scope,
    scopeRef,
    scanStationId,
    scanScope,
    scanError,
    state,
    demo,
    view,
    selected,
    setSelected,
    setOrderId,
    online,
    queue,
    form,
    setForm,
    toast,
    setToast,
    error,
    loading,
    busy,
    newRound,
    setNewRound,
    addingOrder,
    setAddingOrder,
    history,
    setHistory,
    reportVersion,
    setReportVersion,
    showMore,
    setShowMore,
    authError,
    stateRef,
    notify,
    updateState,
    loadLive,
    switchMode,
    flush,
    displayedDate,
    visibleRounds,
    alarms,
    activeAlarmCount,
    round,
    order,
    entries,
    progress,
    fact,
    supervisor,
    myQueue,
    stationList,
    roundReports,
    report,
    stale,
    closed,
    reportReady,
    warnings,
    oldRound,
    openForm,
    switchScope,
    reviewPending,
    chooseDate,
    loadBackfillDay,
    openBackfill,
    submit,
    mutate,
    acknowledge,
    resolveQaAlarm,
    saveConfig,
    createPeriod,
    addOrderToRound,
    share,
    copyReport,
    nav,
    signInHref,
    heading,
  } = useQaWorkspace();

  if (scanError)
    return (
      <div className="login-page">
        <section className="login-card">
          <h1>กรุณาใช้ QR ชุดใหม่</h1>
          <Notice tone="amber" icon="scan">
            {scanError}
          </Notice>
        </section>
      </div>
    );
  if (loading)
    return (
      <div className="loading-screen">
        <CompanyLogo className="company-logo-large" />
        <h2>COMPOUND QA</h2>
        <p>
          <Icon name="loader" className="spin" /> กำลังเปิดสมุดบันทึก QA
        </p>
      </div>
    );
  return (
    <div
      className={
        'app ' + (view === 'dashboard' ? 'dashboard-app' : view === 'reports' ? 'reports-app' : '')
      }
    >
      <aside className="sidebar">
        <a className="brand" href="/">
          <CompanyLogo />
          <div>
            COMPOUND <b>QA</b>
            <small>สมุดบันทึกประจำจุด</small>
          </div>
        </a>
        <nav aria-label="เมนูหลัก">
          {NAV.filter(([id]) => supervisor || !['settings', 'qr'].includes(id)).map(
            ([id, label]) => (
              <button key={id} className={view === id ? 'active' : ''} onClick={() => nav(id)}>
                <Icon name={id} />
                {label}
                {id === 'alarms' && activeAlarmCount ? (
                  <span className="nav-count alarm-nav-count">{activeAlarmCount}</span>
                ) : null}
                {id === 'stations' && progress && !progress.complete ? (
                  <span className="nav-count">{progress.missing.length}</span>
                ) : null}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="clock" size={16} />
            <span>
              บันทึกทุก 30 นาที
              <br />
              <small>เวลาโรงงาน · กรุงเทพฯ</small>
            </span>
          </div>
          <div className="profile">
            <span className="avatar">
              <Icon name="user" size={22} />
            </span>
            <div>
              <strong>{state?.user.name || 'ยังไม่ได้เข้าสู่ระบบ'}</strong>
              <span>{demo ? 'โหมดสาธิต' : supervisor ? 'หัวหน้างาน' : 'QA ประจำจุด'}</span>
            </div>
          </div>
          {!demo ? (
            <a
              className="logout-link"
              href="/logout"
              target="_top"
              onClick={() => {
                if (!myQueue.length) {
                  removeLocal('last-user');
                  removeLocal('state:' + state?.user.id);
                }
              }}
            >
              <Icon name="logout" size={17} />
              ออกจากระบบ
            </a>
          ) : (
            <Button
              variant="ghost small"
              icon="refresh"
              onClick={() => {
                updateState(demoForScope(scopeRef.current));
                setSelected(
                  scopeRef.current.factory === 'AJ2' && scopeRef.current.shift === 'กะเช้า'
                    ? 'demo-20261029-1000'
                    : '',
                );
                notify('เริ่มข้อมูลตัวอย่างใหม่แล้ว');
              }}
            >
              เริ่มตัวอย่างใหม่
            </Button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="mobile-brand" href="/">
            <CompanyLogo />
            <strong>COMPOUND QA</strong>
          </a>
          <span className="plant-label">
            <span className="live-dot" />
            {scope.factory + ' · ' + (state?.config.line || 'COMPOUND')}
            <span className="topbar-divider" />
            ระบบบันทึกคุณภาพและผลผลิต
          </span>
          <div className="topbar-right">
            <Badge tone={online ? 'green' : 'amber'} icon={online ? 'wifi' : 'offline'}>
              {online ? (!demo && realtimeConnected ? 'เรียลไทม์' : 'ออนไลน์') : 'ออฟไลน์'}
            </Badge>
            <span className="topbar-user">
              <Icon name="user" size={17} />
              {state?.user.name || 'ผู้เยี่ยมชม'}
            </span>
          </div>
        </header>
        <div className={'mode-banner ' + (demo ? 'demo' : 'live')}>
          {demo ? (
            <>
              <div>
                <Icon name="flask" size={17} />
                <span>
                  <strong>ข้อมูลตัวอย่าง</strong>
                  <span className="mode-description">
                    {' '}
                    · ทดลองกรอกและดูรายงานได้ ข้อมูลไม่เข้าสู่หน้างานจริง
                  </span>
                </span>
              </div>
              <button onClick={() => switchMode(false)}>
                เริ่มใช้งานจริง
                <Icon name="arrow" size={16} />
              </button>
            </>
          ) : (
            <>
              <div>
                <Icon name="shield" size={17} />
                <span>พื้นที่บันทึกข้อมูลจริง</span>
              </div>
              <button onClick={() => switchMode(true)}>
                ดูข้อมูลตัวอย่าง
                <Icon name="arrow" size={16} />
              </button>
            </>
          )}
        </div>
        <div className="scope-toolbar">
          {scanScope ? (
            <div className="scan-scope">
              <Icon name="shield" size={18} />
              <strong>
                {scanScope.factory} · {scanScope.shift}
              </strong>
              <small>โรงและกะตาม QR</small>
            </div>
          ) : (
            <>
              <label>
                โรงงาน
                <Select
                  label="โรงงาน"
                  value={scope.factory}
                  onValueChange={(factory) =>
                    switchScope(factory, D.FACTORY_SHIFTS[factory][0].name)
                  }
                  options={D.FACTORIES.filter(
                    (f: string) => !state || supervisor || state.user.factories?.includes(f),
                  ).map((f: string) => ({ value: f, label: f }))}
                />
              </label>
              <label>
                กะ
                <Select
                  label="กะทำงาน"
                  value={scope.shift}
                  onValueChange={(shift) => switchScope(scope.factory, shift)}
                  options={D.FACTORY_SHIFTS[scope.factory].map((s: Obj) => ({
                    value: s.name,
                    label: s.name + ' · ' + s.start + '–' + s.end,
                  }))}
                />
              </label>
            </>
          )}
          {!scanScope && state && ['dashboard', 'stations', 'reports', 'alarms'].includes(view) ? (
            <div className="date-toolbar scope-date-controls">
              <Button
                icon="calendar"
                variant="outline"
                aria-label="เลือกวันที่ดูข้อมูลย้อนหลัง"
                title={'เลือกวันที่ · ' + D.displayDate(displayedDate)}
                onClick={() => setCalendarOpen(true)}
              >
                <span className="calendar-date-label">{D.displayDate(displayedDate)}</span>
              </Button>
              <span className="muted tiny">
                {viewingDate ? 'ข้อมูลวันที่เลือก' : 'วันผลิตปัจจุบัน'} · {visibleRounds.length} รอบ
              </span>
              {viewingDate ? (
                <Button
                  variant="small ghost"
                  className="date-return"
                  icon="clock"
                  onClick={() => chooseDate(null)}
                >
                  กลับวันปัจจุบัน
                </Button>
              ) : null}
            </div>
          ) : null}
          <span>
            <Icon name="shield" size={14} />
            แยกข้อมูลตามโรงและกะ
          </span>
        </div>
        <main
          className={
            'main ' +
            (view === 'dashboard' ? 'dashboard-view' : view === 'reports' ? 'reports-view' : '')
          }
        >
          <PageHeading
            title={heading}
            description={
              round
                ? round.factory +
                  ' · ' +
                  D.displayDate(round.date) +
                  ' · ' +
                  round.shift +
                  ' · ' +
                  round.line
                : 'บันทึกข้อมูลประจำจุดและติดตามผลผลิตแต่ละรอบ'
            }
          >
            {state && !['qr', 'reports'].includes(view) ? (
              <>
                <Button
                  variant="outline"
                  icon="history"
                  onClick={() =>
                    setBackfillPoint(
                      scanScope?.stationId ||
                        (supervisor || state.user.stations.includes('production')
                          ? 'production'
                          : state.user.stations[0]),
                    )
                  }
                >
                  กรอกย้อนหลัง
                </Button>
                <Button
                  variant="outline"
                  icon="refresh"
                  aria-label="โหลดข้อมูลล่าสุด"
                  onClick={() => (demo ? notify('ข้อมูลสาธิตเป็นปัจจุบัน') : flush())}
                  className="refresh-button"
                />
                {supervisor ? (
                  <Button
                    icon={view === 'qr' ? 'print' : 'plus'}
                    onClick={() =>
                      view === 'qr'
                        ? window.print()
                        : view === 'settings'
                          ? setNewRound(true)
                          : nav('stations')
                    }
                  >
                    {view === 'qr'
                      ? 'พิมพ์ QR'
                      : view === 'settings'
                        ? 'เปิดรอบย้อนหลัง'
                        : 'กรอกข้อมูล'}
                  </Button>
                ) : null}
              </>
            ) : null}
          </PageHeading>
          {error ? (
            <Notice tone={authError ? 'amber' : 'neutral'}>
              {error}
              {authError ? (
                <a className="button small" href={signInHref} target="_top">
                  เข้าสู่ระบบ
                </a>
              ) : null}
            </Notice>
          ) : null}
          {!state ? (
            <Empty
              icon="shield"
              title="เข้าสู่ระบบเพื่อบันทึกข้อมูลจริง"
              description="หัวหน้าเข้าครั้งแรกเพื่อยืนยันหน่วย ตั้งแผนผลิต และเพิ่มสิทธิ์ QA"
              action={
                <a className="button" href={signInHref} target="_top">
                  เข้าสู่ระบบ
                </a>
              }
            />
          ) : (
            <>
              {view !== 'alarms' ? (
                <AlarmBanner alarms={alarms} onOpen={() => nav('alarms')} />
              ) : null}
              {view === 'alarms' ? (
                <AlarmCenter
                  alarms={alarms}
                  events={state.alarmEvents || []}
                  rounds={visibleRounds}
                  supervisor={supervisor}
                  onAcknowledge={acknowledge}
                  onResolve={resolveQaAlarm}
                />
              ) : null}
              {['dashboard', 'stations'].includes(view) ? (
                <div className={view === 'dashboard' ? 'dashboard-schedule' : ''}>
                  <Notice
                    tone={!demo && D.autoRoundIssue(state.config) ? 'amber' : 'neutral'}
                    icon="clock"
                  >
                    <strong>
                      {D.scheduleFor(state.config).enabled
                        ? 'เปิดรอบอัตโนมัติทุก 30 นาที'
                        : 'ปิดเปิดรอบอัตโนมัติ'}
                    </strong>
                    <p>
                      {state.config.factory} · {state.config.shift} ·{' '}
                      {D.scheduleFor(state.config).start}–{D.scheduleFor(state.config).end} น. ·
                      เวลาไทย
                      {!demo && D.autoRoundIssue(state.config)
                        ? ' · ' + D.autoRoundIssue(state.config)
                        : ' · ไม่ต้องเปิดรอบเอง'}
                    </p>
                    {!followCurrent.current ? (
                      <Button variant="small outline" onClick={() => chooseDate(null)}>
                        กลับรอบปัจจุบัน
                      </Button>
                    ) : null}
                  </Notice>
                </div>
              ) : null}
              {myQueue.length ? (
                <section className="queue-panel">
                  <div className="section-heading">
                    <h3>
                      <Icon name="clock" size={18} />
                      ข้อมูลบนเครื่องที่ยังส่งไม่สำเร็จ ({myQueue.length})
                    </h3>
                    <Button variant="small outline" icon="refresh" onClick={flush}>
                      ลองส่งอีกครั้ง
                    </Button>
                  </div>
                  {myQueue.map((q) => (
                    <div className="queue-item" key={q.id}>
                      <div>
                        <strong>
                          {D.STATIONS.find((s: Obj) => s.id === q.body.stationId)?.name}
                        </strong>
                        <p>{q.error || 'รอส่งเข้าส่วนกลาง · ' + time(q.createdAt)}</p>
                      </div>
                      {q.status !== 'pending' ? (
                        <Button variant="small outline" onClick={() => reviewPending(q)}>
                          ตรวจทาน
                        </Button>
                      ) : (
                        <Badge tone="amber">รอส่ง</Badge>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}
              {['dashboard', 'stations', 'reports'].includes(view) ? (
                <>
                  <div className="round-toolbar">
                    <label>
                      <span>รอบการผลิต</span>
                      <Select
                        label="รอบการผลิต"
                        value={selected}
                        placeholder="ไม่มีรอบในวันที่เลือก"
                        icon="clock"
                        onValueChange={(value) => {
                          followCurrent.current = false;
                          setSelected(value);
                          setOrderId('');
                          setReportVersion('');
                        }}
                        options={visibleRounds.map((r: Obj) => ({
                          value: r.id,
                          label: r.start + '–' + r.end,
                          description: D.displayDate(r.date) + ' · ' + r.shift,
                          badge: D.isCurrentRound(r, state.config) ? 'ปัจจุบัน' : undefined,
                        }))}
                      />
                    </label>
                    {round ? (
                      <label className="order-selector">
                        <span>ลูกค้า / SO</span>
                        <Select
                          label="ลูกค้า / SO"
                          value={order?.id || ''}
                          onValueChange={setOrderId}
                          options={round.snapshot.orders.map((o: Obj) => ({
                            value: o.id,
                            label: o.customer + ' / ' + o.so,
                          }))}
                        />
                      </label>
                    ) : null}
                    {supervisor ? (
                      <button className="text-button" onClick={() => setNewRound(true)}>
                        <Icon name="history" size={16} />
                        เปิดรอบย้อนหลัง
                      </button>
                    ) : null}
                    {supervisor && round && !roundReports.length ? (
                      <button className="text-button" onClick={() => setAddingOrder(true)}>
                        <Icon name="plus" size={16} />
                        เพิ่ม SO ในรอบ
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {oldRound && ['dashboard', 'stations'].includes(view) ? (
                <Notice tone="neutral" icon="history">
                  กำลังดูรอบ {round.start}–{round.end} วันที่ {D.displayDate(round.date)}{' '}
                  กรุณาตรวจสอบรอบก่อนกรอก
                </Notice>
              ) : null}
              {view === 'dashboard' && round ? (
                <DashboardPage
                  round={round}
                  supervisor={supervisor}
                  fact={fact}
                  order={order}
                  progress={progress}
                  stationList={stationList}
                  entries={entries}
                  myQueue={myQueue}
                  selected={selected}
                  openForm={openForm}
                  reportReady={reportReady}
                  closed={closed}
                  stale={stale}
                  warnings={warnings}
                  share={share}
                  nav={nav}
                  alarms={alarms}
                  rounds={visibleRounds}
                  submissions={state.submissions}
                  onRoundChange={(id) => {
                    followCurrent.current = false;
                    const next = visibleRounds.find((r: Obj) => r.id === id);
                    const nextOrder = next?.snapshot.orders.find(
                      (o: Obj) => o.customer === order.customer && o.so === order.so,
                    );
                    setSelected(id);
                    setOrderId(nextOrder?.id || '');
                    setReportVersion('');
                  }}
                />
              ) : null}
              {['dashboard', 'stations'].includes(view) && !round ? (
                <Empty
                  title={viewingDate ? 'ไม่มีข้อมูลในวันที่เลือก' : 'รอเปิดรอบอัตโนมัติ'}
                  description={
                    viewingDate
                      ? 'ลองเลือกวันที่อื่นจากปฏิทิน หรือกลับวันปัจจุบัน'
                      : D.autoRoundIssue(state.config) ||
                        'เมื่อถึงเวลากะ ระบบเปิดรอบให้ทันที แล้วสแกน QR เพื่อกรอกข้อมูลได้'
                  }
                  action={
                    supervisor ? (
                      <Button icon="settings" onClick={() => nav('settings')}>
                        ตั้งค่าและแผนผลิต
                      </Button>
                    ) : null
                  }
                />
              ) : null}
              {view === 'stations' && round ? (
                <StationsPage
                  round={round}
                  order={order}
                  scanStationId={scanStationId}
                  stationList={stationList}
                  entries={entries}
                  openForm={openForm}
                  setHistory={setHistory}
                />
              ) : null}
              {view === 'reports' ? (
                <ReportsPage
                  round={round}
                  report={report}
                  roundReports={roundReports}
                  reportVersion={reportVersion}
                  setReportVersion={setReportVersion}
                  reportReady={reportReady}
                  share={share}
                  copyReport={copyReport}
                  progress={progress}
                  state={state}
                  selected={selected}
                  nav={nav}
                />
              ) : null}
              {view === 'qr' && supervisor ? (
                <QRLabels
                  config={state.config}
                  demo={demo}
                  onScopeChange={switchScope}
                  onToast={notify}
                  factories={state.user.factories}
                  publicUrl={
                    demo
                      ? runtime?.publicUrl || state.deployment?.publicUrl
                      : state.deployment?.publicUrl || runtime?.publicUrl
                  }
                />
              ) : null}
              {view === 'settings' && supervisor ? (
                <SettingsPage
                  state={state}
                  demo={demo}
                  busy={busy}
                  onSave={saveConfig}
                  onServerSettings={async (publicUrl: string) => {
                    if (demo) {
                      updateState({
                        ...stateRef.current,
                        deployment: { ...stateRef.current.deployment, publicUrl },
                      });
                      notify('บันทึก URL สาธิตแล้ว ไม่เปลี่ยนเซิร์ฟเวอร์จริง');
                      return;
                    }
                    await api('server-settings', { publicUrl });
                    await loadLive();
                    notify('บันทึกที่อยู่เว็บสำหรับ QR แล้ว');
                  }}
                  onMember={async (body: any) => {
                    if (demo) {
                      const { password, ...safeBody } = body;
                      const m = { ...safeBody, id: body.email };
                      updateState({
                        ...stateRef.current,
                        members: [
                          ...stateRef.current.members.filter((x: Obj) => x.email !== m.email),
                          m,
                        ],
                      });
                      notify('บันทึกสิทธิ์สาธิตแล้ว');
                    } else {
                      await mutate('members', body);
                      notify('บันทึกสิทธิ์พนักงานแล้ว');
                    }
                  }}
                  onToast={notify}
                />
              ) : null}
            </>
          )}
          <footer className="page-footer">
            <span>COMPOUND QA</span>
            <span>บันทึกให้ครบ · ตรวจสอบย้อนกลับได้</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {NAV.slice(0, 3).map(([id, label]) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => nav(id)}>
            <Icon name={id} size={22} />
            <span>{label}</span>
          </button>
        ))}
        <button className={showMore ? 'active' : ''} onClick={() => setShowMore(!showMore)}>
          <Icon name="more" size={22} />
          <span>เพิ่มเติม</span>
        </button>
      </nav>
      {showMore ? (
        <div className="more-menu">
          {NAV.slice(3)
            .filter(([id]) => supervisor || id === 'alarms')
            .map(([id, label]) => (
              <button key={id} onClick={() => nav(id)}>
                <Icon name={id} />
                {label}
              </button>
            ))}
          <button
            onClick={() => {
              switchMode(!demo);
              setShowMore(false);
            }}
          >
            <Icon name={demo ? 'shield' : 'flask'} />
            {demo ? 'เริ่มใช้งานจริง' : 'ดูข้อมูลตัวอย่าง'}
          </button>
          {!demo ? (
            <a href="/logout" target="_top">
              <Icon name="logout" />
              ออกจากระบบ
            </a>
          ) : (
            <button
              onClick={() => {
                const data = D.ensureDemoRound(demoForScope(scopeRef.current));
                updateState(data);
                setSelected(
                  firstRound(data, viewingDateRef.current || D.productionDate(data.config)),
                );
                setShowMore(false);
                notify('เริ่มข้อมูลตัวอย่างใหม่แล้ว');
              }}
            >
              <Icon name="refresh" />
              เริ่มตัวอย่างใหม่
            </button>
          )}
        </div>
      ) : null}
      {form && round && order ? (
        <QAForm
          key={[demo, selected, order.id, form.station.id, form.pending?.id || ''].join(':')}
          station={form.station}
          round={round}
          order={order}
          user={state.user}
          ovenSettings={
            demo
              ? D.resolveOvenSettings(round, order, D.demoOvenEvents(state))
              : state.ovenSettings?.[round.id + ':' + order.id]
          }
          existing={entries.find((e: Obj) => e.stationId === form.station.id)}
          pending={form.pending}
          demo={demo}
          onSubmit={submit}
          onOrderChange={(id: string) => setOrderId(id)}
          onClose={() => setForm(null)}
          onToast={notify}
          onBackfill={() => setBackfillPoint(form.station.id)}
        />
      ) : null}
      {backfillPoint && state ? (
        <BackfillModal
          config={{ ...state.config, line: scanScope?.line || state.config.line }}
          stations={D.STATIONS.filter((s: Obj) => supervisor || state.user.stations.includes(s.id))}
          stationId={backfillPoint}
          lockedStation={Boolean(scanScope)}
          initialRound={round}
          onLoadDay={loadBackfillDay}
          onOpen={openBackfill}
          onClose={() => setBackfillPoint('')}
        />
      ) : null}
      {calendarOpen ? (
        <HistoryDateModal
          date={displayedDate}
          onClose={() => setCalendarOpen(false)}
          onChoose={chooseDate}
        />
      ) : null}
      {newRound ? (
        <RoundModal
          config={state.config}
          demo={demo}
          onClose={() => setNewRound(false)}
          onCreate={createPeriod}
        />
      ) : null}
      {addingOrder && round ? (
        <AddOrderModal
          config={state.config}
          round={round}
          onClose={() => setAddingOrder(false)}
          onAdd={addOrderToRound}
          onSettings={() => {
            setAddingOrder(false);
            nav('settings');
          }}
        />
      ) : null}
      {history ? (
        <HistoryModal target={history} audits={state.audits} onClose={() => setHistory(null)} />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
          <button aria-label="ปิดข้อความ" onClick={() => setToast('')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

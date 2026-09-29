import type { AuditEvent, LockLedgerEntry, Permit } from '~/types'

export const permits: Permit[] = [
  {
    id: 'WP-260929-018', title: '3 号风机齿轮箱更换', device: 'WTG-03 · 箱变 03', crew: '机务二班', owner: '李骁', window: '09-29 14:00 — 22:00', status: '执行中', risk: '一级', revision: 4, reviewRequired: false, isolationConclusionValid: true,
    isolationPoints: [
      { id: 'IP-301', device: 'WTG-03', label: '塔基 690V 主开关', type: '开关', state: '已隔离' },
      { id: 'IP-302', device: 'BOX-03', label: '箱变低压侧刀闸', type: '刀闸', state: '已隔离' },
      { id: 'IP-303', device: 'WTG-03', label: '叶轮机械锁', type: '阀门', state: '已隔离' },
      { id: 'IP-BUS-A', device: 'BUS-A', label: 'A 段母线共用隔离刀闸', type: '刀闸', state: '已隔离' },
    ],
    steps: [
      { id: 'ST-01', text: '核对工作票、设备双重编号与现场标识', done: true, owner: '周野', evidence: '现场照片 2 张' },
      { id: 'ST-02', text: '断开 690V 主开关并执行机械锁定', done: true, owner: '周野', evidence: '锁具编号 LK-2107' },
      { id: 'ST-03', text: '验电、放电并装设接地线', done: false, owner: '何岚' },
      { id: 'ST-04', text: '全体作业人员确认隔离边界', done: false, owner: '李骁' },
    ],
  },
  {
    id: 'WP-260929-021', title: '2 号集电线路绝缘子更换', device: 'LINE-A2 · 杆塔 17–23', crew: '线路一班', owner: '何岚', window: '09-29 18:00 — 30 02:00', status: '待执行', risk: '一级', revision: 2, reviewRequired: false, isolationConclusionValid: true,
    isolationPoints: [
      { id: 'IP-411', device: 'LINE-A2', label: 'A2 进线断路器', type: '开关', state: '待操作' },
      { id: 'IP-412', device: 'LINE-A2', label: '17 号杆接地刀闸', type: '接地', state: '待操作' },
      { id: 'IP-413', device: 'BUS-A', label: '母线侧隔离刀闸', type: '刀闸', state: '已隔离' },
      { id: 'IP-BUS-A', device: 'BUS-A', label: 'A 段母线共用隔离刀闸', type: '刀闸', state: '已隔离' },
    ],
    steps: [
      { id: 'ST-11', text: '核对线路双重名称与停电范围', done: true, owner: '何岚' },
      { id: 'ST-12', text: '断开 A2 进线并完成五防校验', done: false, owner: '孙禾' },
      { id: 'ST-13', text: '17、23 号杆验电并装设接地线', done: false, owner: '谭勇' },
    ],
  },
  {
    id: 'WP-260930-004', title: '箱变 12 温控器更换', device: 'BOX-12', crew: '电气一班', owner: '孙禾', window: '09-30 08:00 — 12:00', status: '待执行', risk: '二级', revision: 1, reviewRequired: false, isolationConclusionValid: true,
    isolationPoints: [{ id: 'IP-501', device: 'BOX-12', label: '高压负荷开关', type: '开关', state: '待操作' }],
    steps: [{ id: 'ST-21', text: '核对箱变编号和低压侧负荷转移', done: true, owner: '孙禾' }, { id: 'ST-22', text: '断开高压负荷开关并锁定', done: false, owner: '孙禾' }],
  },
]

export const lockLedger: LockLedgerEntry[] = [
  {
    id: 'LK-LEDGER-901',
    time: '16:42',
    lockNo: 'LK-2107',
    action: '领用',
    isolationPointIds: ['IP-301', 'IP-302', 'IP-BUS-A'],
    device: 'WTG-03 / BUS-A',
    location: '3 号风机塔基与 A 段母线操作箱',
    fromHolder: '工具房',
    toHolder: '周野',
    permitIds: ['WP-260929-018'],
    note: '已拍照上传，锁牌与工作票绑定。',
    recordedBy: '周野',
    conclusionInvalidated: false,
  },
  {
    id: 'LK-LEDGER-902',
    time: '16:30',
    lockNo: 'LK-2118',
    action: '领用',
    isolationPointIds: ['IP-411', 'IP-413', 'IP-BUS-A'],
    device: 'LINE-A2 / BUS-A',
    location: 'A2 进线柜与 A 段母线操作箱',
    fromHolder: '工具房',
    toHolder: '孙禾',
    permitIds: ['WP-260929-021'],
    note: '计划 18:00 停电操作，锁具已做预绑定。',
    recordedBy: '孙禾',
    conclusionInvalidated: false,
  },
  {
    id: 'LK-LEDGER-903',
    time: '15:52',
    lockNo: 'GND-042',
    action: '领用',
    isolationPointIds: ['IP-412'],
    device: 'LINE-A2',
    location: '17 号杆接地线存放点',
    fromHolder: '工具房',
    toHolder: '谭勇',
    permitIds: ['WP-260929-021'],
    note: '验电后装设，暂随线路班组保管。',
    recordedBy: '谭勇',
    conclusionInvalidated: false,
  },
]

export const auditEvents: AuditEvent[] = [
  { id: 'AE-901', time: '16:42', actor: '李骁', action: '完成步骤', target: 'WP-260929-018 / ST-02', detail: '上传机械锁具编号 LK-2107' },
  { id: 'AE-902', time: '16:18', actor: '系统', action: '冲突预警', target: 'LINE-A2', detail: '检测到线路一班与电气二班在 18:00–20:00 重叠作业' },
  { id: 'AE-903', time: '15:56', actor: '赵清', action: '复核通过', target: 'WP-260929-014', detail: '同意执行，要求每 2 小时回报风速' },
]

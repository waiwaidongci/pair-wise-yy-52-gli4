export type PermitStatus = '待复核' | '待执行' | '执行中' | '待结束' | '待关闭' | '已完成'

export interface IsolationPoint {
  id: string
  device: string
  label: string
  type: '开关' | '刀闸' | '阀门' | '接地'
  state: '已隔离' | '待操作' | '已恢复'
  /** 共用隔离点组：同组许可恢复时同一时间只能放行一条 */
  sharedKey?: string
  /** 关联的锁具台账编号 */
  lockId?: string
}

export type LockState = '已锁定' | '待领用' | '已拆除'

export interface LockEntry {
  id: string
  type: string
  location: string
  holder: string
  state: LockState
  /** 关联的隔离点编号 */
  pointId?: string
}

export interface Permit {
  id: string
  title: string
  device: string
  crew: string
  owner: string
  window: string
  status: PermitStatus
  risk: '一级' | '二级' | '三级'
  isolationPoints: IsolationPoint[]
  steps: { id: string; text: string; done: boolean; owner: string; evidence?: string }[]
  revision: number
  reviewRequired: boolean
  /** 应急暂停期间冻结：步骤与推进一律禁止 */
  paused?: boolean
  /** 锁具台账更新后原隔离结论失效，恢复时转待复核 */
  conclusionValid?: boolean
  resumeRequestedAt?: number | null
  /** 实际放行顺序（从 1 开始），用于追溯暂停后恢复顺序 */
  resumeOrder?: number | null
}

export interface EmergencySnapshot {
  active: boolean
  /** 风况是否已确认停止；停止后才允许提交恢复 */
  windStopped: boolean
  /** 现场接管人 */
  takeover: string
  pausedAt: string
  windStoppedAt?: string
  /** 暂停前（冻结时）待执行/执行中许可的顺序 */
  order: string[]
  /** 恢复放行顺序 */
  resumedOrder?: string[]
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}

export type PermitStatus = '待复核' | '待执行' | '执行中' | '待结束' | '待关闭' | '已完成' | '应急冻结'
export type ResumeState = '未申请' | '待放行' | '排队中' | '已放行' | '待复核'
export type LockLedgerAction = '领用' | '交接' | '异常更换' | '归还'

export interface IsolationPoint {
  id: string
  device: string
  label: string
  type: '开关' | '刀闸' | '阀门' | '接地'
  state: '已隔离' | '待操作' | '已恢复'
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
  isolationConclusionValid: boolean
  prePauseStatus?: Exclude<PermitStatus, '应急冻结'>
  pauseOrder?: number
  resumeState?: ResumeState
  resumeRequestedAt?: string
}

export interface LockLedgerEntry {
  id: string
  time: string
  lockNo: string
  action: LockLedgerAction
  isolationPointIds: string[]
  device: string
  location: string
  fromHolder: string
  toHolder: string
  permitIds: string[]
  note: string
  recordedBy: string
  conclusionInvalidated: boolean
}

export type EmergencyStatus = '正常' | '暂停中' | '恢复中'

export interface EmergencyState {
  status: EmergencyStatus
  reason: string
  initiatedBy: string
  handedTo: string
  startedAt: string
  recoveryStartedAt: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}

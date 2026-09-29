import { defineStore } from 'pinia'
import type { AuditEvent, EmergencyState, IsolationPoint, LockLedgerAction, LockLedgerEntry, Permit, ResumeState } from '~/types'
import { auditEvents as seedAudit, lockLedger as seedLedger, permits as seedPermits } from '~/utils/mock'

const STORAGE_KEY = 'yy52-permit-ops-v2'
const freezableStatuses = ['待执行', '执行中'] as const

let auditSequence = 0

export function effectiveStatus(permit: Permit): string {
  return permit.status === '应急冻结'
    ? permit.resumeState === '排队中'
      ? '恢复排队中'
      : permit.resumeState === '待复核'
        ? '暂停待复核'
        : permit.status
    : permit.status
}

export const useOperationsStore = defineStore('operations', () => {
  const permits = ref<Permit[]>(structuredClone(seedPermits))
  const audit = ref<AuditEvent[]>(structuredClone(seedAudit))
  const lockLedger = ref<LockLedgerEntry[]>(structuredClone(seedLedger))
  const connection = ref<'在线' | '重连中'>('在线')
  const pendingRetry = ref(0)
  const latestAlert = ref('18:00–20:00 LINE-A2 存在跨班组重叠作业')
  const loaded = ref(false)
  const windSpeed = ref(10.8)
  const emergency = ref<EmergencyState>({
    status: '正常',
    reason: '',
    initiatedBy: '值班负责人',
    handedTo: '',
    startedAt: '',
    recoveryStartedAt: '',
  })

  function nowTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  function persist() {
    if (!import.meta.client) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      permits: permits.value,
      audit: audit.value,
      lockLedger: lockLedger.value,
      emergency: emergency.value,
      windSpeed: windSpeed.value,
    }))
  }
  function restore() {
    if (!import.meta.client || loaded.value) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const draft = JSON.parse(raw)
      permits.value = (draft.permits ?? []).map((permit: Permit) => ({
        ...permit,
        isolationConclusionValid: permit.isolationConclusionValid ?? true,
        resumeState: permit.resumeState ?? '未申请' as ResumeState,
      }))
      audit.value = draft.audit ?? []
      lockLedger.value = draft.lockLedger ?? structuredClone(seedLedger)
      emergency.value = draft.emergency ?? emergency.value
      windSpeed.value = draft.windSpeed ?? windSpeed.value
    }
    loaded.value = true
  }
  function addAudit(actor: string, action: string, target: string, detail: string) {
    audit.value.unshift({
      id: `AE-${Date.now()}-${String(auditSequence++).padStart(2, '0')}`,
      time: nowTime(),
      actor,
      action,
      target,
      detail,
    })
    persist()
  }
  function sharesIsolationPoint(permit: Permit, other: Permit) {
    return permit.id !== other.id && permit.isolationPoints.some((point) => other.isolationPoints.some((candidate) => candidate.id === point.id))
  }
  function affectedPermits(pointIds: string[]) {
    return permits.value.filter((permit) => permit.isolationPoints.some((point) => pointIds.includes(point.id)))
  }
  function releasePermit(permit: Permit, actor: string, reason: string) {
    permit.status = permit.prePauseStatus ?? '待执行'
    permit.resumeState = '已放行'
    permit.revision += 1
    addAudit(actor, '恢复放行', permit.id, `${reason}；暂停前顺序 #${permit.pauseOrder}，原状态为“${permit.prePauseStatus}”，接管人：${emergency.value.handedTo || '未登记'}`)
  }
  function releaseOrQueue(permit: Permit, actor: string, batchLabel: string) {
    if (!permit.isolationConclusionValid || permit.reviewRequired) {
      permit.status = '应急冻结'
      permit.resumeState = '待复核'
      addAudit(actor, '恢复待复核', permit.id, `${batchLabel}；锁具台账已使原隔离结论失效，恢复申请保留在待复核队列`)
      return
    }

    const activeStates: IsolationPoint['state'][] = ['已隔离', '待操作']
    const blocker = permits.value
      .filter((candidate) => {
        if (!['已放行', '排队中'].includes(candidate.resumeState ?? '') || !sharesIsolationPoint(permit, candidate)) return false
        return candidate.isolationPoints.some((candidatePoint) =>
          permit.isolationPoints.some((point) => point.id === candidatePoint.id && activeStates.includes(point.state)),
        )
      })
      .sort((a, b) => (a.pauseOrder ?? 0) - (b.pauseOrder ?? 0))[0]

    if (blocker) {
      permit.status = '应急冻结'
      permit.resumeState = '排队中'
      const shared = permit.isolationPoints
        .filter((point) => blocker.isolationPoints.some((candidate) => candidate.id === point.id))
        .map((point) => point.label)
        .join('、')
      addAudit(actor, '恢复排队', permit.id, `${batchLabel}；共用隔离点“${shared}”已先放行 ${blocker.id}，本许可继续排队`)
      return
    }

    releasePermit(permit, actor, `${batchLabel}；共用隔离点检查通过`)
  }
  function refreshResumeQueue(actor = '系统') {
    if (emergency.value.status !== '恢复中') return
    permits.value
      .filter((permit) => permit.status === '应急冻结' && permit.resumeState === '排队中')
      .sort((a, b) => (a.pauseOrder ?? 0) - (b.pauseOrder ?? 0))
      .forEach((permit) => releaseOrQueue(permit, actor, '隔离点释放后自动重试'))
  }

  function emergencyPause(input: { reason: string, initiatedBy: string, handedTo: string }) {
    if (emergency.value.status !== '正常') return
    const time = nowTime()
    emergency.value = {
      status: '暂停中',
      reason: input.reason,
      initiatedBy: input.initiatedBy || '值班负责人',
      handedTo: input.handedTo,
      startedAt: time,
      recoveryStartedAt: '',
    }
    windSpeed.value = 18.6
    let order = 1
    permits.value.forEach((permit) => {
      if (!freezableStatuses.includes(permit.status as (typeof freezableStatuses)[number])) return
      const previousStatus = permit.status as Permit['prePauseStatus']
      permit.prePauseStatus = previousStatus
      permit.pauseOrder = order
      permit.resumeState = '未申请'
      permit.status = '应急冻结'
      addAudit(input.initiatedBy || '值班负责人', '应急冻结', permit.id, `风速骤升后冻结；暂停前顺序 #${order}，原状态“${previousStatus}”，现场接管人：${input.handedTo}`)
      order += 1
    })
    latestAlert.value = `风速 18.6m/s 已触发应急暂停，${order - 1} 张待执行/执行中许可已冻结，锁具交接仍可补记`
    addAudit(input.initiatedBy || '值班负责人', '应急暂停', '全部待执行/执行中许可', `原因：${input.reason}；接管人：${input.handedTo}；冻结数量：${order - 1}`)
  }

  function beginRecovery(actor = '值班负责人') {
    if (emergency.value.status !== '暂停中') return
    emergency.value.status = '恢复中'
    emergency.value.recoveryStartedAt = nowTime()
    windSpeed.value = 7.8
    latestAlert.value = '风速已降至安全阈值以下，恢复通道开启；共用隔离点按暂停前后顺序一次只放行一张许可'
    addAudit(actor, '风停恢复', '应急恢复批次', '确认风速恢复安全，许可可提交恢复；接管人核对暂停时现场状态')
  }

  function requestResume(ids: string[], actor = '当前用户') {
    if (emergency.value.status !== '恢复中') return
    const requestedAt = nowTime()
    const applicants = permits.value
      .filter((permit) => ids.includes(permit.id) && permit.status === '应急冻结' && permit.resumeState !== '已放行')
      .sort((a, b) => (a.pauseOrder ?? 0) - (b.pauseOrder ?? 0))

    if (!applicants.length) return
    applicants.forEach((permit) => {
      permit.resumeRequestedAt = requestedAt
      if (permit.resumeState === '未申请') permit.resumeState = '待放行'
    })
    const orderedIds = applicants.map((permit) => `${permit.id}(#${permit.pauseOrder})`).join('、')
    addAudit(actor, '同时提交恢复', orderedIds, `同一恢复批次提交时间 ${requestedAt}；按暂停前后顺序原子判定共用隔离点`)
    applicants.forEach((permit) => releaseOrQueue(permit, actor, '恢复批次同时提交'))
    persist()
  }

  function resolveReview(id: string, approved: boolean, actor = '值班负责人') {
    const permit = permits.value.find((item) => item.id === id)
    if (!permit || permit.status !== '应急冻结' || permit.resumeState !== '待复核') return
    if (!approved) {
      permit.resumeState = '未申请'
      permit.resumeRequestedAt = undefined
      addAudit(actor, '复核退回', id, '隔离结论仍不可用，退回现场继续补正锁具台账')
      return
    }
    permit.reviewRequired = false
    permit.isolationConclusionValid = true
    permit.revision += 1
    addAudit(actor, '复核通过', id, '锁具台账与隔离边界已重新核对，原隔离结论重新生效')
    releaseOrQueue(permit, actor, '待复核许可重新参与恢复排序')
    persist()
  }

  function recordLockHandover(input: {
    lockNo: string
    action: LockLedgerAction
    isolationPointIds: string[]
    device: string
    location: string
    fromHolder: string
    toHolder: string
    note: string
    recordedBy: string
    invalidatesConclusion: boolean
  }) {
    const pointIds = input.isolationPointIds.length ? input.isolationPointIds : []
    const linkedPermitIds = affectedPermits(pointIds).map((permit) => permit.id)
    const entry: LockLedgerEntry = {
      id: `LK-LEDGER-${Date.now()}-${String(auditSequence++).padStart(2, '0')}`,
      time: nowTime(),
      lockNo: input.lockNo,
      action: input.action,
      isolationPointIds: pointIds,
      device: input.device,
      location: input.location,
      fromHolder: input.fromHolder,
      toHolder: input.toHolder,
      permitIds: linkedPermitIds,
      note: input.note,
      recordedBy: input.recordedBy,
      conclusionInvalidated: input.invalidatesConclusion,
    }
    lockLedger.value.unshift(entry)

    if (input.action === '归还') {
      permits.value.forEach((permit) => {
        permit.isolationPoints.forEach((point) => {
          if (pointIds.includes(point.id)) point.state = '已恢复'
        })
      })
    }

    addAudit(
      input.recordedBy,
      input.invalidatesConclusion ? '锁具台账更新' : '锁具交接补记',
      `${input.lockNo} / ${linkedPermitIds.join('、') || '未关联许可'}`,
      `${input.action}：${input.fromHolder} → ${input.toHolder}；${input.location}${input.invalidatesConclusion ? '；原隔离结论失效' : ''}；${input.note}`,
    )

    if (input.invalidatesConclusion) {
      affectedPermits(pointIds).forEach((permit) => {
        permit.isolationConclusionValid = false
        permit.reviewRequired = true
        permit.revision += 1
        if (permit.status === '应急冻结') {
          const previousResumeState = permit.resumeState
          permit.resumeState = '待复核'
          addAudit('系统', '隔离结论失效', permit.id, `锁具 ${input.lockNo} 更新后，许可由“${previousResumeState ?? '未申请'}”保留至待复核`)
        } else if (freezableStatuses.includes(permit.status as (typeof freezableStatuses)[number])) {
          const activeStatus = permit.status
          permit.prePauseStatus = activeStatus
          permit.resumeState = '待复核'
          permit.status = '应急冻结'
          addAudit('系统', '隔离结论失效', permit.id, `锁具 ${input.lockNo} 更新后，已放行许可重新冻结，原“${activeStatus}”作业立即停止并等待复核`)
        } else {
          addAudit('系统', '隔离结论失效', permit.id, `锁具 ${input.lockNo} 更新后，许可需重新复核后才能推进`)
        }
      })
    }

    refreshResumeQueue(input.recordedBy)
    persist()
  }

  function advancePermit(id: string) {
    const permit = permits.value.find((item) => item.id === id)
    if (!permit) return
    if (permit.status === '应急冻结') {
      latestAlert.value = `${id} 正处于应急冻结/恢复队列，不能推进未完成步骤`
      return
    }
    const flow: Record<string, Permit['status']> = { 待复核: '待执行', 待执行: '执行中', 执行中: '待结束', 待结束: '待关闭', 待关闭: '已完成' }
    const next = flow[permit.status]
    if (!next) return
    if (permit.status === '待复核' && permit.reviewRequired && !confirm('该许可存在待复核冲突，确认由值班负责人承担审批责任？')) return
    permit.status = next
    permit.reviewRequired = false
    permit.revision += 1
    addAudit('当前用户', '流程推进', permit.id, `状态由“${Object.keys(flow).find((key) => flow[key] === next)}”变更为“${next}”`)
  }
  function toggleStep(permitId: string, stepId: string) {
    const permit = permits.value.find((item) => item.id === permitId)
    const step = permit?.steps.find((item) => item.id === stepId)
    if (!permit || !step) return
    if (permit.status === '应急冻结') {
      latestAlert.value = `${permitId} 已冻结，未完成步骤暂停在原位置；锁具交接可在“隔离与锁定”页补记`
      return
    }
    const previous = permit.steps.filter((item) => item.done).length
    step.done = !step.done
    if (previous === 2 && permit.steps.filter((item) => item.done).length === 3 && permit.id === 'WP-260929-018') {
      latestAlert.value = 'WP-260929-018 检测到 LINE-A2 共用母线隔离点，需要复核'
      permit.reviewRequired = true
      permits.value.find((item) => item.id === 'WP-260929-021')!.reviewRequired = true
    }
    addAudit('当前用户', step.done ? '完成步骤' : '撤销步骤', `${permit.id} / ${step.id}`, step.text)
  }
  function addPermit(permit: Permit) { permits.value.unshift(permit); addAudit('当前用户', '新建许可', permit.id, permit.title) }
  function acceptAlert() { latestAlert.value = ''; addAudit('值班负责人', '确认冲突', '跨班组重叠', '同意调整 LINE-A2 作业时间，不允许同时开工') }
  function markOffline() { connection.value = '重连中'; pendingRetry.value += 1 }
  function markOnline() { connection.value = '在线' }
  function retryPending() { pendingRetry.value = 0; connection.value = '在线'; addAudit('系统', '重试成功', '实时通道', '断线期间的现场确认已补传') }

  restore()
  return {
    permits,
    audit,
    lockLedger,
    emergency,
    windSpeed,
    connection,
    pendingRetry,
    latestAlert,
    emergencyPause,
    beginRecovery,
    requestResume,
    resolveReview,
    recordLockHandover,
    refreshResumeQueue,
    effectiveStatus,
    advancePermit,
    toggleStep,
    addPermit,
    acceptAlert,
    markOffline,
    markOnline,
    retryPending,
    restore,
  }
})

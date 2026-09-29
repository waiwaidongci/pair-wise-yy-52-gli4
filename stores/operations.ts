import { defineStore } from 'pinia'
import type { AuditEvent, EmergencySnapshot, LockEntry, Permit } from '~/types'
import { auditEvents as seedAudit, lockLedger as seedLocks, permits as seedPermits } from '~/utils/mock'

const STORAGE_KEY = 'yy52-permit-ops-v2'

export const useOperationsStore = defineStore('operations', () => {
  const permits = ref<Permit[]>(structuredClone(seedPermits))
  const audit = ref<AuditEvent[]>(structuredClone(seedAudit))
  const lockLedger = ref<LockEntry[]>(structuredClone(seedLocks))
  const emergency = ref<EmergencySnapshot | null>(null)
  const resumeQueue = ref<string[]>([])
  const connection = ref<'在线' | '重连中'>('在线')
  const pendingRetry = ref(0)
  const latestAlert = ref('18:00–20:00 LINE-A2 存在跨班组重叠作业')
  const loaded = ref(false)

  function persist() {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        permits: permits.value,
        audit: audit.value,
        lockLedger: lockLedger.value,
        emergency: emergency.value,
        resumeQueue: resumeQueue.value,
      }))
    }
  }
  function restore() {
    if (!import.meta.client || loaded.value) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const draft = JSON.parse(raw)
      permits.value = draft.permits
      audit.value = draft.audit
      lockLedger.value = draft.lockLedger ?? structuredClone(seedLocks)
      emergency.value = draft.emergency ?? null
      resumeQueue.value = draft.resumeQueue ?? []
    }
    loaded.value = true
  }

  function addAudit(actor: string, action: string, target: string, detail: string) {
    audit.value.unshift({ id: `AE-${Date.now().toString().slice(-5)}`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), actor, action, target, detail })
    persist()
  }

  const frozenCount = computed(() => permits.value.filter((item) => item.paused).length)
  const inEmergency = computed(() => !!emergency.value?.active)
  const windStopped = computed(() => !!emergency.value?.windStopped)

  function sharedGroups(permit: Permit): string[] {
    return [...new Set(permit.isolationPoints.map((point) => point.sharedKey).filter((key): key is string => !!key))]
  }

  /** 应急暂停：待执行、执行中的许可一起冻结，记录接管人与暂停前顺序 */
  function emergencyPause(takeover: string) {
    if (emergency.value?.active) return
    const targets = permits.value.filter((item) => ['待执行', '执行中'].includes(item.status))
    const order = targets.map((item) => item.id)
    const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    targets.forEach((item) => {
      item.paused = true
      item.resumeRequestedAt = null
      item.resumeOrder = null
    })
    resumeQueue.value = []
    emergency.value = { active: true, windStopped: false, takeover, pausedAt: now, order, resumedOrder: [] }
    addAudit('值班员', '应急暂停', '全场作业许可', `风速骤升，启动应急暂停；现场接管人 ${takeover}；冻结 ${targets.length} 条（待执行/执行中）：${order.join('、') || '无'}；暂停前顺序：${order.join(' → ') || '—'}`)
    latestAlert.value = `应急暂停中：已冻结 ${targets.length} 条许可，锁具与未完成步骤就地冻结，接管人 ${takeover}`
  }

  /** 风停确认：解除风况限制，开始按提交顺序恢复 */
  function confirmWindStopped() {
    if (!emergency.value || emergency.value.windStopped) return
    emergency.value.windStopped = true
    emergency.value.windStoppedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    addAudit('值班员', '风停确认', '应急暂停', `现场风速降至允许范围，解除风况限制；接管人 ${emergency.value.takeover}；许可按提交恢复顺序排队，共用隔离点逐条放行`)
    latestAlert.value = '风已停：可提交恢复申请，共用隔离点按顺序放行'
    processResumeQueue()
  }

  /** 锁具交接 / 台账更新：可在暂停期间补记；更新后关联许可的原隔离结论失效 */
  function recordLockHandover(lockId: string, toHolder: string, newState?: LockEntry['state']) {
    const lock = lockLedger.value.find((item) => item.id === lockId)
    if (!lock) return
    const from = lock.holder
    lock.holder = toHolder
    if (newState) lock.state = newState
    const linkedPointIds = new Set<string>()
    if (lock.pointId) linkedPointIds.add(lock.pointId)
    permits.value.forEach((permit) => permit.isolationPoints.forEach((point) => { if (point.lockId === lockId) linkedPointIds.add(point.id) }))
    const affected = permits.value.filter((permit) => permit.isolationPoints.some((point) => linkedPointIds.has(point.id)))
    affected.forEach((permit) => {
      permit.conclusionValid = false
      permit.reviewRequired = true
    })
    addAudit(toHolder || '值班员', '锁具交接', lockId, `${lock.location}：${from} → ${toHolder}${newState ? `，状态变更为「${newState}」` : ''}`)
    affected.forEach((permit) => addAudit('值班员', '隔离结论失效', permit.id, `锁具 ${lockId} 台账更新，原隔离结论失效；许可 ${permit.id} 转待复核，重新确认隔离边界后方可恢复`))
    latestAlert.value = `锁具台账已更新：${lockId} 交接给 ${toHolder}，${affected.length} 条许可隔离结论失效转待复核`
    processResumeQueue()
  }

  /** 提交恢复：风停后排队；结论失效者直接驳回 */
  function submitResume(id: string) {
    const permit = permits.value.find((item) => item.id === id)
    if (!permit || !permit.paused) return
    if (!emergency.value?.active || !emergency.value.windStopped) {
      latestAlert.value = '仍在应急暂停风况限制中，暂不能提交恢复'
      return
    }
    if (resumeQueue.value.includes(id)) return
    if (permit.conclusionValid === false) {
      addAudit('值班员', '恢复驳回', id, '隔离结论已失效，需先完成复核并重新确认隔离边界，不得恢复')
      return
    }
    permit.resumeRequestedAt = Date.now()
    resumeQueue.value.push(id)
    addAudit(permit.owner, '提交恢复', id, `许可 ${id} 提交恢复申请（暂停前状态：${permit.status}），排队第 ${resumeQueue.value.length} 位`)
    processResumeQueue()
  }

  /**
   * 处理恢复队列：
   * - 结论失效 → 留待复核，移出队列；
   * - 共用隔离点组已有许可在恢复作业 → 继续排队，只放行一条；
   * - 其余 → 按顺序放行（paused=false）。
   */
  function processResumeQueue() {
    if (!emergency.value) return
    const releasedGroups = new Set<string>()
    permits.value.forEach((permit) => {
      if (!permit.paused && permit.resumeOrder && ['待执行', '执行中'].includes(permit.status)) {
        sharedGroups(permit).forEach((key) => releasedGroups.add(key))
      }
    })
    const stillQueued: string[] = []
    for (const id of resumeQueue.value) {
      const permit = permits.value.find((item) => item.id === id)
      if (!permit) continue
      if (permit.conclusionValid === false) {
        permit.paused = false
        permit.status = '待复核'
        permit.reviewRequired = true
        permit.resumeOrder = null
        addAudit('值班员', '隔离结论失效', id, `恢复队列中原隔离结论失效，许可 ${id} 留待复核，不得放行`)
        continue
      }
      const groups = sharedGroups(permit)
      const blockedBy = groups.find((key) => releasedGroups.has(key))
      if (blockedBy) {
        stillQueued.push(id)
        addAudit('值班员', '恢复等待', id, `共用隔离点「${blockedBy}」已有许可在恢复作业，许可 ${id} 暂停放行、继续排队`)
        continue
      }
      permit.paused = false
      permit.resumeOrder = (emergency.value.resumedOrder?.length ?? 0) + 1
      emergency.value.resumedOrder = [...(emergency.value.resumedOrder ?? []), id]
      groups.forEach((key) => releasedGroups.add(key))
      addAudit(permit.owner, '恢复许可', id, `许可 ${id} 恢复作业（恢复顺序第 ${permit.resumeOrder} 位），共用隔离点按顺序放行`)
    }
    resumeQueue.value = stillQueued
    const anyPaused = permits.value.some((item) => item.paused)
    if (!anyPaused && resumeQueue.value.length === 0 && emergency.value.active) {
      emergency.value.active = false
      addAudit('值班员', '应急结束', '全场作业许可', '所有冻结许可已恢复或转待复核，应急暂停结束，恢复正常流转')
    }
    persist()
  }

  function advancePermit(id: string) {
    const permit = permits.value.find((item) => item.id === id)
    if (!permit) return
    if (permit.paused) {
      latestAlert.value = `许可 ${id} 应急暂停中已冻结，禁止推进；现场仅可补记锁具交接`
      return
    }
    if (emergency.value?.active && !permit.resumeOrder) {
      latestAlert.value = '应急暂停期间禁止推进许可，待风停并按顺序恢复后再操作'
      return
    }
    const flow: Record<string, Permit['status']> = { 待复核: '待执行', 待执行: '执行中', 执行中: '待结束', 待结束: '待关闭', 待关闭: '已完成' }
    const next = flow[permit.status]
    if (!next) return
    if (permit.status === '待复核' && permit.reviewRequired && !confirm('该许可存在待复核冲突，确认由值班负责人承担审批责任？')) return
    const previous = permit.status
    permit.status = next
    permit.reviewRequired = false
    permit.revision += 1
    addAudit('当前用户', '流程推进', permit.id, `状态由“${previous}”变更为“${next}”`)
    processResumeQueue()
  }

  function toggleStep(permitId: string, stepId: string) {
    const permit = permits.value.find((item) => item.id === permitId)
    const step = permit?.steps.find((item) => item.id === stepId)
    if (!permit || !step) return
    if (permit.paused) {
      latestAlert.value = `许可 ${permitId} 应急暂停中，步骤就地冻结；锁具交接请到「隔离与锁定」补记`
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

  function addPermit(permit: Permit) {
    permits.value.unshift(permit)
    addAudit('当前用户', '新建许可', permit.id, permit.title)
  }
  function acceptAlert() { latestAlert.value = ''; addAudit('值班负责人', '确认冲突', '跨班组重叠', '同意调整 LINE-A2 作业时间，不允许同时开工') }
  function markOffline() { connection.value = '重连中'; pendingRetry.value += 1 }
  function markOnline() { connection.value = '在线' }
  function retryPending() { pendingRetry.value = 0; connection.value = '在线'; addAudit('系统', '重试成功', '实时通道', '断线期间的现场确认已补传') }

  restore()
  return {
    permits, audit, lockLedger, emergency, resumeQueue, connection, pendingRetry, latestAlert,
    frozenCount, inEmergency, windStopped,
    emergencyPause, confirmWindStopped, recordLockHandover, submitResume, processResumeQueue,
    advancePermit, toggleStep, addPermit, acceptAlert, markOffline, markOnline, retryPending, restore,
  }
})

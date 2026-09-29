<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'
import type { LockLedgerAction } from '~/types'

const store = useOperationsStore()
const selectedDevice = ref('WTG-03')
const selectedPoints = computed(() => store.permits.flatMap((permit) => permit.isolationPoints).filter((point) => point.device.includes(selectedDevice.value)))
const allPoints = computed(() => {
  const map = new Map(store.permits.flatMap((permit) => permit.isolationPoints.map((point) => [point.id, { ...point, permitIds: [permit.id] }])))
  store.permits.forEach((permit) => permit.isolationPoints.forEach((point) => {
    const existing = map.get(point.id)
    if (existing && !existing.permitIds.includes(permit.id)) existing.permitIds.push(permit.id)
  }))
  return [...map.values()]
})
const devices = computed(() => [
  { id: 'WTG-03', name: '3 号风力发电机组', state: '检修隔离', load: '0 kW', points: 4, crew: '机务二班' },
  { id: 'LINE-A2', name: 'A2 集电线路', state: store.emergency.status === '正常' ? '待隔离' : '应急冻结', load: '0.8 MW', points: 4, crew: '线路一班' },
  { id: 'BOX-12', name: '12 号箱式变压器', state: store.emergency.status === '正常' ? '运行' : '应急冻结', load: '2.4 MW', points: 1, crew: '电气一班' },
  { id: 'BUS-A', name: 'A 段 35kV 母线', state: '共用隔离', load: '18.6 MW', points: 2, crew: '公用' },
])

const form = reactive({
  lockNo: 'LK-2107',
  action: '交接' as LockLedgerAction,
  isolationPointId: 'IP-BUS-A',
  fromHolder: '周野',
  toHolder: '赵清',
  note: '阵风骤升后现场移交，钥匙与锁牌已双人核对',
  recordedBy: '赵清',
  invalidatesConclusion: true,
})
const pointOptions = computed(() => allPoints.value.map((point) => ({ label: `${point.device} · ${point.label}`, value: point.id })))
const selectedPoint = computed(() => allPoints.value.find((point) => point.id === form.isolationPointId))
const actionOptions = ['领用', '交接', '异常更换', '归还']

function submitHandover() {
  if (!form.lockNo.trim() || !form.toHolder.trim() || !selectedPoint.value) return
  store.recordLockHandover({
    lockNo: form.lockNo,
    action: form.action,
    isolationPointIds: [form.isolationPointId],
    device: selectedPoint.value.device,
    location: selectedPoint.value.label,
    fromHolder: form.fromHolder || '工具房',
    toHolder: form.toHolder,
    note: form.note || '现场补记，无附加说明',
    recordedBy: form.recordedBy || '当前用户',
    invalidatesConclusion: form.invalidatesConclusion,
  })
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">LOCKOUT / TAGOUT</p><h1 class="page-title">设备隔离与锁定点</h1><p class="muted">统一维护设备隔离点、锁具、验电步骤和跨班组占用状态。</p></div><UBadge :color="store.emergency.status === '正常' ? 'green' : 'red'" variant="subtle">{{ store.emergency.status }} · {{ store.windSpeed }} m/s</UBadge></div>
    <UAlert v-if="store.emergency.status !== '正常'" class="mb-4" color="red" variant="soft" icon="i-heroicons-lock-closed" title="应急冻结期间仍允许补记锁具交接" description="许可步骤和流程按钮已冻结；下列台账更新会同步审计，并可选择声明原隔离结论失效。" />
    <div class="device-grid">
      <article v-for="device in devices" :key="device.id" class="panel device" :class="{ active: selectedDevice === device.id }" @click="selectedDevice = device.id"><div class="inline justify-between"><UBadge variant="subtle">{{ device.id }}</UBadge><UBadge :color="device.state === '运行' ? 'green' : device.state.includes('冻结') ? 'red' : 'amber'" variant="subtle">{{ device.state }}</UBadge></div><h2>{{ device.name }}</h2><div class="kv"><span>当前负荷</span><b>{{ device.load }}</b></div><div class="kv"><span>隔离点</span><b>{{ device.points }} 个</b></div><div class="kv"><span>责任班组</span><b>{{ device.crew }}</b></div></article>
    </div>
    <section class="grid lower">
      <article class="panel p-4">
        <h2>{{ selectedDevice }} · 隔离检查单</h2>
        <div v-for="point in selectedPoints" :key="point.id" class="point">
          <div class="lock-icon"><UIcon name="i-heroicons-lock-closed" /></div>
          <div><b>{{ point.label }}</b><small>{{ point.type }} · {{ point.id }}</small></div>
          <UBadge :color="point.state === '已隔离' ? 'green' : point.state === '已恢复' ? 'gray' : 'amber'" variant="subtle">{{ point.state }}</UBadge>
          <UButton size="xs" variant="ghost">操作记录</UButton>
        </div>
        <UAlert v-if="!selectedPoints.length" color="gray" title="该设备暂无隔离点" description="可在许可中新建隔离点并关联设备。" />
        <h2 class="mt-5">共用点占用</h2>
        <div v-for="point in allPoints.filter((item) => item.permitIds.length > 1)" :key="point.id" class="point">
          <div class="lock-icon shared"><UIcon name="i-heroicons-link" /></div>
          <div><b>{{ point.label }}</b><small>{{ point.device }} · {{ point.permitIds.join(' / ') }}</small></div>
          <UBadge color="red" variant="subtle">恢复互斥</UBadge>
        </div>
      </article>
      <aside class="panel p-4">
        <h2>锁具交接补记</h2>
        <div class="ledger-form">
          <UFormGroup label="锁具编号"><UInput v-model="form.lockNo" /></UFormGroup>
          <UFormGroup label="交接类型"><USelect v-model="form.action" :options="actionOptions" /></UFormGroup>
          <UFormGroup label="关联隔离点" class="span-2"><USelect v-model="form.isolationPointId" :options="pointOptions" /></UFormGroup>
          <UFormGroup label="交出人"><UInput v-model="form.fromHolder" /></UFormGroup>
          <UFormGroup label="接收人"><UInput v-model="form.toHolder" /></UFormGroup>
          <UFormGroup label="补记人"><UInput v-model="form.recordedBy" /></UFormGroup>
          <UFormGroup label="交接位置"><UInput :model-value="selectedPoint?.label" disabled /></UFormGroup>
          <UFormGroup label="备注" class="span-2"><UInput v-model="form.note" /></UFormGroup>
          <label class="invalid-check span-2"><UCheckbox v-model="form.invalidatesConclusion" /><span>锁具状态变化，原隔离结论失效并触发许可待复核</span></label>
          <UButton block color="primary" class="span-2" icon="i-heroicons-check-badge" @click="submitHandover">补记并更新台账</UButton>
        </div>
      </aside>
    </section>
    <section class="panel p-4 mt-4">
      <div class="panel-head"><div><h2>锁定器具台账</h2><p class="muted">更新后受影响许可自动进入待复核；审计保留原台账和新交接。</p></div><UBadge color="gray">{{ store.lockLedger.length }} 条</UBadge></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>时间</th><th>锁具 / 动作</th><th>隔离点与许可</th><th>交接</th><th>结论</th></tr></thead><tbody>
        <tr v-for="entry in store.lockLedger" :key="entry.id">
          <td>{{ entry.time }}</td>
          <td><b>{{ entry.lockNo }}</b><small class="block muted">{{ entry.action }} · {{ entry.recordedBy }}</small></td>
          <td>{{ entry.device }}<small class="block muted">{{ entry.isolationPointIds.join('、') }} · {{ entry.permitIds.join('、') || '未关联' }}</small></td>
          <td>{{ entry.fromHolder }} → {{ entry.toHolder }}<small class="block muted">{{ entry.note }}</small></td>
          <td><UBadge :color="entry.conclusionInvalidated ? 'red' : 'green'" variant="subtle">{{ entry.conclusionInvalidated ? '需复核' : '有效' }}</UBadge></td>
        </tr>
      </tbody></table></div>
    </section>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.mb-4{margin-bottom:16px}.device-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.device{padding:16px;cursor:pointer}.device.active{border-color:#2563eb;box-shadow:0 0 0 2px #dbeafe}.device h2{font-size:16px;margin:14px 0}.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:13px}.kv span{color:#667085}.lower{grid-template-columns:1.15fr .85fr;gap:16px}.panel h2{font-size:17px;margin:0 0 14px}.mt-4{margin-top:16px}.mt-5{margin-top:22px}.point{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf0f5}.point>div:nth-child(2){flex:1}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.lock-icon{display:grid;place-items:center;width:34px;height:34px;background:#eff6ff;color:#2563eb;border-radius:7px}.lock-icon.shared{background:#fef2f2;color:#dc2626}.ledger-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}.span-2{grid-column:span 2}.invalid-check{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px}.invalid-check span{line-height:1.5}.panel-head{display:flex;justify-content:space-between;align-items:flex-start}
@media(max-width:1050px){.device-grid{grid-template-columns:1fr 1fr}.lower{grid-template-columns:1fr}}@media(max-width:600px){.head{flex-direction:column;gap:12px}.device-grid{grid-template-columns:1fr}.ledger-form{grid-template-columns:1fr}.span-2{grid-column:span 1}}
</style>

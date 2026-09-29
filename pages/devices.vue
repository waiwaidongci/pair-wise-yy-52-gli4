<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'
import type { LockEntry } from '~/types'

const store = useOperationsStore()
const selectedDevice = ref('WTG-03')
const handoverModal = ref(false)
const handover = reactive<{ lockId: string; toHolder: string; state: LockEntry['state'] }>({ lockId: '', toHolder: '', state: '已锁定' })
const selectedPoints = computed(() => store.permits.flatMap((permit) => permit.isolationPoints).filter((point) => point.device.includes(selectedDevice.value)))
const devices = [
  { id: 'WTG-03', name: '3 号风力发电机组', state: '检修隔离', load: '0 kW', points: 3, crew: '机务二班' },
  { id: 'LINE-A2', name: 'A2 集电线路', state: '待隔离', load: '0.8 MW', points: 3, crew: '线路一班' },
  { id: 'BOX-12', name: '12 号箱式变压器', state: '运行', load: '2.4 MW', points: 1, crew: '电气一班' },
  { id: 'BUS-A', name: 'A 段 35kV 母线', state: '运行', load: '18.6 MW', points: 1, crew: '公用' },
]

function openHandover(lockId: string) {
  const lock = store.lockLedger.find((item) => item.id === lockId)
  if (!lock) return
  handover.lockId = lock.id
  handover.toHolder = lock.holder === '待领用' ? '' : lock.holder
  handover.state = lock.state
  handoverModal.value = true
}
function confirmHandover() {
  if (!handover.lockId || !handover.toHolder.trim()) return
  store.recordLockHandover(handover.lockId, handover.toHolder.trim(), handover.state)
  handoverModal.value = false
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">LOCKOUT / TAGOUT</p><h1 class="page-title">设备隔离与锁定点</h1><p class="muted">统一维护设备隔离点、锁具、验电步骤和跨班组占用状态。</p></div><UButton color="primary" icon="i-heroicons-plus">登记隔离点</UButton></div>
    <div class="device-grid">
      <article v-for="device in devices" :key="device.id" class="panel device" :class="{ active: selectedDevice === device.id }" @click="selectedDevice = device.id"><div class="inline justify-between"><UBadge variant="subtle">{{ device.id }}</UBadge><UBadge :color="device.state === '运行' ? 'green' : device.state === '检修隔离' ? 'red' : 'amber'" variant="subtle">{{ device.state }}</UBadge></div><h2>{{ device.name }}</h2><div class="kv"><span>当前负荷</span><b>{{ device.load }}</b></div><div class="kv"><span>隔离点</span><b>{{ device.points }} 个</b></div><div class="kv"><span>责任班组</span><b>{{ device.crew }}</b></div></article>
    </div>
    <section class="grid lower"><article class="panel p-4"><h2>{{ selectedDevice }} · 隔离检查单</h2><div v-for="point in selectedPoints" :key="point.id" class="point"><div class="lock-icon"><UIcon name="i-heroicons-lock-closed" /></div><div><b>{{ point.label }}</b><small>{{ point.type }} · {{ point.id }}<template v-if="point.sharedKey"> · 共用点 {{ point.sharedKey }}</template><template v-if="point.lockId"> · {{ point.lockId }}</template></small></div><UBadge :color="point.state === '已隔离' ? 'green' : 'amber'" variant="subtle">{{ point.state }}</UBadge><UButton size="xs" variant="ghost">操作记录</UButton></div><UAlert v-if="!selectedPoints.length" color="gray" title="该设备暂无隔离点" description="可在许可中新建隔离点并关联设备。" /></article><article class="panel p-4"><h2>交叉冲突检测</h2><UAlert color="red" variant="soft" title="LINE-A2 与 BOX-12 共用母线隔离边界" description="两个作业在同一时间窗内涉及 BUS-A，需由值班负责人确认先后顺序与交接条件；应急恢复时共用隔离点同一时间只放行一条。" /><h3>锁定器具台账<UBadge v-if="store.inEmergency" color="blue" variant="solid" class="ml-2">应急暂停中可交接</UBadge></h3><div v-for="lock in store.lockLedger" :key="lock.id" class="tool"><span>{{ lock.id }}</span><b>{{ lock.location }} · {{ lock.holder }}</b><UBadge :color="lock.state === '已锁定' ? 'green' : lock.state === '待领用' ? 'amber' : 'gray'" variant="subtle">{{ lock.state }}</UBadge><UButton size="xs" variant="ghost" icon="i-heroicons-arrows-right-left" @click="openHandover(lock.id)">交接</UButton></div><UAlert v-if="store.inEmergency" class="mt-3" color="blue" variant="soft" title="暂停期间仍可补记锁具交接" description="交接后台账更新，关联许可的原隔离结论失效，恢复时转待复核；其余许可继续排队。" /><UButton block color="primary" class="mt-4" icon="i-heroicons-check-badge">完成隔离确认</UButton></article></section>
    <UModal v-model="handoverModal"><article class="p-5"><h2>锁具交接</h2><p class="muted">更新锁具持有人或状态；台账更新后关联许可的原隔离结论即时失效。</p><div class="form-grid"><UFormGroup label="锁具编号"><UInput v-model="handover.lockId" disabled /></UFormGroup><UFormGroup label="接管人"><UInput v-model="handover.toHolder" placeholder="如：赵清" /></UFormGroup><UFormGroup label="锁具状态"><USelect v-model="handover.state" :options="['已锁定','待领用','已拆除']" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="handoverModal = false">取消</UButton><UButton color="primary" icon="i-heroicons-arrows-right-left" :disabled="!handover.toHolder.trim()" @click="confirmHandover">确认交接</UButton></div></article></UModal>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.device-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.device{padding:16px;cursor:pointer}.device.active{border-color:#2563eb;box-shadow:0 0 0 2px #dbeafe}.device h2{font-size:16px;margin:14px 0}.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:13px}.kv span{color:#667085}.lower{grid-template-columns:1.3fr .7fr;gap:16px}.panel h2{font-size:17px;margin:0 0 14px}.point{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf0f5}.point>div:nth-child(2){flex:1}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.lock-icon{display:grid;place-items:center;width:34px;height:34px;background:#eff6ff;color:#2563eb;border-radius:7px}.tool{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #edf0f5}.tool span{color:#2563eb;font-family:monospace}.tool b{font-size:13px}
@media(max-width:1050px){.device-grid{grid-template-columns:1fr 1fr}.lower{grid-template-columns:1fr}}@media(max-width:600px){.head{flex-direction:column;gap:12px}.device-grid{grid-template-columns:1fr}}
</style>

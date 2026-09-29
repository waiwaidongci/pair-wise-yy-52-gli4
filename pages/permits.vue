<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'
import type { Permit } from '~/types'

const store = useOperationsStore()
const route = useRoute()
const selectedId = ref(String(route.query.id || store.permits[0]?.id))
const modal = ref(route.query.new === '1')
const pauseModal = ref(false)
const takeover = ref('赵清')
const form = reactive({ title: '', device: '', crew: '电气一班', owner: '孙禾', window: '09-30 08:00 — 12:00', risk: '二级' as Permit['risk'] })
const selected = computed(() => store.permits.find((item) => item.id === selectedId.value) ?? store.permits[0])
const completed = computed(() => selected.value ? Math.round(selected.value.steps.filter((step) => step.done).length / selected.value.steps.length * 100) : 0)
const statusIndex = computed(() => ['待复核', '待执行', '执行中', '待结束', '待关闭', '已完成'].indexOf(selected.value?.status ?? ''))
const pauseTargets = computed(() => store.permits.filter((item) => ['待执行', '执行中'].includes(item.status)))

function createPermit() {
  if (!form.title.trim() || !form.device.trim()) return
  const permit: Permit = {
    id: `WP-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${String(store.permits.length + 31).padStart(3, '0')}`,
    ...form, status: '待复核', revision: 1, reviewRequired: false, paused: false, conclusionValid: true, resumeRequestedAt: null, resumeOrder: null,
    isolationPoints: [{ id: `IP-${Date.now().toString().slice(-4)}`, device: form.device, label: '主隔离点', type: '开关', state: '待操作' }],
    steps: [{ id: 'ST-31', text: '核对设备双重编号与工作范围', done: false, owner: form.owner }, { id: 'ST-32', text: '完成隔离、锁定、验电和接地', done: false, owner: form.owner }],
  }
  store.addPermit(permit)
  selectedId.value = permit.id
  modal.value = false
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">许可全生命周期</p><h1 class="page-title">作业许可证</h1><p class="muted">从申请、复核到执行、结束和关闭，每一步留存负责人、时间、附件与现场确认。</p></div><div class="inline"><UButton v-if="store.inEmergency" color="gray" variant="outline" icon="i-heroicons-shield-exclamation" @click="store.confirmWindStopped()">风已停 · 确认恢复</UButton><UButton color="red" variant="solid" icon="i-heroicons-exclamation-triangle" @click="pauseModal = true">应急暂停</UButton><UButton icon="i-heroicons-plus" color="primary" @click="modal = true">新建许可</UButton></div></div>
    <UAlert v-if="store.inEmergency" class="mb-4" color="red" variant="soft" icon="i-heroicons-shield-exclamation" title="应急暂停中" :description="`接管人 ${store.emergency?.takeover} · 已冻结 ${store.frozenCount} 条许可 · ${store.windStopped ? '风已停，可提交恢复' : '风况限制中，禁止现场作业'}；锁具交接仍可在「隔离与锁定」补记。`" />
    <div class="permit-layout">
      <aside class="panel permit-list">
        <button v-for="permit in store.permits" :key="permit.id" :class="{ active: permit.id === selectedId }" @click="selectedId = permit.id"><span><b>{{ permit.id }}</b><small>{{ permit.title }}</small></span><span class="inline"><UBadge v-if="permit.paused" color="blue" variant="solid">冻结</UBadge><UBadge :color="permit.reviewRequired ? 'red' : 'amber'" variant="subtle">{{ permit.reviewRequired ? '冲突' : permit.status }}</UBadge></span></button>
      </aside>
      <section v-if="selected" class="grid detail-grid">
        <article class="panel p-4">
          <div class="detail-head"><div><small class="muted">{{ selected.id }} · 修订 r{{ selected.revision }}</small><h2>{{ selected.title }}</h2><p>{{ selected.device }} · {{ selected.window }}</p></div><UBadge size="lg" :color="selected.paused ? 'blue' : selected.reviewRequired ? 'red' : 'green'" variant="subtle">{{ selected.paused ? '已冻结' : selected.reviewRequired ? '待复核' : selected.status }}</UBadge></div>
          <div class="flow"><div v-for="(step,index) in ['申请','复核','执行','结束','关闭']" :key="step" :class="{ done: index <= statusIndex, current: index === statusIndex }"><i>{{ index + 1 }}</i><span>{{ step }}</span></div></div>
          <UAlert v-if="selected.paused" color="blue" variant="soft" title="应急暂停 · 许可已冻结" :description="`暂停前状态「${selected.status}」，步骤与推进就地冻结；风停后提交恢复，共用隔离点按顺序放行。现场锁具交接请到「隔离与锁定」补记。`" />
          <UAlert v-if="selected.reviewRequired && !selected.paused" color="red" variant="soft" title="设备状态变化触发复核" description="共用隔离点或相关设备状态已发生变化，关闭该许可前必须由值班负责人重新确认。" />
          <UAlert v-if="selected.resumeOrder" color="green" variant="soft" :title="`已恢复作业 · 恢复顺序第 ${selected.resumeOrder} 位`" description="该许可已按共用隔离点顺序放行，可继续现场步骤。" />
          <h3>操作步骤</h3>
          <div v-for="step in selected.steps" :key="step.id" class="step"><UCheckbox :model-value="step.done" :disabled="selected.paused" @update:model-value="store.toggleStep(selected.id, step.id)" /><div><b :class="{ completed: step.done }">{{ step.text }}</b><small>责任人 {{ step.owner }} · {{ step.evidence || '尚未上传证据' }}</small></div><UButton size="xs" variant="ghost" icon="i-heroicons-camera">证据</UButton></div>
          <UProgress :value="completed" class="mt-4" /><div class="inline justify-between mt-1"><span class="muted">步骤完成度</span><b>{{ completed }}%</b></div>
        </article>
        <aside class="grid right">
          <article class="panel p-4"><h3>隔离点与锁定</h3><div v-for="point in selected.isolationPoints" :key="point.id" class="point"><span><b>{{ point.label }}</b><small>{{ point.device }} · {{ point.type }}<template v-if="point.sharedKey"> · 共用点 {{ point.sharedKey }}</template><template v-if="point.lockId"> · 锁具 {{ point.lockId }}</template></small></span><UBadge :color="point.state === '已隔离' ? 'green' : 'amber'" variant="subtle">{{ point.state }}</UBadge></div></article>
          <article class="panel p-4"><h3>流程操作</h3><p class="muted">推进前系统重新检查隔离冲突、跨班组重叠与未完成交接。</p><UButton block color="primary" icon="i-heroicons-arrow-right-circle" :disabled="selected.paused" @click="store.advancePermit(selected.id)">推进到下一状态</UButton><UButton block class="mt-2" color="gray" variant="outline" icon="i-heroicons-arrow-uturn-left">退回补件</UButton><UButton v-if="selected.paused" block class="mt-2" color="green" variant="solid" icon="i-heroicons-play" :disabled="!store.windStopped" @click="store.submitResume(selected.id)">{{ store.windStopped ? '提交恢复' : '风况限制中 · 待风停' }}</UButton><UButton v-if="!store.inEmergency" block class="mt-2" color="red" variant="soft" icon="i-heroicons-exclamation-triangle" @click="pauseModal = true">申请紧急暂停</UButton></article>
          <article v-if="store.emergency" class="panel p-4"><h3>应急恢复时间线</h3><p class="muted">接管人 {{ store.emergency.takeover }} · 暂停于 {{ store.emergency.pausedAt }}<template v-if="store.emergency.windStoppedAt"> · 风停 {{ store.emergency.windStoppedAt }}</template></p><div class="point"><span><b>暂停前顺序</b><small>冻结时待执行/执行中许可</small></span><span class="mono">{{ store.emergency.order.join(' → ') || '—' }}</span></div><div class="point"><span><b>恢复放行顺序</b><small>风停后按提交顺序、共用点串行</small></span><span class="mono">{{ store.emergency.resumedOrder?.join(' → ') || '排队中' }}</span></div><div v-if="store.resumeQueue.length" class="point"><span><b>正在排队</b><small>共用隔离点等待放行</small></span><span class="mono">{{ store.resumeQueue.join(' → ') }}</span></div></article>
        </aside>
      </section>
    </div>
    <UModal v-model="pauseModal"><article class="p-5"><h2>应急暂停 · 冻结全场作业</h2><p class="muted">风速骤升等紧急情况下，将所有待执行、执行中许可一起冻结，现场锁具与未完成步骤就地停止；暂停期间仍可补记锁具交接。</p><UAlert class="my-3" color="amber" variant="soft" :title="`将冻结 ${pauseTargets.length} 条许可`" :description="pauseTargets.map(p => `${p.id}（${p.status}）`).join('、') || '无待执行/执行中许可'" /><div class="form-grid"><UFormGroup label="现场接管人"><UInput v-model="takeover" placeholder="如：赵清" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="pauseModal = false">取消</UButton><UButton color="red" variant="solid" icon="i-heroicons-exclamation-triangle" :disabled="!takeover.trim()" @click="store.emergencyPause(takeover); pauseModal = false">确认应急暂停</UButton></div></article></UModal>
    <UModal v-model="modal"><article class="p-5"><h2>申请作业许可</h2><p class="muted">提交后进入安全复核，设备隔离冲突会在提交时自动校验。</p><div class="form-grid"><UFormGroup label="作业名称"><UInput v-model="form.title" /></UFormGroup><UFormGroup label="设备编号"><UInput v-model="form.device" /></UFormGroup><UFormGroup label="班组"><UInput v-model="form.crew" /></UFormGroup><UFormGroup label="负责人"><UInput v-model="form.owner" /></UFormGroup><UFormGroup label="计划窗口"><UInput v-model="form.window" /></UFormGroup><UFormGroup label="风险等级"><USelect v-model="form.risk" :options="['一级','二级','三级']" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="modal = false">取消</UButton><UButton color="primary" :disabled="!form.title || !form.device" @click="createPermit">提交复核</UButton></div></article></UModal>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.permit-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.permit-list{padding:8px;height:fit-content}.permit-list button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:13px 11px;border:0;background:transparent;border-radius:7px;text-align:left;color:inherit;cursor:pointer}.permit-list button:hover,.permit-list button.active{background:#eff6ff}.permit-list b,.permit-list small{display:block}.permit-list small{color:#667085;margin-top:4px;font-size:12px}.detail-grid{grid-template-columns:minmax(0,1.5fr) minmax(280px,.65fr);gap:16px}.right{height:fit-content;gap:14px}.detail-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px}.detail-head h2{margin:4px 0}.detail-head p{margin:0;color:#667085}.flow{display:grid;grid-template-columns:repeat(5,1fr);margin:20px 0}.flow>div{position:relative;text-align:center;color:#94a3b8}.flow>div:after{content:"";position:absolute;left:55%;right:-45%;top:13px;height:2px;background:#e2e8f0}.flow>div:last-child:after{display:none}.flow i{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;margin:auto;border-radius:50%;background:#e2e8f0;font-style:normal;font-size:12px}.flow span{display:block;font-size:12px;margin-top:5px}.flow .done{color:#2563eb}.flow .done i{background:#2563eb;color:#fff}.flow .done:after{background:#2563eb}.panel h3{font-size:15px;margin:18px 0 10px}.step{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5}.step div{flex:1}.step small{display:block;color:#667085;margin-top:4px}.step .completed{text-decoration:line-through;color:#667085}.point{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #edf0f5}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.mt-2{margin-top:8px}.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#475569}
@media(max-width:980px){.permit-layout{grid-template-columns:1fr}.permit-list{display:flex;overflow:auto}.permit-list button{min-width:230px}.detail-grid{grid-template-columns:1fr}}@media(max-width:620px){.head{flex-direction:column}.form-grid{grid-template-columns:1fr}}
</style>

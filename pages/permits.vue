<script setup lang="ts">
import { useOperationsStore, effectiveStatus } from '~/stores/operations'
import type { Permit } from '~/types'

const store = useOperationsStore()
const route = useRoute()
const selectedId = ref(String(route.query.id || store.permits[0]?.id))
const modal = ref(route.query.new === '1')
const pauseModal = ref(false)
const form = reactive({ title: '', device: '', crew: '电气一班', owner: '孙禾', window: '09-30 08:00 — 12:00', risk: '二级' as Permit['risk'] })
const pauseForm = reactive({
  reason: '轮毂高度风速骤升，立即中止高空及带电操作',
  initiatedBy: '李骁',
  handedTo: '赵清',
})
const selected = computed(() => store.permits.find((item) => item.id === selectedId.value) ?? store.permits[0])
const completed = computed(() => selected.value ? Math.round(selected.value.steps.filter((step) => step.done).length / selected.value.steps.length * 100) : 0)
const displayedStatus = computed(() => selected.value ? effectiveStatus(selected.value) : '')
const originalStatus = computed(() => selected.value?.prePauseStatus ?? selected.value?.status ?? '')
const statusIndex = computed(() => ['待复核', '待执行', '执行中', '待结束', '待关闭', '已完成'].indexOf(originalStatus.value))
const frozenPermits = computed(() => store.permits.filter((permit) => permit.status === '应急冻结').sort((a, b) => (a.pauseOrder ?? 0) - (b.pauseOrder ?? 0)))
const pendingReviewPermits = computed(() => frozenPermits.value.filter((permit) => permit.resumeState === '待复核'))

function createPermit() {
  if (!form.title.trim() || !form.device.trim()) return
  const permit: Permit = {
    id: `WP-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${String(store.permits.length + 31).padStart(3, '0')}`,
    ...form,
    status: '待复核',
    revision: 1,
    reviewRequired: false,
    isolationConclusionValid: true,
    isolationPoints: [{ id: `IP-${Date.now().toString().slice(-4)}`, device: form.device, label: '主隔离点', type: '开关', state: '待操作' }],
    steps: [{ id: 'ST-31', text: '核对设备双重编号与工作范围', done: false, owner: form.owner }, { id: 'ST-32', text: '完成隔离、锁定、验电和接地', done: false, owner: form.owner }],
  }
  store.addPermit(permit)
  selectedId.value = permit.id
  modal.value = false
}
function submitPause() {
  if (!pauseForm.reason.trim() || !pauseForm.initiatedBy.trim() || !pauseForm.handedTo.trim()) return
  store.emergencyPause({ ...pauseForm })
  pauseModal.value = false
}
function sharedConcurrentIds() {
  return frozenPermits.value
    .filter((permit, _index, all) => all.some((other) => other.id !== permit.id && permit.isolationPoints.some((point) => other.isolationPoints.some((candidate) => candidate.id === point.id))))
    .map((permit) => permit.id)
}
function requestAllResume() {
  store.requestResume(frozenPermits.value.map((permit) => permit.id))
}
function requestSharedResume() {
  store.requestResume(sharedConcurrentIds())
}
function statusColor(status: string) {
  if (status.includes('待复核')) return 'red'
  if (status.includes('冻结') || status.includes('排队')) return 'orange'
  return status === '执行中' || status === '已完成' ? 'green' : 'amber'
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">许可全生命周期</p><h1 class="page-title">作业许可证</h1><p class="muted">从申请、复核到执行、结束和关闭，每一步留存负责人、时间、附件与现场确认。</p></div><UButton icon="i-heroicons-plus" color="primary" @click="modal = true">新建许可</UButton></div>

    <section class="panel emergency-panel" :class="store.emergency.status">
      <div class="emergency-title">
        <UIcon :name="store.emergency.status === '正常' ? 'i-heroicons-shield-check' : 'i-heroicons-exclamation-triangle'" />
        <div><h2>应急暂停与恢复控制台</h2><p v-if="store.emergency.status === '正常'">风速骤升时一键冻结所有待执行、执行中的许可；已完成许可不受影响。</p><p v-else>风速 {{ store.windSpeed }} m/s · {{ store.emergency.reason }}</p></div>
      </div>
      <div v-if="store.emergency.status === '正常'" class="emergency-actions"><UButton color="red" variant="soft" icon="i-heroicons-pause-circle" @click="pauseModal = true">启动应急暂停</UButton></div>
      <div v-else class="emergency-actions vertical">
        <UButton color="green" :disabled="store.emergency.status !== '暂停中'" icon="i-heroicons-wind" @click="store.beginRecovery()">风停，开启恢复</UButton>
        <UButton color="primary" :disabled="store.emergency.status !== '恢复中' || !frozenPermits.length" icon="i-heroicons-arrow-path" @click="requestAllResume">全部许可同时提交恢复</UButton>
        <UButton color="amber" variant="soft" :disabled="store.emergency.status !== '恢复中' || sharedConcurrentIds().length < 2" icon="i-heroicons-link" @click="requestSharedResume">仅两张共用许可同时提交</UButton>
        <UButton color="gray" variant="ghost" icon="i-heroicons-lock-closed" @click="navigateTo('/devices')">补记锁具交接</UButton>
      </div>
      <div v-if="store.emergency.status !== '正常'" class="emergency-meta">
        <div><span>暂停发起人</span><b>{{ store.emergency.initiatedBy }}</b></div>
        <div><span>现场接管人</span><b>{{ store.emergency.handedTo }}</b></div>
        <div><span>暂停时间</span><b>{{ store.emergency.startedAt }}</b></div>
        <div><span>恢复开启</span><b>{{ store.emergency.recoveryStartedAt || '等待风停确认' }}</b></div>
      </div>
      <div v-if="store.emergency.status !== '正常'" class="queue-strip">
        <div v-for="permit in frozenPermits" :key="permit.id" class="queue-card" :class="permit.resumeState">
          <b>#{{ permit.pauseOrder }} · {{ permit.id }}</b>
          <span>暂停前：{{ permit.prePauseStatus }}</span>
          <UBadge size="xs" :color="permit.resumeState === '已放行' ? 'green' : permit.resumeState === '待复核' ? 'red' : permit.resumeState === '排队中' ? 'orange' : 'gray'" variant="subtle">{{ permit.resumeState }}</UBadge>
        </div>
      </div>
    </section>

    <div class="permit-layout">
      <aside class="panel permit-list">
        <button v-for="permit in store.permits" :key="permit.id" :class="{ active: permit.id === selectedId }" @click="selectedId = permit.id"><span><b>{{ permit.id }}</b><small>{{ permit.title }}</small></span><UBadge :color="statusColor(effectiveStatus(permit))" variant="subtle">{{ effectiveStatus(permit) }}</UBadge></button>
      </aside>
      <section v-if="selected" class="grid detail-grid">
        <article class="panel p-4">
          <div class="detail-head"><div><small class="muted">{{ selected.id }} · 修订 r{{ selected.revision }}</small><h2>{{ selected.title }}</h2><p>{{ selected.device }} · {{ selected.window }}</p></div><UBadge size="lg" :color="statusColor(displayedStatus)" variant="subtle">{{ displayedStatus }}</UBadge></div>
          <div class="flow"><div v-for="(step,index) in ['申请','复核','执行','结束','关闭']" :key="step" :class="{ done: index < statusIndex, current: index === statusIndex && selected.status !== '应急冻结' }"><i>{{ index + 1 }}</i><span>{{ step }}</span></div></div>
          <UAlert v-if="selected.status === '应急冻结'" color="orange" variant="soft" :title="selected.resumeState === '待复核' ? '锁具台账触发待复核' : '许可已冻结，未完成步骤停在原处'" :description="selected.resumeState === '排队中' ? '共用隔离点前序许可尚未完成交接，本许可继续排队。' : '流程推进和步骤勾选均暂停；可到隔离与锁定页补记锁具交接。'" />
          <UAlert v-else-if="selected.reviewRequired || !selected.isolationConclusionValid" color="red" variant="soft" title="设备状态变化触发复核" description="共用隔离点或相关锁具台账已发生变化，关闭该许可前必须由值班负责人重新确认。" />
          <h3>操作步骤</h3>
          <div v-for="step in selected.steps" :key="step.id" class="step"><UCheckbox :model-value="step.done" :disabled="selected.status === '应急冻结'" @update:model-value="store.toggleStep(selected.id, step.id)" /><div><b :class="{ completed: step.done }">{{ step.text }}</b><small>责任人 {{ step.owner }} · {{ step.evidence || '尚未上传证据' }}</small></div><UButton size="xs" variant="ghost" icon="i-heroicons-camera">证据</UButton></div>
          <UProgress :value="completed" class="mt-4" /><div class="inline justify-between mt-1"><span class="muted">步骤完成度</span><b>{{ completed }}%</b></div>
        </article>
        <aside class="grid right">
          <article class="panel p-4">
            <h3>暂停 / 恢复履历</h3>
            <div class="kv"><span>暂停前后顺序</span><b>{{ selected.pauseOrder ? `#${selected.pauseOrder}` : '未冻结' }}</b></div>
            <div class="kv"><span>暂停前状态</span><b>{{ selected.prePauseStatus ?? '—' }}</b></div>
            <div class="kv"><span>恢复状态</span><b>{{ selected.resumeState ?? '未申请' }}</b></div>
            <div class="kv"><span>现场接管人</span><b>{{ store.emergency.handedTo || '—' }}</b></div>
            <div class="kv"><span>原审计</span><UButton size="xs" variant="ghost" @click="navigateTo(`/audit?keyword=${selected.id}`)">查看</UButton></div>
          </article>
          <article class="panel p-4"><h3>隔离点与锁定</h3><div v-for="point in selected.isolationPoints" :key="point.id" class="point"><span><b>{{ point.label }}</b><small>{{ point.device }} · {{ point.type }}</small></span><UBadge :color="point.state === '已隔离' ? 'green' : point.state === '已恢复' ? 'gray' : 'amber'" variant="subtle">{{ point.state }}</UBadge></div></article>
          <article v-if="selected.status === '应急冻结' && selected.resumeState === '待复核'" class="panel p-4">
            <h3>值班负责人复核</h3>
            <p class="muted">锁具台账更新后，原隔离结论已失效；确认边界无误后恢复结论并重新排队。</p>
            <UButton block color="red" icon="i-heroicons-check-badge" @click="store.resolveReview(selected.id, true)">确认复核通过</UButton>
            <UButton block class="mt-2" color="gray" variant="outline" @click="store.resolveReview(selected.id, false)">退回补正</UButton>
          </article>
          <article class="panel p-4"><h3>流程操作</h3><p class="muted">推进前系统重新检查隔离冲突、跨班组重叠与未完成交接。</p><UButton block color="primary" icon="i-heroicons-arrow-right-circle" :disabled="selected.status === '应急冻结'" @click="store.advancePermit(selected.id)">推进到下一状态</UButton><UButton block class="mt-2" color="gray" variant="outline" icon="i-heroicons-arrow-uturn-left" :disabled="selected.status === '应急冻结'">退回补件</UButton><UButton block class="mt-2" color="red" variant="soft" icon="i-heroicons-pause-circle" :disabled="store.emergency.status !== '正常'" @click="pauseModal = true">申请紧急暂停</UButton></article>
        </aside>
      </section>
    </div>
    <UModal v-model="modal"><article class="p-5"><h2>申请作业许可</h2><p class="muted">提交后进入安全复核，设备隔离冲突会在提交时自动校验。</p><div class="form-grid"><UFormGroup label="作业名称"><UInput v-model="form.title" /></UFormGroup><UFormGroup label="设备编号"><UInput v-model="form.device" /></UFormGroup><UFormGroup label="班组"><UInput v-model="form.crew" /></UFormGroup><UFormGroup label="负责人"><UInput v-model="form.owner" /></UFormGroup><UFormGroup label="计划窗口"><UInput v-model="form.window" /></UFormGroup><UFormGroup label="风险等级"><USelect v-model="form.risk" :options="['一级','二级','三级']" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="modal = false">取消</UButton><UButton color="primary" :disabled="!form.title || !form.device" @click="createPermit">提交复核</UButton></div></article></UModal>
    <UModal v-model="pauseModal"><article class="p-5"><h2>启动应急暂停</h2><p class="muted">所有待执行、执行中许可将按当前顺序冻结；锁具交接仍允许现场补记。</p><div class="form-grid single"><UFormGroup label="暂停原因"><UInput v-model="pauseForm.reason" /></UFormGroup><UFormGroup label="值班发起人"><UInput v-model="pauseForm.initiatedBy" /></UFormGroup><UFormGroup label="现场接管人"><UInput v-model="pauseForm.handedTo" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="pauseModal = false">取消</UButton><UButton color="red" :disabled="!pauseForm.reason || !pauseForm.initiatedBy || !pauseForm.handedTo" @click="submitPause">确认冻结</UButton></div></article></UModal>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.emergency-panel{padding:15px;margin-bottom:16px;border:1px solid #fed7aa;background:#fff7ed}.emergency-panel.恢复中{border-color:#bfdbfe;background:#eff6ff}.emergency-title{display:flex;gap:12px;align-items:flex-start}.emergency-title>span{display:none}.emergency-title .iconify,.emergency-title svg{font-size:22px;color:#ea580c}.emergency-title h2{font-size:16px;margin:0 0 3px}.emergency-title p{margin:0;color:#667085;font-size:13px}.emergency-panel>div:first-child{display:flex;justify-content:space-between;gap:14px}.emergency-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}.vertical{flex-direction:column;align-items:stretch;min-width:210px}.emergency-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:13px}.emergency-meta div{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:9px}.emergency-meta span,.emergency-meta b{display:block}.emergency-meta span{font-size:12px;color:#667085}.emergency-meta b{font-size:13px;margin-top:3px}.queue-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.queue-card{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:7px;background:#fff;border:1px solid #e2e8f0;font-size:12px}.queue-card span{color:#667085}.queue-card.待复核{border-color:#fecaca}.queue-card.排队中{border-color:#fdba74}.queue-card.已放行{border-color:#86efac}.permit-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.permit-list{padding:8px;height:fit-content}.permit-list button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:13px 11px;border:0;background:transparent;border-radius:7px;text-align:left;color:inherit;cursor:pointer}.permit-list button:hover,.permit-list button.active{background:#eff6ff}.permit-list b,.permit-list small{display:block}.permit-list small{color:#667085;margin-top:4px;font-size:12px}.detail-grid{grid-template-columns:minmax(0,1.5fr) minmax(300px,.75fr);gap:16px}.right{height:fit-content;gap:14px}.detail-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px}.detail-head h2{margin:4px 0}.detail-head p{margin:0;color:#667085}.flow{display:grid;grid-template-columns:repeat(5,1fr);margin:20px 0}.flow>div{position:relative;text-align:center;color:#94a3b8}.flow>div:after{content:"";position:absolute;left:55%;right:-45%;top:13px;height:2px;background:#e2e8f0}.flow>div:last-child:after{display:none}.flow i{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;margin:auto;border-radius:50%;background:#e2e8f0;font-style:normal;font-size:12px}.flow span{display:block;font-size:12px;margin-top:5px}.flow .done{color:#2563eb}.flow .done i{background:#2563eb;color:#fff}.flow .done:after{background:#2563eb}.panel h3{font-size:15px;margin:18px 0 10px}.step{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5}.step div{flex:1}.step small{display:block;color:#667085;margin-top:4px}.step .completed{text-decoration:line-through;color:#667085}.point,.kv{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #edf0f5}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.kv{font-size:13px}.kv span{color:#667085}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.form-grid.single{grid-template-columns:1fr}.mt-2{margin-top:8px}
@media(max-width:1100px){.detail-grid{grid-template-columns:1fr}.emergency-meta{grid-template-columns:1fr 1fr}}@media(max-width:980px){.permit-layout{grid-template-columns:1fr}.permit-list{display:flex;overflow:auto}.permit-list button{min-width:230px}}@media(max-width:620px){.head{flex-direction:column}.form-grid{grid-template-columns:1fr}.emergency-panel>div:first-child{flex-direction:column}.emergency-actions{justify-content:stretch}.emergency-actions .btn{width:100%}.emergency-meta{grid-template-columns:1fr}}
</style>

<script setup lang="ts">
import { useOperationsStore, effectiveStatus } from '~/stores/operations'

const store = useOperationsStore()
const { data } = await useFetch('/api/operations')
const { reconnect } = useRealtime((event) => {
  if (event.type === 'connection') store.connection = event.payload.startsWith('在线') ? '在线' : '重连中'
  if (event.type === 'permit-update') store.latestAlert = event.payload
})
const counts = computed(() => ({
  active: store.permits.filter((item) => ['执行中', '待结束'].includes(item.status)).length,
  pending: store.permits.filter((item) => ['待复核', '待执行'].includes(item.status)).length,
  frozen: store.permits.filter((item) => item.status === '应急冻结').length,
  review: store.permits.filter((item) => item.reviewRequired || item.resumeState === '待复核').length,
}))
const resumeQueues = computed(() => store.permits.filter((item) => ['排队中', '待复核', '待放行'].includes(item.resumeState ?? '')))
</script>

<template>
  <div class="page">
    <div class="head">
      <div><p class="eyebrow">现场安全运行</p><h1 class="page-title">隔离与作业许可总览</h1><p class="muted">设备状态、隔离锁定、跨班组冲突和许可流转集中于同一视图。</p></div>
      <div class="inline wrap"><UButton color="gray" variant="outline" icon="i-heroicons-arrow-path" @click="reconnect">检查连接</UButton><UButton color="primary" icon="i-heroicons-document-plus" @click="navigateTo('/permits?new=1')">申请作业许可</UButton></div>
    </div>
    <UAlert v-if="store.emergency.status !== '正常'" class="mb-4" :color="store.emergency.status === '暂停中' ? 'red' : 'blue'" variant="soft" icon="i-heroicons-exclamation-triangle" :title="`应急${store.emergency.status} · 风速 ${store.windSpeed} m/s`" :description="`发起人 ${store.emergency.initiatedBy}，现场接管人 ${store.emergency.handedTo || '未登记'}；暂停时间 ${store.emergency.startedAt}。冻结许可保留暂停前后顺序。`" :actions="[{ label: '打开恢复控制台', click: () => navigateTo('/permits') }]" />
    <UAlert v-if="store.latestAlert" class="mb-4" color="amber" variant="soft" icon="i-heroicons-exclamation-triangle" title="实时冲突提醒" :description="store.latestAlert" :actions="[{ label: '协调并确认', click: store.acceptAlert }]" />
    <section class="grid metrics">
      <article class="panel metric"><span>已放行执行许可</span><strong>{{ counts.active }}</strong><small>冻结许可不计入可作业数</small></article>
      <article class="panel metric"><span>待复核 / 待执行</span><strong>{{ counts.pending }}</strong><small>最早 18:00 开工</small></article>
      <article class="panel metric"><span>应急冻结 / 待复核</span><strong class="danger">{{ counts.frozen }} / {{ counts.review }}</strong><small>共用点按顺序恢复</small></article>
      <article class="panel metric"><span>设备在线</span><strong>{{ data?.onlineDevices }}/{{ data?.totalDevices }}</strong><small>现场风速 {{ store.windSpeed }} m/s</small></article>
    </section>
    <section class="grid main-grid">
      <article class="panel p-4">
        <div class="panel-head"><div><h2>当前作业状态</h2><p class="muted">按风险、暂停顺序和恢复批次排序</p></div><UBadge color="blue" variant="subtle">版本 r{{ data?.revision }}</UBadge></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>许可 / 作业</th><th>设备</th><th>负责人</th><th>暂停顺序</th><th>状态</th><th></th></tr></thead><tbody>
          <tr v-for="permit in store.permits" :key="permit.id"><td><b>{{ permit.id }}</b><small class="block muted">{{ permit.title }}</small></td><td>{{ permit.device }}</td><td>{{ permit.owner }} · {{ permit.crew }}</td><td>{{ permit.pauseOrder ? `#${permit.pauseOrder}` : '—' }}</td><td><UBadge :color="permit.resumeState === '待复核' ? 'red' : permit.status === '应急冻结' ? 'orange' : permit.status === '执行中' ? 'green' : 'amber'" variant="subtle">{{ effectiveStatus(permit) }}</UBadge></td><td><UButton size="xs" variant="ghost" @click="navigateTo(`/permits?id=${permit.id}`)">进入</UButton></td></tr>
        </tbody></table></div>
      </article>
      <aside class="grid side-grid">
        <article class="panel p-4">
          <h2>恢复排队</h2>
          <div v-if="!resumeQueues.length" class="muted queue-empty">尚无恢复申请；应急暂停后在此显示待放行、排队和待复核许可。</div>
          <div v-for="permit in resumeQueues" :key="permit.id" class="queue-row">
            <div><b>#{{ permit.pauseOrder }} · {{ permit.id }}</b><small>{{ permit.resumeState }} · 暂停前 {{ permit.prePauseStatus }}</small></div>
            <UBadge size="xs" :color="permit.resumeState === '待复核' ? 'red' : permit.resumeState === '排队中' ? 'orange' : 'blue'" variant="subtle">{{ permit.resumeState }}</UBadge>
          </div>
        </article>
        <article class="panel p-4"><h2>现场条件</h2><div class="condition"><span>轮毂高度风速</span><b>{{ store.windSpeed }} m/s</b></div><div class="condition"><span>能见度</span><b>12 km</b></div><div class="condition"><span>高空作业</span><b :class="store.emergency.status === '正常' ? 'danger' : ''">{{ store.emergency.status === '正常' ? '暂停' : store.emergency.status }}</b></div><div class="condition"><span>下一次窗口</span><b>{{ store.emergency.status === '恢复中' ? '按队列放行' : '17:40 复核' }}</b></div></article>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.mb-4{margin-bottom:16px}.metrics{grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.metric{padding:17px}.main-grid{grid-template-columns:minmax(0,1.65fr) minmax(300px,.7fr);gap:16px}.panel-head{display:flex;justify-content:space-between;margin-bottom:12px}.panel h2{font-size:17px;margin:0 0 12px}.panel-head h2{margin:0}.panel-head p{font-size:12px;margin:3px 0}.block,.device-row small{display:block}.side-grid{gap:14px}.queue-empty{font-size:13px;line-height:1.6}.queue-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #edf0f5}.queue-row b,.queue-row small{display:block}.queue-row small{color:#667085;font-size:12px;margin-top:4px}.condition{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5;font-size:14px}.condition span{color:#667085}
@media(max-width:1100px){.metrics{grid-template-columns:1fr 1fr}.main-grid{grid-template-columns:1fr}}@media(max-width:620px){.head{flex-direction:column}.metrics{grid-template-columns:1fr}}
</style>

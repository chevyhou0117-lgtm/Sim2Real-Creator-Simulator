// 模拟运行 + 3D 回放统一页
//
// 三态状态机：
//   STARTING → 触发 planApi.run，等 RUN_STATUS 进入 RUNNING/SUCCESS/FAILED
//   RUNNING  → 后端 DES 计算中，UI 显示 spinner + 进度
//   READY    → 模拟完成 → 拉事件流 → POST /kit/playback ingest → 显示 iframe + 时间轴回放
//   FAILED   → 失败提示
//
// 入口：
//   - PlanConfig "启动模拟" → /simulation/plan/{id}/running（首次跑）
//   - ResultAnalysis "3D回放" → /simulation/plan/{id}/running（重看，跳过 STARTING/RUNNING 直入 READY）
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  XCircle, AlertCircle, CheckCircle2, Loader2, ChevronLeft,
  FileText, X, Footprints, RotateCw, PlayCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { planApi, masterApi, resolveCreatorUrl, adminApi } from '@/lib/api';
import { kitEnsureStage, kitCurrentStage, subscribeKitSelection, subscribeOpenedStageResult, kitSelectPrim, kitSelectMany, kitFocusPerspective, kitFocusPerspectiveMany } from '@/lib/kit';
import { AssetSidebar } from './plan-config/AssetSidebar';
import { buildAssetTree, collectEquipmentPrimPaths, findNode as findNodeV2 } from './plan-config/asset-tree-builder';
import type { TreeNode as TreeNodeV2 } from './plan-config/types';
import {
  loadPlaybackFromBackend, ingestPlayback, getPlaybackState, controlPlayback,
  playbackPlay, playbackPause, playbackSeek, playbackSpeed,
  type PlaybackState, type PlaybackEvent,
} from '@/lib/playback';
import { PlaybackTimeline, type TimelineEventMarker } from '@/components/PlaybackTimeline';
import { WalkMode } from '@/components/WalkMode';
import { DeviceStatusOverlay } from '@/components/DeviceStatusOverlay';
import { LineProgressPanel } from '@/components/LineProgressPanel';
import { KitViewport } from '@/components/KitViewport';

const KIT_STREAM_URL = (import.meta.env.VITE_KIT_STREAM_URL ?? '').trim();
const BACKEND_DIRECT_URL = (import.meta.env.VITE_BACKEND_DIRECT_URL ?? 'http://localhost:8000').trim();

// PREPARED：4 步全部完成、场景已加载好，但还没点「回放」——展示完成的步骤 + 可点的回放按钮
type PageState = 'STARTING' | 'RUNNING' | 'PREPARED' | 'READY' | 'FAILED' | 'NOT_RUN';
// RUNNING 屏的 4 个步骤（顺序即展示顺序）：
// des=DES计算 / linebalance=线平衡计算 / persist=数据写入 / loading-scene=加载场景
type RunPhase = 'des' | 'linebalance' | 'persist' | 'loading-scene';
type PhaseTimings = { des?: number; linebalance?: number; persist?: number; scene?: number };

// 用于在时间轴上画标记的 event_type 白名单（"中"密度——只标异常 / 关键边界）
const NOTABLE_EVENT_TYPES: Record<string, { label: string; color: string }> = {
  FAILURE_START:    { label: 'Equipment Failure', color: '#ef4444' },
  NG_DETECTED:      { label: 'NG Detected', color: '#f59e0b' },
  CHANGEOVER_START: { label: 'Changeover',     color: '#8b5cf6' },
};

export function SimulationRunningPage() {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  // location.state.autoStart 标记入口来源："启动模拟"按钮 navigate 时 = true；
  // 刷新页面 / 直接打开 URL = undefined → 不自动 run，避免重跑已完成的模拟
  const location = useLocation();
  const autoStart = (location.state as { autoStart?: boolean } | null)?.autoStart === true;
  const [planName, setPlanName] = useState<string>(planId ?? '');

  const [pageState, setPageState] = useState<PageState>('STARTING');
  const [progressPct, setProgressPct] = useState(0);     // 0-100，仅 RUNNING 显示
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);   // 总计算耗时（header 角标）
  // RUNNING 屏 4 步：DES计算 → 线平衡计算 → 数据写入 → 加载场景（场景加载完成才进 READY）
  const [runPhase, setRunPhase] = useState<RunPhase>('des');
  const [phaseTimings, setPhaseTimings] = useState<PhaseTimings>({});   // 各步实际耗时（秒）
  const [activeElapsed, setActiveElapsed] = useState(0);                // 当前进行中步骤的实时秒数
  const phaseStartRef = useRef<number>(0);                              // 当前步骤起点 performance.now()
  const [sceneLoaded, setSceneLoaded] = useState(false);   // openedStageResult success 置真（加载场景打勾）
  const sceneLoadedRef = useRef(false);                    // 供异步 enterReady 读最新值
  const [errorMsg, setErrorMsg] = useState<string>('');
  // 按需加载：点击 Kit 视口中的设备时拉该设备的事件（而不是全量持有）
  const [selectedDeviceEvents, setSelectedDeviceEvents] = useState<PlaybackEvent[]>([]);
  // 产线进度面板用：各线最后一台设备的 PROCESSING_END 事件（enterReady 时批量拉取，量小）
  const [lineProgressEvents, setLineProgressEvents] = useState<PlaybackEvent[]>([]);
  const [durationMs, setDurationMs] = useState(0);
  const [eventMarkers, setEventMarkers] = useState<TimelineEventMarker[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  // Kit 进程重启流程（Kit 卡死兜底）
  // phase: null=未在重启 | 'killing'=后端 pkill+spawn 中 | 'waiting-stage'=等 Kit 起来 + USD 加载
  //        | 're-ingesting'=重新推 playback 数据 + seek 回原 t_ms
  const [showKitRestart, setShowKitRestart] = useState(false);
  const [kitRestartPhase, setKitRestartPhase] = useState<
    null | 'killing' | 'waiting-stage' | 're-ingesting' | 'failed'
  >(null);
  const [kitRestartError, setKitRestartError] = useState<string>('');

  // 漫游模式 + 当前点选 prim（来自 Kit selection SSE 推送，空串=取消选中）
  const [walkActive, setWalkActive] = useState(false);
  const [selectedPrim, setSelectedPrim] = useState<string>('');

  // lookup maps：让 DeviceStatusOverlay / LineProgressPanel 把 UUID 换成中文名
  // 一次性在 enterReady 拉好，回放期间不变（master_data 是只读快照）
  const [equipmentInfoById, setEquipmentInfoById] = useState<Map<string, { name: string; line_id: string }>>(new Map());
  const [productNameById, setProductNameById] = useState<Map<string, string>>(new Map());
  // 每条线信息（id → {name, lbr?, target_qty}）
  const [lineStatById, setLineStatById] = useState<Map<string, { name: string; lbr: number | null; targetQty: number; sortKey: number }>>(new Map());
  // 每条线"最后一台设备"id —— 它的 PROCESSING_END 数量代表该线已完成产量
  // (用 PRODUCT_COMPLETE 时部分线不发会一直 0/1000，与用户预期不符)
  const [lineLastEquipmentById, setLineLastEquipmentById] = useState<Map<string, string>>(new Map());
  // 每条线 LBR 时序（点 = {t_min, lbr}）—— 来自后端 result_summary.line_lbr_timeseries
  // 模拟完成后即固定，回放时随 tMs 推进画播放头线即可（不需要重算）
  const [lbrSeriesByLine, setLbrSeriesByLine] = useState<Map<string, Array<{ t_min: number; lbr: number | null }>>>(new Map());

  // 资产树 (移植自 PlanConfig；回放页只读，不显示参数面板/齿轮)
  const [assetTreeV2, setAssetTreeV2] = useState<TreeNodeV2[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [expandedAssetIds, setExpandedAssetIds] = useState<string[]>([]);
  const selectedAssetNode = selectedAssetId ? findNodeV2(assetTreeV2, selectedAssetId) : null;
  // DeviceStatusOverlay 只关心 name；从 equipmentInfoById 派生一个 id→name 子映射避免 prop 类型耦合
  const equipmentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, info] of equipmentInfoById) m.set(id, info.name);
    return m;
  }, [equipmentInfoById]);

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);
  // 重启 Kit 时复用第一次 load-from-backend 的上下文
  const playbackContextRef = useRef<{
    planId: string;
    durationMs: number;
    usdUrl: string | null;
  } | null>(null);

  const stopPolls = () => {
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
    if (statePollRef.current) { clearInterval(statePollRef.current); statePollRef.current = null; }
  };

  // ── 1. 进入 READY 后：拉事件 + ingest 给 Kit + 启动 state 轮询 ──────────
  const enterReady = useCallback(async () => {
    if (!planId) return;
    try {
      // Kit 直连 sim_backend 拉取事件（治本：浏览器不再持有 664k 条事件，避免 tab OOM）
      // 先拿结果摘要获取 duration_ms + 事件总数
      const simResult = await planApi.result(planId);
      const planDurationMs = simResult.result_summary?.des_duration_ms
        ?? (Number(simResult.result_summary?.['des_duration_ms'] ?? 0) || 0);
      const totalEvents = simResult.result_summary?.des_event_count ?? 0;
      // 从结果摘要补全各步耗时（覆盖「重看已完成方案」这条没走轮询的入口）
      const storedTimings = simResult.result_summary?.phase_timings;
      if (storedTimings) setPhaseTimings(prev => ({ ...prev, ...storedTimings }));

      if (totalEvents === 0) {
        setErrorMsg(t('This simulation produced no events. Possible causes: the plan has no production tasks, no BoP Process is activated for any task (Line x Product), or the simulation duration is 0. Please check the plan configuration and run again.'));
        setPageState('FAILED');
        return;
      }
      setDurationMs(planDurationMs);

      // 时间轴标记：只拉 NOTABLE 类型（PRODUCT_COMPLETE / FAILURE_START）
      // 砍到 ~300 个上限：1500px 宽时间轴上肉眼分不出 200 + 100，再多就是无用 DOM。
      // 之前 5000+1000 = 6000 个 div × 多层嵌套 → 主线程 reconciliation 风暴，
      // Chrome/Firefox 都 1 分钟级崩（chrome.dll CHECK 触发，参 dmp 分析）。
      try {
        const [completeRes, failRes] = await Promise.all([
          planApi.events(planId, { event_type: 'PRODUCT_COMPLETE', limit: 200 }),
          planApi.events(planId, { event_type: 'FAILURE_START', limit: 100 }),
        ]);
        const notableEvents = [...completeRes.events, ...failRes.events];
        const markers: TimelineEventMarker[] = notableEvents
          .filter(e => e.event_type in NOTABLE_EVENT_TYPES)
          .map(e => ({
            tMs: e.timestamp_ms,
            label: t(NOTABLE_EVENT_TYPES[e.event_type].label),
            color: NOTABLE_EVENT_TYPES[e.event_type].color,
          }));
        setEventMarkers(markers);
      } catch (err) {
        console.warn('[Playback] 拉 NOTABLE 事件失败（时间轴标记将为空）:', err);
      }

      // 步骤④「加载场景」：确保对应 USD 已打开 + 把回放数据灌进 Kit。HTTP /ov/open_stage
      // 已阻塞到加载完成才返回，openedStageResult SSE（见下方 mount 订阅）再确认场景就绪。
      setRunPhase('loading-scene');
      sceneLoadedRef.current = false;
      setSceneLoaded(false);
      const sceneT0 = performance.now();
      let usdUrl: string | null = null;
      try {
        usdUrl = await resolveCreatorUrl(await planApi.get(planId));
        if (usdUrl) await kitEnsureStage(usdUrl);
        else console.warn('[Playback] 方案未关联 Creator 工厂项目或无 creator_url，跳过开 USD');
      } catch (err) {
        console.warn('[Playback] 打开 USD 失败（Kit 可能未启动）:', err);
      }

      // Kit 直接从 sim_backend 拉事件（不经过浏览器），避免浏览器 OOM
      // Kit 内部限制最多处理 30 万条事件，超出部分截断（不影响 2D 图表）
      try {
        const t0 = performance.now();
        console.info(`[Playback] load-from-backend 开始：${totalEvents} 条事件（Kit 上限 300k）…`);
        const session = await loadPlaybackFromBackend(planId, BACKEND_DIRECT_URL);
        setDurationMs(session.duration_ms);
        console.info(`[Playback] load-from-backend 完成，耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      } catch (err) {
        console.warn(`[Playback] Kit load-from-backend 失败，3D 画面将显示空帧:`, err);
      }

      // 步骤④「加载场景」实际耗时（开 USD + 灌回放数据）→ 定格显示
      setPhaseTimings(prev => ({ ...prev, scene: (performance.now() - sceneT0) / 1000 }));

      // 暂存上下文：Kit 卡死重启时重新 load-from-backend
      playbackContextRef.current = {
        planId,
        durationMs: planDurationMs,
        usdUrl,
      };

      // 拉 lookup：UUID → 中文名 + 线 → 目标产量/LBR。失败 fail-soft，不影响回放。
      try {
        const plan = await planApi.get(planId);
        const [eqCfg, products, tasks, lbrRows, simResult, stages] = await Promise.all([
          masterApi.equipmentConfig(plan.factory_id, planId).catch(() => null),
          masterApi.products().catch(() => []),
          planApi.tasks(planId).catch(() => []),
          planApi.lineBalance(planId).catch(() => []),
          planApi.result(planId).catch(() => null),
          masterApi.stages(plan.factory_id, planId).catch(() => []),
        ]);
        // stage_id → sequence，用于产线进度面板按制程顺序排
        const stageSeqById = new Map<string, number>();
        for (const s of stages) stageSeqById.set(s.stage_id, s.sequence);
        // equipment 数据里有 stage_id，每条线归到首个 equipment 的 stage_id 即可
        const lineStageSeq = new Map<string, number>();
        if (eqCfg?.items) {
          for (const e of eqCfg.items) {
            if (!lineStageSeq.has(e.line_id)) {
              lineStageSeq.set(e.line_id, stageSeqById.get(e.stage_id) ?? 999);
            }
          }
        }
        // equipment_id → {name, line_id}
        // 注意：LineEquipmentConfigOut 字段是 `items` 不是 `equipment`（之前写错了，map 一直空 → UUID 显示）
        const eqMap = new Map<string, { name: string; line_id: string }>();
        const lineNameMap = new Map<string, string>();
        // 每条线"最后一台设备"：按 operation_sequence 取该线最大值的设备
        const lastEqCandidate = new Map<string, { equipment_id: string; sequence: number }>();
        if (eqCfg?.items) {
          for (const e of eqCfg.items) {
            eqMap.set(e.equipment_id, { name: e.equipment_name, line_id: e.line_id });
            lineNameMap.set(e.line_id, e.line_name);
            const cur = lastEqCandidate.get(e.line_id);
            if (!cur || e.operation_sequence > cur.sequence) {
              lastEqCandidate.set(e.line_id, {
                equipment_id: e.equipment_id,
                sequence: e.operation_sequence,
              });
            }
          }
        }
        setEquipmentInfoById(eqMap);
        const lastEqMap = new Map<string, string>();
        for (const [lid, c] of lastEqCandidate) lastEqMap.set(lid, c.equipment_id);
        setLineLastEquipmentById(lastEqMap);
        // 产线进度面板：各线最后一台设备的 PROCESSING_END 事件（仅这些才代表"出线件数"）
        // 按线并行请求，单线约 plan_quantity 条，总量远小于全量事件
        try {
          const lastEqIds = [...lastEqMap.values()];
          if (lastEqIds.length > 0) {
            const perEqRes = await Promise.all(
              lastEqIds.map(eqId =>
                planApi.events(planId, { equipment_id: eqId, event_type: 'PROCESSING_END' })
                  .catch(() => ({ events: [] as Awaited<ReturnType<typeof planApi.events>>['events'] }))
              )
            );
            setLineProgressEvents(perEqRes.flatMap(r => r.events.map(e => ({
              timestamp_ms: e.timestamp_ms,
              event_type: e.event_type,
              prim_path: e.prim_path ?? '',
              equipment_id: e.equipment_id,
              product_id: e.product_id,
              metadata: e.metadata ?? null,
            }))));
          }
        } catch {
          // fail-soft: LineProgressPanel 显示 0/N 但不崩溃
        }
        // LBR 时序：后端 result_summary.line_lbr_timeseries = [{line_id, points: [{t_min, lbr}]}]
        const lbrSeries = new Map<string, Array<{ t_min: number; lbr: number | null }>>();
        const summary = simResult?.result_summary as { line_lbr_timeseries?: Array<{ line_id: string; points: Array<{ t_min: number; lbr: number | null }> }> } | null;
        if (summary?.line_lbr_timeseries) {
          for (const s of summary.line_lbr_timeseries) {
            lbrSeries.set(s.line_id, s.points ?? []);
          }
        }
        setLbrSeriesByLine(lbrSeries);
        // product_id → product_name；后端 events 里 product_id 既可能是 UUID 也可能是 code，
        // 两者都建索引，前端取的时候双 fallback。
        const prodMap = new Map<string, string>();
        for (const p of products) {
          prodMap.set(p.product_id, p.product_name);
          prodMap.set(p.product_code, p.product_name);
        }
        setProductNameById(prodMap);
        // line_id → {name, lbr, targetQty}
        const targetByLine = new Map<string, number>();
        for (const t of tasks) {
          targetByLine.set(t.line_id, (targetByLine.get(t.line_id) ?? 0) + (t.plan_quantity ?? 0));
        }
        const lbrByLine = new Map<string, number>();
        for (const row of lbrRows) {
          // LineBalanceOut 字段：line_id + overall_lbr / lbr（按 schemas/res.py）
          const lineId = (row as { line_id?: string }).line_id;
          const lbrVal = (row as { lbr?: number; overall_lbr?: number }).lbr ?? (row as { overall_lbr?: number }).overall_lbr;
          if (lineId && lbrVal != null) lbrByLine.set(lineId, Number(lbrVal));
        }
        const lineStat = new Map<string, { name: string; lbr: number | null; targetQty: number; sortKey: number }>();
        for (const [lid, name] of lineNameMap.entries()) {
          lineStat.set(lid, {
            name,
            lbr: lbrByLine.get(lid) ?? null,
            targetQty: targetByLine.get(lid) ?? 0,
            sortKey: lineStageSeq.get(lid) ?? 999,
          });
        }
        setLineStatById(lineStat);

        // 构造资产树（与 PlanConfig 同一棵）：左侧栏展示 + 单击/双击交互
        // 回放页 readOnly = editable false → 不显示齿轮、不出参数面板
        try {
          const lineProductsByLine = new Map<string, string[]>();
          for (const t of tasks) {
            if (!t.line_id || !t.product_code) continue;
            const arr = lineProductsByLine.get(t.line_id) ?? [];
            if (!arr.includes(t.product_code)) arr.push(t.product_code);
            lineProductsByLine.set(t.line_id, arr);
          }
          const selectedProductByLine = new Map<string, string>();
          for (const [lid, ps] of lineProductsByLine) {
            if (ps[0]) selectedProductByLine.set(lid, ps[0]);
          }
          const tree = await buildAssetTree({
            factoryId: plan.factory_id,
            factoryName: plan.plan_name,
            lineProductsByLine,
            selectedProductByLine,
            planId,
          });
          setAssetTreeV2(tree.tree);
          // 默认仅展开 factory + 各 stage（不展开任何 line），避免 SMT 线 01 撑开 25 工序
          // 把后续制程顶到面板外（视觉上"只看到一条线"的根因）。用户点 line 才展开它。
          const stageOnlyExpand = ['factory', ...(tree.tree[0]?.children ?? []).map(s => s.id)];
          setExpandedAssetIds(stageOnlyExpand);
        } catch (err) {
          console.warn('[Playback] 资产树构造失败（左侧栏将为空）:', err);
        }
      } catch (err) {
        console.warn('[Playback] 拉 lookup 数据失败（设备名/进度面板将退到 UUID）:', err);
      }

      // 启动 state 轮询：500ms（之前 250ms 触发 4 次/秒 全页 re-render +
      // 子组件 useMemo 重算（events 数组扫描），主线程压力撑爆 Blink/V8 CHECK）。
      // 500ms 在视觉上几乎察觉不到差别，但负载减半。inFlight 防重：上次未返回不发新请求。
      let inFlight = false;
      const poll = setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const s = await getPlaybackState();
          setPlaybackState(s);
        } catch { /* ignore — Kit 暂时不可达不阻塞 UI */ }
        finally { inFlight = false; }
      }, 500);
      statePollRef.current = poll;

      // 准备完毕：不再自动进回放，停在 PREPARED，由用户点「回放」按钮进入。
      setPageState('PREPARED');
    } catch (err) {
      console.error('[Playback] Failed to load events:', err);
      setErrorMsg(t('Failed to load simulation events: {{message}}', { message: (err as Error).message ?? err }));
      setPageState('FAILED');
    }
  }, [planId, t]);

  // ── 2. 入口 effect：检查现状 → 触发跑 / 直接 READY ───────────────────────
  useEffect(() => {
    if (!planId || triggeredRef.current) return;
    triggeredRef.current = true;

    (async () => {
      // 先拉 plan：既拿名字也判 FAILED 终态（FAILED 时主记录已被删，/run/status 会 404，
      // 不先看 plan.status 会误判成 NOT_RUN）
      let planRow: { plan_name?: string; status?: string } | null = null;
      try {
        planRow = await planApi.get(planId);
        if (planRow?.plan_name) setPlanName(planRow.plan_name);
      } catch { /* fall through */ }

      if (planRow?.status === 'FAILED') {
        setErrorMsg(t('The last simulation failed. Please reconfigure and retry.'));
        setPageState('FAILED');
        return;
      }

      // 先看现状
      let status: { computation_status: string };
      try {
        status = await planApi.runStatus(planId);
      } catch {
        // 后端无结果 → 仅在从「启动模拟」按钮进入时才自动 run
        // （刷新页面 location.state 会丢，避免重跑已完成的模拟）
        if (!autoStart) {
          setPageState('NOT_RUN');
          return;
        }
        try { await planApi.run(planId); } catch (err) {
          setErrorMsg(t('Failed to start simulation: {{message}}', { message: (err as Error).message ?? err }));
          setPageState('FAILED');
          return;
        }
        status = { computation_status: 'RUNNING' };
      }

      if (status.computation_status === 'SUCCESS') {
        // 已完成（重看场景）
        await enterReady();
        return;
      }
      if (status.computation_status === 'FAILED') {
        setErrorMsg(t('The last simulation failed. Please return to the config page and retry.'));
        setPageState('FAILED');
        return;
      }

      // RUNNING：开始轮询 + 视觉进度（3s 一次，写库期间后端 DB 繁忙，1s 太频繁）
      setPageState('RUNNING');
      let statusInFlight = false;
      const poll = setInterval(async () => {
        if (statusInFlight) return;
        statusInFlight = true;
        try {
          const s = await planApi.runStatus(planId);
          if (s.phase_timings) setPhaseTimings(prev => ({ ...prev, ...s.phase_timings }));  // 各步耗时随阶段补全
          if (s.computation_status === 'SUCCESS') {
            clearInterval(poll);
            statusPollRef.current = null;
            setProgressPct(100);
            await enterReady();
          } else if (s.computation_status === 'FAILED') {
            clearInterval(poll);
            statusPollRef.current = null;
            setErrorMsg(t('Simulation failed'));
            setPageState('FAILED');
          } else {
            // COMPUTING 子阶段映射：SIMULATING→DES计算 / AGGREGATING→线平衡 / PERSISTING→数据写入
            setRunPhase(
              s.computation_phase === 'PERSISTING' ? 'persist'
                : s.computation_phase === 'AGGREGATING' ? 'linebalance'
                : 'des',
            );
            setProgressPct(prev => Math.min(95, prev + 1));
            if (s.elapsed_sec != null) setElapsedSec(s.elapsed_sec);
          }
        } catch {
          // /run/status 404：失败兜底已把 result 删了。看 plan.status 兜一下，否则会
          // 误把"已失败"识别成"还在跑"，永远轮询不停。
          try {
            const p = await planApi.get(planId);
            if (p?.status === 'FAILED') {
              clearInterval(poll);
              statusPollRef.current = null;
              setErrorMsg(t('Simulation failed'));
              setPageState('FAILED');
            }
          } catch { /* keep polling */ }
        }
        finally { statusInFlight = false; }
      }, 3000);
      statusPollRef.current = poll;
    })();

    return () => { stopPolls(); };
  }, [planId, enterReady, autoStart, t]);

  // ── 2.5 Kit viewport selection SSE 订阅（进入 READY 后才有意义）─────────
  useEffect(() => {
    if (pageState !== 'READY') return;
    const unsub = subscribeKitSelection((primPath) => {
      setSelectedPrim(primPath);
    });
    return () => unsub();
  }, [pageState]);

  // ── 2.5b openedStageResult SSE 订阅（页面 mount 即订阅，须早于 enterReady 的 kitEnsureStage）─────
  // success → 阶段③打勾。失败不在此升 FAILED：enterReady 的 try/catch + Kit-down fail-soft 已覆盖，
  // 避免事件丢失把 READY 卡死（READY 仍由 enterReady 跑完既有 await 序列推进，不门控在 SSE 上）。
  useEffect(() => {
    const unsub = subscribeOpenedStageResult((r) => {
      if (r.result === 'success') { sceneLoadedRef.current = true; setSceneLoaded(true); }
      else console.warn('[Playback] openedStageResult error:', r.error);
    });
    return () => unsub();
  }, []);

  // ── 2.5c 当前进行中步骤的实时计时（客户端）：步骤切换即归零，运行中每秒走一格 ─────
  useEffect(() => {
    if (pageState !== 'RUNNING' && pageState !== 'STARTING') return;
    phaseStartRef.current = performance.now();
    setActiveElapsed(0);
    const id = setInterval(() => {
      setActiveElapsed((performance.now() - phaseStartRef.current) / 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [runPhase, pageState]);

  // ── 2.6 按需拉设备事件（点选 prim 时才拉该设备的事件，不全量持有）──────
  useEffect(() => {
    if (!selectedPrim || !planId) { setSelectedDeviceEvents([]); return; }
    let cancelled = false;
    planApi.events(planId, { prim_path: selectedPrim }).then(res => {
      if (!cancelled) setSelectedDeviceEvents(res.events.map(e => ({
        timestamp_ms: e.timestamp_ms,
        event_type: e.event_type,
        prim_path: e.prim_path ?? '',
        equipment_id: e.equipment_id,
        product_id: e.product_id,
        metadata: e.metadata ?? null,
      })));
    }).catch(() => { if (!cancelled) setSelectedDeviceEvents([]); });
    return () => { cancelled = true; };
  }, [selectedPrim, planId]);

  // ── 3. 控制行为 ────────────────────────────────────────────────────────
  // handlePlayPause 需要读 playbackState，但若把 state 放进 deps，每 500ms 轮询拿到
  // 新 state → callback identity 变化 → memo 包的 PlaybackTimeline 也跟着重渲染
  // → 等于 memo 没生效。用 ref 拉最新 state，callback 自身 deps=[] 永远稳定。
  const playbackStateRef = useRef<PlaybackState | null>(null);
  useEffect(() => { playbackStateRef.current = playbackState; }, [playbackState]);
  const handlePlayPause = useCallback(() => {
    if (playbackStateRef.current?.state === 'playing') {
      playbackPause().then(setPlaybackState).catch(err => console.warn('[Playback] pause:', err));
    } else {
      playbackPlay().then(setPlaybackState).catch(err => console.warn('[Playback] play:', err));
    }
  }, []);

  const handleSeek = useCallback((tMs: number) => {
    playbackSeek(tMs).then(setPlaybackState).catch(err => console.warn('[Playback] seek:', err));
  }, []);

  const handleSpeed = useCallback((factor: number) => {
    playbackSpeed(factor).then(setPlaybackState).catch(err => console.warn('[Playback] speed:', err));
  }, []);

  // ── 3.1 资产树交互（与 PlanConfigPage 一致）─────────────────────────────
  // 单击只高亮（kitSelect），双击运镜（kitFocusPerspective），不动相机的回俯视由
  // 双击 factory 节点替代（与 PlanConfig 同模式）。回放页 editable=false → 没有齿轮。
  const handleAssetSelect = useCallback((id: string) => {
    setSelectedAssetId(prev => prev === id ? null : id);
    const node = findNodeV2(assetTreeV2, id);
    if (!node) return;
    if (node.type === 'equipment') {
      if (node.prim_path) {
        kitSelectPrim(node.prim_path).catch((err: unknown) => console.warn('[Kit] select prim:', err));
      }
    } else if (node.type === 'operation' || node.type === 'line' || node.type === 'factory') {
      const paths = collectEquipmentPrimPaths(node);
      if (paths.length > 0) {
        kitSelectMany(paths).catch((err: unknown) => console.warn('[Kit] select-many:', err));
      }
    }
  }, [assetTreeV2]);

  const handleAssetDoubleSelect = useCallback((id: string) => {
    setSelectedAssetId(id);
    const node = findNodeV2(assetTreeV2, id);
    if (!node) return;
    if (node.type === 'equipment' && node.prim_path) {
      kitFocusPerspective(node.prim_path).catch((err: unknown) => console.warn('[Kit] focus:', err));
    } else if (node.type === 'operation' || node.type === 'line' || node.type === 'factory') {
      const paths = collectEquipmentPrimPaths(node);
      if (paths.length === 0) return;
      kitFocusPerspectiveMany(paths).catch((err: unknown) => console.warn('[Kit] focus-many:', err));
    }
  }, [assetTreeV2]);

  const toggleAssetExpand = useCallback((id: string) => {
    setExpandedAssetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  // ── 3.5 Kit 卡死重启流程 ───────────────────────────────────────────────
  // 设计：sim_backend (uvicorn) 当外部看门人——pkill+spawn Kit 进程。前端这边：
  //  (1) 暂停旧 state poll 避免它持续 spam 已死的 Kit 端口
  //  (2) 调 /admin/kit/restart（同步返回 new_pid）
  //  (3) polling Kit /ov/current_stage 等新进程起来 + USD 加载完成（最多 60s）
  //  (4) 用 playbackContextRef 缓存的 events 重新 kitEnsureStage + ingestPlayback
  //  (5) seek 回卡死前的 t_ms（保持暂停，让用户自己决定要不要继续播）
  //  (6) 恢复 state poll
  const handleKitRestartConfirm = useCallback(async () => {
    setShowKitRestart(false);
    setKitRestartError('');
    const ctx = playbackContextRef.current;
    const lastTMs = playbackState?.t_ms ?? 0;

    // (1) 停掉 state poll：旧 Kit 已死，再去 fetch /kit/playback/state 是浪费
    if (statePollRef.current) { clearInterval(statePollRef.current); statePollRef.current = null; }

    try {
      // (2) 后端 pkill + spawn
      setKitRestartPhase('killing');
      const res = await adminApi.restartKit();
      console.info('[KitRestart]', res.message);

      // (3) 等 Kit 起来：polling 直到 /ov/current_stage 返回非 null（USD 已加载完成）
      setKitRestartPhase('waiting-stage');
      const deadline = Date.now() + 60_000;
      // 先等 5s 让 Kit 初始化（这段 polling 必失败、降低无用请求）
      await new Promise<void>(r => setTimeout(r, 5000));
      let stageReady = false;
      while (Date.now() < deadline) {
        const cur = await kitCurrentStage();
        if (cur) { stageReady = true; break; }
        await new Promise<void>(r => setTimeout(r, 1500));
      }
      if (!stageReady) {
        // Kit 已 spawn 但 USD 还没加载完——这种情况下 ctx 里的 usdUrl 还要走一遍
        // kitEnsureStage，由它显式打开。日志提醒，但不视为失败。
        console.warn('[KitRestart] Kit 起来了但 60s 内未自动加载 USD，将由前端显式打开');
      }

      // (4) 重新 ingest
      setKitRestartPhase('re-ingesting');
      if (ctx) {
        try {
          if (ctx.usdUrl) await kitEnsureStage(ctx.usdUrl);
        } catch (err) {
          console.warn('[KitRestart] kitEnsureStage 失败:', err);
        }
        try {
          await loadPlaybackFromBackend(ctx.planId, BACKEND_DIRECT_URL);
        } catch (err) {
          throw new Error(t('Re-ingest failed: {{message}}', { message: (err as Error).message ?? err }));
        }
        // (5) seek 回原 t_ms（保持暂停状态，由用户决定恢复播放）
        if (lastTMs > 0) {
          try { await playbackSeek(lastTMs); } catch { /* 静默 */ }
        }
      } else {
        console.warn('[KitRestart] 没有缓存的 playback 上下文，跳过重 ingest（可能进页就卡死过）');
      }

      // (6) 恢复 state poll
      const poll = setInterval(async () => {
        try {
          const s = await getPlaybackState();
          setPlaybackState(s);
        } catch { /* ignore */ }
      }, 250);
      statePollRef.current = poll;

      setKitRestartPhase(null);
    } catch (err) {
      console.error('[KitRestart] 失败:', err);
      setKitRestartError((err as Error).message ?? String(err));
      setKitRestartPhase('failed');
    }
  }, [playbackState, t]);

  // ── 4. 退出处理 ────────────────────────────────────────────────────────
  const handleBackToConfig = () => {
    stopPolls();
    controlPlayback('stop').catch(() => {});
    navigate(`/simulation/plan/${planId}/config`);
  };

  const handleCancelConfirm = async () => {
    stopPolls();
    if (planId) await planApi.cancel(planId).catch(() => {});
    navigate(`/simulation/plan/${planId}/config`);
  };

  const handleViewResult = () => {
    stopPolls();
    controlPlayback('stop').catch(() => {});
    navigate(`/simulation/plan/${planId}/result`);
  };

  // ── render ─────────────────────────────────────────────────────────────
  const isReady = pageState === 'READY';
  const isRunning = pageState === 'RUNNING' || pageState === 'STARTING';
  const isPrepared = pageState === 'PREPARED';   // 准备完毕，等用户点「回放」
  const isFailed = pageState === 'FAILED';
  const isNotRun = pageState === 'NOT_RUN';

  // NOT_RUN 状态下的"启动模拟"按钮：复用入口逻辑（带 autoStart 的 re-navigate）
  const handleStartFromNotRun = () => {
    if (!planId) return;
    triggeredRef.current = false;  // 允许入口 effect 再次跑（依赖 autoStart 变化）
    navigate(`/simulation/plan/${planId}/running`, { state: { autoStart: true }, replace: true });
  };

  // RUNNING 屏 4 步：顺序 + 标签 + done/active/pending 状态 + 各步实际耗时
  const PHASE_ORDER: RunPhase[] = ['des', 'linebalance', 'persist', 'loading-scene'];
  const PHASE_LABELS: Record<RunPhase, string> = {
    'des': t('DES computation'),
    'linebalance': t('Line balance computation'),
    'persist': t('Writing data'),
    'loading-scene': t('Loading scene'),
  };
  const PHASE_TIMING_KEY: Record<RunPhase, keyof PhaseTimings> = {
    'des': 'des', 'linebalance': 'linebalance', 'persist': 'persist', 'loading-scene': 'scene',
  };
  const curPhaseIdx = PHASE_ORDER.indexOf(runPhase);
  const phaseStatus = (p: RunPhase): 'done' | 'active' | 'pending' => {
    if (isPrepared) return 'done';   // PREPARED：准备全部完成，4 步皆打勾
    const i = PHASE_ORDER.indexOf(p);
    if (i < curPhaseIdx) return 'done';
    if (i > curPhaseIdx) return 'pending';
    // 当前步：加载场景需 openedStageResult success 才打勾（否则保持转圈）
    if (p === 'loading-scene' && sceneLoaded) return 'done';
    return 'active';
  };
  // 步骤右侧显示的耗时文案：done→实测秒数；active→客户端实时秒数；pending→空
  const phaseTimeText = (p: RunPhase, st: 'done' | 'active' | 'pending'): string => {
    const measured = phaseTimings[PHASE_TIMING_KEY[p]];
    if (st === 'done') return measured != null ? `${measured.toFixed(1)}s` : '';
    if (st === 'active') return `${activeElapsed.toFixed(0)}s`;
    return '';
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#142235] bg-[#07111e] flex-shrink-0">
        <button
          onClick={handleBackToConfig}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors border border-[#1e3a55] hover:border-[#2a4a6a] rounded-lg px-2.5 py-1.5"
        >
          <ChevronLeft size={12} />{t('Back to Config')}
        </button>

        <div className="w-px h-4 bg-[#142235]" />

        <div className="flex items-center gap-2">
          {(isReady || isPrepared) ? <CheckCircle2 size={14} className="text-emerald-400" /> :
           isFailed ? <AlertCircle size={14} className="text-red-400" /> :
           isNotRun ? <AlertCircle size={14} className="text-amber-400" /> :
           <Loader2 size={14} className="text-amber-400 animate-spin" />}
          <span className="text-sm font-bold text-slate-200">{planName}</span>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium',
            (isReady || isPrepared) ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
            isFailed ? 'bg-red-500/15 text-red-400 border-red-500/30' :
            isNotRun ? 'bg-slate-700/30 text-slate-400 border-slate-500/30' :
            'bg-amber-500/15 text-amber-400 border-amber-500/30',
          )}>
            {isReady ? t('Replay Ready') : isPrepared ? t('Simulation complete') : isFailed ? t('Failed') : isNotRun ? t('Not Run') : pageState === 'STARTING' ? t('Starting') : t('Running')}
          </span>
        </div>

        <div className="flex-1" />

        {isRunning && (
          <span className="text-[11px] font-mono text-slate-400">
            {elapsedSec != null
              ? t('Computing… {{s}}s', { s: elapsedSec.toFixed(0) })
              : t('Starting…')}
          </span>
        )}

        <Button size="sm" variant="ghost" onClick={() => setShowLog(true)}>
          <FileText size={13} /> {t('Log')}
        </Button>
        {isReady && KIT_STREAM_URL && (
          <Button
            size="sm"
            variant={walkActive ? 'primary' : 'ghost'}
            onClick={() => setWalkActive((v) => !v)}
          >
            <Footprints size={13} /> {walkActive ? t('Exit Walk Mode') : t('Walk Mode')}
          </Button>
        )}
        {isReady && KIT_STREAM_URL && (
          <Button
            size="sm"
            variant="danger"
            disabled={kitRestartPhase !== null && kitRestartPhase !== 'failed'}
            onClick={() => setShowKitRestart(true)}
            title={t('Click here when the Kit process hangs: sim_backend will pkill and re-spawn it')}
          >
            <RotateCw size={13} className={kitRestartPhase && kitRestartPhase !== 'failed' ? 'animate-spin' : ''} /> {t('Restart Kit')}
          </Button>
        )}
        {isRunning && (
          <Button size="sm" variant="danger" onClick={() => setShowCancel(true)}>
            <XCircle size={13} /> {t('Cancel Simulation')}
          </Button>
        )}
        {isReady && (
          <Button size="sm" variant="primary" onClick={handleViewResult}>
            {t('View Result Analysis')}
          </Button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#07111e]">
        {(isRunning || isPrepared) && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {/* 4 步：DES计算 → 线平衡计算 → 数据写入 → 加载场景，右侧显示各步实际耗时 */}
              <div className="flex flex-col gap-3 mb-4 mx-auto w-72">
                {PHASE_ORDER.map((p, idx) => {
                  const st = phaseStatus(p);
                  return (
                    <div key={p} className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {st === 'done'
                          ? <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
                          : st === 'active'
                            ? <Loader2 size={18} className="text-blue-400 animate-spin flex-shrink-0" />
                            : <div className="w-[18px] h-[18px] rounded-full border border-slate-600 flex-shrink-0" />}
                        <span className={cn(
                          'text-sm truncate',
                          st === 'done' ? 'text-emerald-300'
                            : st === 'active' ? 'text-slate-100 font-semibold'
                            : 'text-slate-500',
                        )}>
                          {idx + 1}. {PHASE_LABELS[p]}
                        </span>
                      </div>
                      <span className={cn(
                        'text-xs font-mono tabular-nums flex-shrink-0',
                        st === 'done' ? 'text-emerald-400/80'
                          : st === 'active' ? 'text-blue-300'
                          : 'text-slate-600',
                      )}>
                        {phaseTimeText(p, st)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="w-72 h-1 bg-[#1e3a55] rounded-full overflow-hidden mt-2 mx-auto">
                <div className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }} />
              </div>

              {/* 回放按钮：模拟+场景准备完成前为灰（禁用），完成后变蓝可点 → 进入回放界面 */}
              <button
                disabled={!isPrepared}
                onClick={() => setPageState('READY')}
                className={cn(
                  'mt-7 mx-auto flex items-center gap-2 px-7 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  isPrepared
                    ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-lg shadow-blue-900/30'
                    : 'bg-[#13243a] text-slate-500 cursor-not-allowed',
                )}
              >
                <PlayCircle size={16} /> {t('Replay')}
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
              <div className="text-sm font-semibold text-slate-200">{t('Simulation Failed')}</div>
              <div className="text-[11px] text-slate-400 mt-2 break-words">
                {errorMsg || t('Unknown error')}
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                {t('Please reconfigure and re-validate (Save & Ready) before retrying.')}
              </div>
              <div className="flex justify-center gap-2 mt-4">
                <Button size="sm" variant="ghost" onClick={handleBackToConfig}>
                  {t('Back to Config Page')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    if (!planId) return;
                    // FAILED → DRAFT，再进配置页让用户走"保存并就绪"
                    try { await planApi.reconfigure(planId); } catch { /* 幂等：已是 DRAFT 也无所谓 */ }
                    navigate(`/simulation/plan/${planId}/config`);
                  }}
                >
                  {t('Reconfigure')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {isNotRun && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <AlertCircle size={48} className="text-amber-400 mx-auto mb-4" />
              <div className="text-sm font-semibold text-slate-200">{t('This plan has not run a simulation yet')}</div>
              <div className="text-[11px] text-slate-400 mt-2">
                {t('Refreshing or opening the URL directly will not start the simulation automatically, to avoid overwriting existing results. Click the button below to start it manually.')}
              </div>
              <div className="flex justify-center gap-2 mt-4">
                <Button size="sm" variant="ghost" onClick={handleBackToConfig}>{t('Back to Config Page')}</Button>
                <Button size="sm" variant="primary" onClick={handleStartFromNotRun}>{t('Run Simulation')}</Button>
              </div>
            </div>
          </div>
        )}

        {isReady && (
          <>
            {/* Kit WebRTC iframe */}
            <div className="flex-1 relative overflow-hidden bg-black">
              {KIT_STREAM_URL ? (
                <div className="absolute top-0 left-0 right-[2%] bottom-[2%]">
                  {/* 直连 Kit WebRTC（替代原 5183 iframe 页）。回放控制仍走 HTTP /kit/playback。 */}
                  <KitViewport className="w-full h-full" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-center">
                  <div>
                    <AlertCircle size={32} className="text-amber-400 mx-auto mb-2" />
                    <div className="text-[12px] text-slate-300">{t('Kit stream not configured')}</div>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">{t('Set VITE_KIT_STREAM_URL to enable 3D playback')}</div>
                  </div>
                </div>
              )}
              <div className="absolute top-2.5 left-3 text-[9px] font-mono text-slate-400 select-none pointer-events-none tracking-widest z-10 bg-black/40 px-1.5 py-0.5 rounded">
                {KIT_STREAM_URL ? '🟢 OMNIVERSE KIT · REPLAY' : '⚠ KIT STREAM NOT CONFIGURED'}
              </div>

              {/* Kit 进程重启进度蒙层（pkill+spawn 总耗 20~40s，期间盖住 iframe） */}
              {kitRestartPhase !== null && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-sm">
                  <div className="bg-[#07111e] border border-[#1e3a55] rounded-xl p-6 w-[420px] text-center shadow-2xl">
                    {kitRestartPhase !== 'failed' ? (
                      <>
                        <Loader2 size={36} className="text-amber-400 mx-auto mb-3 animate-spin" />
                        <div className="text-sm font-semibold text-slate-200 mb-1">{t('Restarting Kit Process')}</div>
                        <div className="text-[11px] text-slate-400">
                          {kitRestartPhase === 'killing' && t('Killing the old Kit process and spawning a new one...')}
                          {kitRestartPhase === 'waiting-stage' && t('Waiting for Kit to restart and load the USD (usually 20-40 seconds)...')}
                          {kitRestartPhase === 're-ingesting' && t('Reloading playback events and returning to the previous moment...')}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-3 font-mono">{t('The 3D view is not interactive during this time, please wait')}</div>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
                        <div className="text-sm font-semibold text-slate-200 mb-1">{t('Kit Restart Failed')}</div>
                        <div className="text-[11px] text-slate-400 break-words mb-3 whitespace-pre-wrap text-left max-h-48 overflow-auto">
                          {kitRestartError || t('Unknown error')}
                        </div>
                        <div className="text-[10px] text-slate-500 mb-3 font-mono">
                          {t('Full log:')} <code className="text-slate-300">/tmp/kit_spawn.log</code>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setKitRestartPhase(null)}>
                          {t('Close')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 漫游模式覆盖层（active 时接管键盘 + pointer lock，→ Kit 移动相机） */}
              <WalkMode active={walkActive} onExit={() => setWalkActive(false)} />

              {/* 左侧资产树浮层（AssetSidebar 自带 absolute top-3 left-3 + calc 高度，
                  外层不要再包 wrapper，否则 height: calc(100% - 24px) 取 wrapper 的 0 高 → 一条黑线 */}
              {assetTreeV2.length > 0 && (
                <AssetSidebar
                  tree={assetTreeV2}
                  selectedId={selectedAssetId}
                  selectedNode={selectedAssetNode}
                  expandedIds={new Set(expandedAssetIds)}
                  onSelect={handleAssetSelect}
                  onDoubleSelect={handleAssetDoubleSelect}
                  onToggle={toggleAssetExpand}
                  onClearSelection={() => setSelectedAssetId(null)}
                  editable={false}
                />
              )}

              {/* 右上常驻浮层：设备点选 KPI（上）+ 产线进度（下），统一 absolute 容器 */}
              {/* top-3 right-4 bottom-12：上对齐 iframe 顶留 12px，底距 iframe 底 48px（让出时间轴空间） */}
              <div className="absolute top-3 right-4 bottom-12 z-20 flex flex-col gap-3 pointer-events-none">
                <div className="pointer-events-auto">
                  {selectedPrim && (
                    <DeviceStatusOverlay
                      primPath={selectedPrim}
                      events={selectedDeviceEvents}
                      tMs={playbackState?.t_ms ?? 0}
                      onClose={() => setSelectedPrim('')}
                      equipmentNameById={equipmentNameById}
                      productNameById={productNameById}
                    />
                  )}
                </div>
                <div className="pointer-events-auto flex-1 min-h-0">
                  <LineProgressPanel
                    events={lineProgressEvents}
                    tMs={playbackState?.t_ms ?? 0}
                    equipmentInfoById={equipmentInfoById}
                    lineStatById={lineStatById}
                    lineLastEquipmentById={lineLastEquipmentById}
                    lbrSeriesByLine={lbrSeriesByLine}
                  />
                </div>
              </div>
            </div>

            {/* 时间轴 — iframe 下方 */}
            <PlaybackTimeline
              durationMs={durationMs}
              events={eventMarkers}
              state={playbackState}
              onSeek={handleSeek}
              onPlayPause={handlePlayPause}
              onSpeedChange={handleSpeed}
            />
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showLog && <LogModal onClose={() => setShowLog(false)} />}

      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-2xl p-6 w-96 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">{t('Confirm cancel simulation?')}</h3>
                <p className="text-xs text-slate-400 mt-1">{t('After canceling, this simulation\'s results will not be saved, and the plan status will revert to "Ready".')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCancel(false)}>{t('Continue Simulation')}</Button>
              <Button variant="danger" size="sm" onClick={handleCancelConfirm}>{t('Confirm Cancel')}</Button>
            </div>
          </div>
        </div>
      )}

      {showKitRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-2xl p-6 w-[420px] shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <RotateCw size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">{t('Restart Kit process?')}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t('Use this when the Kit main thread hangs: sim_backend will pkill the old process and spawn a new one. The whole process takes about 20-40 seconds; once done it will automatically resume playback at the current moment.')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowKitRestart(false)}>{t('Cancel')}</Button>
              <Button variant="danger" size="sm" onClick={handleKitRestartConfirm}>{t('Confirm Restart')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Log modal (mock) ─────────────────────────────────────────────────────────
const LOG_ENTRIES = [
  { time: '10:05:00', level: 'INFO',  mod: 'System',     msg: 'Simulation task started, master data snapshot v1.2.8' },
  { time: '10:05:01', level: 'INFO',  mod: 'Loader',     msg: 'Loading factory model and BoP Process data' },
  { time: '10:05:05', level: 'INFO',  mod: 'DES',        msg: 'Discrete-event simulation engine initialized' },
  { time: '10:05:22', level: 'INFO',  mod: 'DES',        msg: 'Simulation clock advanced to T+00:30:00, events processed: 1,230' },
  { time: '10:05:45', level: 'WARN',  mod: 'Device',     msg: 'Equipment Failure event triggered (random MTBF), estimated downtime 45 min' },
  { time: '10:06:02', level: 'INFO',  mod: 'DES',        msg: 'Simulation clock advanced to T+02:00:00, events processed: 5,847' },
];

function LogModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string[]>(['INFO', 'WARN', 'ERROR']);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#07111e] border border-[#1e3a55] rounded-2xl shadow-2xl w-[720px] max-h-[55vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#142235] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-300">{t('Run Log')}</span>
            <div className="flex items-center gap-1.5">
              {(['INFO','WARN','ERROR'] as const).map(level => (
                <button key={level} onClick={() => setFilter(prev => prev.includes(level) ? prev.filter(x => x !== level) : [...prev, level])}
                  className={cn('px-2 py-0.5 rounded text-[10px] font-semibold transition-all',
                    filter.includes(level)
                      ? level === 'INFO' ? 'bg-blue-600/20 text-blue-400' : level === 'WARN' ? 'bg-amber-600/20 text-amber-400' : 'bg-red-600/20 text-red-400'
                      : 'bg-[#0a1929] text-slate-400',
                  )}>{level}</button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-0.5 bg-[#040d16] p-4">
          {LOG_ENTRIES.filter(l => filter.includes(l.level)).map((log, i) => (
            <div key={i} className="flex gap-3 hover:bg-[#0a1929]/50 px-1 py-0.5 rounded transition-colors">
              <span className="text-slate-400 flex-shrink-0 w-16">[{log.time}]</span>
              <span className={cn('font-bold flex-shrink-0 w-10', log.level === 'INFO' ? 'text-blue-500' : log.level === 'WARN' ? 'text-amber-500' : 'text-red-500')}>[{log.level}]</span>
              <span className="text-cyan-400 flex-shrink-0 w-24">[{t(log.mod)}]</span>
              <span className="text-slate-300">{t(log.msg)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { EventLog, LaunchConfig, PoolDashboard } from "./data";
import { formatDateTime, formatFeePips, formatInteger, formatSignedTokenAmount, formatTokenAmount } from "./format";
import type { Language } from "./i18n";

export type ReportTone = "blue" | "violet" | "teal" | "amber" | "slate";

export type AgentReportState = {
  key: "guard-triggered" | "launch-high-risk" | "healthy-flow";
  label: string;
  description: string;
  active: boolean;
  tone: ReportTone;
};

export type AgentReportMetric = {
  label: string;
  value: string;
  detail: string;
  tone: ReportTone;
};

export type AgentReport = {
  headline: string;
  summary: string;
  statusLabel: string;
  tone: ReportTone;
  readOnlyNotice: string;
  evidence: string[];
  risks: string[];
  actions: string[];
  states: AgentReportState[];
  metrics: AgentReportMetric[];
};

type SwapEvent = Extract<EventLog, { kind: "swap" }>;
type GuardEvent = Extract<EventLog, { kind: "guard" }>;
type ScoreEvent = Extract<EventLog, { kind: "score" }>;

const englishReport = {
    readOnlyNotice:
      "This report explains what FairFlowHook and MetricsLens already recorded onchain. It does not change fees, pool parameters, or AMM behavior.",
    noDashboard: {
      headline: "FairFlow Report needs live chain reads.",
      summary:
        "The deterministic report generator is read-only and stays unavailable until MetricsLens state and FairFlowHook events can be loaded.",
      statusLabel: "Unavailable",
      evidence: [
        "MetricsLens configuration is missing or unavailable in this browser session.",
        "No report text is generated from placeholders or pretend onchain data.",
      ],
      risks: [
        "Without live state, the page cannot classify healthy flow, guard-triggered activity, or launch high-risk behavior.",
      ],
      actions: [
        "Fill frontend/.env.local with MetricsLens, FairFlowHook, and PoolId values.",
        "Refresh the page after deployment or after switching to the correct network.",
      ],
      metrics: {
        stateSource: "State source",
        eventSource: "Event source",
        reportMode: "Report mode",
        missing: "Missing",
        metricsNotLoaded: "MetricsLens not loaded",
        logsNotLoaded: "FairFlowHook logs not loaded",
        readOnly: "Read-only",
        noWrites: "No writes are attempted",
      },
    },
    states: {
      guardTriggered: {
        label: "Guard Triggered",
        description:
          "Use this state when LaunchGuardTriggered events show the hook rejected or flagged protected launch activity.",
      },
      launchHighRisk: {
        label: "Launch High-Risk",
        description:
          "Use this state when score, imbalance, or large-trade pressure suggests a fragile launch market.",
      },
      healthyFlow: {
        label: "Healthy Flow",
        description:
          "Use this state when score is healthy, flow is balanced enough, and recent swaps show organic participation.",
      },
    },
    headline: {
      mixed: "Mixed launch signals need ongoing monitoring.",
      guard: "The hook has recently enforced a protected launch rule.",
      launchRisk: "The pool is in a high-risk launch state.",
      healthy: "Recent activity points to healthy flow.",
      riskOutsideLaunch: "Risk pressure is elevated even outside the earliest launch phase.",
    },
    summary: {
      mixed:
        "The hook is live and emitting evidence, but the current event window does not cleanly map to a single healthy or defensive state.",
      guard:
        "This is a read-only explanation of enforcement that already happened onchain. The report is not controlling the market; it is describing the hook's emitted guard evidence.",
      launchRisk:
        "Current score, one-sided flow, or large-trade pressure indicates that the launch phase is still fragile and should be explained with caution.",
      healthy:
        "Score, participation, and flow balance suggest the hook is seeing constructive launch behavior rather than defensive guard pressure.",
      riskOutsideLaunch:
        "The pool is no longer in the hottest launch window, but the current score and flow pattern still read as fragile rather than healthy.",
    },
    status: {
      monitoring: "Monitoring",
      guard: "Guard Triggered",
      launchRisk: "Launch High-Risk",
      healthy: "Healthy Flow",
    },
    guardReason: (reason?: string) =>
      reason ? `Launch guard reason: ${reason}.` : "Launch guard was triggered by a protected launch rule.",
    launchWindow: {
      activeNoConfig: "The pool is still in its launch window.",
      inactiveNoConfig: "The pool is outside the launch window or launch config was not returned.",
      active: (end: string, maxBuy: string, cooldown: number) =>
        `Launch window is active until ${end} with max buy ${maxBuy} and ${cooldown} cooldown blocks.`,
      inactive: (start: string, end: string) => `Launch window ran from ${start} to ${end}.`,
    },
    guardLogCount: (count: number) => `${count} ${count === 1 ? "guard log" : "guard logs"}`,
    evidence: {
      score: (score: number, fee: string) => `MetricsLens reports score ${score}/100 with current fee ${fee}.`,
      swaps: (swaps: string, traders: string, largeTrades: string) =>
        `${swaps} successful swaps, ${traders} unique traders, and ${largeTrades} large trades were recorded.`,
      flow: (netFlow: string, volume: string, imbalance: string) =>
        `Net flow is ${netFlow} against rolling volume ${volume}, which is about ${imbalance} directional imbalance.`,
      guardFound: (reason: string, count: string) => `${reason} ${count} found in the current window.`,
      noGuard: "No LaunchGuardTriggered events were found in the current event window.",
    },
    risks: {
      scoreRisk: (score: number) => `Market score is ${score}/100 and still reads below a comfortable healthy threshold.`,
      scoreOk: (score: number) => `Market score is ${score}/100 and does not currently show acute stress.`,
      imbalanceHigh: (imbalance: string) =>
        `Directional imbalance is high at roughly ${imbalance}, which can amplify fee pressure.`,
      imbalanceOk: (imbalance: string) =>
        `Directional imbalance is ${imbalance}, so one-sided flow is present but not extreme.`,
      largeTrades: (count: string) =>
        `${count} large trades have been counted, which can distort early launch quality.`,
      noLargeTrades: "No large-trade pressure has been recorded in the current state snapshot.",
      guard: "Guard events are evidence of rule enforcement and should be presented alongside the relevant tx hash.",
    },
    actions: {
      guard: "Use the latest guard-trigger tx hash as evidence that the hook enforced launch rules onchain.",
      swaps: "Use recent swap and score-update tx hashes as evidence that the hook is actively emitting launch telemetry.",
      healthy: "Lead with healthy flow, score trend, and trader participation when presenting the pool.",
      cautious: "Lead with score, imbalance, and large-trade context before making claims about market health.",
      framing: "Keep the copy framed as explanation of hook behavior, not AI control over AMM parameters or launch policy.",
    },
    metrics: {
      reportState: "Report State",
      eventBasis: "Event Basis",
      flowBalance: "Flow Balance",
      swapEvidence: "Swap Evidence",
      score: "Score",
      swaps: "Swaps",
      imbalance: "Imbalance",
      guards: "Guards",
      currentFee: "Current fee",
      uniqueTraders: "Unique traders",
      netFlow: "Net flow",
      latestWindow: "Latest event window",
      guardLogs: "Guard logs",
      noGuardLogs: "No guard logs",
      launchWindowActive: "Launch window active",
      adaptivePhase: "Adaptive phase",
      logs: (count: number) => `${count} ${count === 1 ? "log" : "logs"}`,
      guardEvents: (count: number) => `${count} ${count === 1 ? "guard event" : "guard events"}`,
      scoreUpdates: (count: number) => `${count} ${count === 1 ? "score update" : "score updates"}`,
      netFlowDetail: (netFlow: string) => `Net flow ${netFlow}`,
      swapLogs: (count: number) => `${count} ${count === 1 ? "swap log" : "swap logs"}`,
      successfulSwapsInState: (swaps: string) => `${swaps} successful swaps in state`,
    },
};

const chineseReport: typeof englishReport = {
    readOnlyNotice:
      "本报告只解释 FairFlowHook 和 MetricsLens 已经记录在链上的内容，不会修改费率、Pool 参数或 AMM 行为。",
    noDashboard: {
      headline: "FairFlow 报告需要实时链上读取。",
      summary: "确定性报告生成器是只读的；只有加载 MetricsLens 状态和 FairFlowHook 事件后才会可用。",
      statusLabel: "不可用",
      evidence: ["当前浏览器会话缺少或无法使用 MetricsLens 配置。", "不会用占位符或伪链上数据生成报告。"],
      risks: ["没有实时状态时，页面无法判断健康流向、防护触发或高风险发行状态。"],
      actions: [
        "在 frontend/.env.local 中填写 MetricsLens、FairFlowHook 和 PoolId。",
        "部署完成或切换到正确网络后刷新页面。",
      ],
      metrics: {
        stateSource: "状态来源",
        eventSource: "事件来源",
        reportMode: "报告模式",
        missing: "缺失",
        metricsNotLoaded: "MetricsLens 未加载",
        logsNotLoaded: "FairFlowHook 日志未加载",
        readOnly: "只读",
        noWrites: "不会尝试写入",
      },
    },
    states: {
      guardTriggered: {
        label: "防护已触发",
        description: "当 LaunchGuardTriggered 事件显示 Hook 拒绝或标记了受保护的发行行为时使用。",
      },
      launchHighRisk: {
        label: "发行高风险",
        description: "当评分、流向失衡或大额交易压力显示发行市场脆弱时使用。",
      },
      healthyFlow: {
        label: "健康流向",
        description: "当评分健康、流向足够平衡且近期 swap 显示自然参与时使用。",
      },
    },
    headline: {
      mixed: "发行信号混合，需要持续观察。",
      guard: "Hook 最近已经执行过受保护的发行规则。",
      launchRisk: "当前 Pool 处于高风险发行状态。",
      healthy: "近期活动显示流向较健康。",
      riskOutsideLaunch: "即使已离开最早期发行阶段，风险压力仍然偏高。",
    },
    summary: {
      mixed: "Hook 正在运行并发出证据，但当前事件窗口还不能清晰归类为单一的健康或防御状态。",
      guard: "这是对链上已发生规则执行的只读解释。报告没有控制市场，只是在描述 Hook 发出的防护证据。",
      launchRisk: "当前评分、单边流向或大额交易压力说明发行阶段仍较脆弱，需要谨慎解释。",
      healthy: "评分、参与度和流向平衡显示 Hook 观察到的是建设性发行行为，而不是防御压力。",
      riskOutsideLaunch: "Pool 已不在最热的发行窗口内，但当前评分和流向模式仍更接近脆弱而非健康。",
    },
    status: {
      monitoring: "观察中",
      guard: "防护已触发",
      launchRisk: "发行高风险",
      healthy: "健康流向",
    },
    guardReason: (reason?: string) => (reason ? `发行防护原因：${reason}。` : "发行防护被受保护规则触发。"),
    launchWindow: {
      activeNoConfig: "Pool 仍处于发行窗口内。",
      inactiveNoConfig: "Pool 已离开发行窗口，或发行配置未返回。",
      active: (end: string, maxBuy: string, cooldown: number) =>
        `发行窗口持续到 ${end}，最大买入 ${maxBuy}，冷却 ${cooldown} 个区块。`,
      inactive: (start: string, end: string) => `发行窗口从 ${start} 到 ${end}。`,
    },
    guardLogCount: (count: number) => `${count} 条防护日志`,
    evidence: {
      score: (score: number, fee: string) => `MetricsLens 报告评分 ${score}/100，当前费率 ${fee}。`,
      swaps: (swaps: string, traders: string, largeTrades: string) =>
        `已记录 ${swaps} 笔成功 swap、${traders} 个独立交易者、${largeTrades} 笔大额交易。`,
      flow: (netFlow: string, volume: string, imbalance: string) =>
        `净流向为 ${netFlow}，滚动成交量为 ${volume}，方向失衡约 ${imbalance}。`,
      guardFound: (reason: string, count: string) => `${reason} 当前窗口找到 ${count}。`,
      noGuard: "当前事件窗口未找到 LaunchGuardTriggered 事件。",
    },
    risks: {
      scoreRisk: (score: number) => `市场评分为 ${score}/100，仍低于舒适的健康阈值。`,
      scoreOk: (score: number) => `市场评分为 ${score}/100，目前没有显示急性压力。`,
      imbalanceHigh: (imbalance: string) => `方向失衡较高，约 ${imbalance}，可能放大费率压力。`,
      imbalanceOk: (imbalance: string) => `方向失衡为 ${imbalance}，存在单边流向但并不极端。`,
      largeTrades: (count: string) => `已统计 ${count} 笔大额交易，可能扭曲早期发行质量。`,
      noLargeTrades: "当前状态快照中没有记录大额交易压力。",
      guard: "防护事件是规则执行证据，应与相关 tx hash 一起展示。",
    },
    actions: {
      guard: "使用最新防护触发 tx hash 证明 Hook 已在链上执行发行规则。",
      swaps: "使用近期 swap 和评分更新 tx hash 证明 Hook 正在主动发出发行遥测。",
      healthy: "展示 Pool 时优先讲健康流向、评分趋势和交易者参与。",
      cautious: "在声明市场健康前，先说明评分、失衡和大额交易背景。",
      framing: "文案必须保持为 Hook 行为解释，不要表述成 AI 控制 AMM 参数或发行政策。",
    },
    metrics: {
      reportState: "报告状态",
      eventBasis: "事件依据",
      flowBalance: "流向平衡",
      swapEvidence: "Swap 证据",
      score: "评分",
      swaps: "Swap",
      imbalance: "失衡",
      guards: "防护",
      currentFee: "当前费率",
      uniqueTraders: "独立交易者",
      netFlow: "净流向",
      latestWindow: "最新事件窗口",
      guardLogs: "防护日志",
      noGuardLogs: "无防护日志",
      launchWindowActive: "发行窗口开启",
      adaptivePhase: "自适应阶段",
      logs: (count: number) => `${count} 条日志`,
      guardEvents: (count: number) => `${count} 个防护事件`,
      scoreUpdates: (count: number) => `${count} 次评分更新`,
      netFlowDetail: (netFlow: string) => `净流向 ${netFlow}`,
      swapLogs: (count: number) => `${count} 条 swap 日志`,
      successfulSwapsInState: (swaps: string) => `状态中记录 ${swaps} 笔成功 swap`,
    },
};

const REPORT_TEXT: Record<Language, typeof englishReport> = {
  en: englishReport,
  zh: chineseReport,
};

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function imbalanceBps(dashboard: PoolDashboard): number {
  if (dashboard.rollingVolume === 0n) return 0;

  const raw = Number((abs(dashboard.netFlow) * 10_000n) / dashboard.rollingVolume);
  return Math.min(raw, 10_000);
}

function formatBpsPercent(value: number): string {
  return `${(value / 100).toFixed(0)}%`;
}

function guardReason(event: GuardEvent | undefined, text: typeof englishReport): string {
  return text.guardReason(event?.reason);
}

function launchWindowEvidence(
  dashboard: PoolDashboard,
  launchConfig: LaunchConfig | undefined,
  text: typeof englishReport,
): string {
  if (!launchConfig) {
    return dashboard.inLaunchWindow ? text.launchWindow.activeNoConfig : text.launchWindow.inactiveNoConfig;
  }

  return dashboard.inLaunchWindow
    ? text.launchWindow.active(
        formatDateTime(launchConfig.launchEnd),
        formatTokenAmount(launchConfig.maxBuyAmount),
        launchConfig.cooldownBlocks,
      )
    : text.launchWindow.inactive(formatDateTime(launchConfig.launchStart), formatDateTime(launchConfig.launchEnd));
}

function buildStates(text: typeof englishReport, activeKey?: AgentReportState["key"]): AgentReportState[] {
  return [
    {
      key: "guard-triggered",
      label: text.states.guardTriggered.label,
      description: text.states.guardTriggered.description,
      active: activeKey === "guard-triggered",
      tone: "amber",
    },
    {
      key: "launch-high-risk",
      label: text.states.launchHighRisk.label,
      description: text.states.launchHighRisk.description,
      active: activeKey === "launch-high-risk",
      tone: "violet",
    },
    {
      key: "healthy-flow",
      label: text.states.healthyFlow.label,
      description: text.states.healthyFlow.description,
      active: activeKey === "healthy-flow",
      tone: "teal",
    },
  ];
}

export function generateAgentReport(
  dashboard?: PoolDashboard,
  events: EventLog[] = [],
  launchConfig?: LaunchConfig,
  language: Language = "en",
): AgentReport {
  const text = REPORT_TEXT[language];

  if (!dashboard) {
    return {
      headline: text.noDashboard.headline,
      summary: text.noDashboard.summary,
      statusLabel: text.noDashboard.statusLabel,
      tone: "slate",
      readOnlyNotice: text.readOnlyNotice,
      evidence: text.noDashboard.evidence,
      risks: text.noDashboard.risks,
      actions: text.noDashboard.actions,
      states: buildStates(text),
      metrics: [
        {
          label: text.noDashboard.metrics.stateSource,
          value: text.noDashboard.metrics.missing,
          detail: text.noDashboard.metrics.metricsNotLoaded,
          tone: "slate",
        },
        {
          label: text.noDashboard.metrics.eventSource,
          value: text.noDashboard.metrics.missing,
          detail: text.noDashboard.metrics.logsNotLoaded,
          tone: "slate",
        },
        {
          label: text.noDashboard.metrics.reportMode,
          value: text.noDashboard.metrics.readOnly,
          detail: text.noDashboard.metrics.noWrites,
          tone: "blue",
        },
      ],
    };
  }

  const swapEvents = events.filter((event): event is SwapEvent => event.kind === "swap");
  const guardEvents = events.filter((event): event is GuardEvent => event.kind === "guard");
  const scoreEvents = events.filter((event): event is ScoreEvent => event.kind === "score");
  const totalSwaps = dashboard.buyCount + dashboard.sellCount;
  const imbalance = imbalanceBps(dashboard);
  const healthyFlow =
    dashboard.score >= 70 &&
    imbalance <= 3_500 &&
    dashboard.uniqueTraderCount > 0n &&
    dashboard.largeTradeCount <= 1n;
  const launchHighRisk =
    dashboard.score < 50 || imbalance >= 6_000 || dashboard.largeTradeCount >= 2n;
  const guardTriggered = guardEvents.length > 0;

  let activeState: AgentReportState["key"] | undefined;
  let headline = text.headline.mixed;
  let summary = text.summary.mixed;
  let statusLabel = text.status.monitoring;
  let tone: ReportTone = "blue";

  if (guardTriggered) {
    activeState = "guard-triggered";
    headline = text.headline.guard;
    summary = text.summary.guard;
    statusLabel = text.status.guard;
    tone = "amber";
  } else if (launchHighRisk && dashboard.inLaunchWindow) {
    activeState = "launch-high-risk";
    headline = text.headline.launchRisk;
    summary = text.summary.launchRisk;
    statusLabel = text.status.launchRisk;
    tone = "violet";
  } else if (healthyFlow) {
    activeState = "healthy-flow";
    headline = text.headline.healthy;
    summary = text.summary.healthy;
    statusLabel = text.status.healthy;
    tone = "teal";
  } else if (launchHighRisk) {
    activeState = "launch-high-risk";
    headline = text.headline.riskOutsideLaunch;
    summary = text.summary.riskOutsideLaunch;
    statusLabel = text.status.launchRisk;
    tone = "violet";
  }

  const evidence = [
    text.evidence.score(dashboard.score, formatFeePips(dashboard.currentFee)),
    text.evidence.swaps(
      formatInteger(totalSwaps),
      formatInteger(dashboard.uniqueTraderCount),
      formatInteger(dashboard.largeTradeCount),
    ),
    text.evidence.flow(
      formatSignedTokenAmount(dashboard.netFlow),
      formatTokenAmount(dashboard.rollingVolume),
      formatBpsPercent(imbalance),
    ),
    launchWindowEvidence(dashboard, launchConfig, text),
    guardTriggered
      ? text.evidence.guardFound(guardReason(guardEvents[0], text), text.guardLogCount(guardEvents.length))
      : text.evidence.noGuard,
  ];

  const risks = [
    launchHighRisk
      ? text.risks.scoreRisk(dashboard.score)
      : text.risks.scoreOk(dashboard.score),
    imbalance >= 6_000
      ? text.risks.imbalanceHigh(formatBpsPercent(imbalance))
      : text.risks.imbalanceOk(formatBpsPercent(imbalance)),
    dashboard.largeTradeCount > 0n
      ? text.risks.largeTrades(formatInteger(dashboard.largeTradeCount))
      : text.risks.noLargeTrades,
  ];

  if (guardTriggered) {
    risks.push(text.risks.guard);
  }

  const actions = [
    guardTriggered ? text.actions.guard : text.actions.swaps,
    healthyFlow ? text.actions.healthy : text.actions.cautious,
    text.actions.framing,
  ];

  return {
    headline,
    summary,
    statusLabel,
    tone,
    readOnlyNotice: text.readOnlyNotice,
    evidence,
    risks,
    actions,
    states: buildStates(text, activeState),
    metrics: [
      {
        label: text.metrics.reportState,
        value: statusLabel,
        detail: dashboard.inLaunchWindow ? text.metrics.launchWindowActive : text.metrics.adaptivePhase,
        tone,
      },
      {
        label: text.metrics.eventBasis,
        value: text.metrics.logs(events.length),
        detail: `${text.metrics.guardEvents(guardEvents.length)} / ${text.metrics.scoreUpdates(scoreEvents.length)}`,
        tone: "blue",
      },
      {
        label: text.metrics.flowBalance,
        value: formatBpsPercent(imbalance),
        detail: text.metrics.netFlowDetail(formatSignedTokenAmount(dashboard.netFlow)),
        tone: imbalance >= 6_000 ? "violet" : "teal",
      },
      {
        label: text.metrics.swapEvidence,
        value: text.metrics.swapLogs(swapEvents.length),
        detail: text.metrics.successfulSwapsInState(formatInteger(totalSwaps)),
        tone: "blue",
      },
    ],
  };
}

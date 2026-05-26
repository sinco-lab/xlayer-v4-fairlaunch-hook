import type { EventLog, LaunchConfig, PoolDashboard } from "./data";
import { formatDateTime, formatFeePips, formatInteger, formatSignedInteger } from "./format";

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

const READ_ONLY_NOTICE =
  "This report explains what FairFlowHook and MetricsLens already recorded onchain. It does not change fees, pool parameters, or AMM behavior.";

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function eventCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function imbalanceBps(dashboard: PoolDashboard): number {
  if (dashboard.rollingVolume === 0n) return 0;

  const raw = Number((abs(dashboard.netFlow) * 10_000n) / dashboard.rollingVolume);
  return Math.min(raw, 10_000);
}

function formatBpsPercent(value: number): string {
  return `${(value / 100).toFixed(0)}%`;
}

function guardReason(event?: GuardEvent): string {
  if (!event?.reason) return "Launch guard was triggered by a protected launch rule.";
  return `Launch guard reason: ${event.reason}.`;
}

function launchWindowEvidence(dashboard: PoolDashboard, launchConfig?: LaunchConfig): string {
  if (!launchConfig) {
    return dashboard.inLaunchWindow
      ? "The pool is still in its launch window."
      : "The pool is outside the launch window or launch config was not returned.";
  }

  return dashboard.inLaunchWindow
    ? `Launch window is active until ${formatDateTime(launchConfig.launchEnd)} with max buy ${formatInteger(
        launchConfig.maxBuyAmount,
      )} and ${launchConfig.cooldownBlocks} cooldown blocks.`
    : `Launch window ran from ${formatDateTime(launchConfig.launchStart)} to ${formatDateTime(
        launchConfig.launchEnd,
      )}.`;
}

function buildStates(activeKey?: AgentReportState["key"]): AgentReportState[] {
  return [
    {
      key: "guard-triggered",
      label: "Guard Triggered",
      description:
        "Use this state when LaunchGuardTriggered events show the hook rejected or flagged protected launch activity.",
      active: activeKey === "guard-triggered",
      tone: "amber",
    },
    {
      key: "launch-high-risk",
      label: "Launch High-Risk",
      description:
        "Use this state when score, imbalance, or large-trade pressure suggests a fragile launch market.",
      active: activeKey === "launch-high-risk",
      tone: "violet",
    },
    {
      key: "healthy-flow",
      label: "Healthy Flow",
      description:
        "Use this state when score is healthy, flow is balanced enough, and recent swaps show organic participation.",
      active: activeKey === "healthy-flow",
      tone: "teal",
    },
  ];
}

export function generateAgentReport(
  dashboard?: PoolDashboard,
  events: EventLog[] = [],
  launchConfig?: LaunchConfig,
): AgentReport {
  if (!dashboard) {
    return {
      headline: "Agent Report needs live chain reads.",
      summary:
        "The report generator is read-only and stays unavailable until MetricsLens state and FairFlowHook events can be loaded.",
      statusLabel: "Unavailable",
      tone: "slate",
      readOnlyNotice: READ_ONLY_NOTICE,
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
      states: buildStates(),
      metrics: [
        { label: "State source", value: "Missing", detail: "MetricsLens not loaded", tone: "slate" },
        { label: "Event source", value: "Missing", detail: "FairFlowHook logs not loaded", tone: "slate" },
        { label: "Report mode", value: "Read-only", detail: "No writes are attempted", tone: "blue" },
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
  let headline = "Mixed launch signals need ongoing monitoring.";
  let summary =
    "The hook is live and emitting evidence, but the current event window does not cleanly map to a single healthy or defensive state.";
  let statusLabel = "Monitoring";
  let tone: ReportTone = "blue";

  if (guardTriggered) {
    activeState = "guard-triggered";
    headline = "The hook has recently enforced a protected launch rule.";
    summary =
      "This is a read-only explanation of enforcement that already happened onchain. The report is not controlling the market; it is describing the hook's emitted guard evidence.";
    statusLabel = "Guard Triggered";
    tone = "amber";
  } else if (launchHighRisk && dashboard.inLaunchWindow) {
    activeState = "launch-high-risk";
    headline = "The pool is in a high-risk launch state.";
    summary =
      "Current score, one-sided flow, or large-trade pressure indicates that the launch phase is still fragile and should be explained with caution.";
    statusLabel = "Launch High-Risk";
    tone = "violet";
  } else if (healthyFlow) {
    activeState = "healthy-flow";
    headline = "Recent activity points to healthy flow.";
    summary =
      "Score, participation, and flow balance suggest the hook is seeing constructive launch behavior rather than defensive guard pressure.";
    statusLabel = "Healthy Flow";
    tone = "teal";
  } else if (launchHighRisk) {
    activeState = "launch-high-risk";
    headline = "Risk pressure is elevated even outside the earliest launch phase.";
    summary =
      "The pool is no longer in the hottest launch window, but the current score and flow pattern still read as fragile rather than healthy.";
    statusLabel = "Launch High-Risk";
    tone = "violet";
  }

  const evidence = [
    `MetricsLens reports score ${dashboard.score}/100 with current fee ${formatFeePips(dashboard.currentFee)}.`,
    `${formatInteger(totalSwaps)} successful swaps, ${formatInteger(
      dashboard.uniqueTraderCount,
    )} unique traders, and ${formatInteger(dashboard.largeTradeCount)} large trades were recorded.`,
    `Net flow is ${formatSignedInteger(dashboard.netFlow)} against rolling volume ${formatInteger(
      dashboard.rollingVolume,
    )}, which is about ${formatBpsPercent(imbalance)} directional imbalance.`,
    launchWindowEvidence(dashboard, launchConfig),
    guardTriggered
      ? `${guardReason(guardEvents[0])} ${eventCountLabel(guardEvents.length, "guard log", "guard logs")} found in the current window.`
      : "No LaunchGuardTriggered events were found in the current event window.",
  ];

  const risks = [
    launchHighRisk
      ? `Market score is ${dashboard.score}/100 and still reads below a comfortable healthy threshold.`
      : `Market score is ${dashboard.score}/100 and does not currently show acute stress.`,
    imbalance >= 6_000
      ? `Directional imbalance is high at roughly ${formatBpsPercent(imbalance)}, which can amplify fee pressure.`
      : `Directional imbalance is ${formatBpsPercent(imbalance)}, so one-sided flow is present but not extreme.`,
    dashboard.largeTradeCount > 0n
      ? `${formatInteger(dashboard.largeTradeCount)} large trades have been counted, which can distort early launch quality.`
      : "No large-trade pressure has been recorded in the current state snapshot.",
  ];

  if (guardTriggered) {
    risks.push("Guard events are evidence of rule enforcement and should be presented alongside the relevant tx hash.");
  }

  const actions = [
    guardTriggered
      ? "Use the latest guard-trigger tx hash as evidence that the hook enforced launch rules onchain."
      : "Use recent swap and score-update tx hashes as evidence that the hook is actively emitting launch telemetry.",
    healthyFlow
      ? "Lead with healthy flow, score trend, and trader participation when presenting the pool."
      : "Lead with score, imbalance, and large-trade context before making claims about market health.",
    "Keep the copy framed as explanation of hook behavior, not AI control over AMM parameters or launch policy.",
  ];

  return {
    headline,
    summary,
    statusLabel,
    tone,
    readOnlyNotice: READ_ONLY_NOTICE,
    evidence,
    risks,
    actions,
    states: buildStates(activeState),
    metrics: [
      {
        label: "Report State",
        value: statusLabel,
        detail: dashboard.inLaunchWindow ? "Launch window active" : "Adaptive phase",
        tone,
      },
      {
        label: "Event Basis",
        value: eventCountLabel(events.length, "log", "logs"),
        detail: `${eventCountLabel(guardEvents.length, "guard event", "guard events")} and ${eventCountLabel(
          scoreEvents.length,
          "score update",
          "score updates",
        )}`,
        tone: "blue",
      },
      {
        label: "Flow Balance",
        value: formatBpsPercent(imbalance),
        detail: `Net flow ${formatSignedInteger(dashboard.netFlow)}`,
        tone: imbalance >= 6_000 ? "violet" : "teal",
      },
      {
        label: "Swap Evidence",
        value: eventCountLabel(swapEvents.length, "swap log", "swap logs"),
        detail: `${formatInteger(totalSwaps)} successful swaps in state`,
        tone: "blue",
      },
    ],
  };
}

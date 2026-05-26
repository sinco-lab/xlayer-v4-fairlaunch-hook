import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  Coins,
  Copy,
  DatabaseZap,
  ExternalLink,
  FileText,
  Gauge,
  Home,
  Info,
  RefreshCcw,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { zeroAddress, type Address, type Hex } from "viem";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { erc20Abi, swapRouterAbi } from "./abi";
import { appConfig, liveReadReady, liveWriteIssues, liveWriteReady } from "./config";
import type { EventLog, LaunchConfig, PoolDashboard, UserStatus } from "./data";
import { usePulsePoolData } from "./data";
import {
  blockExplorerTxUrl,
  formatAddress,
  formatDateTime,
  formatFeePips,
  formatHash,
  formatInteger,
  formatSignedTokenAmount,
  formatTokenAmount,
} from "./format";
import { generateAgentReport, type AgentReportState } from "./report";
import {
  buildDemoPoolKey,
  buildSwapDeadline,
  demoInputSymbol,
  demoInputToken,
  demoOutputSymbol,
  demoOutputToken,
  demoZeroForOne,
  encodeHookUser,
  parseDemoAmount,
  parseOptionalDemoAmount,
  type SwapDirection,
} from "./transactions";
import { publicClient } from "./web3";

type ViewKey = "home" | "create" | "swap" | "dashboard" | "agent";

type NavItem = {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
};

type TxStatus = "idle" | "awaiting-wallet" | "pending" | "success" | "failed";

type SwapReceiptProof = {
  hash: Hex;
  status: "success" | "reverted";
  hookLogFound: boolean;
};

const navItems: NavItem[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "create", label: "Create Launch Pool", icon: Rocket },
  { key: "swap", label: "Swap Demo", icon: ArrowRightLeft },
  { key: "dashboard", label: "Market Dashboard", icon: BarChart3 },
  { key: "agent", label: "Agent Report", icon: FileText },
];

const flowPassCards = [
  { title: "FlowPass I", label: "Early Trader", src: "/flowpass/tier-1.png" },
  { title: "FlowPass II", label: "Trusted Flow", src: "/flowpass/tier-2.png" },
  { title: "FlowPass III", label: "Quality LP", src: "/flowpass/tier-3.png" },
  { title: "FlowPass IV", label: "Launch Guardian", src: "/flowpass/tier-4.png" },
];

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const pulseData = usePulsePoolData(address);

  const dashboard = pulseData.dashboardQuery.data;
  const launchConfig = pulseData.launchConfigQuery.data;
  const userStatus = pulseData.userStatusQuery.data;
  const events = useMemo(() => pulseData.eventLogsQuery.data ?? [], [pulseData.eventLogsQuery.data]);
  const eventReadFailed = pulseData.eventLogsQuery.isError;

  const currentView = useMemo(() => {
    switch (activeView) {
      case "home":
        return <HomeView dashboard={dashboard} />;
      case "create":
        return <CreateLaunchView launchConfig={launchConfig} />;
      case "swap":
        return (
          <SwapDemoView
            address={address}
            chainId={chainId}
            dashboard={dashboard}
            eventReadFailed={eventReadFailed}
            launchConfig={launchConfig}
            userStatus={userStatus}
            events={events}
            isConnected={isConnected}
            onRefresh={pulseData.refetchAll}
          />
        );
      case "agent":
        return <AgentReportView dashboard={dashboard} events={events} eventReadFailed={eventReadFailed} launchConfig={launchConfig} />;
      case "dashboard":
      default:
        return <DashboardView dashboard={dashboard} launchConfig={launchConfig} events={events} eventReadFailed={eventReadFailed} />;
    }
  }, [
    activeView,
    address,
    chainId,
    dashboard,
    eventReadFailed,
    events,
    isConnected,
    launchConfig,
    pulseData.refetchAll,
    userStatus,
  ]);

  const connector = connectors[0];
  const coreReadFailed = pulseData.dashboardQuery.isError || pulseData.launchConfigQuery.isError;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={26} strokeWidth={2.4} />
          </span>
          <span>PulsePool</span>
        </div>

        <nav className="nav-stack" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeView === item.key ? "active" : ""}`}
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <span className="mini-mark">X</span>
          <div>
            <p>Built on</p>
            <strong>{appConfig.networkName}</strong>
          </div>
          <small>Uniswap v4 Hooks, FairFlow metrics, and read-only launch intelligence.</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <NetworkBadge />
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Refresh on-chain data"
              title="Refresh on-chain data"
              onClick={() => {
                void pulseData.refetchAll();
              }}
            >
              <RefreshCcw size={18} />
            </button>
            {isConnected ? (
              <button className="wallet-button" type="button" onClick={() => disconnect()}>
                <Wallet size={18} />
                {formatAddress(address)}
              </button>
            ) : (
              <button
                className="wallet-button"
                type="button"
                disabled={!connector || isPending}
                onClick={() => connector && connect({ connector })}
              >
                <Wallet size={18} />
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        <ConfigNotice hasQueryError={coreReadFailed} />
        {currentView}

        <footer className="footer-bar">
          <span>Trading involves risk. Agent analysis is read-only and informational.</span>
          <span className={`live-dot ${liveReadReady ? "on" : ""}`} />
        </footer>
      </main>
    </div>
  );
}

function NetworkBadge() {
  return (
    <div className="network-badge">
      <span className="x-mark">X</span>
      <div>
        <strong>{appConfig.networkName}</strong>
        <small>Chain ID {appConfig.chainId}</small>
      </div>
      <span className={`status-dot ${liveReadReady ? "ready" : ""}`} />
    </div>
  );
}

function ConfigNotice({ hasQueryError }: { hasQueryError: boolean }) {
  if (liveReadReady && !appConfig.configIssues.length && !hasQueryError) return null;

  return (
    <section className="notice-strip">
      <Info size={18} />
      <div>
        <strong>{liveReadReady ? "Live read mode" : "Configuration required for live reads"}</strong>
        <p>
          MetricsLens, FairFlowHook, and PoolId are read from `frontend/.env.local`. Empty screens are not
          treated as chain data.
        </p>
        {appConfig.configIssues.length > 0 && (
          <ul>
            {appConfig.configIssues.map((issue) => (
              <li key={issue.label}>
                {issue.label}: {issue.detail}
              </li>
            ))}
          </ul>
        )}
        {hasQueryError && <p>RPC or contract read failed. Check network, addresses, and pool configuration.</p>}
      </div>
    </section>
  );
}

function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function HomeView({ dashboard }: { dashboard?: PoolDashboard }) {
  return (
    <section className="view-stack">
      <PageTitle
        eyebrow="Fair launch markets"
        title="PulsePool"
        subtitle="Reputation-aware launch markets with FairFlow guardrails, adaptive fees, and visible on-chain quality signals."
        action={<StatusPill label={liveReadReady ? "Live reads enabled" : "Awaiting deployment config"} tone="blue" />}
      />

      <div className="hero-grid">
        <div className="hero-panel">
          <div className="hero-mark">
            <Activity size={76} />
          </div>
          <div className="hero-copy">
            <h2>FairFlow Hook dashboard</h2>
            <p>Track market score, adaptive fee, launch guard status, FlowPass tier, and emitted hook events.</p>
          </div>
        </div>
        <div className="hero-side">
          <MetricCard
            icon={Gauge}
            label="Market Quality Score"
            value={dashboard ? `${dashboard.score}/100` : "Needs config"}
            tone={scoreTone(dashboard?.score)}
          />
          <MetricCard
            icon={Coins}
            label="Current Fee"
            value={dashboard ? formatFeePips(dashboard.currentFee) : "Needs config"}
            tone="violet"
          />
        </div>
      </div>

      <div className="feature-grid">
        <FeatureCard
          icon={Shield}
          title="Launch Guard"
          copy="Max-buy and cooldown checks protect the launch window before FlowPass discounts can apply."
          badge="Guard first"
        />
        <FeatureCard
          icon={Activity}
          title="Adaptive Fee Engine"
          copy="Fee pips respond to launch phase, imbalance, trade size, and FlowPass reputation tier."
          badge="Dynamic"
        />
        <FeatureCard
          icon={BarChart3}
          title="Market Quality Score"
          copy="The hook emits score updates from volume, flow balance, unique traders, and large-trade pressure."
          badge="On-chain"
        />
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>FlowPass NFT Artwork</h2>
            <p>Artwork preview from the provided NFT image set. Tier ownership is read separately from MetricsLens.</p>
          </div>
          <StatusPill label="Artwork preview" tone="teal" />
        </div>
        <div className="flowpass-grid">
          {flowPassCards.map((card) => (
            <article className="flowpass-card" key={card.title}>
              <img src={card.src} alt={`${card.title} ${card.label}`} />
              <div>
                <strong>{card.title}</strong>
                <span>{card.label}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function DashboardView({
  dashboard,
  eventReadFailed,
  launchConfig,
  events,
}: {
  dashboard?: PoolDashboard;
  eventReadFailed: boolean;
  launchConfig?: LaunchConfig;
  events: EventLog[];
}) {
  return (
    <section className="view-stack">
      <PageTitle
        title="Market Dashboard"
        subtitle="Live state from MetricsLens plus FairFlowHook event logs for the configured pool."
        action={
          <div className="title-actions">
            <StatusPill label="Read-only" tone="teal" />
            <PoolSelector />
          </div>
        }
      />

      <div className="metrics-grid">
        <MetricCard
          icon={Gauge}
          label="Market Quality Score"
          value={dashboard ? `${dashboard.score}/100` : "Needs config"}
          subvalue={dashboard ? healthLabel(dashboard.score) : "No chain read"}
          tone={scoreTone(dashboard?.score)}
        />
        <MetricCard
          icon={DatabaseZap}
          label="Rolling Volume"
          value={dashboard ? formatTokenAmount(dashboard.rollingVolume, "units", appConfig.tokenDecimals) : "Needs config"}
          subvalue="18-dec normalized"
          tone="blue"
        />
        <MetricCard
          icon={ArrowRightLeft}
          label="Net Flow"
          value={dashboard ? formatSignedTokenAmount(dashboard.netFlow, "units", appConfig.tokenDecimals) : "Needs config"}
          subvalue="Positive means buy pressure"
          tone={netFlowTone(dashboard?.netFlow)}
        />
        <MetricCard
          icon={Users}
          label="Unique Traders"
          value={dashboard ? formatInteger(dashboard.uniqueTraderCount) : "Needs config"}
          subvalue={`${dashboard ? formatInteger(dashboard.buyCount) : "0"} buys / ${
            dashboard ? formatInteger(dashboard.sellCount) : "0"
          } sells`}
          tone="teal"
        />
        <MetricCard
          icon={Activity}
          label="Current Fee"
          value={dashboard ? formatFeePips(dashboard.currentFee) : "Needs config"}
          subvalue={dashboard?.guardActive ? "Guard active" : "Guard inactive"}
          tone="violet"
        />
      </div>

      <div className="content-grid dashboard-layout">
        <section className="panel span-2">
          <div className="section-heading">
            <div>
              <h2>Pool State</h2>
              <p>Every value in this panel comes from `getPoolDashboard` after config is present.</p>
            </div>
            <StatusPill
              label={dashboard?.configured ? "Configured" : "Not configured"}
              tone={dashboard?.configured ? "teal" : "amber"}
            />
          </div>
          <div className="state-grid">
            <Field label="PoolId" value={appConfig.poolId ?? "Not configured"} mono />
            <Field label="MetricsLens" value={formatAddress(appConfig.metricsLensAddress)} mono />
            <Field label="FairFlowHook" value={formatAddress(appConfig.fairFlowHookAddress)} mono />
            <Field label="Launch token" value={formatAddress(launchConfig?.launchToken ?? appConfig.launchTokenAddress)} mono />
            <Field label="Quote token" value={formatAddress(launchConfig?.quoteToken ?? appConfig.quoteTokenAddress)} mono />
            <Field label="Large trades" value={dashboard ? formatInteger(dashboard.largeTradeCount) : "Not available"} />
          </div>
        </section>

        <LaunchPhasePanel dashboard={dashboard} launchConfig={launchConfig} />
      </div>

      <EventStream events={events} readFailed={eventReadFailed} />
    </section>
  );
}

function SwapDemoView({
  address,
  chainId,
  dashboard,
  eventReadFailed,
  launchConfig,
  userStatus,
  events,
  isConnected,
  onRefresh,
}: {
  address?: Address;
  chainId?: number;
  dashboard?: PoolDashboard;
  eventReadFailed: boolean;
  launchConfig?: LaunchConfig;
  userStatus?: UserStatus;
  events: EventLog[];
  isConnected: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const [direction, setDirection] = useState<SwapDirection>("buy");
  const [amountInput, setAmountInput] = useState("1");
  const [minOutInput, setMinOutInput] = useState("0");
  const [approveHash, setApproveHash] = useState<Hex>();
  const [swapHash, setSwapHash] = useState<Hex>();
  const [swapProof, setSwapProof] = useState<SwapReceiptProof>();
  const [approveStatus, setApproveStatus] = useState<TxStatus>("idle");
  const [swapStatus, setSwapStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState<string>();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const { writeContractAsync, isPending: walletWritePending } = useWriteContract();
  const swapEvents = events.filter((event) => event.kind === "swap");
  const inputTokenAddress = demoInputToken(direction);
  const outputTokenAddress = demoOutputToken(direction);
  const inputSymbol = demoInputSymbol(direction);
  const outputSymbol = demoOutputSymbol(direction);
  const parsedAmount = useMemo(() => parseDemoAmount(amountInput, appConfig.tokenDecimals), [amountInput]);
  const parsedMinOut = useMemo(() => parseOptionalDemoAmount(minOutInput, appConfig.tokenDecimals), [minOutInput]);
  const amountIn = parsedAmount.value;
  const amountOutMin = parsedMinOut.value ?? 0n;
  const onCorrectChain = chainId === appConfig.chainId;

  const allowanceQuery = useReadContract({
    address: inputTokenAddress ?? zeroAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, appConfig.swapRouterAddress ?? zeroAddress],
    query: {
      enabled: liveWriteReady && Boolean(address && inputTokenAddress && appConfig.swapRouterAddress),
    },
  });

  const balanceQuery = useReadContract({
    address: inputTokenAddress ?? zeroAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: {
      enabled: liveWriteReady && Boolean(address && inputTokenAddress),
    },
  });

  const allowance = typeof allowanceQuery.data === "bigint" ? allowanceQuery.data : 0n;
  const balance = typeof balanceQuery.data === "bigint" ? balanceQuery.data : undefined;
  const approvalRequired = liveWriteReady && isConnected && onCorrectChain && amountIn !== undefined && allowance < amountIn;
  const balanceInsufficient = amountIn !== undefined && balance !== undefined && balance < amountIn;
  const balanceLoading = liveWriteReady && isConnected && Boolean(inputTokenAddress) && balanceQuery.isLoading;
  const transactionBusy = walletWritePending || approveStatus === "awaiting-wallet" || approveStatus === "pending" || swapStatus === "awaiting-wallet" || swapStatus === "pending";

  const readinessIssues = [
    ...liveWriteIssues.map((issue) => `${issue.label}: ${issue.detail}`),
    !isConnected ? "Connect a wallet before sending testnet transactions." : undefined,
    isConnected && !onCorrectChain ? `Switch wallet network to ${appConfig.networkName} (${appConfig.chainId}).` : undefined,
    parsedAmount.error,
    parsedMinOut.error,
    balanceLoading ? `Loading ${inputSymbol} balance.` : undefined,
    balanceInsufficient ? `Insufficient ${inputSymbol} balance for this amount.` : undefined,
  ].filter(Boolean) as string[];

  const canApprove =
    liveWriteReady &&
    isConnected &&
    onCorrectChain &&
    amountIn !== undefined &&
    !balanceLoading &&
    !balanceInsufficient &&
    approvalRequired &&
    !transactionBusy;
  const canSwap =
    liveWriteReady &&
    isConnected &&
    onCorrectChain &&
    amountIn !== undefined &&
    !parsedMinOut.error &&
    !balanceLoading &&
    !balanceInsufficient &&
    !approvalRequired &&
    !transactionBusy;

  async function handleSwitchNetwork() {
    setTxError(undefined);
    await switchChainAsync({ chainId: appConfig.chainId });
  }

  async function handleApprove() {
    if (!canApprove || !amountIn || !appConfig.swapRouterAddress || !inputTokenAddress) return;

    try {
      setTxError(undefined);
      setApproveStatus("awaiting-wallet");
      const hash = await writeContractAsync({
        address: inputTokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [appConfig.swapRouterAddress, amountIn],
        chainId: appConfig.chainId,
      });

      setApproveHash(hash);
      setApproveStatus("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Approval transaction reverted.");
      }

      setApproveStatus("success");
      await allowanceQuery.refetch();
    } catch (error) {
      setApproveStatus("failed");
      setTxError(readableError(error));
    }
  }

  async function handleSwap() {
    if (!canSwap || !amountIn || !address || !appConfig.swapRouterAddress) return;

    try {
      setTxError(undefined);
      setSwapProof(undefined);
      setSwapStatus("awaiting-wallet");
      const hash = await writeContractAsync({
        address: appConfig.swapRouterAddress,
        abi: swapRouterAbi,
        functionName: "swapExactTokensForTokens",
        args: [
          amountIn,
          amountOutMin,
          demoZeroForOne(direction),
          buildDemoPoolKey(),
          encodeHookUser(address),
          address,
          buildSwapDeadline(),
        ],
        value: 0n,
        chainId: appConfig.chainId,
      });

      setSwapHash(hash);
      setSwapStatus("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const hookLogFound = Boolean(
        appConfig.fairFlowHookAddress &&
          receipt.logs.some((log) => log.address.toLowerCase() === appConfig.fairFlowHookAddress?.toLowerCase()),
      );

      setSwapProof({
        hash,
        status: receipt.status,
        hookLogFound,
      });

      if (receipt.status !== "success") {
        throw new Error("Swap transaction reverted.");
      }

      setSwapStatus("success");
      await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch(), onRefresh()]);
    } catch (error) {
      setSwapStatus("failed");
      setTxError(readableError(error));
    }
  }

  return (
    <section className="view-stack">
      <PageTitle
        title="Swap Demo"
        subtitle="Live testnet swap surface for the configured demo pool, with read-only proof panels alongside wallet writes."
        action={<StatusPill label={liveWriteReady ? "Live write" : "Write disabled"} tone={liveWriteReady ? "teal" : "amber"} />}
      />

      <div className="metrics-strip">
        <MetricCard
          icon={Shield}
          label="Launch Guard"
          value={dashboard?.guardActive ? "Active" : "Inactive"}
          subvalue={dashboard?.inLaunchWindow ? "Launch window" : "Outside launch window"}
          tone={dashboard?.guardActive ? "teal" : "slate"}
        />
        <MetricCard
          icon={Gauge}
          label="Max Buy"
          value={launchConfig ? formatTokenAmount(launchConfig.maxBuyAmount, appConfig.launchTokenSymbol, appConfig.tokenDecimals) : "Needs config"}
          subvalue="Launch guard cap"
          tone="blue"
        />
        <MetricCard
          icon={Activity}
          label="Current Fee"
          value={dashboard ? formatFeePips(dashboard.currentFee) : "Needs config"}
          subvalue="From MetricsLens"
          tone="violet"
        />
        <MetricCard
          icon={Sparkles}
          label="Your FlowPass"
          value={isConnected ? `Tier ${userStatus?.flowPassTier ?? 0}` : "Connect wallet"}
          subvalue={isConnected ? `${formatInteger(userStatus?.swapCount ?? 0n)} swaps` : "Read-only until connected"}
          tone="teal"
        />
      </div>

      <div className="content-grid swap-layout">
        <section className="panel swap-card" data-testid="swap-live-panel">
          <div className="section-heading">
            <div>
              <h2>Live Demo Swap</h2>
              <p>Wallet writes are only enabled after config, wallet, chain, allowance, and amount checks pass.</p>
            </div>
            <StatusPill label={liveWriteReady ? "Router flow" : "Guarded"} tone={liveWriteReady ? "teal" : "amber"} />
          </div>

          <div className="direction-toggle" role="group" aria-label="Swap direction">
            <button className={direction === "buy" ? "active" : ""} type="button" onClick={() => setDirection("buy")}>
              Buy {appConfig.launchTokenSymbol}
            </button>
            <button className={direction === "sell" ? "active" : ""} type="button" onClick={() => setDirection("sell")}>
              Sell {appConfig.launchTokenSymbol}
            </button>
          </div>

          <div className="swap-box">
            <div>
              <label htmlFor="from-amount">From</label>
              <div className="token-row">
                <input
                  id="from-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountInput}
                  data-testid="swap-amount-input"
                  onChange={(event) => setAmountInput(event.target.value)}
                />
                <span>{inputSymbol}</span>
              </div>
            </div>
            <button
              className="swap-direction"
              type="button"
              aria-label="Switch swap direction"
              title="Switch swap direction"
              onClick={() => setDirection((value) => (value === "buy" ? "sell" : "buy"))}
            >
              <ArrowRightLeft size={18} />
            </button>
            <div>
              <label htmlFor="to-amount">To</label>
              <div className="token-row">
                <input id="to-amount" value="Router quoted on execution" readOnly />
                <span>{outputSymbol}</span>
              </div>
            </div>
            <div>
              <label htmlFor="min-out">Minimum output</label>
              <div className="token-row compact">
                <input
                  id="min-out"
                  inputMode="decimal"
                  placeholder="0"
                  value={minOutInput}
                  onChange={(event) => setMinOutInput(event.target.value)}
                />
                <span>{outputSymbol}</span>
              </div>
            </div>
          </div>

          <div className="fee-list">
            <Field label="Base fee" value={launchConfig ? formatFeePips(launchConfig.baseFeePips) : "Needs config"} />
            <Field label="Current fee" value={dashboard ? formatFeePips(dashboard.currentFee) : "Needs config"} />
            <Field
              label="FlowPass discount"
              value={launchConfig?.nftDiscountEnabled ? "Enabled by config" : "Disabled or unavailable"}
            />
            <Field label="Swap router" value={formatAddress(appConfig.swapRouterAddress)} mono />
            <Field label="Pool manager" value={formatAddress(appConfig.poolManagerAddress)} mono />
            <Field label="Input token" value={formatAddress(inputTokenAddress)} mono />
            <Field label="Output token" value={formatAddress(outputTokenAddress)} mono />
            <Field label="Allowance" value={formatTokenUnits(allowanceQuery.data, inputSymbol)} />
            <Field label="Wallet balance" value={formatTokenUnits(balance, inputSymbol)} />
          </div>

          <ReadinessPanel issues={readinessIssues} approvalRequired={approvalRequired} />

          <div className="tx-actions">
            {isConnected && !onCorrectChain && (
              <button className="secondary-action" type="button" disabled={switchPending} onClick={handleSwitchNetwork}>
                Switch network
              </button>
            )}
            <button className="secondary-action" type="button" disabled={!canApprove} onClick={handleApprove}>
              {approveButtonLabel({ liveWriteReady, approvalRequired, isConnected, onCorrectChain, inputSymbol })}
            </button>
            <button
              className="primary-action"
              type="button"
              data-testid="swap-submit-button"
              disabled={!canSwap}
              onClick={handleSwap}
            >
              {swapButtonLabel({ canSwap, approvalRequired, isConnected, onCorrectChain })}
              <ArrowRight size={18} />
            </button>
          </div>

          <TransactionStatus
            approveHash={approveHash}
            swapHash={swapHash}
            approveStatus={approveStatus}
            swapStatus={swapStatus}
            swapProof={swapProof}
            error={txError}
          />
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Transaction Proof</h2>
              <p>Configured tx hash and latest FairFlowSwap events are linked to the explorer.</p>
            </div>
          </div>
          <TxProof liveSwapProof={swapProof} liveSwapHash={swapHash} />
          <FlowPassProofPanel
            dashboard={dashboard}
            events={events}
            isConnected={isConnected}
            launchConfig={launchConfig}
            userStatus={userStatus}
          />
          <div className="event-mini-list">
            {swapEvents.length ? (
              swapEvents.slice(0, 5).map((event) => <EventRow event={event} key={`${event.transactionHash}-${event.logIndex}`} />)
            ) : (
              <EmptyState
                icon={Search}
                title="No FairFlowSwap events found"
                detail={eventReadFailed ? "Live log query failed, but configured proof receipts may still verify hook logs." : "Run a demo swap after deployment, then refresh this panel."}
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function CreateLaunchView({ launchConfig }: { launchConfig?: LaunchConfig }) {
  return (
    <section className="view-stack">
      <PageTitle
        title="Create Launch Pool"
        subtitle="Preview-only launch configuration surface. Browser pool creation opens only after init, liquidity, and registration writes are complete."
        action={<StatusPill label="Preview-only" tone="amber" />}
      />

      <div className="content-grid create-layout">
        <section className="panel span-2">
          <div className="section-heading">
            <div>
              <h2>Token & Liquidity Setup</h2>
              <p>Fields mirror the design reference and do not submit transactions.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Token Address
              <input placeholder="0x..." value={formatAddress(launchConfig?.launchToken ?? appConfig.launchTokenAddress)} readOnly />
            </label>
            <label>
              Quote Asset
              <input placeholder="0x..." value={formatAddress(launchConfig?.quoteToken ?? appConfig.quoteTokenAddress)} readOnly />
            </label>
            <label>
              Base Fee
              <input value={launchConfig ? formatFeePips(launchConfig.baseFeePips) : "Needs config"} readOnly />
            </label>
            <label>
              Fee Range
              <input
                value={
                  launchConfig
                    ? `${formatFeePips(launchConfig.minFeePips)} - ${formatFeePips(launchConfig.maxFeePips)}`
                    : "Needs config"
                }
                readOnly
              />
            </label>
            <label>
              Max Buy
              <input
                value={
                  launchConfig
                    ? formatTokenAmount(launchConfig.maxBuyAmount, appConfig.launchTokenSymbol, appConfig.tokenDecimals)
                    : "Needs config"
                }
                readOnly
              />
            </label>
            <label>
              Cooldown Blocks
              <input value={launchConfig ? `${launchConfig.cooldownBlocks}` : "Needs config"} readOnly />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>Launch Pool Preview</h2>
          <div className="preview-token">
            <Activity size={40} />
            <div>
              <strong>PulsePool Launch</strong>
              <span>{appConfig.networkName}</span>
            </div>
          </div>
          <div className="fee-list">
            <Field label="Launch start" value={formatDateTime(launchConfig?.launchStart)} />
            <Field label="Launch end" value={formatDateTime(launchConfig?.launchEnd)} />
            <Field label="NFT discount" value={launchConfig?.nftDiscountEnabled ? "Enabled" : "Disabled or unavailable"} />
          </div>
        </section>

        <section className="panel action-split" data-testid="create-preview-only">
          <div className="section-heading">
            <div>
              <h2>Mainnet Readiness Path</h2>
              <p>Each production step stays explicit until browser writes cover initialization, liquidity, and registration.</p>
            </div>
            <StatusPill label="Production gate" tone="blue" />
          </div>
          <div className="launch-stepper">
            <LaunchStep index={1} title="Deploy contracts" status="Script ready" detail="Deploy or reuse tokens, FlowPassNFT, FairFlowHook, Factory, and Lens." />
            <LaunchStep index={2} title="Initialize v4 pool" status="Script ready" detail="Use a dynamic-fee PoolKey and verify the hook permission address." />
            <LaunchStep index={3} title="Add liquidity" status="Script ready" detail="Create the initial LP position before enabling public swaps." />
            <LaunchStep index={4} title="Register launch" status="Script ready" detail="Factory writes config into FairFlowHook and MetricsLens starts reading it." />
            <LaunchStep index={5} title="Browser create" status="Not enabled" detail="Open only after every write path has wallet simulation, guardrails, and receipt proof." />
          </div>
          <button className="primary-action" type="button" disabled>
            Browser create not enabled
            <Rocket size={18} />
          </button>
          <p className="panel-note">
            Use `contracts/script/DeployXLayerTestnetDemo.s.sol` or the deployment docs for pool setup, then return here to
            review the registered launch config.
          </p>
        </section>
      </div>
    </section>
  );
}

function AgentReportView({
  dashboard,
  events,
  eventReadFailed,
  launchConfig,
}: {
  dashboard?: PoolDashboard;
  events: EventLog[];
  eventReadFailed: boolean;
  launchConfig?: LaunchConfig;
}) {
  const report = generateAgentReport(dashboard, events, launchConfig);
  const reportMetricIcons: LucideIcon[] = [FileText, DatabaseZap, ArrowRightLeft, Activity];

  return (
    <section className="view-stack">
      <PageTitle
        title="Agent Report"
        subtitle="Read-only market narrative generated from MetricsLens state and FairFlowHook events."
        action={<StatusPill label="Read-only" tone="teal" />}
      />

      <div className="content-grid agent-layout">
        <section className="panel span-2 report-hero">
          <div className="report-badge">
            <Activity size={64} />
          </div>
          <div className="report-copy">
            <div className="section-heading compact">
              <div>
                <h2>Overall Assessment</h2>
                <p>{report.headline}</p>
              </div>
              <StatusPill label={report.statusLabel} tone={report.tone} />
            </div>
            <p className="report-summary">{report.summary}</p>
            <p className="report-note">{report.readOnlyNotice}</p>
            <div className="report-stats">
              {report.metrics.map((metric, index) => (
                <MetricCard
                  icon={reportMetricIcons[index] ?? Coins}
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  subvalue={metric.detail}
                  tone={metric.tone}
                />
              ))}
            </div>
          </div>
        </section>

        <ReportStatePanel states={report.states} />
        <InsightPanel title="Evidence Trail" icon={Sparkles} items={report.evidence} tone="blue" />
        <InsightPanel title="Risk Signals" icon={AlertTriangle} items={report.risks} tone="amber" />
        <InsightPanel title="Recommended Actions" icon={CheckCircle2} items={report.actions} tone="teal" />
      </div>

      <EventStream events={events} readFailed={eventReadFailed} />
    </section>
  );
}

function LaunchPhasePanel({
  dashboard,
  launchConfig,
}: {
  dashboard?: PoolDashboard;
  launchConfig?: LaunchConfig;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Launch Phase</h2>
          <p>Derived from launch config and current chain time inside MetricsLens.</p>
        </div>
      </div>
      <div className="phase-track">
        {["Config", "Guard", "Live", "Adaptive"].map((phase, index) => (
          <div className={`phase-node ${phaseActive(index, dashboard) ? "active" : ""}`} key={phase}>
            <span>{index + 1}</span>
            <strong>{phase}</strong>
          </div>
        ))}
      </div>
      <div className="fee-list">
        <Field label="Launch start" value={formatDateTime(launchConfig?.launchStart)} />
        <Field label="Launch end" value={formatDateTime(launchConfig?.launchEnd)} />
        <Field label="Guard state" value={dashboard?.guardActive ? "Active" : "Inactive or unavailable"} />
        <Field label="Configured" value={dashboard?.configured ? "Yes" : "No"} />
      </div>
    </section>
  );
}

function EventStream({ events, readFailed }: { events: EventLog[]; readFailed: boolean }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Live Event Stream</h2>
          <p>FairFlowHook logs from the configured block window plus configured proof receipts.</p>
        </div>
        <StatusPill label={liveReadReady ? `${events.length} logs` : "Needs config"} tone={liveReadReady ? "teal" : "amber"} />
      </div>
      {readFailed && events.length > 0 && (
        <p className="panel-note">Live log query failed, so this panel is showing configured proof receipt logs.</p>
      )}
      <div className="event-table">
        {events.length ? (
          events.slice(0, 10).map((event) => <EventRow event={event} key={`${event.transactionHash}-${event.logIndex}`} />)
        ) : (
          <EmptyState
            icon={DatabaseZap}
            title={liveReadReady ? "No matching hook events" : "Event reads are not configured"}
            detail={
              liveReadReady
                ? readFailed
                  ? "Live log query failed and no configured proof receipts were available."
                  : "The configured pool has no matching logs in the current block window or proof receipts."
                : "Set MetricsLens, FairFlowHook, and PoolId in frontend/.env.local."
            }
          />
        )}
      </div>
    </section>
  );
}

function EventRow({ event }: { event: EventLog }) {
  const txUrl = blockExplorerTxUrl(appConfig.explorerUrl, event.transactionHash);
  const icon = event.kind === "swap" ? ArrowRightLeft : event.kind === "score" ? Gauge : event.kind === "flowpass" ? Sparkles : Shield;
  const Icon = icon;

  return (
    <article className="event-row">
      <div className={`event-kind ${event.kind}`}>
        <Icon size={16} />
      </div>
      <div>
        <strong>{eventTitle(event)}</strong>
        <span>{eventDetail(event)}</span>
      </div>
      <div className="event-meta">
        {event.source === "proof" && <span>Proof receipt</span>}
        <span>Block {formatInteger(event.blockNumber)}</span>
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noreferrer">
            {formatHash(event.transactionHash)}
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </article>
  );
}

function TxProof({ liveSwapHash, liveSwapProof }: { liveSwapHash?: Hex; liveSwapProof?: SwapReceiptProof }) {
  const txUrl = blockExplorerTxUrl(appConfig.explorerUrl, appConfig.demoSwapTxHash);
  const liveTxUrl = blockExplorerTxUrl(appConfig.explorerUrl, liveSwapProof?.hash ?? liveSwapHash);

  return (
    <div className="tx-proof">
      <Field label="Latest browser swap" value={formatHash(liveSwapProof?.hash ?? liveSwapHash)} mono />
      <Field
        label="Hook log in receipt"
        value={liveSwapProof ? (liveSwapProof.hookLogFound ? "Found" : "Not found") : "Waiting for browser swap"}
      />
      {liveTxUrl && (
        <a className="secondary-action" href={liveTxUrl} target="_blank" rel="noreferrer">
          View browser swap
          <ExternalLink size={16} />
        </a>
      )}
      <Field label="Configured demo tx" value={formatHash(appConfig.demoSwapTxHash)} mono />
      {txUrl ? (
        <a className="secondary-action" href={txUrl} target="_blank" rel="noreferrer">
          View on explorer
          <ExternalLink size={16} />
        </a>
      ) : (
        <button className="secondary-action" type="button" disabled>
          Add `VITE_DEMO_SWAP_TX_HASH`
          <Copy size={16} />
        </button>
      )}
    </div>
  );
}

function FlowPassProofPanel({
  dashboard,
  events,
  isConnected,
  launchConfig,
  userStatus,
}: {
  dashboard?: PoolDashboard;
  events: EventLog[];
  isConnected: boolean;
  launchConfig?: LaunchConfig;
  userStatus?: UserStatus;
}) {
  const latestFlowPassEvent = events.find((event) => event.kind === "flowpass");
  const flowPassTxUrl = blockExplorerTxUrl(appConfig.explorerUrl, latestFlowPassEvent?.transactionHash);
  const tier = userStatus?.flowPassTier ?? 0;
  const launchWindowBlocksUpgrade = Boolean(dashboard?.inLaunchWindow);
  const healthyEnough = Boolean(dashboard && dashboard.score >= 50 && !dashboard.guardActive);
  const issuanceState = !isConnected
    ? "Connect wallet"
    : launchWindowBlocksUpgrade
      ? "Guarded during launch"
      : healthyEnough
        ? tier > 0
          ? "Upgrade eligible"
          : "Mint eligible"
        : "Needs healthier flow";

  return (
    <div className="flowpass-proof">
      <div className="section-heading compact">
        <div>
          <h2>FlowPass Proof</h2>
          <p>NFT issuance is read from MetricsLens state and FlowPass events when available.</p>
        </div>
        <StatusPill label={issuanceState} tone={isConnected ? "teal" : "slate"} />
      </div>
      <div className="fee-list">
        <Field label="Current tier" value={isConnected ? `Tier ${tier}` : "Wallet required"} />
        <Field label="FlowPassNFT" value={formatAddress(appConfig.flowPassNftAddress)} mono />
        <Field label="Hook minter" value={formatAddress(appConfig.fairFlowHookAddress)} mono />
        <Field
          label="Discount gate"
          value={launchConfig?.nftDiscountEnabled ? "Enabled by config; guard still wins" : "Disabled or unavailable"}
        />
        <Field
          label="Last NFT event"
          value={
            latestFlowPassEvent?.kind === "flowpass"
              ? `Tier ${latestFlowPassEvent.oldTier ?? 0} -> ${latestFlowPassEvent.newTier ?? 0}`
              : "No FlowPass event in proof set"
          }
        />
      </div>
      {flowPassTxUrl && (
        <a className="secondary-action" href={flowPassTxUrl} target="_blank" rel="noreferrer">
          View FlowPass event
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
}

function ReadinessPanel({ issues, approvalRequired }: { issues: string[]; approvalRequired: boolean }) {
  if (!issues.length && !approvalRequired) {
    return (
      <div className="readiness-panel ready" data-testid="write-guard-list">
        <CheckCircle2 size={17} />
        <span>Ready for live testnet swap.</span>
      </div>
    );
  }

  return (
    <div className="readiness-panel" data-testid="write-guard-list">
      <AlertTriangle size={17} />
      <div>
        <strong>{approvalRequired ? "Approval required before swap" : "Transaction guard active"}</strong>
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
          {approvalRequired && <li>Approve input token allowance for the configured SwapRouter.</li>}
        </ul>
      </div>
    </div>
  );
}

function TransactionStatus({
  approveHash,
  swapHash,
  approveStatus,
  swapStatus,
  swapProof,
  error,
}: {
  approveHash?: Hex;
  swapHash?: Hex;
  approveStatus: TxStatus;
  swapStatus: TxStatus;
  swapProof?: SwapReceiptProof;
  error?: string;
}) {
  return (
    <div className="transaction-status">
      <Field label="Approve status" value={txStatusLabel(approveStatus)} />
      <Field label="Approve tx" value={formatHash(approveHash)} mono />
      <Field label="Swap status" value={txStatusLabel(swapStatus)} />
      <Field label="Swap tx" value={formatHash(swapHash)} mono />
      <Field
        label="Receipt proof"
        value={swapProof ? (swapProof.hookLogFound ? "FairFlowHook log found" : "No FairFlowHook log") : "Not available"}
      />
      {error && <p className="tx-error">{error}</p>}
    </div>
  );
}

function PoolSelector() {
  return (
    <div className="pool-selector">
      <Activity size={20} />
      <div>
        <strong>{appConfig.poolId ? "Configured Pool" : "Pool not configured"}</strong>
        <span>{appConfig.poolId ? formatHash(appConfig.poolId) : "Set VITE_POOL_ID"}</span>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subvalue,
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subvalue?: string;
  tone?: "blue" | "violet" | "teal" | "amber" | "slate";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon">
        <Icon size={22} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {subvalue && <small>{subvalue}</small>}
      </div>
    </article>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  copy,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
  badge: string;
}) {
  return (
    <article className="feature-card">
      <div className="feature-icon">
        <Icon size={28} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
        <span>{badge}</span>
      </div>
    </article>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

function LaunchStep({
  index,
  title,
  status,
  detail,
}: {
  index: number;
  title: string;
  status: string;
  detail: string;
}) {
  return (
    <article className="launch-step">
      <span>{index}</span>
      <div>
        <div>
          <strong>{title}</strong>
          <StatusPill label={status} tone={status === "Not enabled" ? "amber" : "teal"} />
        </div>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "violet" | "teal" | "amber" | "slate";
}) {
  return <span className={`status-pill tone-${tone}`}>{label}</span>;
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function InsightPanel({
  title,
  icon: Icon,
  items,
  tone,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  tone: "blue" | "teal" | "amber";
}) {
  return (
    <section className={`panel insight-panel tone-${tone}`}>
      <div className="insight-heading">
        <Icon size={22} />
        <h2>{title}</h2>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <CheckCircle2 size={15} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportStatePanel({ states }: { states: AgentReportState[] }) {
  return (
    <section className="panel report-state-panel">
      <div className="section-heading">
        <div>
          <h2>State Classifier</h2>
          <p>These labels explain hook behavior and launch evidence. They do not write state or direct the AMM.</p>
        </div>
      </div>
      <div className="report-state-grid">
        {states.map((state) => (
          <article className={`report-state-card ${state.active ? "active" : ""}`} key={state.key}>
            <div className="report-state-head">
              <strong>{state.label}</strong>
              <StatusPill label={state.active ? "Active" : "Available"} tone={state.active ? state.tone : "slate"} />
            </div>
            <p>{state.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function healthLabel(score?: number): string {
  if (score === undefined) return "Unavailable";
  if (score >= 75) return "Healthy";
  if (score >= 50) return "Moderate";
  return "High risk";
}

function scoreTone(score?: number): "blue" | "violet" | "teal" | "amber" | "slate" {
  if (score === undefined) return "slate";
  if (score >= 75) return "teal";
  if (score >= 50) return "amber";
  return "violet";
}

function netFlowTone(value?: bigint): "blue" | "violet" | "teal" | "amber" | "slate" {
  if (value === undefined || value === 0n) return "slate";
  return value > 0n ? "teal" : "violet";
}

function formatTokenUnits(value: unknown, symbol: string): string {
  if (typeof value !== "bigint") return "Not loaded";
  return formatTokenAmount(value, symbol, appConfig.tokenDecimals);
}

function txStatusLabel(status: TxStatus): string {
  if (status === "awaiting-wallet") return "Awaiting wallet";
  if (status === "pending") return "Pending";
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  return "Idle";
}

function readableError(error: unknown): string {
  if (typeof error === "object" && error && "shortMessage" in error) {
    return String((error as { shortMessage?: unknown }).shortMessage);
  }

  if (error instanceof Error) return error.message;
  return "Transaction failed.";
}

function swapButtonLabel({
  canSwap,
  approvalRequired,
  isConnected,
  onCorrectChain,
}: {
  canSwap: boolean;
  approvalRequired: boolean;
  isConnected: boolean;
  onCorrectChain: boolean;
}): string {
  if (canSwap) return "Swap on X Layer";
  if (!isConnected) return "Connect wallet required";
  if (!onCorrectChain) return "Switch network required";
  if (approvalRequired) return "Approve token first";
  return "Resolve transaction guard";
}

function approveButtonLabel({
  liveWriteReady: writeReady,
  approvalRequired,
  isConnected,
  onCorrectChain,
  inputSymbol,
}: {
  liveWriteReady: boolean;
  approvalRequired: boolean;
  isConnected: boolean;
  onCorrectChain: boolean;
  inputSymbol: string;
}): string {
  if (!writeReady) return "Resolve write config";
  if (!isConnected) return "Connect wallet first";
  if (!onCorrectChain) return "Switch network first";
  if (approvalRequired) return `Approve ${inputSymbol}`;
  return `${inputSymbol} approved`;
}

function phaseActive(index: number, dashboard?: PoolDashboard): boolean {
  if (!dashboard?.configured) return index === 0;
  if (dashboard.inLaunchWindow) return index <= 2;
  return true;
}

function eventTitle(event: EventLog): string {
  if (event.kind === "swap") return event.isBuy ? "Buy swap" : "Sell swap";
  if (event.kind === "score") return "Score updated";
  if (event.kind === "flowpass") return "FlowPass upgraded";
  return "Launch guard triggered";
}

function eventDetail(event: EventLog): string {
  if (event.kind === "swap") {
    return `${formatTokenAmount(event.amountInAbs ?? 0n, "units", appConfig.tokenDecimals)}, fee ${formatFeePips(event.appliedFee)}, tier ${
      event.flowPassTier ?? 0
    }, score ${event.marketScore ?? "n/a"}`;
  }

  if (event.kind === "score") {
    return `Score ${event.score ?? "n/a"}, net flow ${formatSignedTokenAmount(event.netFlow, "units", appConfig.tokenDecimals)}, fee ${formatFeePips(
      event.currentFee,
    )}`;
  }

  if (event.kind === "flowpass") {
    return `${formatAddress(event.user)} token ${formatInteger(event.tokenId)} tier ${event.oldTier ?? 0} -> ${
      event.newTier ?? 0
    }`;
  }

  return `${event.reason ?? "Guard rule"} for ${formatAddress(event.user)}`;
}

export default App;

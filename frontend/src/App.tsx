import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
import { defaultLanguage, i18n, languages, type I18nCopy, type Language } from "./i18n";
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
  icon: LucideIcon;
};

type TxStatus = "idle" | "awaiting-wallet" | "pending" | "success" | "failed";

type SwapReceiptProof = {
  hash: Hex;
  status: "success" | "reverted";
  hookLogFound: boolean;
};

const navItems: NavItem[] = [
  { key: "home", icon: Home },
  { key: "create", icon: Rocket },
  { key: "swap", icon: ArrowRightLeft },
  { key: "dashboard", icon: BarChart3 },
  { key: "agent", icon: FileText },
];

const flowPassCards = [
  { title: "FlowPass I", labelIndex: 0, src: "/flowpass/tier-1.png" },
  { title: "FlowPass II", labelIndex: 1, src: "/flowpass/tier-2.png" },
  { title: "FlowPass III", labelIndex: 2, src: "/flowpass/tier-3.png" },
  { title: "FlowPass IV", labelIndex: 3, src: "/flowpass/tier-4.png" },
];

const languageStorageKey = "pulsepool-language";

type I18nContextValue = {
  copy: I18nCopy;
  language: Language;
  setLanguage: (language: Language) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("I18n context missing");
  return context;
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return defaultLanguage;

  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  if (storedLanguage === "en" || storedLanguage === "zh") return storedLanguage;

  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : defaultLanguage;
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(languageStorageKey, nextLanguage);
  }, []);
  const copy = i18n[language];
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
    <I18nContext.Provider value={{ copy, language, setLanguage }}>
      <div className={`app-shell lang-${language}`}>
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
                <span>{copy.nav[item.key]}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <span className="mini-mark">X</span>
          <div>
            <p>{copy.shell.builtOn}</p>
            <strong>{appConfig.networkName}</strong>
          </div>
          <small>{copy.shell.sidebarCopy}</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <NetworkBadge />
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label={copy.shell.refreshData}
              title={copy.shell.refreshData}
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
                {copy.shell.connectWallet}
              </button>
            )}
            <LanguageToggle />
          </div>
        </header>

        <ConfigNotice hasQueryError={coreReadFailed} />
        {currentView}

        <footer className="footer-bar">
          <span>{copy.shell.footer}</span>
          <span className={`live-dot ${liveReadReady ? "on" : ""}`} />
        </footer>
      </main>
    </div>
    </I18nContext.Provider>
  );
}

function NetworkBadge() {
  const { copy } = useI18n();

  return (
    <div className="network-badge">
      <span className="x-mark">X</span>
      <div>
        <strong>{appConfig.networkName}</strong>
        <small>{copy.shell.chainId(appConfig.chainId)}</small>
      </div>
      <span className={`status-dot ${liveReadReady ? "ready" : ""}`} />
    </div>
  );
}

function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  return (
    <div className="language-toggle" role="group" aria-label="Language">
      {languages.map((item) => (
        <button
          className={item === language ? "active" : ""}
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
        >
          {i18n[item].languageShort}
        </button>
      ))}
    </div>
  );
}

function ConfigNotice({ hasQueryError }: { hasQueryError: boolean }) {
  const { copy } = useI18n();

  if (liveReadReady && !appConfig.configIssues.length && !hasQueryError) return null;

  return (
    <section className="notice-strip">
      <Info size={18} />
      <div>
        <strong>{liveReadReady ? copy.notice.liveReadMode : copy.notice.configRequired}</strong>
        <p>{copy.notice.body}</p>
        {appConfig.configIssues.length > 0 && (
          <ul>
            {appConfig.configIssues.map((issue) => (
              <li key={issue.label}>
                {issue.label}: {issue.detail}
              </li>
            ))}
          </ul>
        )}
        {hasQueryError && <p>{copy.notice.rpcError}</p>}
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
  const { copy } = useI18n();

  return (
    <section className="view-stack">
      <PageTitle
        eyebrow={copy.home.eyebrow}
        title={copy.home.title}
        subtitle={copy.home.subtitle}
        action={<StatusPill label={liveReadReady ? copy.home.liveReadsEnabled : copy.home.awaitingConfig} tone="blue" />}
      />

      <div className="hero-grid">
        <div className="hero-panel">
          <div className="hero-mark">
            <Activity size={76} />
          </div>
          <div className="hero-copy">
            <h2>{copy.home.heroTitle}</h2>
            <p>{copy.home.heroCopy}</p>
          </div>
        </div>
        <div className="hero-side">
          <MetricCard
            icon={Gauge}
            label={copy.home.marketQualityScore}
            value={dashboard ? `${dashboard.score}/100` : copy.common.needsConfig}
            tone={scoreTone(dashboard?.score)}
          />
          <MetricCard
            icon={Coins}
            label={copy.home.currentFee}
            value={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.needsConfig}
            tone="violet"
          />
        </div>
      </div>

      <div className="feature-grid">
        <FeatureCard
          icon={Shield}
          title={copy.home.launchGuardTitle}
          copy={copy.home.launchGuardCopy}
          badge={copy.home.launchGuardBadge}
        />
        <FeatureCard
          icon={Activity}
          title={copy.home.adaptiveFeeTitle}
          copy={copy.home.adaptiveFeeCopy}
          badge={copy.home.adaptiveFeeBadge}
        />
        <FeatureCard
          icon={BarChart3}
          title={copy.home.scoreTitle}
          copy={copy.home.scoreCopy}
          badge={copy.home.scoreBadge}
        />
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{copy.home.artworkTitle}</h2>
            <p>{copy.home.artworkCopy}</p>
          </div>
          <StatusPill label={copy.home.artworkStatus} tone="teal" />
        </div>
        <div className="flowpass-grid">
          {flowPassCards.map((card) => (
            <article className="flowpass-card" key={card.title}>
              <img src={card.src} alt={`${card.title} ${copy.home.flowPassLabels[card.labelIndex]}`} />
              <div>
                <strong>{card.title}</strong>
                <span>{copy.home.flowPassLabels[card.labelIndex]}</span>
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
  const { copy } = useI18n();

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.dashboard.title}
        subtitle={copy.dashboard.subtitle}
        action={
          <div className="title-actions">
            <StatusPill label={copy.common.readOnly} tone="teal" />
            <PoolSelector />
          </div>
        }
      />

      <div className="metrics-grid">
        <MetricCard
          icon={Gauge}
          label={copy.dashboard.marketQualityScore}
          value={dashboard ? `${dashboard.score}/100` : copy.common.needsConfig}
          subvalue={dashboard ? healthLabel(dashboard.score, copy) : copy.common.noChainRead}
          tone={scoreTone(dashboard?.score)}
        />
        <MetricCard
          icon={DatabaseZap}
          label={copy.dashboard.rollingVolume}
          value={dashboard ? formatTokenAmount(dashboard.rollingVolume, "units", appConfig.tokenDecimals) : copy.common.needsConfig}
          subvalue={copy.dashboard.rollingVolumeSub}
          tone="blue"
        />
        <MetricCard
          icon={ArrowRightLeft}
          label={copy.dashboard.netFlow}
          value={dashboard ? formatSignedTokenAmount(dashboard.netFlow, "units", appConfig.tokenDecimals) : copy.common.needsConfig}
          subvalue={copy.dashboard.netFlowSub}
          tone={netFlowTone(dashboard?.netFlow)}
        />
        <MetricCard
          icon={Users}
          label={copy.dashboard.uniqueTraders}
          value={dashboard ? formatInteger(dashboard.uniqueTraderCount) : copy.common.needsConfig}
          subvalue={copy.dashboard.buysSells(
            dashboard ? formatInteger(dashboard.buyCount) : "0",
            dashboard ? formatInteger(dashboard.sellCount) : "0",
          )}
          tone="teal"
        />
        <MetricCard
          icon={Activity}
          label={copy.dashboard.currentFee}
          value={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.needsConfig}
          subvalue={dashboard?.guardActive ? copy.dashboard.guardActive : copy.dashboard.guardInactive}
          tone="violet"
        />
      </div>

      <div className="content-grid dashboard-layout">
        <section className="panel span-2">
          <div className="section-heading">
            <div>
              <h2>{copy.dashboard.poolStateTitle}</h2>
              <p>{copy.dashboard.poolStateCopy}</p>
            </div>
            <StatusPill
              label={dashboard?.configured ? copy.common.configured : copy.common.notConfigured}
              tone={dashboard?.configured ? "teal" : "amber"}
            />
          </div>
          <div className="state-grid">
            <Field label={copy.dashboard.poolId} value={appConfig.poolId ?? copy.common.notConfigured} mono />
            <Field label={copy.dashboard.metricsLens} value={formatAddress(appConfig.metricsLensAddress)} mono />
            <Field label={copy.dashboard.fairFlowHook} value={formatAddress(appConfig.fairFlowHookAddress)} mono />
            <Field label={copy.dashboard.launchToken} value={formatAddress(launchConfig?.launchToken ?? appConfig.launchTokenAddress)} mono />
            <Field label={copy.dashboard.quoteToken} value={formatAddress(launchConfig?.quoteToken ?? appConfig.quoteTokenAddress)} mono />
            <Field label={copy.dashboard.largeTrades} value={dashboard ? formatInteger(dashboard.largeTradeCount) : copy.common.notAvailable} />
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
  const { copy } = useI18n();
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
    !isConnected ? copy.swap.guards.connectWallet : undefined,
    isConnected && !onCorrectChain ? copy.swap.guards.switchNetwork(appConfig.networkName, appConfig.chainId) : undefined,
    parsedAmount.error,
    parsedMinOut.error,
    balanceLoading ? copy.swap.guards.loadingBalance(inputSymbol) : undefined,
    balanceInsufficient ? copy.swap.guards.insufficientBalance(inputSymbol) : undefined,
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
        throw new Error(copy.swap.tx.approvalReverted);
      }

      setApproveStatus("success");
      await allowanceQuery.refetch();
    } catch (error) {
      setApproveStatus("failed");
      setTxError(readableError(error, copy));
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
        throw new Error(copy.swap.tx.swapReverted);
      }

      setSwapStatus("success");
      await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch(), onRefresh()]);
    } catch (error) {
      setSwapStatus("failed");
      setTxError(readableError(error, copy));
    }
  }

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.swap.title}
        subtitle={copy.swap.subtitle}
        action={<StatusPill label={liveWriteReady ? copy.common.liveWrite : copy.common.writeDisabled} tone={liveWriteReady ? "teal" : "amber"} />}
      />

      <div className="metrics-strip">
        <MetricCard
          icon={Shield}
          label={copy.swap.launchGuard}
          value={dashboard?.guardActive ? copy.common.active : copy.common.disabledOrUnavailable}
          subvalue={dashboard?.inLaunchWindow ? copy.swap.launchWindow : copy.swap.outsideLaunchWindow}
          tone={dashboard?.guardActive ? "teal" : "slate"}
        />
        <MetricCard
          icon={Gauge}
          label={copy.swap.maxBuy}
          value={launchConfig ? formatTokenAmount(launchConfig.maxBuyAmount, appConfig.launchTokenSymbol, appConfig.tokenDecimals) : copy.common.needsConfig}
          subvalue={copy.swap.maxBuySub}
          tone="blue"
        />
        <MetricCard
          icon={Activity}
          label={copy.dashboard.currentFee}
          value={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.needsConfig}
          subvalue={copy.swap.currentFeeSub}
          tone="violet"
        />
        <MetricCard
          icon={Sparkles}
          label={copy.swap.yourFlowPass}
          value={isConnected ? copy.swap.tier(userStatus?.flowPassTier ?? 0) : copy.shell.connectWallet}
          subvalue={isConnected ? copy.swap.swaps(formatInteger(userStatus?.swapCount ?? 0n)) : copy.swap.readOnlyUntilConnected}
          tone="teal"
        />
      </div>

      <div className="content-grid swap-layout">
        <section className="panel swap-card" data-testid="swap-live-panel">
          <div className="section-heading">
            <div>
              <h2>{copy.swap.liveDemoSwap}</h2>
              <p>{copy.swap.liveDemoSwapCopy}</p>
            </div>
            <StatusPill label={liveWriteReady ? copy.swap.routerFlow : copy.swap.guarded} tone={liveWriteReady ? "teal" : "amber"} />
          </div>

          <div className="direction-toggle" role="group" aria-label={copy.swap.directionAria}>
            <button className={direction === "buy" ? "active" : ""} type="button" onClick={() => setDirection("buy")}>
              {copy.swap.buy(appConfig.launchTokenSymbol)}
            </button>
            <button className={direction === "sell" ? "active" : ""} type="button" onClick={() => setDirection("sell")}>
              {copy.swap.sell(appConfig.launchTokenSymbol)}
            </button>
          </div>

          <div className="swap-box">
            <div>
              <label htmlFor="from-amount">{copy.swap.from}</label>
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
              aria-label={copy.swap.switchDirection}
              title={copy.swap.switchDirection}
              onClick={() => setDirection((value) => (value === "buy" ? "sell" : "buy"))}
            >
              <ArrowRightLeft size={18} />
            </button>
            <div>
              <label htmlFor="to-amount">{copy.swap.to}</label>
              <div className="token-row">
                <input id="to-amount" value={copy.swap.routerQuoted} readOnly />
                <span>{outputSymbol}</span>
              </div>
            </div>
            <div>
              <label htmlFor="min-out">{copy.swap.minimumOutput}</label>
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
            <Field label={copy.swap.baseFee} value={launchConfig ? formatFeePips(launchConfig.baseFeePips) : copy.common.needsConfig} />
            <Field label={copy.swap.currentFee} value={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.needsConfig} />
            <Field
              label={copy.swap.flowPassDiscount}
              value={launchConfig?.nftDiscountEnabled ? copy.swap.enabledByConfig : copy.common.disabledOrUnavailable}
            />
            <Field label={copy.swap.swapRouter} value={formatAddress(appConfig.swapRouterAddress)} mono />
            <Field label={copy.swap.poolManager} value={formatAddress(appConfig.poolManagerAddress)} mono />
            <Field label={copy.swap.inputToken} value={formatAddress(inputTokenAddress)} mono />
            <Field label={copy.swap.outputToken} value={formatAddress(outputTokenAddress)} mono />
            <Field label={copy.swap.allowance} value={formatTokenUnits(allowanceQuery.data, inputSymbol, copy)} />
            <Field label={copy.swap.walletBalance} value={formatTokenUnits(balance, inputSymbol, copy)} />
          </div>

          <ReadinessPanel issues={readinessIssues} approvalRequired={approvalRequired} />

          <div className="tx-actions">
            {isConnected && !onCorrectChain && (
              <button className="secondary-action" type="button" disabled={switchPending} onClick={handleSwitchNetwork}>
                {copy.swap.actions.switchNetwork}
              </button>
            )}
            <button className="secondary-action" type="button" disabled={!canApprove} onClick={handleApprove}>
              {approveButtonLabel({ liveWriteReady, approvalRequired, isConnected, onCorrectChain, inputSymbol }, copy)}
            </button>
            <button
              className="primary-action"
              type="button"
              data-testid="swap-submit-button"
              disabled={!canSwap}
              onClick={handleSwap}
            >
              {swapButtonLabel({ canSwap, approvalRequired, isConnected, onCorrectChain }, copy)}
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
              <h2>{copy.swap.tx.proofTitle}</h2>
              <p>{copy.swap.tx.proofCopy}</p>
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
                title={copy.swap.emptyEventsTitle}
                detail={eventReadFailed ? copy.swap.emptyEventsLiveFailed : copy.swap.emptyEventsDetail}
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function CreateLaunchView({ launchConfig }: { launchConfig?: LaunchConfig }) {
  const { copy } = useI18n();

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.create.title}
        subtitle={copy.create.subtitle}
        action={<StatusPill label={copy.common.previewOnly} tone="amber" />}
      />

      <div className="content-grid create-layout">
        <section className="panel span-2">
          <div className="section-heading">
            <div>
              <h2>{copy.create.tokenSetupTitle}</h2>
              <p>{copy.create.tokenSetupCopy}</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              {copy.create.tokenAddress}
              <input placeholder="0x..." value={formatAddress(launchConfig?.launchToken ?? appConfig.launchTokenAddress)} readOnly />
            </label>
            <label>
              {copy.create.quoteAsset}
              <input placeholder="0x..." value={formatAddress(launchConfig?.quoteToken ?? appConfig.quoteTokenAddress)} readOnly />
            </label>
            <label>
              {copy.create.baseFee}
              <input value={launchConfig ? formatFeePips(launchConfig.baseFeePips) : copy.common.needsConfig} readOnly />
            </label>
            <label>
              {copy.create.feeRange}
              <input
                value={
                  launchConfig
                    ? `${formatFeePips(launchConfig.minFeePips)} - ${formatFeePips(launchConfig.maxFeePips)}`
                    : copy.common.needsConfig
                }
                readOnly
              />
            </label>
            <label>
              {copy.create.maxBuy}
              <input
                value={
                  launchConfig
                    ? formatTokenAmount(launchConfig.maxBuyAmount, appConfig.launchTokenSymbol, appConfig.tokenDecimals)
                    : copy.common.needsConfig
                }
                readOnly
              />
            </label>
            <label>
              {copy.create.cooldownBlocks}
              <input value={launchConfig ? `${launchConfig.cooldownBlocks}` : copy.common.needsConfig} readOnly />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>{copy.create.previewTitle}</h2>
          <div className="preview-token">
            <Activity size={40} />
            <div>
              <strong>{copy.create.previewName}</strong>
              <span>{appConfig.networkName}</span>
            </div>
          </div>
          <div className="fee-list">
            <Field label={copy.dashboard.launchStart} value={formatDateTime(launchConfig?.launchStart)} />
            <Field label={copy.dashboard.launchEnd} value={formatDateTime(launchConfig?.launchEnd)} />
            <Field label={copy.create.nftDiscount} value={launchConfig?.nftDiscountEnabled ? copy.create.enabled : copy.common.disabledOrUnavailable} />
          </div>
        </section>

        <section className="panel action-split" data-testid="create-preview-only">
          <div className="section-heading">
            <div>
              <h2>{copy.create.readinessTitle}</h2>
              <p>{copy.create.readinessCopy}</p>
            </div>
            <StatusPill label={copy.common.productionGate} tone="blue" />
          </div>
          <div className="launch-stepper">
            {copy.create.steps.map((step, index) => (
              <LaunchStep
                detail={step.detail}
                disabled={index === copy.create.steps.length - 1}
                index={index + 1}
                key={step.title}
                status={index === copy.create.steps.length - 1 ? copy.common.notEnabled : copy.common.scriptReady}
                title={step.title}
              />
            ))}
          </div>
          <button className="primary-action" type="button" disabled>
            {copy.create.browserCreateDisabled}
            <Rocket size={18} />
          </button>
          <p className="panel-note">{copy.create.note}</p>
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
  const { copy, language } = useI18n();
  const report = generateAgentReport(dashboard, events, launchConfig, language);
  const reportMetricIcons: LucideIcon[] = [FileText, DatabaseZap, ArrowRightLeft, Activity];

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.agent.title}
        subtitle={copy.agent.subtitle}
        action={<StatusPill label={copy.common.readOnly} tone="teal" />}
      />

      <div className="content-grid agent-layout">
        <section className="panel span-2 report-hero">
          <div className="report-badge">
            <Activity size={64} />
          </div>
          <div className="report-copy">
            <div className="section-heading compact">
              <div>
                <h2>{copy.agent.overallAssessment}</h2>
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
        <InsightPanel title={copy.agent.evidenceTrail} icon={Sparkles} items={report.evidence} tone="blue" />
        <InsightPanel title={copy.agent.riskSignals} icon={AlertTriangle} items={report.risks} tone="amber" />
        <InsightPanel title={copy.agent.recommendedActions} icon={CheckCircle2} items={report.actions} tone="teal" />
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
  const { copy } = useI18n();

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{copy.dashboard.launchPhaseTitle}</h2>
          <p>{copy.dashboard.launchPhaseCopy}</p>
        </div>
      </div>
      <div className="phase-track">
        {copy.dashboard.phaseNodes.map((phase, index) => (
          <div className={`phase-node ${phaseActive(index, dashboard) ? "active" : ""}`} key={phase}>
            <span>{index + 1}</span>
            <strong>{phase}</strong>
          </div>
        ))}
      </div>
      <div className="fee-list">
        <Field label={copy.dashboard.launchStart} value={formatDateTime(launchConfig?.launchStart)} />
        <Field label={copy.dashboard.launchEnd} value={formatDateTime(launchConfig?.launchEnd)} />
        <Field label={copy.dashboard.guardState} value={dashboard?.guardActive ? copy.dashboard.active : copy.dashboard.inactiveOrUnavailable} />
        <Field label={copy.common.configured} value={dashboard?.configured ? copy.common.yes : copy.common.no} />
      </div>
    </section>
  );
}

function EventStream({ events, readFailed }: { events: EventLog[]; readFailed: boolean }) {
  const { copy } = useI18n();

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{copy.eventStream.title}</h2>
          <p>{copy.eventStream.copy}</p>
        </div>
        <StatusPill label={liveReadReady ? copy.eventStream.logs(events.length) : copy.common.needsConfig} tone={liveReadReady ? "teal" : "amber"} />
      </div>
      {readFailed && events.length > 0 && (
        <p className="panel-note">{copy.eventStream.liveFailedFallback}</p>
      )}
      <div className="event-table">
        {events.length ? (
          events.slice(0, 10).map((event) => <EventRow event={event} key={`${event.transactionHash}-${event.logIndex}`} />)
        ) : (
          <EmptyState
            icon={DatabaseZap}
            title={liveReadReady ? copy.eventStream.noMatching : copy.eventStream.notConfigured}
            detail={
              liveReadReady
                ? readFailed
                  ? copy.eventStream.liveFailedEmpty
                  : copy.eventStream.noLogs
                : copy.eventStream.setConfig
            }
          />
        )}
      </div>
    </section>
  );
}

function EventRow({ event }: { event: EventLog }) {
  const { copy } = useI18n();
  const txUrl = blockExplorerTxUrl(appConfig.explorerUrl, event.transactionHash);
  const icon = event.kind === "swap" ? ArrowRightLeft : event.kind === "score" ? Gauge : event.kind === "flowpass" ? Sparkles : Shield;
  const Icon = icon;

  return (
    <article className="event-row">
      <div className={`event-kind ${event.kind}`}>
        <Icon size={16} />
      </div>
      <div>
        <strong>{eventTitle(event, copy)}</strong>
        <span>{eventDetail(event, copy)}</span>
      </div>
      <div className="event-meta">
        {event.source === "proof" && <span>{copy.eventStream.proofReceipt}</span>}
        <span>{copy.eventStream.block(formatInteger(event.blockNumber))}</span>
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
  const { copy } = useI18n();
  const txUrl = blockExplorerTxUrl(appConfig.explorerUrl, appConfig.demoSwapTxHash);
  const liveTxUrl = blockExplorerTxUrl(appConfig.explorerUrl, liveSwapProof?.hash ?? liveSwapHash);

  return (
    <div className="tx-proof">
      <Field label={copy.swap.tx.latestBrowserSwap} value={formatHash(liveSwapProof?.hash ?? liveSwapHash)} mono />
      <Field
        label={copy.swap.tx.hookLogReceipt}
        value={liveSwapProof ? (liveSwapProof.hookLogFound ? copy.common.found : copy.common.notFound) : copy.swap.tx.waitingBrowserSwap}
      />
      {liveTxUrl && (
        <a className="secondary-action" href={liveTxUrl} target="_blank" rel="noreferrer">
          {copy.swap.tx.viewBrowserSwap}
          <ExternalLink size={16} />
        </a>
      )}
      <Field label={copy.swap.tx.configuredDemoTx} value={formatHash(appConfig.demoSwapTxHash)} mono />
      {txUrl ? (
        <a className="secondary-action" href={txUrl} target="_blank" rel="noreferrer">
          {copy.swap.tx.viewExplorer}
          <ExternalLink size={16} />
        </a>
      ) : (
        <button className="secondary-action" type="button" disabled>
          {copy.swap.tx.addDemoHash}
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
  const { copy } = useI18n();
  const latestFlowPassEvent = events.find((event) => event.kind === "flowpass");
  const flowPassTxUrl = blockExplorerTxUrl(appConfig.explorerUrl, latestFlowPassEvent?.transactionHash);
  const tier = userStatus?.flowPassTier ?? 0;
  const launchWindowBlocksUpgrade = Boolean(dashboard?.inLaunchWindow);
  const healthyEnough = Boolean(dashboard && dashboard.score >= 50 && !dashboard.guardActive);
  const issuanceState = !isConnected
    ? copy.swap.flowPass.connectWallet
    : launchWindowBlocksUpgrade
      ? copy.swap.flowPass.guardedDuringLaunch
      : healthyEnough
        ? tier > 0
          ? copy.swap.flowPass.upgradeEligible
          : copy.swap.flowPass.mintEligible
        : copy.swap.flowPass.needsHealthierFlow;

  return (
    <div className="flowpass-proof">
      <div className="section-heading compact">
        <div>
          <h2>{copy.swap.flowPass.title}</h2>
          <p>{copy.swap.flowPass.copy}</p>
        </div>
        <StatusPill label={issuanceState} tone={isConnected ? "teal" : "slate"} />
      </div>
      <div className="fee-list">
        <Field label={copy.swap.flowPass.currentTier} value={isConnected ? copy.swap.tier(tier) : copy.swap.flowPass.walletRequired} />
        <Field label="FlowPassNFT" value={formatAddress(appConfig.flowPassNftAddress)} mono />
        <Field label={copy.swap.flowPass.hookMinter} value={formatAddress(appConfig.fairFlowHookAddress)} mono />
        <Field
          label={copy.swap.flowPass.discountGate}
          value={launchConfig?.nftDiscountEnabled ? copy.swap.flowPass.discountGateEnabled : copy.common.disabledOrUnavailable}
        />
        <Field
          label={copy.swap.flowPass.lastNftEvent}
          value={
            latestFlowPassEvent?.kind === "flowpass"
              ? copy.swap.flowPass.eventTier(latestFlowPassEvent.oldTier ?? 0, latestFlowPassEvent.newTier ?? 0)
              : copy.swap.flowPass.noEvent
          }
        />
      </div>
      {flowPassTxUrl && (
        <a className="secondary-action" href={flowPassTxUrl} target="_blank" rel="noreferrer">
          {copy.swap.flowPass.viewEvent}
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
}

function ReadinessPanel({ issues, approvalRequired }: { issues: string[]; approvalRequired: boolean }) {
  const { copy } = useI18n();

  if (!issues.length && !approvalRequired) {
    return (
      <div className="readiness-panel ready" data-testid="write-guard-list">
        <CheckCircle2 size={17} />
        <span>{copy.swap.guards.ready}</span>
      </div>
    );
  }

  return (
    <div className="readiness-panel" data-testid="write-guard-list">
      <AlertTriangle size={17} />
      <div>
        <strong>{approvalRequired ? copy.swap.guards.approvalRequired : copy.swap.guards.transactionGuard}</strong>
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
          {approvalRequired && <li>{copy.swap.guards.approveAllowance}</li>}
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
  const { copy } = useI18n();

  return (
    <div className="transaction-status">
      <Field label={copy.swap.tx.approveStatus} value={txStatusLabel(approveStatus, copy)} />
      <Field label={copy.swap.tx.approveTx} value={formatHash(approveHash)} mono />
      <Field label={copy.swap.tx.swapStatus} value={txStatusLabel(swapStatus, copy)} />
      <Field label={copy.swap.tx.swapTx} value={formatHash(swapHash)} mono />
      <Field
        label={copy.swap.tx.receiptProof}
        value={swapProof ? (swapProof.hookLogFound ? copy.swap.tx.fairFlowLogFound : copy.swap.tx.noFairFlowLog) : copy.common.notAvailable}
      />
      {error && <p className="tx-error">{error}</p>}
    </div>
  );
}

function PoolSelector() {
  const { copy } = useI18n();

  return (
    <div className="pool-selector">
      <Activity size={20} />
      <div>
        <strong>{appConfig.poolId ? copy.poolSelector.configured : copy.poolSelector.notConfigured}</strong>
        <span>{appConfig.poolId ? formatHash(appConfig.poolId) : copy.poolSelector.setPoolId}</span>
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
  disabled = false,
  index,
  title,
  status,
  detail,
}: {
  disabled?: boolean;
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
          <StatusPill label={status} tone={disabled ? "amber" : "teal"} />
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
  const { copy } = useI18n();

  return (
    <section className="panel report-state-panel">
      <div className="section-heading">
        <div>
          <h2>{copy.agent.stateClassifier}</h2>
          <p>{copy.agent.stateClassifierCopy}</p>
        </div>
      </div>
      <div className="report-state-grid">
        {states.map((state) => (
          <article className={`report-state-card ${state.active ? "active" : ""}`} key={state.key}>
            <div className="report-state-head">
              <strong>{state.label}</strong>
              <StatusPill label={state.active ? copy.common.active : copy.common.available} tone={state.active ? state.tone : "slate"} />
            </div>
            <p>{state.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function healthLabel(score: number | undefined, copy: I18nCopy): string {
  if (score === undefined) return copy.common.unavailable;
  if (score >= 75) return copy.common.healthy;
  if (score >= 50) return copy.common.moderate;
  return copy.common.highRisk;
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

function formatTokenUnits(value: unknown, symbol: string, copy: I18nCopy): string {
  if (typeof value !== "bigint") return copy.common.notAvailable;
  return formatTokenAmount(value, symbol, appConfig.tokenDecimals);
}

function txStatusLabel(status: TxStatus, copy: I18nCopy): string {
  if (status === "awaiting-wallet") return copy.common.awaitingWallet;
  if (status === "pending") return copy.common.pending;
  if (status === "success") return copy.common.success;
  if (status === "failed") return copy.common.failed;
  return copy.common.idle;
}

function readableError(error: unknown, copy: I18nCopy): string {
  if (typeof error === "object" && error && "shortMessage" in error) {
    return String((error as { shortMessage?: unknown }).shortMessage);
  }

  if (error instanceof Error) return error.message;
  return copy.swap.tx.failed;
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
}, copy: I18nCopy): string {
  if (canSwap) return copy.swap.actions.swapOnXLayer;
  if (!isConnected) return copy.swap.actions.connectRequired;
  if (!onCorrectChain) return copy.swap.actions.switchRequired;
  if (approvalRequired) return copy.swap.actions.approveFirst;
  return copy.swap.actions.resolveGuard;
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
}, copy: I18nCopy): string {
  if (!writeReady) return copy.swap.actions.resolveWriteConfig;
  if (!isConnected) return copy.swap.actions.connectFirst;
  if (!onCorrectChain) return copy.swap.actions.switchFirst;
  if (approvalRequired) return copy.swap.actions.approve(inputSymbol);
  return copy.swap.actions.approved(inputSymbol);
}

function phaseActive(index: number, dashboard?: PoolDashboard): boolean {
  if (!dashboard?.configured) return index === 0;
  if (dashboard.inLaunchWindow) return index <= 2;
  return true;
}

function eventTitle(event: EventLog, copy: I18nCopy): string {
  if (event.kind === "swap") return event.isBuy ? copy.eventStream.titles.buySwap : copy.eventStream.titles.sellSwap;
  if (event.kind === "score") return copy.eventStream.titles.scoreUpdated;
  if (event.kind === "flowpass") return copy.eventStream.titles.flowPassUpgraded;
  return copy.eventStream.titles.guardTriggered;
}

function eventDetail(event: EventLog, copy: I18nCopy): string {
  if (event.kind === "swap") {
    return copy.eventStream.details.swap(
      formatTokenAmount(event.amountInAbs ?? 0n, "units", appConfig.tokenDecimals),
      formatFeePips(event.appliedFee),
      event.flowPassTier ?? 0,
      event.marketScore ?? "n/a",
    );
  }

  if (event.kind === "score") {
    return copy.eventStream.details.score(
      event.score ?? "n/a",
      formatSignedTokenAmount(event.netFlow, "units", appConfig.tokenDecimals),
      formatFeePips(event.currentFee),
    );
  }

  if (event.kind === "flowpass") {
    return copy.eventStream.details.flowpass(
      formatAddress(event.user),
      formatInteger(event.tokenId),
      event.oldTier ?? 0,
      event.newTier ?? 0,
    );
  }

  return copy.eventStream.details.guard(event.reason ?? copy.eventStream.details.defaultGuardReason, formatAddress(event.user));
}

export default App;

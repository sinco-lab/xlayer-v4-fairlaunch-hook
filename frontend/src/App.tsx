import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Coins,
  Copy,
  DatabaseZap,
  ExternalLink,
  FileText,
  Gauge,
  Home,
  Info,
  LogOut,
  RefreshCcw,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { encodeDeployData, formatUnits, getAddress, isAddress, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDeployContract,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import {
  erc20Abi,
  flowPassNftAbi,
  launchCreatedEvent,
  launchFactoryAbi,
  permit2Abi,
  poolManagerAbi,
  stateViewAbi,
  swapRouterAbi,
  universalRouterAbi,
  v4QuoterAbi,
} from "./abi";
import { appConfig, liveReadReady, liveWriteIssues, liveWriteReady } from "./config";
import type { EventLog, LaunchConfig, PoolDashboard, UserStatus } from "./data";
import { usePulsePoolData } from "./data";
import {
  blockExplorerTxUrl,
  blockExplorerAddressUrl,
  formatAddress,
  formatDateTime,
  formatFeePips,
  formatHash,
  formatInteger,
  formatSignedTokenAmount,
  formatTokenAmount,
} from "./format";
import { defaultLanguage, i18n, languages, type I18nCopy, type Language } from "./i18n";
import { fairLaunchTokenAbi, fairLaunchTokenBytecode } from "./fairLaunchTokenArtifact";
import { generateAgentReport, type AgentReportState } from "./report";
import {
  buildPoolKeyForTokens,
  buildSwapDeadline,
  encodeHookUser,
  poolIdForPoolKey,
  poolStateSlotForPoolId,
  parseDemoAmount,
  parseOptionalDemoAmount,
  sqrtPriceX96FromSlot0,
  type SwapDirection,
} from "./transactions";
import { buildV4ExactInputSingleSwap } from "./universalRouter";
import { publicClient } from "./web3";

type ViewKey = "home" | "create" | "swap" | "dashboard" | "agent" | "guide";

type NavItem = {
  key: ViewKey;
  icon: LucideIcon;
};

type TxStatus = "idle" | "awaiting-wallet" | "pending" | "success" | "failed";

type LaunchMode = "create-token" | "existing-token";
type LaunchIndexScope = "all" | "mine";

type LaunchTokenDeployment = {
  address: Address;
  chainId: number;
  createdAt: number;
  deployer?: Address;
  name: string;
  symbol: string;
  txHash: Hex;
};

type RegisteredLaunchRecord = {
  chainId: number;
  createdAt: number;
  creator?: Address;
  launchEnd?: bigint;
  launchStart?: bigint;
  launchToken?: Address;
  poolId: Hex;
  quoteToken?: Address;
  txHash: Hex;
};

type LaunchIndexItem = Omit<RegisteredLaunchRecord, "txHash"> & {
  blockNumber?: bigint;
  source: "configured" | "factory" | "local";
  txHash?: Hex;
};

type SelectedPool = {
  chainId: number;
  launchEnd?: bigint;
  launchStart?: bigint;
  launchToken?: Address;
  poolId: Hex;
  quoteToken?: Address;
  source?: LaunchIndexItem["source"];
  txHash?: Hex;
};

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
  { key: "guide", icon: BookOpen },
];

const slippageOptions = [50, 100, 200];

const flowPassCards = [
  { title: "FlowPass I", labelIndex: 0, src: "/flowpass/tier-1.png" },
  { title: "FlowPass II", labelIndex: 1, src: "/flowpass/tier-2.png" },
  { title: "FlowPass III", labelIndex: 2, src: "/flowpass/tier-3.png" },
  { title: "FlowPass IV", labelIndex: 3, src: "/flowpass/tier-4.png" },
];

const languageStorageKey = "fairflow-launch-language";
const selectedPoolStorageKey = "pulsepool.selectedPool.v1";

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

function initialSelectedPool(): SelectedPool | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const stored = window.localStorage.getItem(selectedPoolStorageKey);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || typeof parsed.chainId !== "number" || !isBytes32Hex(parsed.poolId)) {
      return undefined;
    }

    return {
      chainId: parsed.chainId,
      launchEnd: storedBigInt(parsed.launchEnd),
      launchStart: storedBigInt(parsed.launchStart),
      launchToken: parsed.launchToken && isAddress(parsed.launchToken) ? getAddress(parsed.launchToken) : undefined,
      poolId: parsed.poolId.toLowerCase() as Hex,
      quoteToken: parsed.quoteToken && isAddress(parsed.quoteToken) ? getAddress(parsed.quoteToken) : undefined,
      source: parsed.source === "factory" || parsed.source === "local" || parsed.source === "configured" ? parsed.source : undefined,
      txHash: isBytes32Hex(parsed.txHash) ? parsed.txHash : undefined,
    };
  } catch {
    return undefined;
  }
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("home");
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const [selectedPool, setSelectedPool] = useState<SelectedPool | undefined>(initialSelectedPool);
  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(languageStorageKey, nextLanguage);
  }, []);
  const copy = i18n[language];
  const { address, chainId, isConnected } = useAccount();
  const activeChainId = useChainId();
  const walletChainId = chainId ?? activeChainId;
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const pulseData = usePulsePoolData(address, selectedPool?.poolId);
  const handleSelectPool = useCallback((pool: SelectedPool) => {
    setSelectedPool(pool);
  }, []);
  const handleSwapPool = useCallback((pool: SelectedPool) => {
    setSelectedPool(pool);
    setActiveView("swap");
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeView]);

  useEffect(() => {
    if (!selectedPool) {
      window.localStorage.removeItem(selectedPoolStorageKey);
      return;
    }

    window.localStorage.setItem(
      selectedPoolStorageKey,
      JSON.stringify(selectedPool, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    );
  }, [selectedPool]);

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
        return (
          <CreateLaunchView
            address={address}
            chainId={walletChainId}
            isConnected={isConnected}
            onRefresh={pulseData.refetchAll}
          />
        );
      case "swap":
        return (
          <SwapView
            address={address}
            chainId={walletChainId}
            dashboard={dashboard}
            eventReadFailed={eventReadFailed}
            launchConfig={launchConfig}
            userStatus={userStatus}
            events={events}
            isConnected={isConnected}
            onRefresh={pulseData.refetchAll}
            selectedPool={selectedPool}
          />
        );
      case "agent":
        return <AgentReportView dashboard={dashboard} events={events} launchConfig={launchConfig} />;
      case "guide":
        return <GuideView launchConfig={launchConfig} />;
      case "dashboard":
      default:
        return (
          <DashboardView
            address={address}
            dashboard={dashboard}
            launchConfig={launchConfig}
            events={events}
            eventReadFailed={eventReadFailed}
            onSelectPool={handleSelectPool}
            onSwapPool={handleSwapPool}
            selectedPool={selectedPool}
          />
        );
    }
  }, [
    activeView,
    address,
    walletChainId,
    dashboard,
    eventReadFailed,
    events,
    isConnected,
    launchConfig,
    handleSelectPool,
    handleSwapPool,
    pulseData.refetchAll,
    selectedPool,
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
          <span>FairFlow Launch</span>
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
              <div className="wallet-group">
                <div
                  className="wallet-button wallet-display"
                  role="status"
                  aria-label={`${copy.shell.connectedWallet}: ${formatAddress(address)}`}
                  title={copy.shell.connectedWallet}
                >
                  <Wallet size={18} />
                  {formatAddress(address)}
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={copy.shell.disconnectWallet}
                  title={copy.shell.disconnectWallet}
                  onClick={() => disconnect()}
                >
                  <LogOut size={18} />
                </button>
              </div>
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
  address,
  dashboard,
  eventReadFailed,
  launchConfig,
  events,
  onSelectPool,
  onSwapPool,
  selectedPool,
}: {
  address?: Address;
  dashboard?: PoolDashboard;
  eventReadFailed: boolean;
  launchConfig?: LaunchConfig;
  events: EventLog[];
  onSelectPool: (pool: SelectedPool) => void;
  onSwapPool: (pool: SelectedPool) => void;
  selectedPool?: SelectedPool;
}) {
  const { copy } = useI18n();
  const [launchIndexScope, setLaunchIndexScope] = useState<LaunchIndexScope>("all");
  const launchIndexQuery = useQuery({
    queryKey: ["launch-index", appConfig.chainId, appConfig.launchFactoryAddress, appConfig.eventBlockWindow],
    queryFn: readLaunchIndex,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const launchIndex = useMemo(() => launchIndexQuery.data?.items ?? [], [launchIndexQuery.data?.items]);
  const launchIndexReadFailed = Boolean(launchIndexQuery.data?.liveFailed || launchIndexQuery.isError);
  const walletLaunchIndex = useMemo(() => {
    if (!address) return [];
    const wallet = address.toLowerCase();
    return launchIndex.filter((item) => item.creator?.toLowerCase() === wallet);
  }, [address, launchIndex]);
  const visibleLaunchIndex = launchIndexScope === "mine" ? walletLaunchIndex : launchIndex;
  const swapEvents = events.filter((event): event is Extract<EventLog, { kind: "swap" }> => event.kind === "swap");
  const scoreEvents = events.filter((event): event is Extract<EventLog, { kind: "score" }> => event.kind === "score");

  useEffect(() => {
    if (!address && launchIndexScope === "mine") setLaunchIndexScope("all");
  }, [address, launchIndexScope]);

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.dashboard.title}
        subtitle={copy.dashboard.subtitle}
        action={
          <div className="title-actions">
            <StatusPill label={copy.common.readOnly} tone="teal" />
            <PoolSelector selectedPool={selectedPool} />
          </div>
        }
      />

      <LaunchIndexPanel
        allCount={launchIndex.length}
        eventBlockWindow={appConfig.eventBlockWindow}
        items={visibleLaunchIndex}
        loading={launchIndexQuery.isLoading}
        mineCount={walletLaunchIndex.length}
        onSelectPool={onSelectPool}
        onScopeChange={setLaunchIndexScope}
        onSwapPool={onSwapPool}
        readFailed={launchIndexReadFailed}
        scope={launchIndexScope}
        selectedPoolId={selectedPool?.poolId}
        walletConnected={Boolean(address)}
      />

      <div className="market-metrics-grid">
        <MarketMetricCard
          icon={Gauge}
          label={copy.dashboard.marketQualityScore}
          value={dashboard ? `${dashboard.score}/100` : copy.common.needsConfig}
          subvalue={dashboard ? healthLabel(dashboard.score, copy) : copy.common.noChainRead}
          tone={scoreTone(dashboard?.score)}
          chartData={scoreSeries(scoreEvents, dashboard)}
        />
        <MarketMetricCard
          icon={DatabaseZap}
          label={copy.dashboard.rollingVolume}
          value={dashboard ? formatTokenAmount(dashboard.rollingVolume, "", appConfig.tokenDecimals) : copy.common.needsConfig}
          subvalue={copy.dashboard.eventDerived(events.length)}
          tone="blue"
          chartData={volumeSeries(scoreEvents, dashboard)}
        />
        <MarketMetricCard
          icon={ArrowRightLeft}
          label={copy.dashboard.netFlow}
          value={dashboard ? formatSignedTokenAmount(dashboard.netFlow, "", appConfig.tokenDecimals) : copy.common.needsConfig}
          subvalue={copy.dashboard.netFlowSub}
          tone={netFlowTone(dashboard?.netFlow)}
          chartData={netFlowSeries(scoreEvents, dashboard)}
        />
        <MarketMetricCard
          icon={Users}
          label={copy.dashboard.uniqueTraders}
          value={dashboard ? formatInteger(dashboard.uniqueTraderCount) : copy.common.needsConfig}
          subvalue={copy.dashboard.buysSells(
            dashboard ? formatInteger(dashboard.buyCount) : "0",
            dashboard ? formatInteger(dashboard.sellCount) : "0",
          )}
          tone="teal"
          chartData={swapActivitySeries(swapEvents)}
        />
        <MarketMetricCard
          icon={BarChart3}
          label={copy.dashboard.tradeActivity}
          value={dashboard ? formatInteger(dashboard.buyCount + dashboard.sellCount) : copy.common.needsConfig}
          subvalue={copy.dashboard.largeTradeSub(dashboard ? formatInteger(dashboard.largeTradeCount) : "0")}
          tone="blue"
          chartData={swapActivitySeries(swapEvents)}
        />
        <MarketMetricCard
          icon={Activity}
          label={copy.dashboard.currentFee}
          value={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.needsConfig}
          subvalue={dashboard?.guardActive ? copy.dashboard.guardActive : copy.dashboard.guardInactive}
          tone="violet"
          chartData={feeSeries(scoreEvents, dashboard)}
        />
      </div>

      <div className="market-dashboard-grid">
        <div className="market-main-column">
          <div className="market-chart-grid">
            <MarketChartPanel
              title={copy.dashboard.feeChartTitle}
              copy={copy.dashboard.feeChartCopy}
              label={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.notAvailable}
            >
              <LineChart data={feeSeries(scoreEvents, dashboard)} tone="violet" emptyLabel={copy.dashboard.insufficientEvents} />
            </MarketChartPanel>
            <MarketChartPanel
              title={copy.dashboard.flowChartTitle}
              copy={copy.dashboard.flowChartCopy}
              label={dashboard ? formatSignedTokenAmount(dashboard.netFlow, "", appConfig.tokenDecimals) : copy.common.notAvailable}
            >
              <FlowChart events={swapEvents} emptyLabel={copy.dashboard.insufficientEvents} />
            </MarketChartPanel>
            <MarketChartPanel
              title={copy.dashboard.scoreTrendTitle}
              copy={copy.dashboard.scoreTrendCopy}
              label={dashboard ? `${dashboard.score}` : copy.common.notAvailable}
            >
              <LineChart data={scoreSeries(scoreEvents, dashboard)} tone="blue" emptyLabel={copy.dashboard.insufficientEvents} />
            </MarketChartPanel>
          </div>

          <div className="market-tables-grid">
            <RecentSwapsPanel events={swapEvents} />
            <ScoreUpdatesPanel events={scoreEvents} dashboard={dashboard} />
          </div>
        </div>

        <aside className="market-side-column">
          <LaunchPhasePanel dashboard={dashboard} launchConfig={launchConfig} />
          <RiskStatePanel dashboard={dashboard} launchConfig={launchConfig} events={events} />
          <LiveEventStreamPanel events={events} readFailed={eventReadFailed} />
        </aside>
      </div>

      <section className="panel">
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
    </section>
  );
}

function MarketMetricCard({
  icon: Icon,
  label,
  value,
  subvalue,
  tone = "blue",
  chartData = [],
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subvalue?: string;
  tone?: "blue" | "violet" | "teal" | "amber" | "slate";
  chartData?: number[];
}) {
  return (
    <article className={`market-metric-card tone-${tone}`}>
      <div>
        <div className="market-metric-icon">
          <Icon size={18} />
        </div>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {subvalue && <small>{subvalue}</small>}
      <MiniSparkline data={chartData} tone={tone} />
    </article>
  );
}

function MarketChartPanel({
  title,
  copy,
  label,
  children,
}: {
  title: string;
  copy: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="panel market-chart-panel">
      <div className="market-panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        <StatusPill label={label} tone="slate" />
      </div>
      {children}
    </section>
  );
}

function RecentSwapsPanel({ events }: { events: Extract<EventLog, { kind: "swap" }>[] }) {
  const { copy } = useI18n();
  const rows = chronologicalEvents(events).slice(-6).reverse();

  return (
    <section className="panel market-table-panel">
      <div className="market-panel-heading">
        <div>
          <h2>{copy.dashboard.recentSwapsTitle}</h2>
          <p>{copy.dashboard.recentSwapsCopy}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th>{copy.dashboard.type}</th>
                <th>{copy.dashboard.amount}</th>
                <th>{copy.dashboard.fee}</th>
                <th>{copy.dashboard.trader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={`${event.transactionHash}-${event.logIndex}`}>
                  <td>
                    <span className={`trade-side ${event.isBuy ? "buy" : "sell"}`}>
                      {event.isBuy ? copy.dashboard.buy : copy.dashboard.sell}
                    </span>
                  </td>
                  <td>{formatTokenAmount(event.amountInAbs ?? 0n, "", appConfig.tokenDecimals)}</td>
                  <td>{formatFeePips(event.appliedFee)}</td>
                  <td>{formatAddress(event.user)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Search} title={copy.dashboard.noSwapRowsTitle} detail={copy.dashboard.noSwapRowsCopy} />
      )}
    </section>
  );
}

function ScoreUpdatesPanel({
  events,
  dashboard,
}: {
  events: Extract<EventLog, { kind: "score" }>[];
  dashboard?: PoolDashboard;
}) {
  const { copy } = useI18n();
  const rows = chronologicalEvents(events).slice(-6).reverse();

  return (
    <section className="panel market-table-panel">
      <div className="market-panel-heading">
        <div>
          <h2>{copy.dashboard.scoreUpdatesTitle}</h2>
          <p>{copy.dashboard.scoreUpdatesCopy}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th>{copy.dashboard.score}</th>
                <th>{copy.dashboard.netFlow}</th>
                <th>{copy.dashboard.currentFee}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={`${event.transactionHash}-${event.logIndex}`}>
                  <td>{event.score ?? copy.common.notAvailable}</td>
                  <td>{formatSignedTokenAmount(event.netFlow, "", appConfig.tokenDecimals)}</td>
                  <td>{formatFeePips(event.currentFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Gauge}
          title={copy.dashboard.noScoreRowsTitle}
          detail={dashboard ? copy.dashboard.noScoreRowsCopy : copy.common.noChainRead}
        />
      )}
    </section>
  );
}

function RiskStatePanel({
  dashboard,
  launchConfig,
  events,
}: {
  dashboard?: PoolDashboard;
  launchConfig?: LaunchConfig;
  events: EventLog[];
}) {
  const { copy } = useI18n();
  const tone = scoreTone(dashboard?.score);
  const signals = riskSignals(dashboard, launchConfig, events, copy);

  return (
    <section className="panel risk-state-panel">
      <div className="market-panel-heading">
        <div>
          <h2>{copy.dashboard.riskStateTitle}</h2>
          <p>{copy.dashboard.riskStateCopy}</p>
        </div>
        <StatusPill label={healthLabel(dashboard?.score, copy)} tone={tone} />
      </div>
      <div className={`risk-score-card tone-${tone}`}>
        <Shield size={26} />
        <div>
          <strong>{dashboard ? `${dashboard.score}/100` : copy.common.notAvailable}</strong>
          <span>{copy.dashboard.riskScore}</span>
        </div>
      </div>
      <div className="risk-meter">
        <span style={{ width: `${Math.max(0, Math.min(100, dashboard?.score ?? 0))}%` }} />
      </div>
      <ul className="risk-signal-list">
        {signals.map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>
    </section>
  );
}

function LiveEventStreamPanel({ events, readFailed }: { events: EventLog[]; readFailed: boolean }) {
  const { copy } = useI18n();
  const rows = events.slice(0, 6);

  return (
    <section className="panel live-stream-panel">
      <div className="market-panel-heading">
        <div>
          <h2>{copy.eventStream.title}</h2>
          <p>{readFailed ? copy.eventStream.liveFailedFallback : copy.dashboard.liveEventCopy}</p>
        </div>
        <StatusPill label={liveReadReady ? copy.eventStream.logs(events.length) : copy.common.needsConfig} tone={liveReadReady ? "teal" : "amber"} />
      </div>
      <div className="live-event-list">
        {rows.length ? (
          rows.map((event) => <CompactEventRow event={event} key={`${event.transactionHash}-${event.logIndex}`} />)
        ) : (
          <EmptyState
            icon={DatabaseZap}
            title={liveReadReady ? copy.eventStream.noMatching : copy.eventStream.notConfigured}
            detail={liveReadReady ? copy.eventStream.noLogs : copy.eventStream.setConfig}
          />
        )}
      </div>
    </section>
  );
}

function CompactEventRow({ event }: { event: EventLog }) {
  const { copy } = useI18n();
  const icon = event.kind === "swap" ? ArrowRightLeft : event.kind === "score" ? Gauge : event.kind === "flowpass" ? Sparkles : Shield;
  const Icon = icon;

  return (
    <article className="compact-event-row">
      <div className={`event-kind ${event.kind}`}>
        <Icon size={14} />
      </div>
      <div>
        <strong>{eventTitle(event, copy)}</strong>
        <span>{eventDetail(event, copy)}</span>
      </div>
    </article>
  );
}

function MiniSparkline({
  data,
  tone,
}: {
  data: number[];
  tone: "blue" | "violet" | "teal" | "amber" | "slate";
}) {
  const points = sparklinePoints(data, 110, 32);

  if (!points) {
    return <div className="mini-sparkline empty" />;
  }

  return (
    <svg className={`mini-sparkline tone-${tone}`} viewBox="0 0 110 32" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LineChart({
  data,
  tone,
  emptyLabel,
}: {
  data: number[];
  tone: "blue" | "violet" | "teal";
  emptyLabel: string;
}) {
  const points = sparklinePoints(data, 420, 150);

  return (
    <div className="line-chart">
      {points ? (
        <svg viewBox="0 0 420 150" className={`line-chart-svg tone-${tone}`} aria-hidden="true">
          <path d="M0 120H420 M0 80H420 M0 40H420" />
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <div className="chart-empty">{emptyLabel}</div>
      )}
    </div>
  );
}

function FlowChart({
  events,
  emptyLabel,
}: {
  events: Extract<EventLog, { kind: "swap" }>[];
  emptyLabel: string;
}) {
  const rows = chronologicalEvents(events).slice(-18);

  if (!rows.length) {
    return <div className="line-chart chart-empty">{emptyLabel}</div>;
  }

  return (
    <div className="flow-chart" aria-hidden="true">
      {rows.map((event) => {
        const amount = Number(formatUnits(event.amountInAbs ?? 0n, appConfig.tokenDecimals));
        const height = Math.max(12, Math.min(88, Number.isFinite(amount) ? amount * 14 : 12));
        return (
          <span
            className={event.isBuy ? "buy" : "sell"}
            key={`${event.transactionHash}-${event.logIndex}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

function LaunchIndexPanel({
  allCount,
  eventBlockWindow,
  items,
  loading,
  mineCount,
  onSelectPool,
  onScopeChange,
  onSwapPool,
  readFailed,
  scope,
  selectedPoolId,
  walletConnected,
}: {
  allCount: number;
  eventBlockWindow: number;
  items: LaunchIndexItem[];
  loading: boolean;
  mineCount: number;
  onSelectPool: (pool: SelectedPool) => void;
  onScopeChange: (scope: LaunchIndexScope) => void;
  onSwapPool: (pool: SelectedPool) => void;
  readFailed: boolean;
  scope: LaunchIndexScope;
  selectedPoolId?: Hex;
  walletConnected: boolean;
}) {
  const { copy } = useI18n();
  const noPoolsTitle = scope === "mine" ? copy.dashboard.noMyLaunchesTitle : copy.dashboard.noLaunchesTitle;
  const noPoolsCopy = scope === "mine" ? copy.dashboard.noMyLaunchesCopy : copy.dashboard.noLaunchesCopy;

  return (
    <section className="panel launch-index-panel">
      <div className="section-heading">
        <div>
          <h2>{copy.dashboard.launchIndexTitle}</h2>
          <p>{copy.dashboard.launchIndexCopy}</p>
        </div>
        <div className="launch-index-toolbar">
          <div className="launch-index-scope" role="group" aria-label={copy.dashboard.scopeLabel}>
            <button className={scope === "all" ? "active" : ""} type="button" onClick={() => onScopeChange("all")}>
              {copy.dashboard.allPools}
              <span>{allCount}</span>
            </button>
            <button
              className={scope === "mine" ? "active" : ""}
              type="button"
              disabled={!walletConnected}
              onClick={() => onScopeChange("mine")}
            >
              {copy.dashboard.myPools}
              <span>{mineCount}</span>
            </button>
          </div>
          <StatusPill label={readFailed ? copy.dashboard.localOnly : copy.dashboard.liveIndex} tone={readFailed ? "amber" : "teal"} />
        </div>
      </div>
      <p className="launch-index-source">{copy.dashboard.launchIndexSource(eventBlockWindow)}</p>

      {items.length ? (
        <div className="launch-index-list">
          {items.map((item) => {
            const txUrl = blockExplorerTxUrl(appConfig.explorerUrl, item.txHash);
            const selected = selectedPoolId?.toLowerCase() === item.poolId.toLowerCase();
            return (
              <article className="launch-index-row" key={`${item.chainId}-${item.poolId}`}>
                <div>
                  <span>{copy.dashboard.poolId}</span>
                  <strong>{formatHash(item.poolId)}</strong>
                </div>
                <div>
                  <span>{copy.dashboard.launchToken}</span>
                  <code>{item.launchToken ? formatAddress(item.launchToken) : copy.common.notConfigured}</code>
                </div>
                <div>
                  <span>{copy.dashboard.quoteToken}</span>
                  <code>{item.quoteToken ? formatAddress(item.quoteToken) : copy.common.notConfigured}</code>
                </div>
                <div>
                  <span>{copy.dashboard.launchWindow}</span>
                  <code>{formatLaunchWindow(item, copy)}</code>
                </div>
                <div>
                  <span>{copy.dashboard.creator}</span>
                  <code>{item.creator ? formatAddress(item.creator) : copy.common.notAvailable}</code>
                </div>
                <div className="launch-index-actions">
                  <StatusPill label={selected ? copy.dashboard.selectedPool : launchIndexSourceLabel(item.source, copy)} tone={selected ? "teal" : "slate"} />
                  <button className="secondary-action" type="button" disabled={selected} onClick={() => onSelectPool(item)}>
                    {selected ? copy.dashboard.selected : copy.dashboard.selectPool}
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onSwapPool(item)}>
                    {copy.dashboard.swapPool}
                    <ArrowRightLeft size={15} />
                  </button>
                  {txUrl ? (
                    <a className="secondary-action" href={txUrl} target="_blank" rel="noreferrer">
                      {copy.dashboard.viewTx}
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={DatabaseZap}
          title={loading ? copy.common.loading : noPoolsTitle}
          detail={!walletConnected && scope === "mine" ? copy.dashboard.connectWalletForMine : noPoolsCopy}
        />
      )}
    </section>
  );
}

function SwapView({
  address,
  chainId,
  dashboard,
  eventReadFailed,
  launchConfig,
  userStatus,
  events,
  isConnected,
  onRefresh,
  selectedPool,
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
  selectedPool?: SelectedPool;
}) {
  const { copy } = useI18n();
  const [direction, setDirection] = useState<SwapDirection>("buy");
  const [amountInput, setAmountInput] = useState("1");
  const [minOutInput, setMinOutInput] = useState("");
  const [minOutEditedByUser, setMinOutEditedByUser] = useState(false);
  const [slippageBps, setSlippageBps] = useState(100);
  const [approveHash, setApproveHash] = useState<Hex>();
  const [swapHash, setSwapHash] = useState<Hex>();
  const [swapProof, setSwapProof] = useState<SwapReceiptProof>();
  const [approveStatus, setApproveStatus] = useState<TxStatus>("idle");
  const [swapStatus, setSwapStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState<string>();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const { writeContractAsync, isPending: walletWritePending } = useWriteContract();
  const swapEvents = events.filter((event) => event.kind === "swap");
  const launchTokenAddress = launchConfig?.launchToken ?? selectedPool?.launchToken;
  const quoteTokenAddress = launchConfig?.quoteToken ?? selectedPool?.quoteToken;
  const poolKey = useMemo(
    () => (launchTokenAddress && quoteTokenAddress ? buildPoolKeyForTokens(launchTokenAddress, quoteTokenAddress) : undefined),
    [launchTokenAddress, quoteTokenAddress],
  );
  const inputTokenAddress = direction === "buy" ? quoteTokenAddress : launchTokenAddress;
  const outputTokenAddress = direction === "buy" ? launchTokenAddress : quoteTokenAddress;
  const zeroForOne = Boolean(poolKey && inputTokenAddress && poolKey.currency0.toLowerCase() === inputTokenAddress.toLowerCase());
  const usesUniversalRouter = appConfig.swapRouterMode === "universal";
  const tokenAllowanceSpender = usesUniversalRouter ? appConfig.permit2Address : appConfig.swapRouterAddress;
  const launchTokenSymbolQuery = useReadContract({
    address: launchTokenAddress ?? zeroAddress,
    abi: erc20Abi,
    functionName: "symbol",
    query: {
      enabled: Boolean(launchTokenAddress),
      staleTime: 60_000,
    },
  });
  const quoteTokenSymbolQuery = useReadContract({
    address: quoteTokenAddress ?? zeroAddress,
    abi: erc20Abi,
    functionName: "symbol",
    query: {
      enabled: Boolean(quoteTokenAddress),
      staleTime: 60_000,
    },
  });
  const launchSymbol = tokenSymbol(launchTokenSymbolQuery.data, launchTokenAddress, appConfig.launchTokenAddress, appConfig.launchTokenSymbol);
  const quoteSymbol = tokenSymbol(quoteTokenSymbolQuery.data, quoteTokenAddress, appConfig.quoteTokenAddress, appConfig.quoteTokenSymbol);
  const inputSymbol = direction === "buy" ? quoteSymbol : launchSymbol;
  const outputSymbol = direction === "buy" ? launchSymbol : quoteSymbol;
  const parsedAmount = useMemo(() => parseDemoAmount(amountInput, appConfig.tokenDecimals), [amountInput]);
  const parsedMinOut = useMemo(() => parseOptionalDemoAmount(minOutInput, appConfig.tokenDecimals), [minOutInput]);
  const amountIn = parsedAmount.value;
  const amountOutMin = parsedMinOut.value ?? 0n;
  const onCorrectChain = chainId === appConfig.chainId;
  const poolSelected = Boolean(selectedPool?.poolId && launchTokenAddress && quoteTokenAddress && poolKey);

  const tokenAllowanceQuery = useReadContract({
    address: inputTokenAddress ?? zeroAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, tokenAllowanceSpender ?? zeroAddress],
    query: {
      enabled: liveWriteReady && Boolean(address && inputTokenAddress && tokenAllowanceSpender),
    },
  });

  const permit2AllowanceQuery = useReadContract({
    address: appConfig.permit2Address ?? zeroAddress,
    abi: permit2Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, inputTokenAddress ?? zeroAddress, appConfig.swapRouterAddress ?? zeroAddress],
    query: {
      enabled: liveWriteReady && usesUniversalRouter && Boolean(address && inputTokenAddress && appConfig.permit2Address && appConfig.swapRouterAddress),
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

  const quoteQuery = useQuery({
    queryKey: [
      "swap-quote",
      appConfig.v4QuoterAddress,
      address,
      selectedPool?.poolId,
      direction,
      amountIn?.toString() ?? "none",
      appConfig.chainId,
    ],
    queryFn: async () => {
      if (!appConfig.v4QuoterAddress || !address || amountIn === undefined || !poolKey) {
        throw new Error("Quote requires V4Quoter, wallet, selected pool, and amount.");
      }

      const { result } = await publicClient.simulateContract({
        address: appConfig.v4QuoterAddress,
        abi: v4QuoterAbi,
        functionName: "quoteExactInputSingle",
        account: address,
        args: [
          {
            poolKey,
            zeroForOne,
            exactAmount: amountIn,
            hookData: encodeHookUser(address),
          },
        ],
      });

      const [amountOut, gasEstimate] = result;
      return { amountOut, gasEstimate };
    },
    enabled: Boolean(appConfig.v4QuoterAddress && address && amountIn !== undefined && !parsedAmount.error && poolKey),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });

  const tokenAllowance = typeof tokenAllowanceQuery.data === "bigint" ? tokenAllowanceQuery.data : 0n;
  const permit2Allowance = Array.isArray(permit2AllowanceQuery.data) ? permit2AllowanceQuery.data[0] : 0n;
  const permit2Expiration = Array.isArray(permit2AllowanceQuery.data) ? BigInt(permit2AllowanceQuery.data[1]) : 0n;
  const permit2Expired = usesUniversalRouter && permit2Allowance > 0n && permit2Expiration <= BigInt(Math.floor(Date.now() / 1000) + 60);
  const balance = typeof balanceQuery.data === "bigint" ? balanceQuery.data : undefined;
  const quoteAmountOut = quoteQuery.data?.amountOut;
  const protectedMinOut =
    quoteAmountOut !== undefined ? (quoteAmountOut * BigInt(10_000 - slippageBps)) / 10_000n : undefined;
  const minimumOutputMissing = amountIn !== undefined && amountOutMin === 0n;
  const approvalRequired =
    liveWriteReady &&
    isConnected &&
    onCorrectChain &&
    amountIn !== undefined &&
    (tokenAllowance < amountIn || (usesUniversalRouter && (permit2Allowance < amountIn || permit2Expired)));
  const balanceInsufficient = amountIn !== undefined && balance !== undefined && balance < amountIn;
  const balanceLoading = liveWriteReady && isConnected && Boolean(inputTokenAddress) && balanceQuery.isLoading;
  const transactionBusy = walletWritePending || approveStatus === "awaiting-wallet" || approveStatus === "pending" || swapStatus === "awaiting-wallet" || swapStatus === "pending";

  const readinessIssues = [
    ...liveWriteIssues.map((issue) => issue.detail),
    !poolSelected ? copy.swap.guards.selectPool : undefined,
    !isConnected ? copy.swap.guards.connectWallet : undefined,
    isConnected && !onCorrectChain ? copy.swap.guards.switchNetwork(appConfig.networkName, appConfig.chainId) : undefined,
    parsedAmount.error,
    parsedMinOut.error,
    minimumOutputMissing ? copy.swap.guards.minimumOutputRequired : undefined,
    !appConfig.v4QuoterAddress ? copy.swap.quote.configureQuoter : undefined,
    appConfig.v4QuoterAddress && isConnected && amountIn !== undefined && quoteQuery.isError ? copy.swap.quote.quoteFailed : undefined,
    balanceLoading ? copy.swap.guards.loadingBalance(inputSymbol) : undefined,
    balanceInsufficient ? copy.swap.guards.insufficientBalance(inputSymbol) : undefined,
  ].filter(Boolean) as string[];

  const canApprove =
    liveWriteReady &&
    poolSelected &&
    isConnected &&
    onCorrectChain &&
    amountIn !== undefined &&
    !balanceLoading &&
    !balanceInsufficient &&
    approvalRequired &&
    !transactionBusy;
  const canSwap =
    liveWriteReady &&
    poolSelected &&
    isConnected &&
    onCorrectChain &&
    amountIn !== undefined &&
    !parsedMinOut.error &&
    !minimumOutputMissing &&
    !balanceLoading &&
    !balanceInsufficient &&
    !approvalRequired &&
    !transactionBusy;
  const quoteOutputValue = quoteOutputLabel(
    {
      amountIn,
      hasQuoter: Boolean(appConfig.v4QuoterAddress),
      isConnected,
      outputSymbol,
      quoteAmountOut,
      quoteError: quoteQuery.isError,
      quoteLoading: quoteQuery.isLoading,
    },
    copy,
  );
  const protectedMinOutValue =
    protectedMinOut !== undefined ? formatTokenAmount(protectedMinOut, outputSymbol, appConfig.tokenDecimals) : copy.common.notAvailable;

  useEffect(() => {
    if (protectedMinOut === undefined || minOutEditedByUser) return;
    setMinOutInput(formatUnits(protectedMinOut, appConfig.tokenDecimals));
  }, [minOutEditedByUser, protectedMinOut]);

  async function handleSwitchNetwork() {
    setTxError(undefined);
    await switchChainAsync({ chainId: appConfig.chainId });
  }

  async function handleApprove() {
    if (!canApprove || !amountIn || !appConfig.swapRouterAddress || !inputTokenAddress) return;

    try {
      setTxError(undefined);
      setApproveStatus("awaiting-wallet");

      if (usesUniversalRouter) {
        if (!appConfig.permit2Address) return;

        if (tokenAllowance < amountIn) {
          const erc20Hash = await writeContractAsync({
            address: inputTokenAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [appConfig.permit2Address, amountIn],
            chainId: appConfig.chainId,
          });

          setApproveHash(erc20Hash);
          setApproveStatus("pending");
          const erc20Receipt = await publicClient.waitForTransactionReceipt({ hash: erc20Hash });
          if (erc20Receipt.status !== "success") {
            throw new Error(copy.swap.tx.approvalReverted);
          }
        }

        if (permit2Allowance < amountIn || permit2Expired) {
          const permit2Hash = await writeContractAsync({
            address: appConfig.permit2Address,
            abi: permit2Abi,
            functionName: "approve",
            args: [inputTokenAddress, appConfig.swapRouterAddress, amountIn, Number(buildSwapDeadline())],
            chainId: appConfig.chainId,
          });

          setApproveHash(permit2Hash);
          setApproveStatus("pending");
          const permit2Receipt = await publicClient.waitForTransactionReceipt({ hash: permit2Hash });
          if (permit2Receipt.status !== "success") {
            throw new Error(copy.swap.tx.approvalReverted);
          }
        }
      } else {
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
      }

      setApproveStatus("success");
      await Promise.all([tokenAllowanceQuery.refetch(), permit2AllowanceQuery.refetch()]);
    } catch (error) {
      setApproveStatus("failed");
      setTxError(readableError(error, copy));
    }
  }

  async function handleSwap() {
    if (!canSwap || !amountIn || !address || !appConfig.swapRouterAddress || !poolKey || !outputTokenAddress) return;

    try {
      setTxError(undefined);
      setSwapProof(undefined);
      setSwapStatus("awaiting-wallet");
      let hash: Hex;
      if (usesUniversalRouter) {
        const universalRouterPlan = buildV4ExactInputSingleSwap({
          amountIn,
          amountOutMinimum: amountOutMin,
          hookData: encodeHookUser(address),
          outputCurrency: outputTokenAddress,
          poolKey,
          zeroForOne,
        });

        hash = await writeContractAsync({
          address: appConfig.swapRouterAddress,
          abi: universalRouterAbi,
          functionName: "execute",
          args: [universalRouterPlan.commands, universalRouterPlan.inputs, buildSwapDeadline()],
          value: 0n,
          chainId: appConfig.chainId,
        });
      } else {
        hash = await writeContractAsync({
          address: appConfig.swapRouterAddress,
          abi: swapRouterAbi,
          functionName: "swapExactTokensForTokens",
          args: [
            amountIn,
            amountOutMin,
            zeroForOne,
            poolKey,
            encodeHookUser(address),
            address,
            buildSwapDeadline(),
          ],
          value: 0n,
          chainId: appConfig.chainId,
        });
      }

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
      await Promise.all([tokenAllowanceQuery.refetch(), permit2AllowanceQuery.refetch(), balanceQuery.refetch(), onRefresh()]);
    } catch (error) {
      setSwapStatus("failed");
      setTxError(readableError(error, copy));
    }
  }

  if (!selectedPool) {
    return (
      <section className="view-stack">
        <PageTitle
          title={copy.swap.title}
          subtitle={copy.swap.subtitle}
          action={
            <div className="title-actions">
              <StatusPill label={copy.common.writeDisabled} tone="amber" />
              <PoolSelector selectedPool={selectedPool} />
            </div>
          }
        />
        <section className="panel">
          <EmptyState icon={Search} title={copy.swap.noPoolTitle} detail={copy.swap.noPoolCopy} />
        </section>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.swap.title}
        subtitle={copy.swap.subtitle}
        action={
          <div className="title-actions">
            <StatusPill label={liveWriteReady ? copy.common.liveWrite : copy.common.writeDisabled} tone={liveWriteReady ? "teal" : "amber"} />
            <PoolSelector selectedPool={selectedPool} />
          </div>
        }
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
          value={launchConfig ? formatTokenAmount(launchConfig.maxBuyAmount, launchSymbol, appConfig.tokenDecimals) : copy.common.needsConfig}
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
              {copy.swap.buy(launchSymbol)}
            </button>
            <button className={direction === "sell" ? "active" : ""} type="button" onClick={() => setDirection("sell")}>
              {copy.swap.sell(launchSymbol)}
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
                <input id="to-amount" value={quoteOutputValue} readOnly />
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
                  onChange={(event) => {
                    setMinOutEditedByUser(true);
                    setMinOutInput(event.target.value);
                  }}
                />
                <span>{outputSymbol}</span>
              </div>
            </div>
          </div>

          <div className="quote-panel">
            <div className="fee-list">
              <Field label={copy.swap.quote.estimatedOutput} value={quoteOutputValue} />
              <Field label={copy.swap.quote.slippage} value={formatSlippage(slippageBps)} />
              <Field label={copy.swap.quote.protectedMinimum} value={protectedMinOutValue} />
              <Field label={copy.swap.quote.v4Quoter} value={formatAddress(appConfig.v4QuoterAddress)} mono />
              {quoteQuery.data?.gasEstimate !== undefined && (
                <Field label={copy.swap.quote.quoteGas} value={formatInteger(quoteQuery.data.gasEstimate)} />
              )}
            </div>
            <div className="slippage-actions">
              {slippageOptions.map((option) => (
                <button
                  className={option === slippageBps ? "active" : ""}
                  key={option}
                  type="button"
                  onClick={() => setSlippageBps(option)}
                >
                  {formatSlippage(option)}
                </button>
              ))}
              <button
                type="button"
                disabled={protectedMinOut === undefined}
                onClick={() => {
                  if (protectedMinOut !== undefined) {
                    setMinOutEditedByUser(false);
                    setMinOutInput(formatUnits(protectedMinOut, appConfig.tokenDecimals));
                  }
                }}
              >
                {copy.swap.quote.useProtectedMinimum}
              </button>
            </div>
            <p className="panel-note compact">{copy.swap.quote.minimumOutputHint}</p>
            {!appConfig.v4QuoterAddress && <p className="panel-note">{copy.swap.quote.configureQuoter}</p>}
            {appConfig.v4QuoterAddress && !isConnected && <p className="panel-note">{copy.swap.quote.connectWallet}</p>}
            {quoteQuery.isError && <p className="tx-error">{copy.swap.quote.quoteFailed}</p>}
          </div>

          <div className="fee-list">
            <Field label={copy.swap.baseFee} value={launchConfig ? formatFeePips(launchConfig.baseFeePips) : copy.common.needsConfig} />
            <Field label={copy.swap.currentFee} value={dashboard ? formatFeePips(dashboard.currentFee) : copy.common.needsConfig} />
            <Field
              label={copy.swap.flowPassDiscount}
              value={launchConfig?.nftDiscountEnabled ? copy.swap.enabledByConfig : copy.common.disabledOrUnavailable}
            />
            <Field label={copy.swap.swapRouter} value={formatAddress(appConfig.swapRouterAddress)} mono />
            <Field label={copy.swap.routerMode} value={usesUniversalRouter ? "Universal Router" : "Demo router"} />
            <Field label={copy.swap.poolManager} value={formatAddress(appConfig.poolManagerAddress)} mono />
            <Field label={copy.swap.inputToken} value={formatAddress(inputTokenAddress)} mono />
            <Field label={copy.swap.outputToken} value={formatAddress(outputTokenAddress)} mono />
            <Field label={copy.swap.allowance} value={formatTokenUnits(tokenAllowanceQuery.data, inputSymbol, copy)} />
            {usesUniversalRouter && <Field label={copy.swap.permit2Allowance} value={formatTokenUnits(permit2Allowance, inputSymbol, copy)} />}
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
              {swapButtonLabel(
                {
                  approvalRequired,
                  balanceInsufficient,
                  balanceLoading,
                  canSwap,
                  hasAmountError: Boolean(parsedAmount.error),
                  hasMinimumOutputError: Boolean(parsedMinOut.error) || minimumOutputMissing,
                  isConnected,
                  liveWriteReady,
                  onCorrectChain,
                  transactionBusy,
                },
                copy,
              )}
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
            address={address}
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

const oneToOneSqrtPriceX96 = 79228162514264337593543950336n;
const zeroBytes32 = `0x${"0".repeat(64)}` as Hex;
const launchTokenDeploymentStorageKey = "pulsepool.launchTokenDeployments.v1";
const registeredLaunchStorageKey = "pulsepool.registeredLaunches.v1";
const launchIndexLogChunk = 100n;
const launchIndexMaxItems = 80;

function isBytes32Hex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function storedBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return undefined;
  }
}

function readLaunchTokenDeployments(): LaunchTokenDeployment[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(launchTokenDeploymentStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is LaunchTokenDeployment =>
        item &&
        typeof item === "object" &&
        isAddress(item.address) &&
        typeof item.chainId === "number" &&
        typeof item.createdAt === "number" &&
        typeof item.name === "string" &&
        typeof item.symbol === "string" &&
        typeof item.txHash === "string" &&
        item.txHash.startsWith("0x") &&
        (!item.deployer || isAddress(item.deployer)),
      )
      .map((item) => ({
        ...item,
        address: getAddress(item.address),
        deployer: item.deployer ? getAddress(item.deployer) : undefined,
        txHash: item.txHash as Hex,
      }));
  } catch {
    return [];
  }
}

function writeLaunchTokenDeployments(deployments: LaunchTokenDeployment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(launchTokenDeploymentStorageKey, JSON.stringify(deployments));
}

function readRegisteredLaunchRecords(): RegisteredLaunchRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(registeredLaunchStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is RegisteredLaunchRecord =>
          item &&
          typeof item === "object" &&
          typeof item.chainId === "number" &&
          typeof item.createdAt === "number" &&
          isBytes32Hex(item.poolId) &&
          isBytes32Hex(item.txHash) &&
          (!item.creator || isAddress(item.creator)) &&
          (!item.launchToken || isAddress(item.launchToken)) &&
          (!item.quoteToken || isAddress(item.quoteToken)) &&
          (!item.launchStart || ["bigint", "number", "string"].includes(typeof item.launchStart)) &&
          (!item.launchEnd || ["bigint", "number", "string"].includes(typeof item.launchEnd)),
      )
      .map((item) => ({
        ...item,
        creator: item.creator ? getAddress(item.creator) : undefined,
        launchEnd: storedBigInt(item.launchEnd),
        launchStart: storedBigInt(item.launchStart),
        launchToken: item.launchToken ? getAddress(item.launchToken) : undefined,
        poolId: item.poolId.toLowerCase() as Hex,
        quoteToken: item.quoteToken ? getAddress(item.quoteToken) : undefined,
        txHash: item.txHash as Hex,
      }));
  } catch {
    return [];
  }
}

function writeRegisteredLaunchRecords(records: RegisteredLaunchRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    registeredLaunchStorageKey,
    JSON.stringify(records, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
}

async function readLaunchIndex(): Promise<{ items: LaunchIndexItem[]; liveFailed: boolean }> {
  const byPoolId = new Map<string, LaunchIndexItem>();

  if (appConfig.poolId) {
    byPoolId.set(appConfig.poolId.toLowerCase(), {
      chainId: appConfig.chainId,
      createdAt: 0,
      launchToken: appConfig.launchTokenAddress,
      poolId: appConfig.poolId.toLowerCase() as Hex,
      quoteToken: appConfig.quoteTokenAddress,
      source: "configured",
    });
  }

  for (const record of readRegisteredLaunchRecords().filter((item) => item.chainId === appConfig.chainId)) {
    byPoolId.set(record.poolId.toLowerCase(), {
      ...record,
      source: "local",
    });
  }

  if (!appConfig.launchFactoryAddress) {
    return { items: sortLaunchIndexItems([...byPoolId.values()]), liveFailed: false };
  }

  const launchFactoryAddress = appConfig.launchFactoryAddress;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const window = BigInt(appConfig.eventBlockWindow);
    const fromBlock = latestBlock > window ? latestBlock - window : 0n;
    let chunkStart = fromBlock;

    while (chunkStart <= latestBlock) {
      const chunkEnd = chunkStart + launchIndexLogChunk - 1n > latestBlock ? latestBlock : chunkStart + launchIndexLogChunk - 1n;
      const logs = await publicClient.getLogs({
        address: launchFactoryAddress,
        event: launchCreatedEvent,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      });

      for (const log of logs) {
        if (!log.args.poolId || !log.transactionHash) continue;
        const poolId = log.args.poolId.toLowerCase() as Hex;
        const existing = byPoolId.get(poolId);
        byPoolId.set(poolId, {
          ...existing,
          chainId: appConfig.chainId,
          blockNumber: log.blockNumber ?? existing?.blockNumber,
          createdAt: existing?.createdAt ?? Number(log.blockNumber ?? 0n),
          launchEnd: log.args.launchEnd,
          launchStart: log.args.launchStart,
          launchToken: log.args.launchToken ? getAddress(log.args.launchToken) : existing?.launchToken,
          poolId,
          quoteToken: log.args.quoteToken ? getAddress(log.args.quoteToken) : existing?.quoteToken,
          source: "factory",
          txHash: log.transactionHash,
        });
      }

      chunkStart = chunkEnd + 1n;
    }

    const itemsWithCreators = await addLaunchCreators(
      sortLaunchIndexItems([...byPoolId.values()]).slice(0, launchIndexMaxItems),
      launchFactoryAddress,
    );

    return { items: itemsWithCreators, liveFailed: false };
  } catch {
    return {
      items: await addLaunchCreators(sortLaunchIndexItems([...byPoolId.values()]).slice(0, launchIndexMaxItems), launchFactoryAddress),
      liveFailed: true,
    };
  }
}

async function addLaunchCreators(items: LaunchIndexItem[], launchFactoryAddress: Address): Promise<LaunchIndexItem[]> {
  return Promise.all(
    items.map(async (item) => {
      try {
        const creator = await publicClient.readContract({
          address: launchFactoryAddress,
          abi: launchFactoryAbi,
          functionName: "launchCreators",
          args: [item.poolId],
        });
        return creator !== zeroAddress ? { ...item, creator: getAddress(creator) } : item;
      } catch {
        return item;
      }
    }),
  );
}

function sortLaunchIndexItems(items: LaunchIndexItem[]): LaunchIndexItem[] {
  return items.sort((a, b) => {
    if (a.blockNumber !== undefined && b.blockNumber !== undefined && a.blockNumber !== b.blockNumber) {
      return a.blockNumber > b.blockNumber ? -1 : 1;
    }
    return b.createdAt - a.createdAt;
  });
}

function chronologicalEvents<T extends EventLog>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? 1 : -1;
    return a.logIndex - b.logIndex;
  });
}

function scoreSeries(events: Extract<EventLog, { kind: "score" }>[], dashboard?: PoolDashboard): number[] {
  const values = chronologicalEvents(events)
    .map((event) => event.score)
    .filter((value): value is number => typeof value === "number");
  return appendLatest(values, dashboard?.score).slice(-18);
}

function feeSeries(events: Extract<EventLog, { kind: "score" }>[], dashboard?: PoolDashboard): number[] {
  const values = chronologicalEvents(events)
    .map((event) => event.currentFee)
    .filter((value): value is number => typeof value === "number")
    .map((value) => value / 10_000);
  return appendLatest(values, dashboard ? dashboard.currentFee / 10_000 : undefined).slice(-18);
}

function netFlowSeries(events: Extract<EventLog, { kind: "score" }>[], dashboard?: PoolDashboard): number[] {
  const values = chronologicalEvents(events).map((event) => Number(formatUnits(event.netFlow ?? 0n, appConfig.tokenDecimals)));
  return appendLatest(values, dashboard ? Number(formatUnits(dashboard.netFlow, appConfig.tokenDecimals)) : undefined).slice(-18);
}

function volumeSeries(events: Extract<EventLog, { kind: "score" }>[], dashboard?: PoolDashboard): number[] {
  const values = chronologicalEvents(events).map((event) => Number(formatUnits(event.rollingVolume ?? 0n, appConfig.tokenDecimals)));
  return appendLatest(values, dashboard ? Number(formatUnits(dashboard.rollingVolume, appConfig.tokenDecimals)) : undefined).slice(-18);
}

function swapActivitySeries(events: Extract<EventLog, { kind: "swap" }>[]): number[] {
  return chronologicalEvents(events)
    .slice(-18)
    .map((event, index) => (event.isBuy ? index + 1 : -(index + 1)));
}

function appendLatest(values: number[], latest?: number): number[] {
  if (latest === undefined || !Number.isFinite(latest)) return values;
  const last = values[values.length - 1];
  return last === latest ? values : [...values, latest];
}

function sparklinePoints(values: number[], width: number, height: number): string | undefined {
  const data = values.filter((value) => Number.isFinite(value));
  if (data.length < 2) return undefined;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatLaunchWindow(item: LaunchIndexItem, copy: I18nCopy): string {
  if (!item.launchStart || !item.launchEnd) return copy.common.notConfigured;
  return `${formatDateTime(item.launchStart)} - ${formatDateTime(item.launchEnd)}`;
}

function tokenSymbol(symbol: unknown, token: Address | undefined, configuredToken: Address | undefined, configuredSymbol: string): string {
  if (typeof symbol === "string" && symbol.trim().length > 0) return symbol.trim();
  if (token && configuredToken && token.toLowerCase() === configuredToken.toLowerCase()) return configuredSymbol;
  return token ? formatAddress(token) : "TOKEN";
}

function launchIndexSourceLabel(source: LaunchIndexItem["source"], copy: I18nCopy): string {
  if (source === "factory") return copy.dashboard.factoryEvent;
  if (source === "local") return copy.dashboard.localRecord;
  return copy.dashboard.configuredPool;
}

function riskSignals(
  dashboard: PoolDashboard | undefined,
  launchConfig: LaunchConfig | undefined,
  events: EventLog[],
  copy: I18nCopy,
): string[] {
  if (!dashboard) return [copy.dashboard.signals.noLiveState];

  const guardEvents = events.filter((event) => event.kind === "guard").length;
  const signals = [
    dashboard.score >= 70 ? copy.dashboard.signals.healthyScore : copy.dashboard.signals.lowScore(dashboard.score),
    dashboard.guardActive ? copy.dashboard.signals.guardActive : copy.dashboard.signals.guardInactive,
    dashboard.largeTradeCount > 0n
      ? copy.dashboard.signals.largeTrades(formatInteger(dashboard.largeTradeCount))
      : copy.dashboard.signals.noLargeTrades,
    guardEvents > 0 ? copy.dashboard.signals.guardEvents(formatInteger(guardEvents)) : copy.dashboard.signals.noGuardEvents,
  ];

  if (launchConfig?.nftDiscountEnabled) {
    signals.push(copy.dashboard.signals.flowPassEnabled);
  }

  return signals;
}

function localDateTimeInput(offsetMs: number): string {
  const date = new Date(Date.now() + offsetMs);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dateTimeInputToSeconds(value: string): bigint | undefined {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return undefined;
  return BigInt(Math.floor(timestamp / 1000));
}

function isProjectUri(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("ipfs://") || trimmed.startsWith("https://");
}

function isMetadataUri(value: string): boolean {
  const trimmed = value.trim();
  return isProjectUri(trimmed) || trimmed.startsWith("data:application/json");
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function buildMetadataDataUri(name: string, symbol: string, logoUri: string): string {
  const metadata: Record<string, unknown> = {
    name,
    symbol,
    description: `${name} launch token created with FairFlow Launch.`,
  };

  if (isProjectUri(logoUri)) metadata.image = logoUri;

  return `data:application/json;base64,${base64Utf8(JSON.stringify(metadata))}`;
}

function percentToBps(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined;

  return Math.round(parsed * 100);
}

function allocationAmount(totalSupply: bigint, bps: number): bigint {
  return (totalSupply * BigInt(bps)) / 10_000n;
}

function CreateLaunchView({
  address,
  chainId,
  isConnected,
  onRefresh,
}: {
  address?: Address;
  chainId?: number;
  isConnected: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const { copy } = useI18n();
  const [launchMode, setLaunchMode] = useState<LaunchMode>("create-token");
  const [tokenNameInput, setTokenNameInput] = useState("");
  const [tokenSymbolInput, setTokenSymbolInput] = useState("");
  const [tokenSupplyInput, setTokenSupplyInput] = useState("1000000000");
  const [tokenLogoUriInput, setTokenLogoUriInput] = useState("");
  const [tokenMetadataUriInput, setTokenMetadataUriInput] = useState("");
  const [tokenOwnerInput, setTokenOwnerInput] = useState("");
  const [creatorRecipientInput, setCreatorRecipientInput] = useState("");
  const [creatorAllocationInput, setCreatorAllocationInput] = useState("60");
  const [liquidityRecipientInput, setLiquidityRecipientInput] = useState("");
  const [liquidityAllocationInput, setLiquidityAllocationInput] = useState("30");
  const [treasuryRecipientInput, setTreasuryRecipientInput] = useState("");
  const [treasuryAllocationInput, setTreasuryAllocationInput] = useState("10");
  const [deployedLaunchToken, setDeployedLaunchToken] = useState<Address>();
  const [tokenDeployHash, setTokenDeployHash] = useState<Hex>();
  const [tokenDeployStatus, setTokenDeployStatus] = useState<TxStatus>("idle");
  const [tokenAddressCopied, setTokenAddressCopied] = useState(false);
  const [recentTokenDeployments, setRecentTokenDeployments] = useState<LaunchTokenDeployment[]>(readLaunchTokenDeployments);
  const [existingTokenTaxAccepted, setExistingTokenTaxAccepted] = useState(false);
  const [existingTokenVerificationUrl, setExistingTokenVerificationUrl] = useState("");
  const [launchTokenInput, setLaunchTokenInput] = useState("");
  const [quoteTokenInput, setQuoteTokenInput] = useState(() => appConfig.quoteTokenAddress ?? "");
  const [quoteAssetMode, setQuoteAssetMode] = useState<string>(() => appConfig.quoteTokenAddress ?? "custom");
  const [launchStartInput, setLaunchStartInput] = useState(localDateTimeInput(5 * 60 * 1000));
  const [launchEndInput, setLaunchEndInput] = useState(localDateTimeInput(7 * 24 * 60 * 60 * 1000));
  const [baseFeeInput, setBaseFeeInput] = useState("3000");
  const [minFeeInput, setMinFeeInput] = useState("500");
  const [maxFeeInput, setMaxFeeInput] = useState("100000");
  const [maxBuyInput, setMaxBuyInput] = useState("5");
  const [maxBuyBpsInput, setMaxBuyBpsInput] = useState("500");
  const [cooldownBlocksInput, setCooldownBlocksInput] = useState("3");
  const [nftDiscountEnabled, setNftDiscountEnabled] = useState(true);
  const [initializeHash, setInitializeHash] = useState<Hex>();
  const [registerHash, setRegisterHash] = useState<Hex>();
  const [initializeStatus, setInitializeStatus] = useState<TxStatus>("idle");
  const [registerStatus, setRegisterStatus] = useState<TxStatus>("idle");
  const [registeredLaunchRecords, setRegisteredLaunchRecords] = useState<RegisteredLaunchRecord[]>(readRegisteredLaunchRecords);
  const [txError, setTxError] = useState<string>();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const { writeContractAsync, isPending: walletWritePending } = useWriteContract();
  const { deployContractAsync, isPending: walletDeployPending } = useDeployContract();
  const previousAddressRef = useRef<Address>();

  useEffect(() => {
    if (!address) return;
    const previousAddress = previousAddressRef.current;
    const shouldSyncWalletAddress = (current: string) =>
      !current || (previousAddress ? current.toLowerCase() === previousAddress.toLowerCase() : false);

    setTokenOwnerInput((current) => (shouldSyncWalletAddress(current) ? address : current));
    setCreatorRecipientInput((current) => (shouldSyncWalletAddress(current) ? address : current));
    setLiquidityRecipientInput((current) => (shouldSyncWalletAddress(current) ? address : current));
    setTreasuryRecipientInput((current) => (shouldSyncWalletAddress(current) ? address : current));
    previousAddressRef.current = address;
  }, [address]);

  const effectiveLaunchTokenInput = launchMode === "create-token" ? deployedLaunchToken ?? "" : launchTokenInput;
  const tokenFormLocked = Boolean(deployedLaunchToken);
  const deployedTokenAddressUrl = blockExplorerAddressUrl(appConfig.explorerUrl, deployedLaunchToken);
  const tokenDeployTxUrl = blockExplorerTxUrl(appConfig.explorerUrl, tokenDeployHash);
  const walletTokenDeployments = useMemo(
    () =>
      recentTokenDeployments
        .filter(
          (deployment) =>
            deployment.chainId === appConfig.chainId &&
            (!address || !deployment.deployer || deployment.deployer.toLowerCase() === address.toLowerCase()),
        )
        .slice(0, 4),
    [address, recentTokenDeployments],
  );
  const quoteAssetOptions = useMemo(
    () =>
      appConfig.quoteTokenAddress
        ? [
            {
              address: appConfig.quoteTokenAddress,
              label: `${appConfig.quoteTokenSymbol} · ${formatAddress(appConfig.quoteTokenAddress)}`,
            },
          ]
        : [],
    [],
  );
  const launchToken = isAddress(effectiveLaunchTokenInput) ? getAddress(effectiveLaunchTokenInput) : undefined;
  const quoteToken = isAddress(quoteTokenInput) ? getAddress(quoteTokenInput) : undefined;
  const poolKey = useMemo(() => {
    if (!launchToken || !quoteToken || launchToken.toLowerCase() === quoteToken.toLowerCase()) return undefined;
    try {
      return buildPoolKeyForTokens(launchToken, quoteToken);
    } catch {
      return undefined;
    }
  }, [launchToken, quoteToken]);
  const generatedPoolId = useMemo(() => (poolKey ? poolIdForPoolKey(poolKey) : undefined), [poolKey]);
  const launchStart = dateTimeInputToSeconds(launchStartInput);
  const launchEnd = dateTimeInputToSeconds(launchEndInput);
  const baseFeePips = Number(baseFeeInput);
  const minFeePips = Number(minFeeInput);
  const maxFeePips = Number(maxFeeInput);
  const maxBuyBps = Number(maxBuyBpsInput);
  const cooldownBlocks = Number(cooldownBlocksInput);
  const parsedMaxBuy = useMemo(() => {
    try {
      const value = parseUnits(maxBuyInput || "0", appConfig.tokenDecimals);
      return value > 0n ? value : undefined;
    } catch {
      return undefined;
    }
  }, [maxBuyInput]);
  const onCorrectChain = chainId === appConfig.chainId;
  const tokenName = tokenNameInput.trim();
  const tokenSymbol = tokenSymbolInput.trim().toUpperCase();
  const tokenMetadataUri = tokenMetadataUriInput.trim();
  const tokenLogoUri = tokenLogoUriInput.trim();
  const effectiveTokenMetadataUri =
    tokenMetadataUri || (tokenName && tokenSymbol ? buildMetadataDataUri(tokenName, tokenSymbol, tokenLogoUri) : "");
  const tokenOwner = isAddress(tokenOwnerInput) ? getAddress(tokenOwnerInput) : undefined;
  const creatorRecipient = isAddress(creatorRecipientInput) ? getAddress(creatorRecipientInput) : undefined;
  const liquidityRecipient = isAddress(liquidityRecipientInput) ? getAddress(liquidityRecipientInput) : undefined;
  const treasuryRecipient = isAddress(treasuryRecipientInput) ? getAddress(treasuryRecipientInput) : undefined;
  const creatorAllocationBps = percentToBps(creatorAllocationInput);
  const liquidityAllocationBps = percentToBps(liquidityAllocationInput);
  const treasuryAllocationBps = percentToBps(treasuryAllocationInput);
  const totalAllocationBps =
    (creatorAllocationBps ?? 0) + (liquidityAllocationBps ?? 0) + (treasuryAllocationBps ?? 0);
  const parsedTokenSupply = useMemo(() => {
    try {
      const value = parseUnits(tokenSupplyInput || "0", 18);
      return value > 0n ? value : undefined;
    } catch {
      return undefined;
    }
  }, [tokenSupplyInput]);
  const tokenAllocationAmounts = useMemo(() => {
    if (
      parsedTokenSupply === undefined ||
      creatorAllocationBps === undefined ||
      liquidityAllocationBps === undefined ||
      treasuryAllocationBps === undefined ||
      totalAllocationBps !== 10_000
    ) {
      return undefined;
    }

    const creatorAmount = allocationAmount(parsedTokenSupply, creatorAllocationBps);
    const liquidityAmount = allocationAmount(parsedTokenSupply, liquidityAllocationBps);
    const treasuryAmount = allocationAmount(parsedTokenSupply, treasuryAllocationBps);
    const remainder = parsedTokenSupply - creatorAmount - liquidityAmount - treasuryAmount;

    return [creatorAmount + remainder, liquidityAmount, treasuryAmount] as const;
  }, [creatorAllocationBps, liquidityAllocationBps, parsedTokenSupply, totalAllocationBps, treasuryAllocationBps]);
  const tokenDeployIssues = [
    !appConfig.enableWrites ? copy.create.writeEnableRequired : undefined,
    !isConnected ? copy.swap.guards.connectWallet : undefined,
    isConnected && !onCorrectChain ? copy.swap.guards.switchNetwork(appConfig.networkName, appConfig.chainId) : undefined,
    tokenName.length < 2 ? copy.create.invalidTokenName : undefined,
    !/^[A-Z0-9]{2,12}$/.test(tokenSymbol) ? copy.create.invalidTokenSymbol : undefined,
    parsedTokenSupply === undefined ? copy.create.invalidTokenSupply : undefined,
    tokenLogoUri.length > 0 && !isProjectUri(tokenLogoUri) ? copy.create.invalidLogoUri : undefined,
    effectiveTokenMetadataUri.length === 0 || !isMetadataUri(effectiveTokenMetadataUri)
      ? copy.create.invalidMetadataUri
      : undefined,
    !tokenOwner ? copy.create.invalidTokenOwner : undefined,
    !creatorRecipient || !liquidityRecipient || !treasuryRecipient ? copy.create.invalidAllocationRecipients : undefined,
    creatorAllocationBps === undefined || liquidityAllocationBps === undefined || treasuryAllocationBps === undefined
      ? copy.create.invalidAllocationPercent
      : undefined,
    totalAllocationBps !== 10_000 ? copy.create.invalidAllocationTotal : undefined,
  ].filter(Boolean) as string[];
  const tokenAllocationRecipients =
    creatorRecipient && liquidityRecipient && treasuryRecipient
      ? ([creatorRecipient, liquidityRecipient, treasuryRecipient] as const)
      : undefined;
  const canDeployLaunchToken =
    launchMode === "create-token" &&
    tokenDeployIssues.length === 0 &&
    tokenOwner &&
    tokenAllocationRecipients &&
    tokenAllocationAmounts &&
    !deployedLaunchToken &&
    !walletDeployPending &&
    tokenDeployStatus !== "awaiting-wallet" &&
    tokenDeployStatus !== "pending";
  const launchWriteConfigIssues = [
    !appConfig.enableWrites
      ? {
          label: "VITE_PULSEPOOL_ENABLE_WRITES",
          detail: copy.create.writeEnableRequired,
        }
      : undefined,
    !appConfig.poolManagerAddress
      ? {
          label: "VITE_POOL_MANAGER_ADDRESS",
          detail: copy.create.poolManagerRequired,
        }
      : undefined,
    !appConfig.launchFactoryAddress
      ? {
          label: "VITE_LAUNCH_FACTORY_ADDRESS",
          detail: copy.create.factoryRequired,
        }
      : undefined,
    !appConfig.fairFlowHookAddress
      ? {
          label: "VITE_FAIRFLOW_HOOK_ADDRESS",
          detail: copy.create.hookRequired,
        }
      : undefined,
  ].filter(Boolean) as { label: string; detail: string }[];
  const config = launchToken && quoteToken && launchStart !== undefined && launchEnd !== undefined && parsedMaxBuy !== undefined
    ? {
        launchToken,
        quoteToken,
        launchStart,
        launchEnd,
        baseFeePips,
        maxFeePips,
        minFeePips,
        maxBuyBps,
        maxBuyAmount: parsedMaxBuy,
        cooldownBlocks,
        nftDiscountEnabled,
      }
    : undefined;
  const transactionBusy =
    walletDeployPending ||
    walletWritePending ||
    tokenDeployStatus === "awaiting-wallet" ||
    tokenDeployStatus === "pending" ||
    initializeStatus === "awaiting-wallet" ||
    initializeStatus === "pending" ||
    registerStatus === "awaiting-wallet" ||
    registerStatus === "pending";

  const factoryOwnerQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "owner",
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress),
    },
  });
  const registeredLaunchQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "registeredLaunches",
    args: [generatedPoolId ?? zeroBytes32],
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress && generatedPoolId),
    },
  });
  const poolSlot0Query = useQuery({
    queryKey: [
      "create-pool-slot0",
      appConfig.chainId,
      generatedPoolId,
      appConfig.stateViewAddress,
      appConfig.poolManagerAddress,
    ],
    queryFn: async () => {
      if (!generatedPoolId) return undefined;

      if (appConfig.stateViewAddress) {
        try {
          const slot0 = await publicClient.readContract({
            address: appConfig.stateViewAddress,
            abi: stateViewAbi,
            functionName: "getSlot0",
            args: [generatedPoolId],
          });

          return {
            source: "StateView",
            sqrtPriceX96: slot0[0],
          };
        } catch (error) {
          if (!appConfig.poolManagerAddress) throw error;
        }
      }

      if (!appConfig.poolManagerAddress) return undefined;
      const rawSlot0 = await publicClient.readContract({
        address: appConfig.poolManagerAddress,
        abi: poolManagerAbi,
        functionName: "extsload",
        args: [poolStateSlotForPoolId(generatedPoolId)],
      });

      return {
        source: "PoolManager",
        sqrtPriceX96: sqrtPriceX96FromSlot0(rawSlot0),
      };
    },
    enabled: Boolean(generatedPoolId && (appConfig.stateViewAddress || appConfig.poolManagerAddress)),
    refetchInterval: transactionBusy ? 5_000 : 15_000,
    retry: 1,
    staleTime: 5_000,
  });
  const launchCreatorQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "launchCreators",
    args: [generatedPoolId ?? zeroBytes32],
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress && generatedPoolId),
    },
  });
  const publicCreationQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "publicCreationEnabled",
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress),
    },
  });
  const pausedQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "paused",
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress),
    },
  });
  const creationFeeQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "creationFee",
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress),
    },
  });
  const feeRecipientQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "feeRecipient",
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress),
    },
  });
  const canCreateQuery = useReadContract({
    address: appConfig.launchFactoryAddress ?? zeroAddress,
    abi: launchFactoryAbi,
    functionName: "canCreate",
    args: [address ?? zeroAddress],
    query: {
      enabled: Boolean(appConfig.launchFactoryAddress && address),
    },
  });
  const launchTokenCodeQuery = useQuery({
    queryKey: ["token-code", appConfig.chainId, launchToken],
    queryFn: async () => {
      if (!launchToken) return undefined;
      return publicClient.getBytecode({ address: launchToken });
    },
    enabled: Boolean(launchToken),
    staleTime: 60_000,
  });
  const quoteTokenCodeQuery = useQuery({
    queryKey: ["token-code", appConfig.chainId, quoteToken],
    queryFn: async () => {
      if (!quoteToken) return undefined;
      return publicClient.getBytecode({ address: quoteToken });
    },
    enabled: Boolean(quoteToken),
    staleTime: 60_000,
  });
  const launchTokenNameQuery = useReadContract({
    address: launchToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "name",
    query: {
      enabled: Boolean(launchToken),
      retry: false,
    },
  });
  const launchTokenSymbolQuery = useReadContract({
    address: launchToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "symbol",
    query: {
      enabled: Boolean(launchToken),
      retry: false,
    },
  });
  const launchTokenDecimalsQuery = useReadContract({
    address: launchToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "decimals",
    query: {
      enabled: Boolean(launchToken),
      retry: false,
    },
  });
  const launchTokenSupplyQuery = useReadContract({
    address: launchToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "totalSupply",
    query: {
      enabled: Boolean(launchToken),
      retry: false,
    },
  });
  const launchTokenOwnerQuery = useReadContract({
    address: launchToken ?? zeroAddress,
    abi: fairLaunchTokenAbi,
    functionName: "owner",
    query: {
      enabled: Boolean(launchToken),
      retry: false,
    },
  });
  const factoryOwner = typeof factoryOwnerQuery.data === "string" ? getAddress(factoryOwnerQuery.data) : undefined;
  const ownerMatches = Boolean(address && factoryOwner && address.toLowerCase() === factoryOwner.toLowerCase());
  const locallyRegistered = Boolean(
    generatedPoolId &&
      registeredLaunchRecords.some(
        (record) => record.chainId === appConfig.chainId && record.poolId.toLowerCase() === generatedPoolId.toLowerCase(),
      ),
  );
  const alreadyRegistered = registeredLaunchQuery.data === true || locallyRegistered;
  const poolInitializedFromChain = Boolean(poolSlot0Query.data && poolSlot0Query.data.sqrtPriceX96 > 0n);
  const poolInitialized = alreadyRegistered || initializeStatus === "success" || poolInitializedFromChain;
  const poolInitializationPending = Boolean(
    generatedPoolId && appConfig.poolManagerAddress && poolSlot0Query.isFetching && !poolSlot0Query.isSuccess,
  );
  const poolInitializationFailed = Boolean(
    generatedPoolId && appConfig.poolManagerAddress && poolSlot0Query.data === undefined && poolSlot0Query.isError,
  );
  const publicCreationEnabled = publicCreationQuery.data === true;
  const factoryPaused = pausedQuery.data === true;
  const creatorCanCreate = ownerMatches || canCreateQuery.data === true;
  const creationFee = typeof creationFeeQuery.data === "bigint" ? creationFeeQuery.data : undefined;
  const registrationFee = ownerMatches ? 0n : creationFee;
  const feeRecipient = typeof feeRecipientQuery.data === "string" ? getAddress(feeRecipientQuery.data) : undefined;
  const launchCreator =
    typeof launchCreatorQuery.data === "string" && launchCreatorQuery.data !== zeroAddress
      ? getAddress(launchCreatorQuery.data)
      : undefined;
  const ownerCheckPending = Boolean(appConfig.launchFactoryAddress && isConnected && !factoryOwner && factoryOwnerQuery.isFetching);
  const ownerCheckFailed = Boolean(appConfig.launchFactoryAddress && isConnected && !factoryOwner && factoryOwnerQuery.isError);
  const creatorCheckPending = Boolean(
    appConfig.launchFactoryAddress && isConnected && !ownerMatches && canCreateQuery.data === undefined && canCreateQuery.isFetching,
  );
  const creatorCheckFailed = Boolean(
    appConfig.launchFactoryAddress && isConnected && !ownerMatches && canCreateQuery.data === undefined && canCreateQuery.isError,
  );
  const creationFeePending = Boolean(
    appConfig.launchFactoryAddress && isConnected && !ownerMatches && creationFee === undefined && creationFeeQuery.isFetching,
  );
  const creationFeeFailed = Boolean(
    appConfig.launchFactoryAddress && isConnected && !ownerMatches && creationFee === undefined && creationFeeQuery.isError,
  );
  const registrationCheckPending = Boolean(
    appConfig.launchFactoryAddress && generatedPoolId && registeredLaunchQuery.data === undefined && registeredLaunchQuery.isFetching,
  );
  const registrationCheckFailed = Boolean(
    appConfig.launchFactoryAddress && generatedPoolId && registeredLaunchQuery.data === undefined && registeredLaunchQuery.isError,
  );
  const launchTokenTrustedFromDeployment = Boolean(
    launchToken && deployedLaunchToken && launchToken.toLowerCase() === deployedLaunchToken.toLowerCase(),
  );
  const launchTokenCodePending = Boolean(
    launchToken && !launchTokenTrustedFromDeployment && launchTokenCodeQuery.isFetching && !launchTokenCodeQuery.isSuccess,
  );
  const quoteTokenCodePending = Boolean(quoteToken && quoteTokenCodeQuery.isFetching && !quoteTokenCodeQuery.isSuccess);
  const launchTokenMissingCode = Boolean(
    launchToken &&
      !launchTokenTrustedFromDeployment &&
      launchTokenCodeQuery.isSuccess &&
      (!launchTokenCodeQuery.data || launchTokenCodeQuery.data === "0x"),
  );
  const quoteTokenMissingCode = Boolean(
    quoteToken && quoteTokenCodeQuery.isSuccess && (!quoteTokenCodeQuery.data || quoteTokenCodeQuery.data === "0x"),
  );
  const launchTokenCodeFailed = Boolean(launchToken && !launchTokenTrustedFromDeployment && launchTokenCodeQuery.isError);
  const launchTokenCodeOk = Boolean(
    launchTokenTrustedFromDeployment || (launchTokenCodeQuery.isSuccess && launchTokenCodeQuery.data && launchTokenCodeQuery.data !== "0x"),
  );
  const quoteTokenCodeFailed = Boolean(quoteToken && quoteTokenCodeQuery.isError);
  const launchTokenName = typeof launchTokenNameQuery.data === "string" ? launchTokenNameQuery.data : undefined;
  const launchTokenSymbol = typeof launchTokenSymbolQuery.data === "string" ? launchTokenSymbolQuery.data : undefined;
  const launchTokenDecimals = typeof launchTokenDecimalsQuery.data === "number" ? launchTokenDecimalsQuery.data : undefined;
  const launchTokenSupply = typeof launchTokenSupplyQuery.data === "bigint" ? launchTokenSupplyQuery.data : undefined;
  const launchTokenOwner =
    typeof launchTokenOwnerQuery.data === "string" && isAddress(launchTokenOwnerQuery.data)
      ? getAddress(launchTokenOwnerQuery.data)
      : undefined;
  const poolAvailability =
    !poolKey
      ? copy.create.poolWaiting
      : registrationCheckPending || poolInitializationPending
        ? copy.create.poolChecking
        : registrationCheckFailed || poolInitializationFailed
          ? copy.create.poolUnknown
          : alreadyRegistered
            ? copy.create.poolExisting
            : poolInitialized
              ? copy.create.poolInitialized
              : copy.create.poolAvailable;
  const poolAvailabilityTone: "slate" | "amber" | "teal" =
    !poolKey || registrationCheckPending || registrationCheckFailed || poolInitializationPending || poolInitializationFailed
      ? "slate"
      : alreadyRegistered
        ? "amber"
        : "teal";
  const v4PoolStatus =
    !poolKey
      ? copy.common.notConfigured
      : poolInitializationPending
        ? copy.create.poolChecking
        : poolInitializationFailed
          ? copy.create.poolUnknown
          : poolInitialized
            ? copy.create.poolInitialized
            : copy.create.poolUninitialized;
  const validationIssues = [
    ...launchWriteConfigIssues.map((issue) => issue.detail),
    !isConnected ? copy.swap.guards.connectWallet : undefined,
    isConnected && !onCorrectChain ? copy.swap.guards.switchNetwork(appConfig.networkName, appConfig.chainId) : undefined,
    !launchToken ? (launchMode === "create-token" ? copy.create.deployTokenFirst : copy.create.invalidLaunchToken) : undefined,
    !quoteToken ? copy.create.invalidQuoteToken : undefined,
    launchMode === "existing-token" && !existingTokenTaxAccepted ? copy.create.taxAttestationRequired : undefined,
    launchMode === "existing-token" && !existingTokenVerificationUrl.trim().startsWith("https://")
      ? copy.create.verificationRequired
      : undefined,
    launchTokenCodePending ? copy.create.launchTokenCodePending : undefined,
    quoteTokenCodePending ? copy.create.quoteTokenCodePending : undefined,
    launchTokenCodeFailed ? copy.create.launchTokenCodeFailed : undefined,
    quoteTokenCodeFailed ? copy.create.quoteTokenCodeFailed : undefined,
    launchTokenMissingCode ? copy.create.launchTokenMissingCode : undefined,
    quoteTokenMissingCode ? copy.create.quoteTokenMissingCode : undefined,
    launchToken && quoteToken && launchToken.toLowerCase() === quoteToken.toLowerCase() ? copy.create.sameToken : undefined,
    !Number.isInteger(baseFeePips) || baseFeePips <= 0 ? copy.create.invalidBaseFee : undefined,
    !Number.isInteger(minFeePips) || minFeePips <= 0 ? copy.create.invalidMinFee : undefined,
    !Number.isInteger(maxFeePips) || maxFeePips <= 0 ? copy.create.invalidMaxFee : undefined,
    Number.isInteger(minFeePips) && Number.isInteger(baseFeePips) && Number.isInteger(maxFeePips) && !(minFeePips <= baseFeePips && baseFeePips <= maxFeePips)
      ? copy.create.invalidFeeRange
      : undefined,
    !Number.isInteger(maxBuyBps) || maxBuyBps < 0 || maxBuyBps > 10_000 ? copy.create.invalidMaxBuyBps : undefined,
    parsedMaxBuy === undefined ? copy.create.invalidMaxBuy : undefined,
    !Number.isInteger(cooldownBlocks) || cooldownBlocks < 0 || cooldownBlocks > 50_000 ? copy.create.invalidCooldown : undefined,
    launchStart === undefined || launchEnd === undefined || launchEnd <= launchStart ? copy.create.invalidLaunchWindow : undefined,
    ownerCheckPending ? copy.create.ownerCheckPending : undefined,
    ownerCheckFailed ? copy.create.ownerCheckFailed : undefined,
    factoryPaused ? copy.create.factoryPaused : undefined,
    creatorCheckPending ? copy.create.creatorCheckPending : undefined,
    creatorCheckFailed ? copy.create.creatorCheckFailed : undefined,
    appConfig.launchFactoryAddress && address && !creatorCanCreate && canCreateQuery.data === false
      ? copy.create.creatorAccessRequired
      : undefined,
    creationFeePending ? copy.create.creationFeePending : undefined,
    creationFeeFailed ? copy.create.creationFeeFailed : undefined,
    registrationCheckPending ? copy.create.registrationCheckPending : undefined,
    registrationCheckFailed ? copy.create.registrationCheckFailed : undefined,
    poolInitializationPending ? copy.create.poolInitializationCheckPending : undefined,
    poolInitializationFailed ? copy.create.poolInitializationCheckFailed : undefined,
    alreadyRegistered ? copy.create.alreadyRegistered : undefined,
  ].filter(Boolean) as string[];
  const writeReady = appConfig.enableWrites && launchWriteConfigIssues.length === 0;
  const canInitialize =
    writeReady && isConnected && onCorrectChain && Boolean(poolKey) && !poolInitialized && validationIssues.length === 0 && !transactionBusy;
  const canRegister =
    writeReady &&
    isConnected &&
    onCorrectChain &&
    Boolean(poolKey && config && appConfig.launchFactoryAddress) &&
    poolInitialized &&
    registrationFee !== undefined &&
    validationIssues.length === 0 &&
    !transactionBusy;
  const launchPrimaryActionIsRegister = poolInitialized;
  const launchPrimaryLabel =
    registerStatus === "success" || alreadyRegistered
      ? copy.create.launchCreated
      : launchPrimaryActionIsRegister
        ? copy.create.nextRegisterLaunch
        : copy.create.nextInitializePool;
  const launchPrimaryDisabled =
    registerStatus === "success" || alreadyRegistered || (launchPrimaryActionIsRegister ? !canRegister : !canInitialize);

  async function handleDeployLaunchToken() {
    if (
      !canDeployLaunchToken ||
      !address ||
      !tokenOwner ||
      !tokenAllocationRecipients ||
      !tokenAllocationAmounts ||
      !parsedTokenSupply
    ) {
      return;
    }

    try {
      setTxError(undefined);
      setTokenDeployStatus("awaiting-wallet");
      const deployArgs = [
        tokenName,
        tokenSymbol,
        tokenOwner,
        [...tokenAllocationRecipients],
        [...tokenAllocationAmounts],
        effectiveTokenMetadataUri,
      ] as const;
      const deployData = encodeDeployData({
        abi: fairLaunchTokenAbi,
        bytecode: fairLaunchTokenBytecode,
        args: deployArgs,
      });
      const estimatedGas = await publicClient.estimateGas({ account: address, data: deployData });
      const gas = (estimatedGas * 130n) / 100n + 50_000n;

      const hash = await deployContractAsync({
        abi: fairLaunchTokenAbi,
        bytecode: fairLaunchTokenBytecode,
        args: deployArgs,
        chainId: appConfig.chainId,
        gas,
      });

      setTokenDeployHash(hash);
      setTokenDeployStatus("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(copy.create.tokenDeployReverted);

      const tokenAddress = getAddress(receipt.contractAddress);
      setDeployedLaunchToken(tokenAddress);
      setLaunchTokenInput(tokenAddress);
      setTokenDeployStatus("success");
      setRecentTokenDeployments((current) => {
        const nextDeployment: LaunchTokenDeployment = {
          address: tokenAddress,
          chainId: appConfig.chainId,
          createdAt: Date.now(),
          deployer: address,
          name: tokenName,
          symbol: tokenSymbol,
          txHash: hash,
        };
        const next = [
          nextDeployment,
          ...current.filter(
            (deployment) =>
              deployment.chainId !== appConfig.chainId || deployment.address.toLowerCase() !== tokenAddress.toLowerCase(),
          ),
        ].slice(0, 12);
        writeLaunchTokenDeployments(next);
        return next;
      });
    } catch (error) {
      setTokenDeployStatus("failed");
      setTxError(readableError(error, copy));
    }
  }

  function handleUseRecentToken(deployment: LaunchTokenDeployment) {
    setDeployedLaunchToken(deployment.address);
    setLaunchTokenInput(deployment.address);
    setTokenDeployHash(deployment.txHash);
    setTokenDeployStatus("success");
    setTokenNameInput(deployment.name);
    setTokenSymbolInput(deployment.symbol);
    setTokenAddressCopied(false);
    setTxError(undefined);
  }

  function handleStartAnotherToken() {
    setDeployedLaunchToken(undefined);
    setLaunchTokenInput("");
    setTokenDeployHash(undefined);
    setTokenDeployStatus("idle");
    setTokenAddressCopied(false);
    setTxError(undefined);
  }

  async function handleSwitchNetwork() {
    setTxError(undefined);
    await switchChainAsync({ chainId: appConfig.chainId });
  }

  async function handleInitializePool() {
    if (!canInitialize || !poolKey || !appConfig.poolManagerAddress) return;

    try {
      setTxError(undefined);
      setInitializeStatus("awaiting-wallet");
      const hash = await writeContractAsync({
        address: appConfig.poolManagerAddress,
        abi: poolManagerAbi,
        functionName: "initialize",
        args: [poolKey, oneToOneSqrtPriceX96],
        chainId: appConfig.chainId,
      });

      setInitializeHash(hash);
      setInitializeStatus("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(copy.create.initializeReverted);
      setInitializeStatus("success");
      await poolSlot0Query.refetch();
    } catch (error) {
      setInitializeStatus("failed");
      setTxError(readableError(error, copy));
    }
  }

  async function handleRegisterLaunch() {
    if (!canRegister || !poolKey || !config || !appConfig.launchFactoryAddress) return;

    try {
      setTxError(undefined);
      setRegisterStatus("awaiting-wallet");
      const hash = await writeContractAsync({
        address: appConfig.launchFactoryAddress,
        abi: launchFactoryAbi,
        functionName: "registerLaunch",
        args: [poolKey, config],
        chainId: appConfig.chainId,
        value: registrationFee ?? 0n,
      });

      setRegisterHash(hash);
      setRegisterStatus("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(copy.create.registerReverted);
      setRegisterStatus("success");
      setRegisteredLaunchRecords((current) => {
        const nextRecord: RegisteredLaunchRecord = {
          chainId: appConfig.chainId,
          createdAt: Date.now(),
          creator: address,
          launchEnd: config.launchEnd,
          launchStart: config.launchStart,
          launchToken: config.launchToken,
          poolId: generatedPoolId ?? poolIdForPoolKey(poolKey),
          quoteToken: config.quoteToken,
          txHash: hash,
        };
        const next = [
          nextRecord,
          ...current.filter(
            (record) =>
              record.chainId !== appConfig.chainId || record.poolId.toLowerCase() !== nextRecord.poolId.toLowerCase(),
          ),
        ].slice(0, 24);
        writeRegisteredLaunchRecords(next);
        return next;
      });
      await Promise.all([registeredLaunchQuery.refetch(), onRefresh()]);
    } catch (error) {
      setRegisterStatus("failed");
      setTxError(readableError(error, copy));
    }
  }

  async function handleCopyDeployedToken() {
    if (!deployedLaunchToken) return;

    try {
      await navigator.clipboard.writeText(deployedLaunchToken);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = deployedLaunchToken;
      textArea.setAttribute("readonly", "true");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setTokenAddressCopied(true);
    window.setTimeout(() => setTokenAddressCopied(false), 1800);
  }

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.create.title}
        subtitle={copy.create.subtitle}
        action={<StatusPill label={writeReady ? copy.common.liveWrite : copy.common.previewOnly} tone={writeReady ? "teal" : "amber"} />}
      />

      <div className="content-grid create-layout">
        <section className="panel span-2">
          <div className="section-heading">
            <div>
              <h2>{copy.create.tokenSetupTitle}</h2>
              <p>{copy.create.tokenSetupCopy}</p>
            </div>
          </div>
          <div className="launch-flow-summary">
            <div>
              <strong>{copy.create.productFlowTitle}</strong>
              <p>{copy.create.productFlowCopy}</p>
            </div>
            <ol>
              {copy.create.productFlowSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="launch-mode-tabs" role="tablist" aria-label={copy.create.launchModeLabel}>
            <button
              className={launchMode === "create-token" ? "active" : ""}
              type="button"
              onClick={() => setLaunchMode("create-token")}
            >
              <Coins size={16} />
              {copy.create.createTokenMode}
            </button>
            <button
              className={launchMode === "existing-token" ? "active" : ""}
              type="button"
              onClick={() => setLaunchMode("existing-token")}
            >
              <Search size={16} />
              {copy.create.existingTokenMode}
            </button>
          </div>

          {launchMode === "create-token" && (
            <div className="token-builder">
              <div className="section-heading compact">
                <div>
                  <h3>{copy.create.tokenBuilderTitle}</h3>
                  <p>{copy.create.tokenBuilderCopy}</p>
                </div>
                <StatusPill
                  label={deployedLaunchToken ? copy.create.tokenDeployed : copy.create.deployRequired}
                  tone={deployedLaunchToken ? "teal" : "amber"}
                />
              </div>
              <div className="form-grid">
                <label>
                  {copy.create.tokenName}
                  <input disabled={tokenFormLocked} value={tokenNameInput} onChange={(event) => setTokenNameInput(event.target.value)} />
                </label>
                <label>
                  {copy.create.tokenSymbol}
                  <input
                    disabled={tokenFormLocked}
                    value={tokenSymbolInput}
                    onChange={(event) => setTokenSymbolInput(event.target.value.toUpperCase())}
                  />
                </label>
                <label>
                  {copy.create.totalSupply}
                  <input
                    disabled={tokenFormLocked}
                    inputMode="decimal"
                    value={tokenSupplyInput}
                    onChange={(event) => setTokenSupplyInput(event.target.value)}
                  />
                </label>
                <label>
                  {copy.create.initialOwner}
                  <input
                    disabled={tokenFormLocked}
                    placeholder="0x..."
                    value={tokenOwnerInput}
                    onChange={(event) => setTokenOwnerInput(event.target.value)}
                  />
                </label>
                <label>
                  {copy.create.logoUri}
                  <small>{copy.create.logoUriHelp}</small>
                  <input
                    disabled={tokenFormLocked}
                    placeholder="ipfs://... or https://..."
                    value={tokenLogoUriInput}
                    onChange={(event) => setTokenLogoUriInput(event.target.value)}
                  />
                </label>
                <label>
                  {copy.create.metadataUri}
                  <small>{copy.create.metadataUriHelp}</small>
                  <input
                    disabled={tokenFormLocked}
                    placeholder="ipfs://... or https://..."
                    value={tokenMetadataUriInput}
                    onChange={(event) => setTokenMetadataUriInput(event.target.value)}
                  />
                </label>
              </div>
              <div className="allocation-grid">
                <label>
                  {copy.create.creatorAllocation}
                  <input disabled={tokenFormLocked} placeholder="0x..." value={creatorRecipientInput} onChange={(event) => setCreatorRecipientInput(event.target.value)} />
                  <input disabled={tokenFormLocked} inputMode="decimal" value={creatorAllocationInput} onChange={(event) => setCreatorAllocationInput(event.target.value)} />
                </label>
                <label>
                  {copy.create.liquidityAllocation}
                  <input disabled={tokenFormLocked} placeholder="0x..." value={liquidityRecipientInput} onChange={(event) => setLiquidityRecipientInput(event.target.value)} />
                  <input disabled={tokenFormLocked} inputMode="decimal" value={liquidityAllocationInput} onChange={(event) => setLiquidityAllocationInput(event.target.value)} />
                </label>
                <label>
                  {copy.create.treasuryAllocation}
                  <input disabled={tokenFormLocked} placeholder="0x..." value={treasuryRecipientInput} onChange={(event) => setTreasuryRecipientInput(event.target.value)} />
                  <input disabled={tokenFormLocked} inputMode="decimal" value={treasuryAllocationInput} onChange={(event) => setTreasuryAllocationInput(event.target.value)} />
                </label>
              </div>
              <div className="launch-check-grid">
                <LaunchCheck title={copy.create.ownerPermissionsTitle} detail={copy.create.ownerPermissionsCopy} status={copy.common.configured} />
                <LaunchCheck title={copy.create.taxCheckTitle} detail={copy.create.taxFreeTemplate} status={copy.common.found} />
                <LaunchCheck title={copy.create.contractVerificationTitle} detail={copy.create.templateVerificationCopy} status={copy.common.available} />
              </div>
              {!deployedLaunchToken && walletTokenDeployments.length > 0 && (
                <div className="recent-token-list">
                  <div>
                    <strong>{copy.create.recentTokensTitle}</strong>
                    <p>{copy.create.recentTokensCopy}</p>
                  </div>
                  {walletTokenDeployments.map((deployment) => {
                    const addressUrl = blockExplorerAddressUrl(appConfig.explorerUrl, deployment.address);
                    return (
                      <div className="recent-token-row" key={`${deployment.chainId}-${deployment.address}`}>
                        <div>
                          <strong>
                            {deployment.name} ({deployment.symbol})
                          </strong>
                          <code>{deployment.address}</code>
                        </div>
                        <button className="secondary-action" type="button" onClick={() => handleUseRecentToken(deployment)}>
                          {copy.create.useRecentToken}
                        </button>
                        {addressUrl && (
                          <a className="secondary-action" href={addressUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={16} />
                            {copy.create.viewTokenOnExplorer}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="tx-actions compact">
                {isConnected && !onCorrectChain && (
                  <button className="secondary-action" type="button" disabled={switchPending} onClick={handleSwitchNetwork}>
                    {copy.swap.actions.switchNetwork}
                  </button>
                )}
                <button className="primary-action" type="button" disabled={!canDeployLaunchToken} onClick={handleDeployLaunchToken}>
                  {deployedLaunchToken ? copy.create.deployTokenLocked : copy.create.deployToken}
                  <Rocket size={18} />
                </button>
                {deployedLaunchToken && (
                  <button className="secondary-action" type="button" onClick={handleStartAnotherToken}>
                    {copy.create.deployAnotherToken}
                  </button>
                )}
              </div>
              {deployedLaunchToken && (
                <div className="token-success-card">
                  <div>
                    <strong>{copy.create.deployedTokenReadyTitle}</strong>
                    <p>{copy.create.deployedTokenReadyCopy}</p>
                    <code>{deployedLaunchToken}</code>
                  </div>
                  <div className="token-success-actions">
                    <button className="secondary-action" type="button" onClick={handleCopyDeployedToken}>
                      <Copy size={16} />
                      {tokenAddressCopied ? copy.create.tokenAddressCopied : copy.create.copyTokenAddress}
                    </button>
                    {deployedTokenAddressUrl && (
                      <a className="secondary-action" href={deployedTokenAddressUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        {copy.create.viewTokenOnExplorer}
                      </a>
                    )}
                    {tokenDeployTxUrl && (
                      <a className="secondary-action" href={tokenDeployTxUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        {copy.create.viewDeployTx}
                      </a>
                    )}
                  </div>
                </div>
              )}
              <div className="fee-list">
                <Field label={copy.create.tokenDeployStatus} value={txStatusLabel(tokenDeployStatus, copy)} />
                <Field label={copy.create.tokenDeployTx} value={formatHash(tokenDeployHash)} mono />
                <Field label={copy.create.deployedToken} value={deployedLaunchToken ?? formatAddress(deployedLaunchToken)} mono />
              </div>
              {tokenDeployIssues.length > 0 && <ReadinessPanel issues={tokenDeployIssues} approvalRequired={false} />}
            </div>
          )}

          {launchMode === "existing-token" && (
            <div className="token-builder">
              <div className="section-heading compact">
                <div>
                  <h3>{copy.create.existingTokenReviewTitle}</h3>
                  <p>{copy.create.existingTokenReviewCopy}</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  {copy.create.verificationUrl}
                  <input
                    placeholder="https://..."
                    value={existingTokenVerificationUrl}
                    onChange={(event) => setExistingTokenVerificationUrl(event.target.value)}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    checked={existingTokenTaxAccepted}
                    type="checkbox"
                    onChange={(event) => setExistingTokenTaxAccepted(event.target.checked)}
                  />
                  {copy.create.taxAttestation}
                </label>
              </div>
              <div className="launch-check-grid">
                <LaunchCheck title={copy.create.taxCheckTitle} detail={copy.create.existingTaxCheckCopy} status={existingTokenTaxAccepted ? copy.common.configured : copy.common.notConfigured} />
                <LaunchCheck title={copy.create.contractVerificationTitle} detail={copy.create.existingVerificationCopy} status={existingTokenVerificationUrl.trim().startsWith("https://") ? copy.common.configured : copy.common.notConfigured} />
              </div>
            </div>
          )}

          <div className="form-grid">
            <label className="asset-field">
              <span className="asset-field-header">
                <span>
                  <strong>{copy.create.tokenAddress}</strong>
                  <small>{launchMode === "create-token" ? copy.create.generatedTokenAddressHelp : copy.create.tokenAddressHelp}</small>
                </span>
              </span>
              {launchMode === "create-token" ? (
                <div className={`readonly-address-field ${launchToken ? "" : "empty"}`}>
                  {launchToken ? (
                    <>
                      <span>{formatAddress(launchToken)}</span>
                      <code>{launchToken}</code>
                    </>
                  ) : (
                    <span>{copy.common.notConfigured}</span>
                  )}
                </div>
              ) : (
                <input
                  placeholder="0x..."
                  value={effectiveLaunchTokenInput}
                  onChange={(event) => setLaunchTokenInput(event.target.value)}
                />
              )}
            </label>
            <label className="asset-field">
              <span className="asset-field-header">
                <span>
                  <strong>{copy.create.quoteAsset}</strong>
                  <small>{copy.create.quoteAssetHelp}</small>
                </span>
                <select
                  aria-label={copy.create.quoteAssetPreset}
                  value={quoteAssetMode}
                  onChange={(event) => {
                    const nextMode = event.target.value;
                    setQuoteAssetMode(nextMode);
                    if (nextMode !== "custom") setQuoteTokenInput(nextMode);
                  }}
                >
                  <option value="">{copy.create.selectQuoteAsset}</option>
                  {quoteAssetOptions.map((option) => (
                    <option key={option.address} value={option.address}>
                      {option.label}
                    </option>
                  ))}
                  <option value="custom">{copy.create.customQuoteAsset}</option>
                </select>
              </span>
              {quoteAssetMode === "custom" ? (
                <input
                  className="asset-address-input"
                  placeholder="0x..."
                  value={quoteTokenInput}
                  onChange={(event) => {
                    setQuoteAssetMode("custom");
                    setQuoteTokenInput(event.target.value);
                  }}
                />
              ) : (
                <div className={`readonly-address-field ${quoteToken ? "" : "empty"}`}>
                  {quoteToken ? (
                    <>
                      <span>{formatAddress(quoteToken)}</span>
                      <code>{quoteToken}</code>
                    </>
                  ) : (
                    <span>{copy.common.notConfigured}</span>
                  )}
                </div>
              )}
            </label>
            <label>
              {copy.create.maxBuy}
              <small>{copy.create.maxBuyHelp}</small>
              <input inputMode="decimal" value={maxBuyInput} onChange={(event) => setMaxBuyInput(event.target.value)} />
            </label>
            <label>
              {copy.dashboard.launchStart}
              <small>{copy.create.launchStartHelp}</small>
              <input type="datetime-local" value={launchStartInput} onChange={(event) => setLaunchStartInput(event.target.value)} />
            </label>
            <label>
              {copy.dashboard.launchEnd}
              <small>{copy.create.launchEndHelp}</small>
              <input type="datetime-local" value={launchEndInput} onChange={(event) => setLaunchEndInput(event.target.value)} />
            </label>
            <label className="checkbox-row">
              <input
                checked={nftDiscountEnabled}
                type="checkbox"
                onChange={(event) => setNftDiscountEnabled(event.target.checked)}
              />
              <span>
                <strong>{copy.create.nftDiscount}</strong>
                <small>{copy.create.nftDiscountHelp}</small>
              </span>
            </label>
          </div>
          <details className="advanced-settings">
            <summary>
              <span>{copy.create.advancedSettingsTitle}</span>
              <small>{copy.create.advancedSettingsCopy}</small>
            </summary>
            <div className="form-grid">
              <label>
                {copy.create.baseFee}
                <small>{copy.create.baseFeeHelp}</small>
                <input inputMode="numeric" value={baseFeeInput} onChange={(event) => setBaseFeeInput(event.target.value)} />
              </label>
              <label>
                {copy.create.minFee}
                <small>{copy.create.minFeeHelp}</small>
                <input inputMode="numeric" value={minFeeInput} onChange={(event) => setMinFeeInput(event.target.value)} />
              </label>
              <label>
                {copy.create.maxFee}
                <small>{copy.create.maxFeeHelp}</small>
                <input inputMode="numeric" value={maxFeeInput} onChange={(event) => setMaxFeeInput(event.target.value)} />
              </label>
              <label>
                {copy.create.maxBuyBps}
                <small>{copy.create.maxBuyBpsHelp}</small>
                <input inputMode="numeric" value={maxBuyBpsInput} onChange={(event) => setMaxBuyBpsInput(event.target.value)} />
              </label>
              <label>
                {copy.create.cooldownBlocks}
                <small>{copy.create.cooldownBlocksHelp}</small>
                <input inputMode="numeric" value={cooldownBlocksInput} onChange={(event) => setCooldownBlocksInput(event.target.value)} />
              </label>
            </div>
          </details>
        </section>

        <section className="panel">
          <div className="section-heading compact">
            <div>
              <h2>{copy.create.previewTitle}</h2>
              <p>{copy.create.previewCopy}</p>
            </div>
            <StatusPill label={poolAvailability} tone={poolAvailabilityTone} />
          </div>
          <div className="preview-token">
            <Activity size={40} />
            <div>
              <strong>{copy.create.previewName}</strong>
              <span>{appConfig.networkName}</span>
            </div>
          </div>
          <div className="fee-list">
            <Field label={copy.dashboard.poolId} value={generatedPoolId ?? copy.common.needsConfig} mono />
            <Field label="currency0" value={formatAddress(poolKey?.currency0)} mono />
            <Field label="currency1" value={formatAddress(poolKey?.currency1)} mono />
            <Field label={copy.dashboard.fairFlowHook} value={formatAddress(appConfig.fairFlowHookAddress)} mono />
            <Field label={copy.create.factoryOwner} value={formatAddress(factoryOwner)} mono />
            <Field label={copy.create.factoryMode} value={factoryPaused ? copy.create.factoryPausedShort : publicCreationEnabled ? copy.create.publicMode : copy.create.allowlistMode} />
            <Field label={copy.create.creatorAccess} value={isConnected ? (creatorCanCreate ? copy.common.yes : copy.common.no) : copy.shell.connectWallet} />
            <Field label={copy.create.creationFee} value={formatNativeAmount(registrationFee, copy)} />
            <Field label={copy.create.feeRecipient} value={formatAddress(feeRecipient)} mono />
            <Field
              label={copy.create.launchTokenContract}
              value={!launchToken ? copy.common.notConfigured : launchTokenCodePending ? copy.create.poolChecking : launchTokenCodeOk ? copy.common.yes : copy.common.no}
            />
            <Field
              label={copy.create.quoteTokenContract}
              value={!quoteToken ? copy.common.notConfigured : quoteTokenCodePending ? copy.create.poolChecking : quoteTokenMissingCode || quoteTokenCodeFailed ? copy.common.no : copy.common.yes}
            />
            <Field label={copy.create.tokenName} value={launchTokenName ?? copy.common.notConfigured} />
            <Field label={copy.create.tokenSymbol} value={launchTokenSymbol ?? copy.common.notConfigured} />
            <Field
              label={copy.create.tokenDecimals}
              value={launchTokenDecimals !== undefined ? formatInteger(launchTokenDecimals) : copy.common.notConfigured}
            />
            <Field
              label={copy.create.tokenSupply}
              value={
                launchTokenSupply !== undefined && launchTokenDecimals !== undefined
                  ? formatTokenAmount(launchTokenSupply, launchTokenSymbol ?? copy.create.tokenSymbol, launchTokenDecimals)
                  : copy.common.notConfigured
              }
            />
            <Field label={copy.create.tokenOwner} value={formatAddress(launchTokenOwner)} mono />
            <Field label={copy.create.poolAvailability} value={poolAvailability} />
            <Field label={copy.create.v4PoolStatus} value={v4PoolStatus} />
            <Field label={copy.create.registered} value={alreadyRegistered ? copy.common.yes : copy.common.no} />
            <Field label={copy.create.launchCreator} value={formatAddress(launchCreator)} mono />
            <Field label={copy.dashboard.launchStart} value={formatDateTime(config?.launchStart)} />
            <Field label={copy.dashboard.launchEnd} value={formatDateTime(config?.launchEnd)} />
            <Field label={copy.create.nftDiscount} value={config?.nftDiscountEnabled ? copy.create.enabled : copy.common.disabledOrUnavailable} />
          </div>
          {poolKey && !registrationCheckPending && !registrationCheckFailed && !poolInitializationPending && !poolInitializationFailed && (
            <div className={`pool-state-callout ${alreadyRegistered ? "existing" : "available"}`}>
              {alreadyRegistered ? <Info size={17} /> : <CheckCircle2 size={17} />}
              <div>
                <strong>
                  {alreadyRegistered
                    ? copy.create.existingPoolTitle
                    : poolInitialized
                      ? copy.create.initializedPoolTitle
                      : copy.create.availablePoolTitle}
                </strong>
                <p>
                  {alreadyRegistered
                    ? copy.create.existingPoolCopy
                    : poolInitialized
                      ? copy.create.initializedPoolCopy
                      : copy.create.availablePoolCopy}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="panel action-split" data-testid="create-write-console">
          <div className="section-heading">
            <div>
              <h2>{copy.create.readinessTitle}</h2>
              <p>{copy.create.readinessCopy}</p>
            </div>
            <StatusPill label={copy.create.twoTransactionStatus} tone="blue" />
          </div>
          <div className="launch-stepper compact">
            <LaunchStep
              detail={copy.create.initializePoolDetail}
              index={1}
              status={poolInitialized ? copy.common.success : poolInitializationPending ? copy.create.poolChecking : txStatusLabel(initializeStatus, copy)}
              title={copy.create.initializePool}
            />
            <LaunchStep
              detail={copy.create.registerLaunchDetail}
              index={2}
              status={
                registerStatus === "success"
                  ? copy.common.success
                  : initializeStatus === "success"
                    ? copy.common.liveWrite
                    : copy.create.waitingForStepOne
              }
              title={copy.create.registerLaunch}
            />
          </div>
          <details className="runbook-card">
            <summary>{copy.create.liquidityRunbookTitle}</summary>
            <div>
              <p>{copy.create.liquidityRunbookCopy}</p>
            </div>
            <ul>
              {copy.create.liquidityChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
          <div className="launch-next-action">
            <div>
              <strong>{copy.create.nextActionTitle}</strong>
              <span>{copy.create.nextActionCopy}</span>
            </div>
            {isConnected && !onCorrectChain ? (
              <button className="primary-action" type="button" disabled={switchPending} onClick={handleSwitchNetwork}>
                {copy.swap.actions.switchNetwork}
              </button>
            ) : (
              <button
                className="primary-action"
                type="button"
                disabled={launchPrimaryDisabled}
                onClick={launchPrimaryActionIsRegister ? handleRegisterLaunch : handleInitializePool}
              >
                {launchPrimaryLabel}
                <Rocket size={18} />
              </button>
            )}
          </div>
          <div className="fee-list">
            <Field label={copy.create.initializeStatus} value={txStatusLabel(initializeStatus, copy)} />
            <Field label={copy.create.initializeTx} value={formatHash(initializeHash)} mono />
            <Field label={copy.create.registerStatus} value={txStatusLabel(registerStatus, copy)} />
            <Field label={copy.create.registerTx} value={formatHash(registerHash)} mono />
          </div>
          {validationIssues.length > 0 && <ReadinessPanel issues={validationIssues} approvalRequired={false} />}
          {txError && <p className="tx-error">{txError}</p>}
          <p className="panel-note">{copy.create.note}</p>
        </section>
      </div>
    </section>
  );
}

function AgentReportView({
  dashboard,
  events,
  launchConfig,
}: {
  dashboard?: PoolDashboard;
  events: EventLog[];
  launchConfig?: LaunchConfig;
}) {
  const { copy, language } = useI18n();
  const report = generateAgentReport(dashboard, events, launchConfig, language);

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
          </div>
        </section>

        <ReportStatePanel states={report.states} />
        <InsightPanel title={copy.agent.evidenceTrail} icon={Sparkles} items={report.evidence} tone="blue" />
        <InsightPanel title={copy.agent.riskSignals} icon={AlertTriangle} items={report.risks} tone="amber" />
        <InsightPanel title={copy.agent.recommendedActions} icon={CheckCircle2} items={report.actions} tone="teal" />
      </div>
    </section>
  );
}

function GuideView({ launchConfig }: { launchConfig?: LaunchConfig }) {
  const { copy } = useI18n();

  return (
    <section className="view-stack">
      <PageTitle
        title={copy.guide.title}
        subtitle={copy.guide.subtitle}
        action={<StatusPill label={copy.common.productionGate} tone="blue" />}
      />

      <div className="guide-grid">
        <section className="panel guide-card">
          <div className="feature-icon">
            <DatabaseZap size={24} />
          </div>
          <div>
            <h2>{copy.guide.stackTitle}</h2>
            <p>{copy.guide.stackCopy}</p>
            <div className="fee-list">
              <Field label={copy.swap.poolManager} value={formatAddress(appConfig.poolManagerAddress)} mono />
              <Field label={copy.swap.quote.v4Quoter} value={formatAddress(appConfig.v4QuoterAddress)} mono />
              <Field label={copy.dashboard.poolId} value={appConfig.poolId ?? copy.common.notConfigured} mono />
            </div>
          </div>
        </section>

        <section className="panel guide-card">
          <div className="feature-icon">
            <ArrowRightLeft size={24} />
          </div>
          <div>
            <h2>{copy.guide.swapTitle}</h2>
            <p>{copy.guide.swapCopy}</p>
            <div className="fee-list">
              <Field label={copy.swap.maxBuy} value={launchConfig ? formatTokenAmount(launchConfig.maxBuyAmount, appConfig.launchTokenSymbol, appConfig.tokenDecimals) : copy.common.needsConfig} />
              <Field label={copy.create.cooldownBlocks} value={launchConfig ? `${launchConfig.cooldownBlocks}` : copy.common.needsConfig} />
              <Field label={copy.swap.flowPassDiscount} value={launchConfig?.nftDiscountEnabled ? copy.common.enabled : copy.common.disabledOrUnavailable} />
            </div>
          </div>
        </section>

        <section className="panel guide-card">
          <div className="feature-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <h2>{copy.guide.flowPassTitle}</h2>
            <p>{copy.guide.flowPassCopy}</p>
            <div className="rule-list">
              {copy.swap.flowPass.rules.map((rule) => (
                <div key={rule}>
                  <CheckCircle2 size={15} />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel guide-card">
          <div className="feature-icon">
            <Shield size={24} />
          </div>
          <div>
            <h2>{copy.guide.readinessTitle}</h2>
            <div className="rule-list">
              {copy.guide.readinessItems.map((item) => (
                <div key={item}>
                  <CheckCircle2 size={15} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
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
    </div>
  );
}

function FlowPassProofPanel({
  address,
  dashboard,
  events,
  isConnected,
  launchConfig,
  userStatus,
}: {
  address?: Address;
  dashboard?: PoolDashboard;
  events: EventLog[];
  isConnected: boolean;
  launchConfig?: LaunchConfig;
  userStatus?: UserStatus;
}) {
  const { copy } = useI18n();
  const latestFlowPassEvent = events.find((event) => event.kind === "flowpass");
  const flowPassTxUrl = blockExplorerTxUrl(appConfig.explorerUrl, latestFlowPassEvent?.transactionHash);
  const flowPassAddressUrl = blockExplorerAddressUrl(appConfig.explorerUrl, appConfig.flowPassNftAddress);
  const tokenOfQuery = useReadContract({
    address: appConfig.flowPassNftAddress ?? zeroAddress,
    abi: flowPassNftAbi,
    functionName: "tokenOf",
    args: [address ?? zeroAddress],
    query: {
      enabled: Boolean(isConnected && address && appConfig.flowPassNftAddress),
    },
  });
  const tier = userStatus?.flowPassTier ?? 0;
  const tokenId = typeof tokenOfQuery.data === "bigint" && tokenOfQuery.data > 0n ? tokenOfQuery.data : undefined;
  const flowPassCard = flowPassCards[Math.max(0, Math.min(flowPassCards.length - 1, tier - 1))] ?? flowPassCards[0];
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
      <div className="flowpass-proof-grid">
        <div className={`flowpass-owned-card ${tokenId === undefined ? "locked" : ""}`}>
          <img src={flowPassCard.src} alt={flowPassCard.title} />
          <div>
            <strong>{tokenId !== undefined ? flowPassCard.title : copy.swap.flowPass.noToken}</strong>
            <span>{isConnected ? issuanceState : copy.swap.flowPass.walletRequired}</span>
          </div>
        </div>
        <div className="fee-list">
          <Field label={copy.swap.flowPass.currentTier} value={isConnected ? copy.swap.tier(tier) : copy.swap.flowPass.walletRequired} />
          <Field label={copy.swap.flowPass.tokenId} value={tokenId !== undefined ? formatInteger(tokenId) : copy.swap.flowPass.noToken} />
          {launchWindowBlocksUpgrade && launchConfig && (
            <Field label={copy.swap.flowPass.eligibleAfter} value={formatDateTime(launchConfig.launchEnd)} />
          )}
          <Field label={copy.swap.flowPass.metadata} value={copy.swap.flowPass.metadataPending} />
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
      </div>
      {flowPassTxUrl && (
        <a className="secondary-action" href={flowPassTxUrl} target="_blank" rel="noreferrer">
          {copy.swap.flowPass.viewEvent}
          <ExternalLink size={16} />
        </a>
      )}
      {flowPassAddressUrl && (
        <a className="secondary-action" href={flowPassAddressUrl} target="_blank" rel="noreferrer">
          {copy.swap.flowPass.viewContract}
          <ExternalLink size={16} />
        </a>
      )}
      <div className="rule-list">
        {copy.swap.flowPass.rules.map((rule) => (
          <div key={rule}>
            <CheckCircle2 size={15} />
            <span>{rule}</span>
          </div>
        ))}
      </div>
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

function PoolSelector({ selectedPool }: { selectedPool?: SelectedPool }) {
  const { copy } = useI18n();

  return (
    <div className="pool-selector">
      <Activity size={20} />
      <div>
        <strong>{selectedPool ? copy.poolSelector.configured : copy.poolSelector.notConfigured}</strong>
        <span>{selectedPool ? formatHash(selectedPool.poolId) : copy.poolSelector.setPoolId}</span>
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

function LaunchCheck({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <article className="launch-check">
      <CheckCircle2 size={17} />
      <div>
        <div>
          <strong>{title}</strong>
          <span>{status}</span>
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

function formatNativeAmount(value: bigint | undefined, copy: I18nCopy): string {
  if (value === undefined) return copy.common.notAvailable;
  return `${formatUnits(value, 18)} ${appConfig.nativeCurrencySymbol}`;
}

function formatSlippage(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 1)}%`;
}

function quoteOutputLabel({
  amountIn,
  hasQuoter,
  isConnected,
  outputSymbol,
  quoteAmountOut,
  quoteError,
  quoteLoading,
}: {
  amountIn?: bigint;
  hasQuoter: boolean;
  isConnected: boolean;
  outputSymbol: string;
  quoteAmountOut?: bigint;
  quoteError: boolean;
  quoteLoading: boolean;
}, copy: I18nCopy): string {
  if (quoteAmountOut !== undefined) return formatTokenAmount(quoteAmountOut, outputSymbol, appConfig.tokenDecimals);
  if (!hasQuoter) return copy.swap.quote.configureQuoterShort;
  if (!isConnected) return copy.swap.quote.connectWalletShort;
  if (amountIn === undefined) return copy.swap.quote.enterAmount;
  if (quoteLoading) return copy.swap.quote.loading;
  if (quoteError) return copy.swap.quote.unavailable;
  return copy.swap.quote.waiting;
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
  approvalRequired,
  balanceInsufficient,
  balanceLoading,
  canSwap,
  hasAmountError,
  hasMinimumOutputError,
  isConnected,
  liveWriteReady: writeReady,
  onCorrectChain,
  transactionBusy,
}: {
  approvalRequired: boolean;
  balanceInsufficient: boolean;
  balanceLoading: boolean;
  canSwap: boolean;
  hasAmountError: boolean;
  hasMinimumOutputError: boolean;
  isConnected: boolean;
  liveWriteReady: boolean;
  onCorrectChain: boolean;
  transactionBusy: boolean;
}, copy: I18nCopy): string {
  if (canSwap) return copy.swap.actions.swapOnXLayer;
  if (!writeReady) return copy.swap.actions.resolveWriteConfig;
  if (!isConnected) return copy.swap.actions.connectRequired;
  if (!onCorrectChain) return copy.swap.actions.switchRequired;
  if (transactionBusy) return copy.swap.actions.waitForTx;
  if (hasAmountError || hasMinimumOutputError) return copy.swap.actions.checkAmount;
  if (balanceLoading) return copy.swap.actions.loadingBalance;
  if (balanceInsufficient) return copy.swap.actions.insufficientBalance;
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
      formatTokenAmount(event.amountInAbs ?? 0n, "", appConfig.tokenDecimals),
      formatFeePips(event.appliedFee),
      event.flowPassTier ?? 0,
      event.marketScore ?? "n/a",
    );
  }

  if (event.kind === "score") {
    return copy.eventStream.details.score(
      event.score ?? "n/a",
      formatSignedTokenAmount(event.netFlow, "", appConfig.tokenDecimals),
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

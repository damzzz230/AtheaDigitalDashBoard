import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Button, cx, Glass, Select, TextInput } from "./components/ui";
import { DataProvider, useData } from "./data/DataContext";
import { HttpAdapter } from "./data/httpAdapter";
import { AuthRequiredError, type DataStore } from "./data/store";
import { needsAction } from "./domain/actions";
import { PEOPLE, type Person, type Snapshot } from "./shared/schema";
import { CapacityScreen } from "./screens/Capacity";
import { MarketingScreen } from "./screens/Marketing";
import { MoneyScreen } from "./screens/Money";
import { PipelineScreen } from "./screens/Pipeline";
import { ProjectsScreen } from "./screens/Projects";
import { SettingsScreen } from "./screens/Settings";
import { SitesScreen } from "./screens/Sites";
import { TodayScreen } from "./screens/Today";
import { PERSON_LABEL } from "./components/labels";
import { Logo, Monogram } from "./components/Logo";

async function createStore(): Promise<DataStore> {
  if (import.meta.env.DEV) {
    const [{ LocalStorageAdapter }, { USER_KEY }] = await Promise.all([import("./data/localAdapter"), import("./data/keys")]);
    return new LocalStorageAdapter(window.localStorage, () => (window.localStorage.getItem(USER_KEY) === "das" ? "das" : "damz"));
  }
  return new HttpAdapter();
}

type BootState = { kind: "loading" } | { kind: "login"; store: HttpAdapter } | { kind: "ready"; store: DataStore; snapshot: Snapshot } | { kind: "error"; message: string };

export function Boot() {
  const [state, setState] = useState<BootState>({ kind: "loading" });

  const start = useCallback(async () => {
    try {
      const store = await createStore();
      try {
        const snapshot = await store.load();
        setState({ kind: "ready", store, snapshot });
      } catch (e) {
        if (e instanceof AuthRequiredError && store instanceof HttpAdapter) setState({ kind: "login", store });
        else throw e;
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Could not start" });
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const onAuthLost = useCallback(() => setState({ kind: "login", store: new HttpAdapter() }), []);

  return (
    <>
      <div className="app-bg" aria-hidden />
      {state.kind === "loading" && <p className="p-8 text-muted">Loading...</p>}
      {state.kind === "error" && (
        <div className="p-6">
          <Glass className="mx-auto max-w-md p-6">
            <h1 className="text-xl">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted">{state.message}</p>
            <Button className="mt-4" onClick={() => void start()}>
              Try again
            </Button>
          </Glass>
        </div>
      )}
      {state.kind === "login" && <Login store={state.store} onDone={() => void start()} />}
      {state.kind === "ready" && (
        <ErrorBoundary>
        <DataProvider store={state.store} initial={state.snapshot} onAuthLost={onAuthLost}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Shell
              onLogout={async () => {
                await state.store.logout();
                if (state.store.mode === "remote") setState({ kind: "login", store: new HttpAdapter() });
              }}
            />
          </BrowserRouter>
        </DataProvider>
        </ErrorBoundary>
      )}
    </>
  );
}

function Login({ store, onDone }: { store: HttpAdapter; onDone: () => void }) {
  const [user, setUser] = useState<Person | null>("damz");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Glass featured className="w-full max-w-sm p-6">
        <Monogram className="h-9 w-auto text-ink" />
        <p className="mt-3 text-sm text-accent-text">Athea Digital</p>
        <h1 className="mt-1 text-2xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">For Damz and Das only.</p>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!user || !pass) return;
            setBusy(true);
            setError(null);
            const r = await store.login(user, pass);
            setBusy(false);
            setPass("");
            if (r.ok) onDone();
            else setError(r.message);
          }}
        >
          <Select label="Who are you?" value={user} onChange={setUser} options={PEOPLE.map((p) => ({ value: p, label: PERSON_LABEL[p] }))} />
          <TextInput label="Passphrase" type="password" freeText={false} hint="" value={pass} onChange={setPass} error={error ?? undefined} />
          <Button type="submit" className="w-full" disabled={busy || !pass}>
            {busy ? "Checking..." : "Sign in"}
          </Button>
        </form>
      </Glass>
    </main>
  );
}

const NAV = [
  { to: "/", label: "Today", icon: "M3 12l9-8 9 8M5 10v10h14V10", mobile: true },
  { to: "/pipeline", label: "Pipeline", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z", mobile: true },
  { to: "/projects", label: "Projects", icon: "M4 6h16M4 12h16M4 18h10", mobile: true },
  { to: "/money", label: "Money", icon: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.2 5 3.2-2.2 3-5 3-5-1.1-5-3", mobile: true },
  { to: "/capacity", label: "Capacity", icon: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { to: "/sites", label: "Sites", icon: "M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { to: "/marketing", label: "Marketing", icon: "M4 15V9l12-5v16L4 15zM4 15l2 5h3l-1-4" },
  { to: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 .5-1.5-1.2L15 4h-6l-.5 2.3L7 7.5 5 7l-2 4 2 1-.1 1.5L3 15l2 4 2-.5 1.5 1.2L9 22h6l.5-2.3 1.5-1.2 2 .5 2-4-2-1.5z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function NavItem({ to, label, icon, badge, compact }: { to: string; label: string; icon: string; badge?: number; compact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cx(
          "relative flex items-center rounded-xl transition-colors",
          compact ? "min-h-14 flex-1 flex-col justify-center gap-0.5 px-1 text-[11px]" : "min-h-11 gap-3 px-3 text-sm",
          isActive ? "bg-accent-text/10 text-accent-text" : "text-muted hover:bg-white/5 hover:text-ink",
        )
      }
    >
      <Icon d={icon} />
      <span>{label}</span>
      {!!badge && <span className={cx("tabular rounded-full bg-bad px-1.5 text-[10px] font-bold leading-4 text-[#2a0808]", compact ? "absolute right-[22%] top-1.5" : "ml-auto")}>{badge}</span>}
    </NavLink>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { data, today, now, user, store } = useData();
  const overdue = needsAction(data, today, now).filter((a) => a.severity === "overdue").length;
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 p-4 md:flex">
        <div className="mb-4 px-3 pt-2">
          <Logo />
          <p className="mt-1.5 text-xs text-muted">Internal dashboard</p>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} badge={n.to === "/" ? overdue : undefined} />
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-3 text-xs text-muted">
          {store.mode === "local" && <p className="rounded-lg border border-warn/40 px-2 py-1 text-warn">Local dev data (this browser only)</p>}
          <p>
            Signed in as <span className="text-ink">{PERSON_LABEL[user]}</span>
          </p>
          {store.mode === "remote" && (
            <button className="text-accent-text underline-offset-2 hover:underline" onClick={onLogout}>
              Sign out
            </button>
          )}
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-7xl">
          <Logo className="mb-5 md:hidden" />
          <Routes>
            <Route path="/" element={<TodayScreen />} />
            <Route path="/pipeline" element={<PipelineScreen />} />
            <Route path="/projects" element={<ProjectsScreen />} />
            <Route path="/money" element={<MoneyScreen />} />
            <Route path="/capacity" element={<CapacityScreen />} />
            <Route path="/sites" element={<SitesScreen />} />
            <Route path="/marketing" element={<MarketingScreen />} />
            <Route path="/settings" element={<SettingsScreen onLogout={onLogout} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <nav aria-label="Main" className="overlay-panel pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line px-1 pt-1 md:hidden">
        {moreOpen && (
          <div className="grid grid-cols-4 gap-1 border-b border-line pb-1">
            {NAV.filter((n) => !n.mobile).map((n) => (
              <NavItem key={n.to} {...n} compact />
            ))}
          </div>
        )}
        <div className="flex">
          {NAV.filter((n) => n.mobile).map((n) => (
            <NavItem key={n.to} {...n} compact badge={n.to === "/" ? overdue : undefined} />
          ))}
          <MoreButton open={moreOpen} active={NAV.some((n) => !n.mobile && n.to === loc.pathname)} onClick={() => setMoreOpen((o) => !o)} />
        </div>
      </nav>
    </div>
  );
}

function MoreButton({ open, active, onClick }: { open: boolean; active: boolean; onClick: () => void }): ReactNode {
  return (
    <button onClick={onClick} aria-expanded={open} className={cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px]", open || active ? "text-accent-text" : "text-muted")}>
      <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
      <span>More</span>
    </button>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6">
        <Glass className="mx-auto max-w-md p-6">
          <h1 className="text-xl">This screen hit an error</h1>
          <p className="mt-2 text-sm text-muted">{this.state.error.message}. Your saved data is safe.</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Glass>
      </div>
    );
  }
}

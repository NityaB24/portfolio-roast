import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Hotspots from "../components/Hotspots";
import ScoreCountUp from "../components/ScoreCountUp";
import { api, ApiError, domainOf, MODE_LABEL, scoreTone, SEVERITY_BADGE, SEVERITY_LABEL, type HistoryEntry, type RoastRecord, type Viewport } from "../lib/api";
import { formatCountdown, linkedInShareUrl, msUntilReroast, shareText, xShareUrl } from "../lib/share";
import { stagger } from "../lib/ui";

export default function Result() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const preloaded = (location.state as { record?: RoastRecord } | null)?.record;

  const [rec, setRec] = useState<RoastRecord | null>(preloaded && preloaded.id === id ? preloaded : null);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [active, setActive] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [reroasting, setReroasting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (rec && rec.id === id) return;
    let alive = true;
    api
      .get(id)
      .then((r) => alive && setRec(r))
      .catch((e: Error) => alive && setError(e instanceof ApiError && e.status === 404 ? "This roast was removed or never existed." : e.message));
    return () => {
      alive = false;
    };
  }, [id, rec]);

  useEffect(() => {
    if (!rec) return;
    document.title = `${domainOf(rec.normalizedUrl)} scored ${rec.score}/100 · Portfolio Roast`;
    api
      .history(rec.normalizedUrl)
      .then((h) => setHistory(h.entries))
      .catch(() => setHistory([]));
  }, [rec]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const select = useCallback(
    (i: number | null) => {
      setActive(i);
      if (i !== null && rec) {
        const vp = rec.roasts[i]?.box.viewport;
        if (vp) setViewport(vp);
      }
    },
    [rec],
  );

  useEffect(() => {
    if (active === null) return;
    const el = document.getElementById(`roast-${active}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${id}` : `/r/${id}`;
  const improvement = useMemo(() => {
    // Compare like with like: only roasts in the same mode as this one.
    const same = rec ? history.filter((h) => h.mode === rec.mode) : history;
    if (same.length < 2) return null;
    const first = same[0];
    const last = same[same.length - 1];
    if (!first || !last || first.score === last.score) return null;
    return { from: first.score, to: last.score, count: same.length };
  }, [history, rec]);

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-24 sm:px-8 sm:py-32">
        <h1 className="display reveal text-[clamp(3.5rem,12vw,7rem)]">
          <em className="text-accent">Gone.</em>
        </h1>
        <p className="reveal mt-6 max-w-md text-fg-2" style={stagger(1)}>
          {error}
        </p>
        <Link to="/" className="btn btn-primary reveal mt-8" style={stagger(2)}>
          Roast another
        </Link>
      </section>
    );
  }
  if (!rec) {
    return (
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-8 sm:pt-24" aria-busy="true" aria-label="Loading roast">
        <div className="display animate-pulse text-[clamp(8rem,34vw,14rem)] leading-[0.8] text-sunken">00</div>
        <div className="mt-10 h-5 w-2/3 max-w-md animate-pulse rounded bg-sunken" />
      </section>
    );
  }

  const domain = domainOf(rec.normalizedUrl);
  const tone = scoreTone(rec.score, rec.blocked);
  const cooldown = msUntilReroast(rec.createdAt, now);
  const canReroast = cooldown === 0;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this link", pageUrl);
    }
  }

  async function reroast() {
    if (!canReroast || reroasting) return;
    setReroasting(true);
    setActionError(null);
    try {
      const fresh = await api.roast(rec!.normalizedUrl, rec!.mode);
      navigate(`/r/${fresh.id}`, { state: { record: fresh } });
      setRec(fresh);
      setActive(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Re-roast failed.");
    } finally {
      setReroasting(false);
    }
  }

  async function remove() {
    setRemoving(true);
    setActionError(null);
    try {
      await api.remove(rec!.id);
      navigate("/");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Removal failed.");
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  const text = shareText(domain, rec.score, rec.mode);

  return (
    <article className="mx-auto max-w-6xl px-4 pt-10 sm:px-8 sm:pt-16">
      {/* Score block */}
      <header className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-14">
        <div className="reveal flex items-end gap-3">
          <ScoreCountUp value={rec.score} className={"display text-[clamp(8rem,34vw,15rem)] leading-[0.78] " + tone.color} />
          <div className="pb-2 sm:pb-5">
            <div className="display text-2xl text-fg-3 sm:text-4xl">/100</div>
            <div className={"badge mt-2 " + tone.badge}>{tone.label}</div>
          </div>
        </div>
        <div className="min-w-0 lg:pb-3">
          <p className="meta reveal flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-fg-2" style={stagger(1)}>
            <a href={rec.normalizedUrl} target="_blank" rel="noreferrer nofollow" className="break-all font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent">
              {domain}
            </a>
            <span aria-hidden="true">·</span>
            <time dateTime={rec.createdAt}>{new Date(rec.createdAt).toLocaleString()}</time>
            <span className={"badge " + (rec.mode === "comedy" ? "bg-sev-med-bg text-sev-med" : "bg-sev-high-bg text-sev-high")}>{MODE_LABEL[rec.mode] ?? rec.mode}</span>
            {rec.cached && <span className="badge bg-sunken text-fg-3">cached</span>}
            {improvement && (
              <span className={"badge " + (improvement.to > improvement.from ? "bg-good-bg text-good" : "bg-sev-high-bg text-sev-high")}>
                {improvement.to > improvement.from ? "improved" : "dropped"} {improvement.from} → {improvement.to}
              </span>
            )}
          </p>
          <h1 className="display reveal mt-4 text-[clamp(2rem,5vw,3.75rem)]" style={stagger(2)}>
            {rec.verdict}
          </h1>
          <div className="reveal mt-7 flex flex-wrap items-center gap-2" style={stagger(3)}>
            <Btn onClick={copyLink} primary>
              {copied ? "Copied" : "Copy link"}
            </Btn>
            <Btn href={xShareUrl(text, pageUrl)}>Share on X</Btn>
            <Btn href={linkedInShareUrl(pageUrl)}>LinkedIn</Btn>
            <Btn onClick={reroast} disabled={!canReroast || reroasting} title={canReroast ? "Roast this URL again" : "Available 24h after the last roast"}>
              {reroasting ? "Roasting…" : canReroast ? "Re-roast" : `Re-roast in ${formatCountdown(cooldown)}`}
            </Btn>
            {confirmRemove ? (
              <span className="flex flex-wrap items-center gap-2 rounded-xl bg-sev-high-bg px-3 py-1.5" role="group" aria-label="Confirm removal">
                <span className="text-sm text-sev-high">Hide this page and drop it from the leaderboard?</span>
                <button type="button" className="btn btn-danger !min-h-9 !px-3 font-semibold" onClick={remove} disabled={removing}>
                  {removing ? "Removing…" : "Yes, remove"}
                </button>
                <button type="button" className="btn !min-h-9 !px-3" onClick={() => setConfirmRemove(false)} disabled={removing}>
                  Cancel
                </button>
              </span>
            ) : (
              <Btn onClick={() => setConfirmRemove(true)} danger>
                Remove my result
              </Btn>
            )}
          </div>
          {actionError && (
            <p role="alert" className="mt-4 rounded-lg bg-sev-high-bg px-4 py-3 text-sm font-medium text-sev-high">
              {actionError}
            </p>
          )}
        </div>
      </header>

      {rec.blocked && (
        <p className="mt-8 rounded-xl bg-sev-high-bg p-4 text-sev-high">
          The headless browser could not load this page{rec.blockedReason ? ` (${rec.blockedReason})` : ""}. No screenshots, score 0. Fix the bot blocking and re-roast after 24h.
        </p>
      )}

      {/* Screenshot + roasts */}
      <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-24">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="seg" role="group" aria-label="Screenshot viewport">
              {(["desktop", "mobile"] as Viewport[]).map((vp) => (
                <button key={vp} type="button" onClick={() => setViewport(vp)} aria-pressed={viewport === vp}>
                  {vp === "desktop" ? "Desktop 1440" : "Mobile 390"}
                </button>
              ))}
            </div>
            <p className="hidden text-sm text-fg-3 sm:block">Click a box or a roast</p>
          </div>
          {rec.blocked ? (
            <div className="grid aspect-[1440/900] place-items-center rounded-xl border border-line bg-sunken">
              <p className="display text-4xl text-fg-3">No signal</p>
            </div>
          ) : (
            <Hotspots src={api.shotUrl(rec.id, viewport)} viewport={viewport} roasts={rec.roasts} active={active} onSelect={select} />
          )}
          {rec.signals && <SignalsStrip signals={rec.signals} />}
        </div>

        <ol className="space-y-3">
          {rec.roasts.map((r, i) => {
            const isActive = active === i;
            return (
              <li key={i} id={`roast-${i}`} className="reveal scroll-mt-24" style={stagger(Math.min(i, 8))}>
                <button
                  type="button"
                  onClick={() => select(isActive ? null : i)}
                  aria-pressed={isActive}
                  className={
                    "w-full rounded-xl border p-5 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.995] " +
                    (isActive ? "border-fg bg-surface" : "border-line bg-surface hover:border-line-strong")
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"grid h-6 w-6 place-items-center rounded-full font-mono text-xs font-medium " + SEVERITY_BADGE[r.severity]}>{i + 1}</span>
                    <span className={"badge " + SEVERITY_BADGE[r.severity]}>{SEVERITY_LABEL[r.severity]}</span>
                    <span className="meta text-fg-3">{r.category}</span>
                    <span className="meta ml-auto text-fg-3">{r.box.viewport}</span>
                  </div>
                  <h2 className="display mt-3 text-2xl">{r.title}</h2>
                  <p className="mt-2 text-pretty text-fg-2">{r.detail}</p>
                  <p className={"mt-4 rounded-lg px-3 py-2.5 text-pretty text-fg transition-colors " + (isActive ? "bg-good-bg" : "bg-sunken")}>
                    <span className="badge mr-2 bg-good-bg text-good">Fix</span>
                    {r.fix}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Compliments */}
      {rec.compliments.length > 0 && (
        <section className="mt-16 grid gap-6 rounded-2xl bg-good-bg p-6 sm:p-10 md:grid-cols-[1fr_2fr]">
          <h2 className="display text-4xl text-good sm:text-5xl">
            Fine, credit
            <br />
            where due.
          </h2>
          <ul className="max-w-2xl space-y-4 text-lg text-fg">
            {rec.compliments.map((c, i) => (
              <li key={i} className="flex gap-3">
                <svg className="mt-1.5 shrink-0 text-good" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8.500l3.500 3.500L13 4.500" />
                </svg>
                <span className="text-pretty">{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="meta mt-14 break-all text-fg-3">
        prompt {rec.promptVersion} · id {rec.id} ·{" "}
        <Link to="/" className="text-fg-2 underline decoration-accent underline-offset-4 transition-colors hover:text-fg">
          roast another
        </Link>
      </p>
    </article>
  );
}

function Btn({ children, onClick, href, disabled, danger, primary, title }: { children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; danger?: boolean; primary?: boolean; title?: string }) {
  const cls = "btn " + (danger ? "btn-danger" : primary ? "btn-primary" : "");
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}>
      {children}
    </button>
  );
}

function SignalsStrip({ signals }: { signals: NonNullable<RoastRecord["signals"]> }) {
  const cells: Array<[string, string]> = [
    ["load", `${signals.loadMs} ms`],
    ["words", String(signals.wordCount)],
    ["images", String(signals.imageCount)],
    ["links", String(signals.linkCount)],
    ["fonts", String(signals.fontFamilies.length)],
    ["dark toggle", signals.hasDarkModeToggle ? "yes" : "no"],
    ["template", signals.usesCommonTemplate ? signals.templateHints[0] ?? "yes" : "no"],
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line min-[480px]:grid-cols-4">
      {cells.map(([k, v]) => (
        <div key={k} className="col-span-1 bg-surface p-3 last:col-span-2">
          <dt className="meta text-fg-3">{k}</dt>
          <dd className="mt-1 truncate font-mono text-sm text-fg" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

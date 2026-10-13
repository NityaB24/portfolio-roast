import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Hotspots from "../components/Hotspots";
import ScoreCountUp from "../components/ScoreCountUp";
import { api, ApiError, domainOf, scoreTone, SEVERITY_CLASS, SEVERITY_LABEL, type HistoryEntry, type RoastRecord, type Viewport } from "../lib/api";
import { formatCountdown, linkedInShareUrl, msUntilReroast, shareText, xShareUrl } from "../lib/share";

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

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${id}` : `/r/${id}`;
  const improvement = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    if (!first || !last || first.score === last.score) return null;
    return { from: first.score, to: last.score, count: history.length };
  }, [history]);

  if (error) {
    return (
      <section className="mx-auto max-w-[1400px] px-4 sm:px-8 py-32">
        <h1 className="display text-6xl sm:text-8xl">GONE.</h1>
        <p className="mt-6 text-bone-2">{error}</p>
        <Link to="/" className="inline-block mt-8 tag underline underline-offset-4 decoration-blood">
          Roast another
        </Link>
      </section>
    );
  }
  if (!rec) {
    return (
      <section className="mx-auto max-w-[1400px] px-4 sm:px-8 py-32">
        <div className="display text-[20vw] sm:text-[14rem] text-ink-3 animate-pulse">00</div>
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
    try {
      const fresh = await api.roast(rec!.normalizedUrl);
      navigate(`/r/${fresh.id}`, { state: { record: fresh } });
      setRec(fresh);
      setActive(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Re-roast failed.");
    } finally {
      setReroasting(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this result from the leaderboard and hide this page? This cannot be undone.")) return;
    setRemoving(true);
    try {
      await api.remove(rec!.id);
      navigate("/");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Removal failed.");
      setRemoving(false);
    }
  }

  const text = shareText(domain, rec.score);

  return (
    <article className="mx-auto max-w-[1400px] px-4 sm:px-8 pt-10 sm:pt-16">
      {/* Score block */}
      <header className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-end border-b border-ink-3 pb-10">
        <div className="flex items-end gap-3">
          <ScoreCountUp value={rec.score} className={"display text-[38vw] sm:text-[16rem] lg:text-[18rem] leading-[0.8] " + tone.color} />
          <div className="pb-3 sm:pb-6">
            <div className="display text-2xl sm:text-4xl text-bone-3">/100</div>
            <div className={"tag mt-2 " + tone.color}>{tone.label}</div>
          </div>
        </div>
        <div className="lg:pb-4">
          <p className="tag text-bone-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={rec.normalizedUrl} target="_blank" rel="noreferrer nofollow" className="text-bone hover:text-blood">
              {domain}
            </a>
            <span>·</span>
            <time dateTime={rec.createdAt}>{new Date(rec.createdAt).toLocaleString()}</time>
            {rec.cached && <span className="text-bone-3">· cached</span>}
            {improvement && (
              <span className={improvement.to > improvement.from ? "text-good" : "text-blood"}>
                · {improvement.to > improvement.from ? "improved" : "dropped"} from {improvement.from} to {improvement.to}
              </span>
            )}
          </p>
          <h1 className="display text-3xl sm:text-5xl lg:text-6xl text-bone">{rec.verdict}</h1>
          <div className="mt-8 flex flex-wrap gap-2">
            <Btn onClick={copyLink}>{copied ? "Copied" : "Copy link"}</Btn>
            <Btn href={xShareUrl(text, pageUrl)}>Share on X</Btn>
            <Btn href={linkedInShareUrl(pageUrl)}>LinkedIn</Btn>
            <Btn onClick={reroast} disabled={!canReroast || reroasting} title={canReroast ? "Roast this URL again" : "Available 24h after the last roast"}>
              {reroasting ? "Roasting…" : canReroast ? "Re-roast" : `Re-roast in ${formatCountdown(cooldown)}`}
            </Btn>
            <Btn onClick={remove} disabled={removing} danger>
              Remove my result
            </Btn>
          </div>
        </div>
      </header>

      {rec.blocked && (
        <p className="mt-8 border border-blood/40 bg-blood/10 p-4 text-bone-2">
          The headless browser could not load this page{rec.blockedReason ? ` (${rec.blockedReason})` : ""}. No screenshots, score 0. Fix the bot blocking and re-roast after 24h.
        </p>
      )}

      {/* Screenshot + roasts */}
      <section className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {(["desktop", "mobile"] as Viewport[]).map((vp) => (
                <button
                  key={vp}
                  type="button"
                  onClick={() => setViewport(vp)}
                  className={"tag px-4 py-2 border transition-colors " + (viewport === vp ? "bg-bone text-ink border-bone" : "border-ink-3 text-bone-2 hover:border-bone-2")}
                >
                  {vp === "desktop" ? "Desktop 1440" : "Mobile 390"}
                </button>
              ))}
            </div>
            <p className="tag text-bone-3 hidden sm:block">Click a box or a roast</p>
          </div>
          {rec.blocked ? (
            <div className="aspect-[1440/900] border border-ink-3 bg-ink-2 grid place-items-center">
              <p className="display text-4xl text-bone-3">NO SIGNAL</p>
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
              <li key={i}>
                <button
                  type="button"
                  onClick={() => select(isActive ? null : i)}
                  className={"w-full text-left border p-5 transition-colors " + (isActive ? "border-bone bg-ink-2" : "border-ink-3 hover:border-bone-3")}
                >
                  <div className="flex items-center gap-3 tag">
                    <span className={"inline-grid place-items-center h-6 w-6 rounded-full bg-current " + SEVERITY_CLASS[r.severity]}>
                      <span className="text-ink font-bold tracking-normal">{i + 1}</span>
                    </span>
                    <span className={SEVERITY_CLASS[r.severity]}>{SEVERITY_LABEL[r.severity]}</span>
                    <span className="text-bone-3">{r.category}</span>
                    <span className="text-bone-3 ml-auto">{r.box.viewport}</span>
                  </div>
                  <h2 className="display text-xl sm:text-2xl mt-3 text-bone">{r.title}</h2>
                  <p className="mt-2 text-bone-2 leading-relaxed">{r.detail}</p>
                  <p className={"mt-3 pl-3 border-l-2 text-bone leading-relaxed " + (isActive ? "border-good" : "border-ink-3")}>
                    <span className="tag text-good mr-2">Fix</span>
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
        <section className="mt-20 grid gap-6 md:grid-cols-[1fr_2fr] border-t border-ink-3 pt-10">
          <h2 className="display text-4xl sm:text-5xl text-good">
            FINE,
            <br />
            CREDIT WHERE DUE.
          </h2>
          <ul className="space-y-4 text-lg text-bone-2 max-w-2xl">
            {rec.compliments.map((c, i) => (
              <li key={i} className="flex gap-4">
                <span className="text-good">+</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-16 tag text-bone-3">
        prompt {rec.promptVersion} · id {rec.id} ·{" "}
        <Link to="/" className="underline underline-offset-4 decoration-blood text-bone-2 hover:text-bone">
          roast another
        </Link>
      </p>
    </article>
  );
}

function Btn({ children, onClick, href, disabled, danger, title }: { children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; danger?: boolean; title?: string }) {
  const cls =
    "tag px-4 py-3 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
    (danger ? "border-blood/50 text-blood hover:bg-blood hover:text-ink" : "border-ink-3 text-bone hover:bg-bone hover:text-ink");
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
    <dl className="mt-4 grid grid-cols-3 sm:grid-cols-7 gap-px bg-ink-3 border border-ink-3">
      {cells.map(([k, v]) => (
        <div key={k} className="bg-ink p-3">
          <dt className="tag text-bone-3">{k}</dt>
          <dd className="font-mono text-sm text-bone mt-1 truncate" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

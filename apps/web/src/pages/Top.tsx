import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, scoreTone, type LeaderboardEntry } from "../lib/api";
import { stagger } from "../lib/ui";

type Tab = "week" | "all" | "shame";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
  { id: "shame", label: "Hall of shame" },
];

export default function Top() {
  const [tab, setTab] = useState<Tab>("week");
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Leaderboard · Portfolio Roast";
    let alive = true;
    setRows(null);
    setError(null);
    const p = tab === "shame" ? api.bottom() : api.top(tab);
    p.then((r) => alive && setRows(r.entries)).catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [tab]);

  return (
    <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8 sm:pt-20">
      <p className="badge reveal bg-sunken text-fg-2">Public. Deduped by URL. Latest roast wins.</p>
      <h1 className="display reveal mt-6 text-[clamp(3.25rem,11vw,7rem)]" style={stagger(1)}>
        {tab === "shame" ? (
          <>
            The <em className="text-accent">worst.</em>
          </>
        ) : (
          <>
            The <em className="text-accent">best.</em>
          </>
        )}
      </h1>

      <div className="seg reveal mt-8" role="tablist" aria-label="Leaderboard period" style={stagger(2)}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6" aria-live="polite">
        {error && <p role="alert" className="rounded-lg bg-sev-high-bg px-4 py-3 text-sm font-medium text-sev-high">{error}</p>}

        {!rows && !error && (
          <ul className="card divide-y divide-line overflow-hidden" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="flex h-[76px] animate-pulse items-center gap-4 px-4 sm:px-6">
                <div className="h-3 w-6 rounded bg-sunken" />
                <div className="h-4 w-1/3 rounded bg-sunken" />
                <div className="ml-auto h-8 w-12 rounded bg-sunken" />
              </li>
            ))}
          </ul>
        )}

        {rows && rows.length === 0 && (
          <div className="card px-6 py-16 text-center">
            <p className="display text-4xl text-fg-2">Nobody here yet.</p>
            <Link to="/" className="btn btn-primary mt-6">
              Be the first victim
            </Link>
          </div>
        )}

        {rows && rows.length > 0 && (
          <ol className="card divide-y divide-line overflow-hidden">
            {rows.map((r, i) => {
              const tone = scoreTone(r.score);
              return (
                <li key={r.id} className="reveal" style={stagger(Math.min(i, 10))}>
                  <Link
                    to={`/r/${r.id}`}
                    className="group grid min-h-[76px] grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-sunken focus-visible:-outline-offset-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:gap-5 sm:px-6"
                  >
                    <span className={"meta " + (i === 0 && tab !== "shame" ? "text-accent" : "text-fg-3")}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="display truncate text-2xl transition-colors group-hover:text-accent sm:text-3xl">{r.domain}</span>
                        {r.mode === "comedy" && <span className="badge shrink-0 bg-sev-med-bg text-sev-med">comedy</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-fg-2">{r.verdict}</span>
                    </span>
                    <span className={"badge hidden sm:inline-flex " + tone.badge}>{tone.label}</span>
                    <span className={"display text-right text-4xl sm:text-5xl " + tone.color} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {r.score}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, scoreTone, type LeaderboardEntry } from "../lib/api";

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
    <section className="mx-auto max-w-[1400px] px-4 sm:px-8 pt-14 sm:pt-20">
      <p className="tag text-blood mb-6">Public. Deduped by URL. Latest roast wins.</p>
      <h1 className="display text-[14vw] sm:text-[8rem]">{tab === "shame" ? "THE WORST." : "THE BEST."}</h1>

      <div className="mt-10 flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={"tag px-4 py-3 border transition-colors " + (tab === t.id ? "bg-bone text-ink border-bone" : "border-ink-3 text-bone-2 hover:border-bone-2")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-10">
        {error && <p className="text-sev-high">{error}</p>}
        {!rows && !error && (
          <ul className="divide-y divide-ink-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="py-5 h-20 animate-pulse">
                <div className="h-4 w-1/3 bg-ink-3" />
              </li>
            ))}
          </ul>
        )}
        {rows && rows.length === 0 && (
          <div className="py-20">
            <p className="display text-4xl text-bone-2">Nobody here yet.</p>
            <Link to="/" className="inline-block mt-6 tag underline underline-offset-4 decoration-blood">
              Be the first victim
            </Link>
          </div>
        )}
        {rows && rows.length > 0 && (
          <ol className="divide-y divide-ink-3 border-y border-ink-3">
            {rows.map((r, i) => {
              const tone = scoreTone(r.score);
              return (
                <li key={r.id}>
                  <Link to={`/r/${r.id}`} className="group grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[4rem_1fr_minmax(0,2fr)_auto] gap-4 sm:gap-8 items-center py-5 hover:bg-ink-2 -mx-4 px-4 transition-colors">
                    <span className="tag text-bone-3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="display text-xl sm:text-3xl truncate group-hover:text-blood transition-colors">{r.domain}</span>
                    <span className="hidden sm:block text-bone-2 truncate">{r.verdict}</span>
                    <span className={"display text-4xl sm:text-5xl text-right " + tone.color} style={{ fontVariantNumeric: "tabular-nums" }}>
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

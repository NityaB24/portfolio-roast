import { useEffect, useState } from "react";

/**
 * The roast is a single request that takes 10-25s. We fake progression from
 * elapsed time so the user sees something move. Thresholds in seconds.
 */
const STEPS: Array<{ label: string; at: number; quip: string }> = [
  { label: "Capturing desktop", at: 0, quip: "1440x900. No hiding." },
  { label: "Capturing mobile", at: 4, quip: "390px wide. Thumbs out." },
  { label: "Measuring", at: 8, quip: "Counting fonts, words, excuses." },
  { label: "Roasting", at: 11, quip: "The critic is reading. This hurts them too." },
];

export default function LoadingSteps({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 200);
    return () => clearInterval(t);
  }, [startedAt]);

  const current = STEPS.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <div className="card mt-6 p-6 sm:p-8" aria-live="polite">
      <ol className="space-y-5">
        {STEPS.map((s, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={s.label} className="flex items-start gap-4">
              <span
                className={
                  "mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors " +
                  (state === "done" ? "border-transparent bg-good-bg text-good" : state === "active" ? "border-accent" : "border-line-strong")
                }
                aria-hidden="true"
              >
                {state === "done" && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.500l2.500 2.500 4.500-5" />
                  </svg>
                )}
                {state === "active" && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />}
              </span>
              <div className="min-w-0">
                <div className={"display text-2xl sm:text-3xl " + (state === "todo" ? "text-fg-3" : "text-fg")}>{s.label}</div>
                {state === "active" && <p className="mt-1 text-sm text-fg-2">{s.quip}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="meta mt-8 border-t border-line pt-4 text-fg-3">
        {elapsed.toFixed(0)}s elapsed{elapsed > 25 ? " · slow site or slow critic. Hang on." : ""}
      </p>
    </div>
  );
}

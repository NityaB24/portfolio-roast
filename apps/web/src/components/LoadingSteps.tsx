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
    <div className="mt-16 max-w-2xl" aria-live="polite">
      <ol className="space-y-5">
        {STEPS.map((s, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={s.label} className="flex items-start gap-5">
              <span
                className={
                  "mt-1 h-3 w-3 shrink-0 " +
                  (state === "done" ? "bg-good" : state === "active" ? "bg-blood animate-pulse" : "bg-ink-3")
                }
              />
              <div>
                <div className={"display text-2xl sm:text-4xl " + (state === "todo" ? "text-bone-3" : state === "active" ? "text-bone" : "text-bone-2 line-through decoration-good/70")}>
                  {s.label}
                </div>
                {state === "active" && <p className="tag text-bone-3 mt-2">{s.quip}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="tag text-bone-3 mt-10">
        {elapsed.toFixed(0)}s elapsed{elapsed > 25 ? " · slow site or slow critic. Hang on." : ""}
      </p>
    </div>
  );
}

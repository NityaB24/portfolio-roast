import { useEffect, useState } from "react";
import { api, type Quota } from "../lib/api";

export default function QuotaBar() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .quota()
      .then((q) => alive && setQuota(q))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-fg-3">Quota unavailable. API offline?</p>;
  }
  if (!quota) {
    return (
      <div aria-hidden="true">
        <div className="h-4 w-48 animate-pulse rounded bg-sunken" />
        <div className="mt-3 h-1.5 w-full rounded-full bg-sunken" />
      </div>
    );
  }
  const left = Math.max(0, quota.limit - quota.used);
  const pct = quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
  const reset = new Date(quota.resetsAt);
  const hoursLeft = Math.max(0, Math.round((reset.getTime() - Date.now()) / 3_600_000));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className={left === 0 ? "text-sev-high" : "text-fg-2"}>
          <span className="font-mono font-medium text-fg">{left}</span> of {quota.limit} roasts left today
        </span>
        <span className="text-fg-3">resets in ~{hoursLeft}h</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Daily roasts used" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.used}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

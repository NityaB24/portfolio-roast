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
    return <p className="tag text-bone-3">Quota unavailable. API offline?</p>;
  }
  if (!quota) {
    return (
      <div className="tag text-bone-3">
        <span className="inline-block h-2 w-48 bg-ink-3 animate-pulse align-middle" />
      </div>
    );
  }
  const left = Math.max(0, quota.limit - quota.used);
  const pct = quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
  const reset = new Date(quota.resetsAt);
  const hoursLeft = Math.max(0, Math.round((reset.getTime() - Date.now()) / 3_600_000));
  return (
    <div className="max-w-xl">
      <div className="flex items-baseline justify-between gap-4 tag">
        <span className={left === 0 ? "text-blood" : "text-bone-2"}>
          <span className="text-bone text-base font-bold tracking-normal">{left}</span> of {quota.limit} roasts left today
        </span>
        <span className="text-bone-3">resets in ~{hoursLeft}h</span>
      </div>
      <div className="mt-2 h-1.5 w-full bg-ink-3 overflow-hidden">
        <div className="h-full bg-blood transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

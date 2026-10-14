import { useState } from "react";
import type { RoastItem, Viewport } from "../lib/api";

interface Props {
  src: string;
  viewport: Viewport;
  roasts: RoastItem[];
  active: number | null;
  onSelect: (index: number | null) => void;
}

const ASPECT: Record<Viewport, string> = { desktop: "1440 / 900", mobile: "390 / 844" };

export default function Hotspots({ src, viewport, roasts, active, onSelect }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={"relative w-full overflow-hidden rounded-xl border border-line bg-sunken " + (viewport === "mobile" ? "mx-auto max-w-[390px]" : "")}
      style={{ aspectRatio: ASPECT[viewport] }}
    >
      {failed ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <p className="text-sm text-fg-3">Screenshot unavailable.</p>
        </div>
      ) : (
        <img src={src} alt={`${viewport} screenshot`} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} draggable={false} />
      )}
      {roasts.map((r, i) =>
        r.box.viewport === viewport ? (
          <button
            key={i}
            type="button"
            className="hotspot"
            data-sev={r.severity}
            data-active={active === i}
            style={{ left: `${r.box.x * 100}%`, top: `${r.box.y * 100}%`, width: `${r.box.w * 100}%`, height: `${r.box.h * 100}%` }}
            onClick={() => onSelect(active === i ? null : i)}
            aria-label={`${r.title} (${r.severity})`}
            title={r.title}
          >
            <span className="pin">
              <span>{i + 1}</span>
            </span>
          </button>
        ) : null,
      )}
    </div>
  );
}

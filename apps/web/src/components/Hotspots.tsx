import { useState } from "react";
import { SEVERITY_CLASS, type RoastItem, type Viewport } from "../lib/api";

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
      className={"relative w-full overflow-hidden bg-ink-2 border border-ink-3 " + (viewport === "mobile" ? "max-w-[390px] mx-auto" : "")}
      style={{ aspectRatio: ASPECT[viewport] }}
    >
      {failed ? (
        <div className="absolute inset-0 grid place-items-center text-center p-6">
          <p className="tag text-bone-3">Screenshot unavailable.</p>
        </div>
      ) : (
        <img src={src} alt={`${viewport} screenshot`} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} draggable={false} />
      )}
      {roasts.map((r, i) =>
        r.box.viewport === viewport ? (
          <button
            key={i}
            type="button"
            className={"hotspot " + SEVERITY_CLASS[r.severity]}
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

import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoadingSteps from "../components/LoadingSteps";
import QuotaBar from "../components/QuotaBar";
import { api, ApiError } from "../lib/api";

const TICKER = ["HIERARCHY", "COPY", "PERFORMANCE", "MOBILE", "ORIGINALITY", "ACCESSIBILITY"];

export default function Home() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = startedAt !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !url.trim()) return;
    setError(null);
    setStartedAt(Date.now());
    try {
      const rec = await api.roast(url.trim());
      navigate(`/r/${rec.id}`, { state: { record: rec } });
    } catch (err) {
      setStartedAt(null);
      if (err instanceof ApiError) {
        if (err.code === "quota_exhausted") setError("Today's roasts are gone. The grill reopens at midnight UTC.");
        else if (err.code === "ip_limit") setError("You have hit your daily limit. Fix something, come back tomorrow.");
        else setError(err.message);
      } else {
        setError("Something exploded. Try again.");
      }
    }
  }

  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 sm:px-8 pt-14 sm:pt-24">
        <p className="tag text-blood mb-6">Brutal. Specific. Free.</p>
        <h1 className="display text-[15vw] sm:text-[9.5rem] xl:text-[12rem] text-bone">
          YOUR
          <br />
          PORTFOLIO
          <br />
          <span className="strike">IS FINE.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg sm:text-xl text-bone-2 leading-snug">
          Paste the URL. A headless browser screenshots it on desktop and mobile, measures what it finds, and a senior design lead (model) tears it apart. Score out of 100, annotated screenshots, a fix for every wound.
        </p>

        {!busy && (
          <form onSubmit={submit} className="mt-14 max-w-4xl">
            <label htmlFor="url" className="tag text-bone-2 block mb-3">
              Portfolio URL
            </label>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-0 border-b-4 border-bone focus-within:border-blood transition-colors">
              <input
                id="url"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                autoFocus
                placeholder="yourname.dev"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="display flex-1 bg-transparent py-4 text-3xl sm:text-6xl outline-none min-w-0 text-bone placeholder:text-bone-3"
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="display shrink-0 bg-blood text-ink px-8 py-4 text-2xl sm:text-4xl hover:bg-bone disabled:opacity-30 disabled:hover:bg-blood transition-colors"
              >
                ROAST IT
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-4 text-sev-high font-semibold">
                {error}
              </p>
            )}
            <div className="mt-10">
              <QuotaBar />
            </div>
          </form>
        )}

        {busy && startedAt !== null && (
          <div>
            <p className="tag text-bone-3 mt-14">
              Roasting <span className="text-bone">{url}</span>
            </p>
            <LoadingSteps startedAt={startedAt} />
          </div>
        )}
      </section>

      <section className="mt-28 border-y border-ink-3 py-4 overflow-hidden">
        <div className="marquee display text-3xl sm:text-5xl text-ink-3 select-none" aria-hidden="true">
          {[...TICKER, ...TICKER, ...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>
              {t}
              <span className="text-blood">.</span>
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 sm:px-8 mt-20 grid gap-y-12 gap-x-16 md:grid-cols-[1fr_2fr]">
        <h2 className="display text-5xl sm:text-6xl">
          HOW IT
          <br />
          HURTS
        </h2>
        <ol className="space-y-8 text-bone-2 max-w-2xl">
          <Step n="01" title="Two screenshots, zero mercy">
            Cloudflare Browser Rendering loads your page at 1440x900 and 390x844 with a 15s timeout. Block headless browsers and you get a 0 for cowardice.
          </Step>
          <Step n="02" title="Facts, not vibes">
            Title, H1, meta description, font families, image and link counts, visible word count, load time, dark-mode toggle, template fingerprints. The model has to cite them.
          </Step>
          <Step n="03" title="Five to seven wounds">
            Each roast is pinned to a region of the screenshot, graded by severity, and ends with a fix. One or two compliments, because we are not monsters.
          </Step>
          <Step n="04" title="Public by default">
            Your score lands on the <Link to="/top" className="underline decoration-blood underline-offset-4 text-bone">leaderboard</Link>. One click removes it. Re-roast after 24h and watch the number climb.
          </Step>
        </ol>
      </section>
    </>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[3rem_1fr] gap-4">
      <span className="tag text-blood pt-1">{n}</span>
      <div>
        <h3 className="display text-2xl text-bone">{title}</h3>
        <p className="mt-2 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

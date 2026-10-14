import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoadingSteps from "../components/LoadingSteps";
import QuotaBar from "../components/QuotaBar";
import { api, ApiError, MODES, type RoastMode } from "../lib/api";
import { stagger } from "../lib/ui";

const JUDGED = ["Hierarchy", "Copy", "Performance", "Mobile", "Originality", "Accessibility"];

export default function Home() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<RoastMode>(() => {
    try {
      return window.localStorage.getItem("roast-mode") === "comedy" ? "comedy" : "brutal";
    } catch {
      return "brutal";
    }
  });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = startedAt !== null;

  // Focus the field on desktop only; on phones it would throw the keyboard up over the hero.
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !url.trim()) return;
    setError(null);
    setStartedAt(Date.now());
    try {
      const rec = await api.roast(url.trim(), mode);
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

  function pickMode(m: RoastMode) {
    setMode(m);
    try {
      window.localStorage.setItem("roast-mode", m);
    } catch {
      // private mode, ignore
    }
  }

  return (
    <>
      <section className="mx-auto max-w-4xl px-4 pt-14 sm:px-8 sm:pt-24">
        <p className="badge reveal bg-sunken text-fg-2">Brutal. Specific. Free.</p>
        <h1 className="display reveal mt-6 text-[clamp(3.25rem,11vw,7.5rem)]" style={stagger(1)}>
          Your portfolio
          <br />
          is <em className="strike pr-1 text-accent">fine.</em>
        </h1>
        <p className="reveal mt-6 max-w-xl text-pretty text-lg text-fg-2 sm:text-xl" style={stagger(2)}>
          Paste the URL. A headless browser screenshots it on desktop and mobile, measures what it finds, and a senior design lead (model) tears it apart. Score out of 100, annotated screenshots, a fix for every wound.
        </p>

        {!busy && (
          <form onSubmit={submit} className="card reveal mt-10 p-4 sm:mt-12 sm:p-6" style={stagger(3)}>
            <label htmlFor="url" className="mb-3 block text-sm font-medium">
              Portfolio URL
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                ref={inputRef}
                id="url"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="yourname.dev"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="min-h-14 min-w-0 flex-1 rounded-xl border border-line-strong bg-canvas px-4 text-lg text-fg outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
              <button type="submit" disabled={!url.trim()} className="btn btn-primary min-h-14 px-7 text-base">
                Roast it
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-sev-high-bg px-4 py-3 text-sm font-medium text-sev-high">
                {error}
              </p>
            )}

            <fieldset className="mt-7">
              <legend className="mb-3 text-sm font-medium">Roast style</legend>
              <div role="radiogroup" aria-label="Roast style" className="grid gap-3 sm:grid-cols-2">
                {MODES.map((m) => {
                  const on = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickMode(m.id)}
                      className={
                        "group flex items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.99] " +
                        (on ? "border-fg bg-sunken" : "border-line hover:border-line-strong")
                      }
                    >
                      <span
                        className={"mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors " + (on ? "border-fg bg-fg" : "border-line-strong")}
                        aria-hidden="true"
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-full bg-canvas" />}
                      </span>
                      <span>
                        <span className="display block text-2xl">{m.label}</span>
                        <span className="mt-0.5 block text-sm text-fg-2">{m.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-7 border-t border-line pt-5">
              <QuotaBar />
            </div>
          </form>
        )}

        {busy && startedAt !== null && (
          <div className="reveal mt-10">
            <p className="text-sm text-fg-2">
              {mode === "comedy" ? "Comedy-roasting" : "Roasting"} <span className="break-all font-medium text-fg">{url}</span>
            </p>
            <LoadingSteps startedAt={startedAt} />
          </div>
        )}

        <div className="reveal mt-8 flex flex-wrap items-center gap-2" style={stagger(4)}>
          <span className="mr-1 text-sm text-fg-3">What gets judged</span>
          {JUDGED.map((t) => (
            <span key={t} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-fg-2">
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-4xl px-4 sm:mt-32 sm:px-8">
        <h2 className="display text-4xl sm:text-6xl">
          How it <em className="text-accent">hurts</em>
        </h2>
        <ol className="mt-10 grid gap-3 sm:gap-4 md:grid-cols-6">
          <Step n="01" title="Two screenshots, zero mercy" span="md:col-span-4" i={0}>
            Cloudflare Browser Rendering loads your page at 1440x900 and 390x844 with a 15s timeout. Block headless browsers and you get a 0 for cowardice.
          </Step>
          <Step n="02" title="Facts, not vibes" span="md:col-span-2" i={1}>
            Title, H1, meta description, font families, image and link counts, visible word count, load time, dark-mode toggle, template fingerprints. The model has to cite them.
          </Step>
          <Step n="03" title="Five to seven wounds" span="md:col-span-2" i={2}>
            Each roast is pinned to a region of the screenshot, graded by severity, and ends with a fix. One or two compliments, because we are not monsters.
          </Step>
          <Step n="04" title="Public by default" span="md:col-span-4" i={3}>
            Your score lands on the{" "}
            <Link to="/top" className="font-medium text-fg underline decoration-accent decoration-2 underline-offset-4">
              leaderboard
            </Link>
            . One click removes it. Re-roast after 24h and watch the number climb.
          </Step>
        </ol>
      </section>
    </>
  );
}

function Step({ n, title, span, i, children }: { n: string; title: string; span: string; i: number; children: ReactNode }) {
  return (
    <li className={"card reveal p-6 sm:p-8 " + span} style={stagger(i + 5)}>
      <span className="meta text-accent">{n}</span>
      <h3 className="display mt-3 text-2xl sm:text-3xl">{title}</h3>
      <p className="mt-3 max-w-prose text-pretty text-fg-2">{children}</p>
    </li>
  );
}

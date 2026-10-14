import { useEffect } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Result from "./pages/Result";
import Top from "./pages/Top";
import ThemeToggle from "./components/ThemeToggle";
import { REPO_URL } from "./lib/api";
import { stagger } from "./lib/ui";

const navLink = ({ isActive }: { isActive: boolean }) =>
  "rounded-lg px-2.5 sm:px-3 py-2 text-sm font-medium transition-colors " + (isActive ? "bg-sunken text-fg" : "text-fg-2 hover:text-fg");

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-canvas">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 select-none" aria-label="Portfolio Roast, home">
            <img src="/favicon.svg" alt="" width="28" height="28" className="h-7 w-7" />
            <span className="display hidden text-2xl leading-none min-[420px]:inline">
              Portfolio <em className="text-accent">Roast</em>
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Main">
            <NavLink to="/" end className={navLink}>
              Roast
            </NavLink>
            <NavLink to="/top" className={navLink}>
              Leaderboard
            </NavLink>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-fg-2 transition-colors hover:text-fg sm:inline">
              Source
            </a>
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:id" element={<Result />} />
          <Route path="/top" element={<Top />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="mt-24 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="max-w-xl text-pretty">Runs on Cloudflare Workers, D1, KV, R2, Browser Rendering and Groq. Free tiers only. Costs the owner $0.</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="meta text-fg-2 transition-colors hover:text-fg">
            github.com/NityaB24/portfolio-roast
          </a>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-8 sm:py-32">
      <p className="badge bg-sunken text-fg-2 reveal">404</p>
      <h1 className="display reveal mt-6 text-[clamp(3.5rem,12vw,8rem)]" style={stagger(1)}>
        Lost, <em className="text-accent">somehow.</em>
      </h1>
      <p className="reveal mt-6 max-w-md text-fg-2" style={stagger(2)}>
        This page does not exist. Unlike your portfolio's hierarchy problems, which very much do.
      </p>
      <Link to="/" className="btn btn-primary reveal mt-8" style={stagger(3)}>
        Back to the grill
      </Link>
    </section>
  );
}

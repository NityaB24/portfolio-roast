import { Link, NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Result from "./pages/Result";
import Top from "./pages/Top";
import { REPO_URL } from "./lib/api";

export default function App() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-ink-3">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8 h-16 flex items-center justify-between gap-6">
          <Link to="/" className="display text-2xl leading-none select-none">
            PORTFOLIO<span className="text-blood">ROAST</span>
          </Link>
          <nav className="flex items-center gap-6 tag">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "text-blood" : "text-bone-2 hover:text-bone")}>
              Roast
            </NavLink>
            <NavLink to="/top" className={({ isActive }) => (isActive ? "text-blood" : "text-bone-2 hover:text-bone")}>
              Leaderboard
            </NavLink>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden sm:inline text-bone-2 hover:text-bone">
              Source
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:id" element={<Result />} />
          <Route path="/top" element={<Top />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="border-t border-ink-3 mt-24">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8 py-8 flex flex-col sm:flex-row gap-3 sm:items-center justify-between tag text-bone-3">
          <p>
            Runs on Cloudflare Workers, D1, KV, R2, Browser Rendering and Groq. Free tiers only. Costs the owner $0.
          </p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-bone">
            github.com/NityaB24/portfolio-roast
          </a>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-8 py-32">
      <p className="tag text-blood mb-6">404</p>
      <h1 className="display text-[14vw] sm:text-[8rem]">LOST.</h1>
      <p className="mt-6 text-bone-2 max-w-md">This page does not exist. Unlike your portfolio's hierarchy problems, which very much do.</p>
      <Link to="/" className="inline-block mt-8 tag text-bone underline underline-offset-4 decoration-blood">
        Back to the grill
      </Link>
    </section>
  );
}

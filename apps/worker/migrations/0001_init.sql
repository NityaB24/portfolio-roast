-- Portfolio Roast: initial schema
CREATE TABLE IF NOT EXISTS roasts (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  normalizedUrl TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  roastsJson TEXT NOT NULL,
  complimentsJson TEXT NOT NULL,
  signalsJson TEXT NOT NULL,
  promptVersion TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  optInLeaderboard INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_roasts_normalizedUrl ON roasts (normalizedUrl);
CREATE INDEX IF NOT EXISTS idx_roasts_score ON roasts (score);
CREATE INDEX IF NOT EXISTS idx_roasts_createdAt ON roasts (createdAt);

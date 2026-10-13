-- Roast mode: "brutal" (senior design lead) or "comedy" (roast-battle headliner).
ALTER TABLE roasts ADD COLUMN mode TEXT NOT NULL DEFAULT 'brutal';
CREATE INDEX IF NOT EXISTS idx_roasts_url_mode ON roasts (normalizedUrl, mode);

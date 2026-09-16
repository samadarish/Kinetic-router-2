/** Additive migration 1. This database belongs exclusively to portal analytics. */
export const ANALYTICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS kr_analytics_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kr_analytics_visitors (
  id uuid PRIMARY KEY, first_seen bigint NOT NULL, current_session uuid
);
CREATE TABLE IF NOT EXISTS kr_analytics_sessions (
  id uuid PRIMARY KEY, visitor_id uuid NOT NULL REFERENCES kr_analytics_visitors(id),
  started_at bigint NOT NULL, last_seen bigint NOT NULL,
  referrer text NOT NULL, source text NOT NULL, medium text NOT NULL, campaign text NOT NULL,
  device text NOT NULL, browser text NOT NULL, os text NOT NULL,
  entry_path text, entry_surface text, entry_at bigint, entry_id uuid,
  exit_path text, exit_surface text, exit_at bigint, exit_id uuid
);
CREATE INDEX IF NOT EXISTS kr_analytics_sessions_visitor ON kr_analytics_sessions(visitor_id, last_seen);
CREATE TABLE IF NOT EXISTS kr_analytics_facts (
  page_id uuid NOT NULL, day date NOT NULL, session_id uuid NOT NULL REFERENCES kr_analytics_sessions(id),
  visitor_id uuid NOT NULL, surface text NOT NULL, path text NOT NULL, at bigint NOT NULL,
  views integer NOT NULL DEFAULT 0 CHECK(views BETWEEN 0 AND 1), engagement_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(page_id, day)
);
CREATE INDEX IF NOT EXISTS kr_analytics_facts_range ON kr_analytics_facts(day, surface, session_id);
CREATE INDEX IF NOT EXISTS kr_analytics_facts_session ON kr_analytics_facts(session_id);
CREATE TABLE IF NOT EXISTS kr_analytics_actions (
  id uuid PRIMARY KEY, day date NOT NULL, session_id uuid NOT NULL REFERENCES kr_analytics_sessions(id),
  visitor_id uuid NOT NULL, surface text NOT NULL, path text NOT NULL, name text NOT NULL, at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS kr_analytics_actions_range ON kr_analytics_actions(day, surface);
CREATE INDEX IF NOT EXISTS kr_analytics_actions_funnel ON kr_analytics_actions(session_id, name, at);
CREATE TABLE IF NOT EXISTS kr_analytics_vitals (
  page_id uuid NOT NULL, metric_id text NOT NULL, metric text NOT NULL, day date NOT NULL,
  session_id uuid NOT NULL REFERENCES kr_analytics_sessions(id), visitor_id uuid NOT NULL,
  surface text NOT NULL, path text NOT NULL, at bigint NOT NULL, value double precision NOT NULL,
  PRIMARY KEY(page_id, metric, metric_id)
);
CREATE INDEX IF NOT EXISTS kr_analytics_vitals_range ON kr_analytics_vitals(day, surface, path, metric);
CREATE TABLE IF NOT EXISTS kr_analytics_events (
  day date NOT NULL, id uuid NOT NULL, at bigint NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(day, id)
) PARTITION BY RANGE(day);
INSERT INTO kr_analytics_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS kr_analytics_customer_hours (
  day date NOT NULL, hour smallint NOT NULL CHECK(hour BETWEEN 0 AND 23), user_id text NOT NULL,
  first_seen bigint NOT NULL, last_seen bigint NOT NULL, PRIMARY KEY(day,hour,user_id)
);
CREATE TABLE IF NOT EXISTS kr_analytics_customer_coverage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), started_at bigint NOT NULL
);
INSERT INTO kr_analytics_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
`;

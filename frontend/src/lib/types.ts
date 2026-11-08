export type Color = "gray" | "blue" | "green" | "amber" | "red" | "purple" | "pink" | "teal";

export type User = {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "rejected" | "disabled";
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type AdminUser = User & { note: string | null; approved_at: string | null; workspaces: number };

export type WorkspaceBrief = { id: string; slug: string; name: string; role: string };

export type Me = { user: User; workspaces: WorkspaceBrief[]; pending_users: number };

export type Workspace = { id: string; slug: string; name: string; created_at: string; role: string | null };

export type Project = { id: string; name: string; description: string | null; color: Color; created_at: string };

export type Tag = { id: string; name: string; color: Color };

export type Ref = { id: string; name: string; color: Color };

export type MonitorType = "http" | "tcp" | "push";
export type MonitorStatus = "pending" | "up" | "down" | "paused";

export type Bar = { t: string; total: number; up: number };

export type Monitor = {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  project: Ref | null;
  tags: Ref[];
  url: string | null;
  method: string;
  expected_status: string;
  keyword: string | null;
  keyword_invert: boolean;
  headers: Record<string, string>;
  follow_redirects: boolean;
  verify_ssl: boolean;
  host: string | null;
  port: number | null;
  push_token: string | null;
  interval: number;
  timeout: number;
  confirmations: number;
  notify: boolean;
  paused: boolean;
  status: MonitorStatus;
  fail_streak: number;
  fail_since: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_change_at: string | null;
  last_latency_ms: number | null;
  last_status_code: number | null;
  last_error: string | null;
  ssl_expires_at: string | null;
  ssl_issuer: string | null;
  created_at: string;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  avg_latency_24h: number | null;
  bars: Bar[];
};

export type MonitorBrief = {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  status: MonitorStatus;
  project: Ref | null;
};

export type Incident = {
  id: string;
  monitor: MonitorBrief;
  started_at: string;
  resolved_at: string | null;
  cause: string | null;
  duration_seconds: number;
};

export type Summary = {
  counts: Record<MonitorStatus, number>;
  total: number;
  uptime_24h: number | null;
  uptime_30d: number | null;
  avg_latency_24h: number | null;
  incidents_30d: number;
  open_incidents: Incident[];
  recent_incidents: Incident[];
  ssl_expiring: (MonitorBrief & { ssl_expires_at: string })[];
};

export type SeriesPoint = { t: string; total: number; up: number; avg: number | null; max: number | null };

export type Series = {
  range: "24h" | "7d" | "30d" | "90d";
  bucket_seconds: number;
  uptime: number | null;
  avg_latency: number | null;
  max_latency: number | null;
  checks: number;
  points: SeriesPoint[];
};

export type DailyPoint = { date: string; total: number; up: number };

export type CheckRow = {
  id: number;
  checked_at: string;
  ok: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
};

export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write";
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

export type ChannelType = "telegram" | "discord" | "slack" | "webhook";

export type Channel = {
  id: string;
  name: string;
  type: ChannelType;
  config: Record<string, string>;
  enabled: boolean;
  created_at: string;
  last_error: string | null;
  last_sent_at: string | null;
};

export type SessionInfo = {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};

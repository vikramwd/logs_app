import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

interface IndexPatternSetting {
  pattern: string;
  timeField: string;
  searchFields: string[];
  searchMode?: 'relevant' | 'exact' | '';
}

interface AdminConfig {
  opensearchHost: string;
  opensearchPort: string;
  opensearchScheme: string;
  opensearchBasePath: string;
  opensearchUsername: string;
  opensearchPassword: string;
  opensearchInsecureSSL: boolean;
  opensearchConnections: OpensearchConnection[];
  opensearchDashboardsUrl: string;
  importEnabled: boolean;
  importUiVisible?: boolean;
  importMaxFileBytes?: number;
  importBatchSizeBytes?: number;
  defaultIndexPattern: string;
  indexOptions: string[];
  indexPatternSettings: IndexPatternSetting[];
  fieldExplorerFields: string[];
  fieldExplorerTopN: number;
  timeZone: string;
  maxExportSize: number;
  darkModeDefault: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  alertEmailTo: string;
  alertEmailFrom: string;
  brandName: string;
  brandLogoDataUrl: string;
  brandLogoSizeUser: 'sm' | 'md' | 'lg';
  brandLogoSizeAdmin: 'sm' | 'md' | 'lg';
  motdEnabled?: boolean;
  motdMessage?: string;
  teamIndexAccess: Record<string, string[]>;
  userIndexAccess: Record<string, string[]>;
  piiFieldRules: { pattern: string; action: 'hide' | 'mask' | 'partial' }[];
  highlightRules: { field: string; pattern: string; color: string; match?: 'contains' | 'equals' }[];
  customUrls: { id: string; name: string; url: string }[];
}

interface OpensearchConnection {
  id: string;
  host: string;
  port: string;
  scheme: string;
  basePath: string;
  username: string;
  password: string;
  insecureSSL: boolean;
}

interface MetricsSnapshot {
  date: string;
  searchesToday: number;
  topQueries: { query: string; count: number }[];
  activeUsers: number;
  activeUserIps: string[];
  exportsToday: number;
  exportByFormat: Record<string, number>;
}

interface WeeklyUsageResponse {
  days: { date: string; searches: number; exports: number; total: number; percent: number }[];
}

interface DailyTopUsersResponse {
  users: { user: string; count: number; percent: number }[];
}

interface HourlyUsageResponse {
  hours: { hour: string; total: number; percent: number }[];
}

interface StorageUsage {
  totalBytes: number;
  files: { file: string; bytes: number }[];
}

interface Rule {
  id: string;
  name: string;
  query: string;
  threshold: number;
  windowMinutes: number;
  team?: string;
  email?: string;
}

interface TeamBookmark {
  id: string;
  name: string;
  query: string;
  team?: string;
  createdAt?: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
}

interface ActivityEntry {
  time: string;
  type: string;
  query?: string;
  format?: string;
  size?: number;
  indexPattern?: string;
  user?: string;
  ip?: string;
  message?: string;
}

type NoticeType = 'success' | 'error' | 'info';

interface AnomalyHint {
  type: string;
  current: number;
  baseline: number;
}

interface AnomalyResponse {
  hour: string;
  hints: AnomalyHint[];
}

interface IndexStatsEntry {
  index: string;
  health: string;
  status: string;
  pri: number;
  rep: number;
  docsCount: number;
  storeBytes: number;
}

interface IndexStatsResponse {
  cached: boolean;
  fetchedAt: string;
  summary: {
    totalIndices: number;
    totalDocs: number;
    totalStoreBytes: number;
  };
  indices: IndexStatsEntry[];
}

interface HealthTrendResponse {
  hours: { hour: string; status: string }[];
}

interface Diagnostics {
  time: string;
  proxyUptimeSeconds: number;
  appVersion?: string;
  opensearch: {
    reachable: boolean;
    status: string | null;
    info: any;
    error?: string;
  };
}

interface RotateResponse {
  rotated: boolean;
  reason?: string;
  path?: string;
}

interface RestartResponse {
  ok: boolean;
  message?: string;
  output?: string;
  error?: string;
  detail?: string;
}

const emptyConfig: AdminConfig = {
  opensearchHost: '',
  opensearchPort: '',
  opensearchScheme: 'http',
  opensearchBasePath: '',
  opensearchUsername: '',
  opensearchPassword: '',
  opensearchInsecureSSL: false,
  opensearchConnections: [],
  opensearchDashboardsUrl: '',
  importEnabled: false,
  importUiVisible: true,
  importMaxFileBytes: 100 * 1024 * 1024,
  importBatchSizeBytes: 10 * 1024 * 1024,
  defaultIndexPattern: '',
  indexOptions: [],
  indexPatternSettings: [],
  fieldExplorerFields: [],
  fieldExplorerTopN: 10,
  timeZone: '',
  maxExportSize: 100000,
  darkModeDefault: false,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  alertEmailTo: '',
  alertEmailFrom: '',
  brandName: 'WDTS Logging Solution',
  brandLogoDataUrl: '',
  brandLogoSizeUser: 'md',
  brandLogoSizeAdmin: 'md',
  motdEnabled: false,
  motdMessage: '',
  teamIndexAccess: {},
  userIndexAccess: {},
  piiFieldRules: [],
  highlightRules: [],
  customUrls: []
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(1)} ${units[idx]}`;
}

const createClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const buildOpensearchLabel = (conn: OpensearchConnection) => {
  const basePath = conn.basePath ? conn.basePath : '';
  return `${conn.scheme}://${conn.host}:${conn.port}${basePath}`;
};

  const buildOpensearchKey = (conn: OpensearchConnection) =>
    `${conn.scheme}://${conn.host}:${conn.port}${conn.basePath || ''}|${conn.username || ''}|${conn.insecureSSL ? '1' : '0'}`;

const buildOpensearchUrl = (conn: {
  host: string;
  port: string;
  scheme: string;
  basePath: string;
}) => {
  const base = conn.basePath ? conn.basePath : '';
  return `${conn.scheme}://${conn.host}:${conn.port}${base}`;
};

function AdminApp() {
  const adminTtlMinutes = Number(import.meta.env.VITE_ADMIN_SESSION_TTL_MINUTES || 5);
  const ADMIN_SESSION_TTL_MS = (Number.isFinite(adminTtlMinutes) && adminTtlMinutes > 0 ? adminTtlMinutes : 5) * 60 * 1000;
  const isStorageSessionValid = (storage: Storage) => {
    const header = storage.getItem('adminAuth');
    const ts = Number(storage.getItem('adminAuthAt') || 0);
    return Boolean(header && ts && Date.now() - ts <= ADMIN_SESSION_TTL_MS);
  };
  const clearStorageSession = (storage: Storage) => {
    storage.removeItem('adminAuth');
    storage.removeItem('adminUser');
    storage.removeItem('adminAuthAt');
  };
  const getStoredAdminAuth = () => {
    if (isStorageSessionValid(sessionStorage)) {
      return sessionStorage.getItem('adminAuth') || '';
    }
    clearStorageSession(sessionStorage);
    if (isStorageSessionValid(localStorage)) {
      return localStorage.getItem('adminAuth') || '';
    }
    clearStorageSession(localStorage);
    return '';
  };
  const isAdminSessionValid = () => {
    return isStorageSessionValid(sessionStorage) || isStorageSessionValid(localStorage);
  };
  const touchAdminSession = () => {
    const storage = sessionStorage.getItem('adminAuth')
      ? sessionStorage
      : (localStorage.getItem('adminAuth') ? localStorage : sessionStorage);
    const ts = String(Date.now());
    storage.setItem('adminAuthAt', ts);
  };

  const [authHeader, setAuthHeader] = useState<string>(() => getStoredAdminAuth());
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getStoredAdminAuth()));
  const [adminUser, setAdminUser] = useState<string>(() => sessionStorage.getItem('adminUser') || localStorage.getItem('adminUser') || '');
  const [clientIp, setClientIp] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rememberAdmin, setRememberAdmin] = useState(() => localStorage.getItem('rememberMeAdmin') !== 'false');
  const [config, setConfig] = useState<AdminConfig>(emptyConfig);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [teamBookmarks, setTeamBookmarks] = useState<TeamBookmark[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamQuery, setNewTeamQuery] = useState('');
  const [newTeamNameSpace, setNewTeamNameSpace] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [newAdminTeamName, setNewAdminTeamName] = useState('');
  const [newAdminTeamDesc, setNewAdminTeamDesc] = useState('');
  const [restartBusy, setRestartBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyResponse | null>(null);
  const [indexStats, setIndexStats] = useState<IndexStatsResponse | null>(null);
  const [indexStatsLoading, setIndexStatsLoading] = useState(false);
  const [indexSearchText, setIndexSearchText] = useState('');
  const [indexSearch, setIndexSearch] = useState('');
  const [healthTrend, setHealthTrend] = useState<HealthTrendResponse | null>(null);
  const [weeklyUsage, setWeeklyUsage] = useState<WeeklyUsageResponse | null>(null);
  const [dailyTopUsers, setDailyTopUsers] = useState<DailyTopUsersResponse | null>(null);
  const [hourlyUsage, setHourlyUsage] = useState<HourlyUsageResponse | null>(null);
  const [indexOptionsText, setIndexOptionsText] = useState('');
  const [indexPatternSettings, setIndexPatternSettings] = useState<IndexPatternSetting[]>([]);
  const [timeFieldOptions, setTimeFieldOptions] = useState<Record<string, string[]>>({});
  const [discoverySelections, setDiscoverySelections] = useState<Record<string, { enabled: boolean; alias: string }>>({});
  const [fieldExplorerText, setFieldExplorerText] = useState('');
  const [teamIndexAccessText, setTeamIndexAccessText] = useState('');
  const [userIndexAccessText, setUserIndexAccessText] = useState('');
  const [piiRulesText, setPiiRulesText] = useState('');
  const [highlightRulesText, setHighlightRulesText] = useState('');
  const [usersList, setUsersList] = useState<{ id: string; username: string; role: string; teams: string[]; email?: string; createdAt?: string; lastLoginAt?: string; online?: boolean }[]>([]);
  const [userTeamsDraft, setUserTeamsDraft] = useState<Record<string, string>>({});
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState('viewer');
  const [newUserTeams, setNewUserTeams] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [featureToggles, setFeatureToggles] = useState<Record<string, { exports: boolean; bookmarks: boolean; rules: boolean; queryBuilder: boolean; limitTo7Days: boolean; piiUnmasked: boolean; showFullResults: boolean }>>({});
  const [connectionStatus, setConnectionStatus] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importIndex, setImportIndex] = useState('');
  const [importParser, setImportParser] = useState<'ndjson' | 'regex'>('ndjson');
  const [importTimestampField, setImportTimestampField] = useState('@timestamp');
  const [importTimestampFormat, setImportTimestampFormat] = useState('');
  const [importRegex, setImportRegex] = useState('');
  const [importPreview, setImportPreview] = useState<{ samples: Record<string, any>[]; errors: number; skipped?: number; totalChecked: number } | null>(null);
  const [importJobId, setImportJobId] = useState('');
  const [importStatus, setImportStatus] = useState<any>(null);
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState('');
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [publicLogoDataUrl, setPublicLogoDataUrl] = useState('');
  const [publicLogoSizeUser, setPublicLogoSizeUser] = useState<'sm' | 'md' | 'lg'>('md');
  const [publicLogoSizeAdmin, setPublicLogoSizeAdmin] = useState<'sm' | 'md' | 'lg'>('md');
  const [adminDarkMode, setAdminDarkMode] = useState(() => {
    const saved = localStorage.getItem('adminDarkMode');
    return saved === null ? true : saved === 'true';
  });
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [serverTime, setServerTime] = useState('');
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [showUserManagement, setShowUserManagement] = useState(() => {
    const saved = localStorage.getItem('adminShowUsers');
    return saved === 'true';
  });
  const [showTeams, setShowTeams] = useState(() => {
    const saved = localStorage.getItem('adminShowTeams');
    return saved === 'true';
  });
  const [showIndexManagement, setShowIndexManagement] = useState(() => {
    const saved = localStorage.getItem('adminShowIndexManagement');
    return saved === 'true';
  });
  const [showAppConfig, setShowAppConfig] = useState(() => {
    const saved = localStorage.getItem('adminShowAppConfig');
    return saved === 'true';
  });
  const [showTeamBookmarks, setShowTeamBookmarks] = useState(() => {
    const saved = localStorage.getItem('adminShowTeamBookmarks');
    return saved === 'true';
  });
  const [showMaintenance, setShowMaintenance] = useState(() => {
    const saved = localStorage.getItem('adminShowMaintenance');
    return saved === 'true';
  });
  const [showBranding, setShowBranding] = useState(() => {
    const saved = localStorage.getItem('adminShowBranding');
    return saved === 'true';
  });
  const [showHealth, setShowHealth] = useState(() => {
    const saved = localStorage.getItem('adminShowHealth');
    return saved === 'true';
  });
  const [showEmailAlerts, setShowEmailAlerts] = useState(() => {
    const saved = localStorage.getItem('adminShowEmailAlerts');
    return saved === 'true';
  });
  const [showOpenSearch, setShowOpenSearch] = useState(() => {
    const saved = localStorage.getItem('adminShowOpenSearch');
    return saved === 'true';
  });
  const [showImport, setShowImport] = useState(() => {
    const saved = localStorage.getItem('adminShowImport');
    return saved === 'true';
  });
  const [showMotd, setShowMotd] = useState(() => {
    const saved = localStorage.getItem('adminShowMotd');
    return saved === 'true';
  });
  const [showCustomUrls, setShowCustomUrls] = useState(false);
  const [showAlertRules, setShowAlertRules] = useState(() => {
    const saved = localStorage.getItem('adminShowAlertRules');
    return saved === 'true';
  });
  const [showFeatureToggles, setShowFeatureToggles] = useState(() => {
    const saved = localStorage.getItem('adminShowToggles');
    return saved === 'true';
  });
  const teamList = useMemo(() => {
    const teamSet = new Set<string>();
    teams.forEach((t) => teamSet.add(t.name));
    usersList.forEach((u) => u.teams.forEach((t) => teamSet.add(t)));
    Object.keys(featureToggles).forEach((t) => teamSet.add(t));
    return Array.from(teamSet);
  }, [featureToggles, usersList, teams]);

  useEffect(() => {
    setUserTeamsDraft((prev) => {
      const next: Record<string, string> = {};
      usersList.forEach((u) => {
        next[u.id] = prev[u.id] ?? u.teams.join(', ');
      });
      return next;
    });
  }, [usersList]);

  useEffect(() => {
    setShowUserManagement(false);
    setShowTeams(false);
    setShowIndexManagement(false);
    setShowAppConfig(false);
    setShowTeamBookmarks(false);
    setShowMaintenance(false);
    setShowBranding(false);
    setShowHealth(false);
    setShowEmailAlerts(false);
    setShowOpenSearch(false);
    setShowImport(false);
    setShowMotd(false);
    setShowCustomUrls(false);
    setShowAlertRules(false);
    setShowFeatureToggles(false);
    localStorage.setItem('adminShowUsers', 'false');
    localStorage.setItem('adminShowTeams', 'false');
    localStorage.setItem('adminShowIndexManagement', 'false');
    localStorage.setItem('adminShowAppConfig', 'false');
    localStorage.setItem('adminShowTeamBookmarks', 'false');
    localStorage.setItem('adminShowMaintenance', 'false');
    localStorage.setItem('adminShowBranding', 'false');
    localStorage.setItem('adminShowHealth', 'false');
    localStorage.setItem('adminShowEmailAlerts', 'false');
    localStorage.setItem('adminShowOpenSearch', 'false');
    localStorage.setItem('adminShowImport', 'false');
    localStorage.setItem('adminShowMotd', 'false');
    localStorage.setItem('adminShowAlertRules', 'false');
    localStorage.setItem('adminShowToggles', 'false');
  }, []);

  const adminHeaders = useMemo(() => {
    return authHeader ? { Authorization: authHeader } : {};
  }, [authHeader]);

  const getAdminUserFromHeader = (headerValue: string) => {
    if (!headerValue.startsWith('Basic ')) return '';
    try {
      const decoded = atob(headerValue.slice(6));
      return decoded.split(':')[0] || '';
    } catch {
      return '';
    }
  };

  const clearAdminSession = () => {
    setAuthed(false);
    setAuthHeader('');
    setAdminUser('');
    clearStorageSession(sessionStorage);
    clearStorageSession(localStorage);
  };

  const adminRequest = async <T,>(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: any) => {
    if (!isAdminSessionValid()) {
      clearAdminSession();
      throw new Error('Admin session expired.');
    }
    touchAdminSession();
    const headers = { ...adminHeaders, 'Cache-Control': 'no-cache', Pragma: 'no-cache' };
    const params = method === 'get' ? { _ts: Date.now() } : undefined;
    return axios.request<T>({ method, url, data, headers, params });
  };

  const showNotice = (message: string, type: NoticeType = 'info') => {
    setNotice({ type, message });
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);


  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    const maxBytes = 512 * 1024;
    if (file.size > maxBytes) {
      showNotice('Logo is too large. Please upload an image under 512KB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setConfig((prev) => ({ ...prev, brandLogoDataUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const getHealthBadge = () => {
    if (!diagnostics) {
      return { label: 'Unknown', color: 'bg-gray-200 text-gray-700', tip: 'Run the connection test.' };
    }
    if (!diagnostics.opensearch.reachable) {
      return { label: 'Offline', color: 'bg-red-100 text-red-700', tip: 'Check OpenSearch host/port in App Configuration.' };
    }
    const status = diagnostics.opensearch.status || 'unknown';
    if (status === 'green') {
      return { label: 'Healthy', color: 'bg-green-100 text-green-700', tip: 'Connection looks good.' };
    }
    if (status === 'yellow') {
      return { label: 'Warning', color: 'bg-yellow-100 text-yellow-800', tip: 'Some shards unassigned; check cluster health.' };
    }
    if (status === 'red') {
      return { label: 'Critical', color: 'bg-red-100 text-red-700', tip: 'Cluster unhealthy; investigate OpenSearch.' };
    }
    return { label: 'Unknown', color: 'bg-gray-200 text-gray-700', tip: 'Status not reported; retry the test.' };
  };

  const getLogoSizeClass = (size: 'sm' | 'md' | 'lg') => {
    if (size === 'sm') return 'h-12 w-12';
    if (size === 'lg') return 'h-20 w-20';
    return 'h-16 w-16';
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfg, met, stor, rulesRes, diags, bookmarks, toggles, teamRes, anomalyRes, activityRes, healthRes, weeklyRes, usersUsageRes, hourlyRes] = await Promise.all([
        adminRequest<AdminConfig>('get', '/api/admin/config'),
        adminRequest<MetricsSnapshot>('get', '/api/admin/metrics'),
        adminRequest<StorageUsage>('get', '/api/admin/storage'),
        adminRequest<Rule[]>('get', '/api/admin/rules'),
        adminRequest<Diagnostics>('get', '/api/admin/diagnostics'),
        adminRequest<TeamBookmark[]>('get', '/api/admin/team-bookmarks'),
        adminRequest<{ teams: Record<string, { exports: boolean; bookmarks: boolean; rules: boolean; queryBuilder: boolean; limitTo7Days: boolean; piiUnmasked: boolean; showFullResults: boolean }> }>('get', '/api/admin/feature-toggles'),
        adminRequest<Team[]>('get', '/api/admin/teams'),
        adminRequest<AnomalyResponse>('get', '/api/admin/anomalies'),
        adminRequest<ActivityEntry[]>('get', '/api/admin/activity'),
        adminRequest<HealthTrendResponse>('get', '/api/admin/health-trend'),
        adminRequest<WeeklyUsageResponse>('get', '/api/admin/metrics-weekly'),
        adminRequest<DailyTopUsersResponse>('get', '/api/admin/metrics-users-daily'),
        adminRequest<HourlyUsageResponse>('get', '/api/admin/metrics-hourly')
      ]);
      const usersRes = await adminRequest<{ id: string; username: string; role: string; teams: string[]; createdAt?: string; lastLoginAt?: string }[]>('get', '/api/admin/users');
      setConfig(cfg.data);
      setIndexOptionsText((cfg.data.indexOptions || []).join('\n'));
      setIndexPatternSettings(cfg.data.indexPatternSettings || []);
      setFieldExplorerText((cfg.data.fieldExplorerFields || []).join('\n'));
      setTeamIndexAccessText(
        Object.entries(cfg.data.teamIndexAccess || {})
          .map(([team, patterns]) => `${team}=${(patterns || []).join(',')}`)
          .join('\n')
      );
      setUserIndexAccessText(
        Object.entries(cfg.data.userIndexAccess || {})
          .map(([user, patterns]) => `${user}=${(patterns || []).join(',')}`)
          .join('\n')
      );
      setPiiRulesText(
        (cfg.data.piiFieldRules || [])
          .map((rule) => `${rule.pattern}=${rule.action || 'mask'}`)
          .join('\n')
      );
      setHighlightRulesText(
        (cfg.data.highlightRules || [])
          .map((rule) => `${rule.field}|${rule.match || 'contains'}|${rule.pattern}|${rule.color}`)
          .join('\n')
      );
      setMetrics(met.data);
      setStorage(stor.data);
      setRules(rulesRes.data);
      setDiagnostics(diags.data);
      setTeamBookmarks(bookmarks.data);
      setFeatureToggles(toggles.data.teams || {});
      setTeams(teamRes.data || []);
      setAnomalies(anomalyRes.data || null);
      setActivity(activityRes.data || []);
      setHealthTrend(healthRes.data || null);
      setWeeklyUsage(weeklyRes.data || null);
      setDailyTopUsers(usersUsageRes.data || null);
      setHourlyUsage(hourlyRes.data || null);
      setUsersList(usersRes.data);
      if (diags.data?.opensearch?.reachable) {
        setConnectionStatus('Connection OK');
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        clearAdminSession();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) {
      loadAll();
    }
  }, [authed]);

  useEffect(() => {
    let alive = true;
    axios.get('/api/ip').then((res) => {
      if (!alive) return;
      setClientIp(res.data?.ip || '');
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!authed || !config.importEnabled) return;
    fetchImportHistory();
  }, [authed, config.importEnabled]);

  useEffect(() => {
    if (!importIndex && config.defaultIndexPattern) {
      setImportIndex(config.defaultIndexPattern);
    }
  }, [importIndex, config.defaultIndexPattern]);

  useEffect(() => {
    if (!importJobId) return;
    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      const status = await fetchImportStatus(importJobId);
      if (status && (status.status === 'completed' || status.status === 'failed')) {
        clearInterval(interval);
        setImportJobId('');
        fetchImportHistory();
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [importJobId]);

  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(() => {
      if (!isAdminSessionValid()) {
        clearAdminSession();
      }
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [authed]);

  useEffect(() => {
    const connections = config.opensearchConnections || [];
    if (!connections.length) {
      setSelectedConnectionId('');
      return;
    }
    const currentKey = buildOpensearchKey({
      id: '',
      host: config.opensearchHost,
      port: config.opensearchPort,
      scheme: config.opensearchScheme,
      basePath: config.opensearchBasePath,
      username: config.opensearchUsername,
      password: config.opensearchPassword,
      insecureSSL: config.opensearchInsecureSSL
    });
    const match = connections.find((conn) => buildOpensearchKey(conn) === currentKey);
    setSelectedConnectionId(match ? match.id : '');
  }, [
    config.opensearchConnections,
    config.opensearchHost,
    config.opensearchPort,
    config.opensearchScheme,
    config.opensearchBasePath,
    config.opensearchUsername,
    config.opensearchPassword,
    config.opensearchInsecureSSL
  ]);

  useEffect(() => {
    if (adminUser || !authHeader) return;
    const parsed = getAdminUserFromHeader(authHeader);
    if (parsed) {
      setAdminUser(parsed);
      sessionStorage.setItem('adminUser', parsed);
    }
  }, [adminUser, authHeader]);

  useEffect(() => {
    if (adminDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('adminDarkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('adminDarkMode', 'false');
    }
  }, [adminDarkMode]);

  useEffect(() => {
    const loadPublicBranding = async () => {
      try {
        const res = await axios.get<{ brandLogoDataUrl?: string; brandLogoSizeUser?: 'sm' | 'md' | 'lg'; brandLogoSizeAdmin?: 'sm' | 'md' | 'lg' }>('/api/config');
        const nextLogo = res.data?.brandLogoDataUrl || '';
        const nextSizeUser = res.data?.brandLogoSizeUser === 'sm' || res.data?.brandLogoSizeUser === 'lg' ? res.data.brandLogoSizeUser : 'md';
        const nextSizeAdmin = res.data?.brandLogoSizeAdmin === 'sm' || res.data?.brandLogoSizeAdmin === 'lg' ? res.data.brandLogoSizeAdmin : 'md';
        setPublicLogoDataUrl(nextLogo);
        setPublicLogoSizeUser(nextSizeUser);
        setPublicLogoSizeAdmin(nextSizeAdmin);
        if (nextLogo) localStorage.setItem('brandLogoDataUrl', nextLogo);
        localStorage.setItem('brandLogoSizeUser', nextSizeUser);
        localStorage.setItem('brandLogoSizeAdmin', nextSizeAdmin);
      } catch {
        setPublicLogoDataUrl(localStorage.getItem('brandLogoDataUrl') || '');
        const cachedUser = localStorage.getItem('brandLogoSizeUser');
        const cachedAdmin = localStorage.getItem('brandLogoSizeAdmin');
        setPublicLogoSizeUser(cachedUser === 'sm' || cachedUser === 'lg' ? cachedUser : 'md');
        setPublicLogoSizeAdmin(cachedAdmin === 'sm' || cachedAdmin === 'lg' ? cachedAdmin : 'md');
      }
    };
    loadPublicBranding();
  }, []);

  useEffect(() => {
    localStorage.setItem('adminShowUsers', showUserManagement ? 'true' : 'false');
  }, [showUserManagement]);

  useEffect(() => {
    localStorage.setItem('adminShowTeams', showTeams ? 'true' : 'false');
  }, [showTeams]);

  useEffect(() => {
    localStorage.setItem('adminShowIndexManagement', showIndexManagement ? 'true' : 'false');
  }, [showIndexManagement]);

  useEffect(() => {
    localStorage.setItem('adminShowAppConfig', showAppConfig ? 'true' : 'false');
  }, [showAppConfig]);

  useEffect(() => {
    localStorage.setItem('adminShowTeamBookmarks', showTeamBookmarks ? 'true' : 'false');
  }, [showTeamBookmarks]);

  useEffect(() => {
    localStorage.setItem('adminShowMaintenance', showMaintenance ? 'true' : 'false');
  }, [showMaintenance]);

  useEffect(() => {
    localStorage.setItem('adminShowBranding', showBranding ? 'true' : 'false');
  }, [showBranding]);

  useEffect(() => {
    localStorage.setItem('adminShowHealth', showHealth ? 'true' : 'false');
  }, [showHealth]);

  useEffect(() => {
    localStorage.setItem('adminShowEmailAlerts', showEmailAlerts ? 'true' : 'false');
  }, [showEmailAlerts]);

  useEffect(() => {
    localStorage.setItem('adminShowOpenSearch', showOpenSearch ? 'true' : 'false');
  }, [showOpenSearch]);

  useEffect(() => {
    localStorage.setItem('adminShowImport', showImport ? 'true' : 'false');
  }, [showImport]);
  useEffect(() => {
    localStorage.setItem('adminShowMotd', showMotd ? 'true' : 'false');
  }, [showMotd]);


  useEffect(() => {
    localStorage.setItem('adminShowAlertRules', showAlertRules ? 'true' : 'false');
  }, [showAlertRules]);

  useEffect(() => {
    localStorage.setItem('adminShowToggles', showFeatureToggles ? 'true' : 'false');
  }, [showFeatureToggles]);


  useEffect(() => {
    if (!authed) return;
    const loadServerTime = async () => {
      try {
        const response = await adminRequest<{ serverTime: string }>('get', '/api/time');
        const server = new Date(response.data.serverTime).getTime();
        if (!Number.isNaN(server)) {
          setTimeOffsetMs(server - Date.now());
        }
      } catch {
        setTimeOffsetMs(0);
      }
    };
    loadServerTime();
    const syncTimer = setInterval(loadServerTime, 5 * 60 * 1000);
    return () => clearInterval(syncTimer);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(() => {
      const now = new Date(Date.now() + timeOffsetMs);
      setServerTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffsetMs, authed]);

  const parseIndexOptionLine = (line: string) => {
    const [valueRaw, labelRaw] = line.split('|');
    const value = (valueRaw || '').trim();
    const label = (labelRaw || '').trim();
    return { value, label };
  };

  const getIndexLabel = (pattern: string) => {
    const selection = discoverySelections[pattern];
    if (selection?.alias) return selection.alias;
    return pattern;
  };

  useEffect(() => {
    const lines = indexOptionsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const nextSelections: Record<string, { enabled: boolean; alias: string }> = {};
    for (const line of lines) {
      const { value, label } = parseIndexOptionLine(line);
      if (!value) continue;
      nextSelections[value] = { enabled: true, alias: label || '' };
    }
    setDiscoverySelections(nextSelections);
  }, [indexOptionsText]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const header = `Basic ${btoa(`${loginUser}:${loginPass}`)}`;
    try {
      await axios.get('/api/admin/ping', { headers: { Authorization: header } });
      setAuthHeader(header);
      const storage = rememberAdmin ? localStorage : sessionStorage;
      const otherStorage = rememberAdmin ? sessionStorage : localStorage;
      storage.setItem('adminAuth', header);
      storage.setItem('adminAuthAt', String(Date.now()));
      otherStorage.removeItem('adminAuth');
      otherStorage.removeItem('adminAuthAt');
      otherStorage.removeItem('adminUser');
      localStorage.setItem('rememberMeAdmin', rememberAdmin ? 'true' : 'false');
      const displayUser = loginUser.trim();
      if (displayUser) {
        setAdminUser(displayUser);
        storage.setItem('adminUser', displayUser);
      }
      touchAdminSession();
      setAuthed(true);
      setLoginPass('');
    } catch {
      setLoginError('Invalid credentials.');
    }
  };

  const handleLogout = () => {
    clearAdminSession();
  };

  const updateIndexPatternSetting = (index: number, patch: Partial<IndexPatternSetting>) => {
    setIndexPatternSettings((current) => current.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)));
  };

  const addIndexPatternSetting = () => {
    setIndexPatternSettings((current) => [...current, { pattern: '', timeField: '', searchFields: [], searchMode: '' }]);
  };

  const removeIndexPatternSetting = (index: number) => {
    setIndexPatternSettings((current) => current.filter((_, idx) => idx !== index));
  };

  const fetchTimeFieldOptions = async (pattern: string) => {
    if (!pattern || timeFieldOptions[pattern]) return;
    try {
      const res = await adminRequest<{ fields: string[] }>('get', `/api/admin/time-fields?indexPattern=${encodeURIComponent(pattern)}`);
      setTimeFieldOptions((current) => ({ ...current, [pattern]: res.data?.fields || [] }));
    } catch {
      setTimeFieldOptions((current) => ({ ...current, [pattern]: [] }));
    }
  };

  useEffect(() => {
    const patterns = Array.from(new Set(indexPatternSettings.map((entry) => entry.pattern).filter(Boolean)));
    patterns.forEach((pattern) => {
      fetchTimeFieldOptions(pattern);
    });
  }, [indexPatternSettings]);

  const saveConfig = async () => {
    const indexOptions = indexOptionsText
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const fieldExplorerFields = fieldExplorerText
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const teamIndexAccess = teamIndexAccessText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .reduce((acc, line) => {
        const [teamRaw, patternsRaw] = line.split('=');
        const team = (teamRaw || '').trim();
        const patterns = (patternsRaw || '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        if (team && patterns.length > 0) acc[team] = patterns;
        return acc;
      }, {} as Record<string, string[]>);
    const userIndexAccess = userIndexAccessText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .reduce((acc, line) => {
        const [userRaw, patternsRaw] = line.split('=');
        const user = (userRaw || '').trim();
        const patterns = (patternsRaw || '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        if (user && patterns.length > 0) acc[user] = patterns;
        return acc;
      }, {} as Record<string, string[]>);
    const piiFieldRules = piiRulesText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [pattern, actionRaw] = line.split('=').map((part) => part.trim());
        if (!pattern) return null;
        const action = actionRaw === 'hide' ? 'hide' : actionRaw === 'partial' ? 'partial' : 'mask';
        return { pattern, action };
      })
      .filter(Boolean) as { pattern: string; action: 'hide' | 'mask' | 'partial' }[];
    const highlightRules = highlightRulesText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [field, matchRaw, pattern, color] = line.split('|').map((part) => part.trim());
        if (!field || !pattern || !color) return null;
        const match = matchRaw === 'equals' ? 'equals' : 'contains';
        return { field, match, pattern, color };
      })
      .filter(Boolean) as { field: string; match: 'contains' | 'equals'; pattern: string; color: string }[];
    const normalizedIndexPatternSettings = indexPatternSettings
      .map((entry) => {
        const pattern = String(entry.pattern || '').split('|')[0].trim();
        if (!pattern) return null;
        const timeField = String(entry.timeField || '').trim();
        const searchFields = Array.isArray(entry.searchFields)
          ? entry.searchFields.map((field) => String(field).trim()).filter((field) => field.length > 0)
          : [];
        const searchMode = entry.searchMode === 'exact' || entry.searchMode === 'relevant' ? entry.searchMode : '';
        return { pattern, timeField, searchFields, searchMode };
      })
      .filter(Boolean) as IndexPatternSetting[];
    const payload = { ...config, indexOptions, indexPatternSettings: normalizedIndexPatternSettings, fieldExplorerFields, teamIndexAccess, userIndexAccess, piiFieldRules, highlightRules };
    await adminRequest<AdminConfig>('put', '/api/admin/config', payload);
    setConfig(payload);
    setIndexPatternSettings(normalizedIndexPatternSettings);
    setTeamIndexAccessText(
      Object.entries(teamIndexAccess)
        .map(([team, patterns]) => `${team}=${patterns.join(',')}`)
        .join('\n')
    );
    setUserIndexAccessText(
      Object.entries(userIndexAccess)
        .map(([user, patterns]) => `${user}=${patterns.join(',')}`)
        .join('\n')
    );
    setPiiRulesText(piiFieldRules.map((rule) => `${rule.pattern}=${rule.action}`).join('\n'));
    setHighlightRulesText(highlightRules.map((rule) => `${rule.field}|${rule.match}|${rule.pattern}|${rule.color}`).join('\n'));
    showNotice('Config saved.', 'success');
  };

  const testConnection = async () => {
    setConnectionStatus('Testing...');
    try {
      const diags = await adminRequest<Diagnostics>('get', '/api/admin/diagnostics');
      setDiagnostics(diags.data);
      if (diags.data?.opensearch?.reachable) {
        try {
          const newConnection: OpensearchConnection = {
            id: createClientId(),
            host: config.opensearchHost,
            port: config.opensearchPort,
            scheme: config.opensearchScheme,
            basePath: config.opensearchBasePath,
            username: config.opensearchUsername,
            password: config.opensearchPassword,
            insecureSSL: config.opensearchInsecureSSL
          };
          const connections = Array.isArray(config.opensearchConnections) ? config.opensearchConnections : [];
          const match = connections.find((conn) => buildOpensearchKey(conn) === buildOpensearchKey(newConnection));
          const savedConnection = { ...newConnection, id: match ? match.id : newConnection.id };
          const nextConnections = [
            savedConnection,
            ...connections.filter((conn) => buildOpensearchKey(conn) !== buildOpensearchKey(savedConnection))
          ];
          const nextConfig = { ...config, opensearchConnections: nextConnections };
          setConfig(nextConfig);
          setSelectedConnectionId(savedConnection.id);
          await adminRequest('put', '/api/admin/config', {
            opensearchHost: config.opensearchHost,
            opensearchPort: config.opensearchPort,
            opensearchScheme: config.opensearchScheme,
            opensearchBasePath: config.opensearchBasePath,
            opensearchUsername: config.opensearchUsername,
            opensearchPassword: config.opensearchPassword,
            opensearchInsecureSSL: config.opensearchInsecureSSL,
            opensearchConnections: nextConnections
          });
          setConnectionStatus('Connection OK (saved)');
        } catch {
          setConnectionStatus('Connection OK (save failed)');
        }
      } else {
        setConnectionStatus('Connection failed');
      }
    } catch {
      setConnectionStatus('Connection failed');
    }
  };

  const rotateLogs = async () => {
    const res = await adminRequest<RotateResponse>('post', '/api/admin/logs/rotate');
    const message = res.data.rotated ? 'Access log rotated.' : (res.data.reason || 'Rotation failed.');
    showNotice(message, res.data.rotated ? 'success' : 'error');
    await loadAll();
  };

  const pruneLogs = async () => {
    const daysRaw = prompt('Delete access logs older than how many days?', '7');
    if (!daysRaw) return;
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days < 0) {
      showNotice('Enter a valid number of days (0 = delete all rotated logs).', 'error');
      return;
    }
    const res = await adminRequest<{ removed: number }>('post', '/api/admin/logs/prune', { days });
    showNotice(`Removed ${res.data.removed} old log file(s).`, 'success');
    await loadAll();
  };

  const saveRules = async () => {
    const res = await adminRequest<Rule[]>('put', '/api/admin/rules', rules);
    setRules(res.data);
    showNotice('Rules updated.', 'success');
  };

  const sendTestEmail = async () => {
    setTestEmailStatus('Testing...');
    setTestEmailBusy(true);
    try {
      await adminRequest('post', '/api/admin/email/test');
      setTestEmailStatus('Test email sent.');
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail || error?.response?.data?.error;
      const message = detail || error?.message || 'Test email failed.';
      const suffix = status ? ` (HTTP ${status})` : '';
      setTestEmailStatus(`${message}${suffix}`);
    } finally {
      setTestEmailBusy(false);
    }
  };

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { id: createClientId(), name: '', query: '', threshold: 5, windowMinutes: 60, team: '' }
    ]);
  };

  const addCustomUrl = () => {
    const next = [...(config.customUrls || []), { id: createClientId(), name: '', url: '' }];
    setConfig({ ...config, customUrls: next });
  };

  const updateCustomUrl = (id: string, patch: Partial<{ name: string; url: string }>) => {
    const next = (config.customUrls || []).map((entry) => (
      entry.id === id ? { ...entry, ...patch } : entry
    ));
    setConfig({ ...config, customUrls: next });
  };

  const removeCustomUrl = (id: string) => {
    const next = (config.customUrls || []).filter((entry) => entry.id !== id);
    setConfig({ ...config, customUrls: next });
  };

  const buildImportFormData = () => {
    const form = new FormData();
    if (importFile) form.append('file', importFile);
    form.append('index', importIndex.trim());
    form.append('parserType', importParser);
    form.append('timestampField', importTimestampField.trim());
    form.append('timestampFormat', importTimestampFormat.trim());
    if (importParser === 'regex') {
      form.append('regexPattern', importRegex.trim());
    }
    return form;
  };

  const formatImportError = (error: any) => {
    const data = error?.response?.data;
    if (data?.limitBytes) {
      const maxMb = Math.max(1, Math.round(Number(data.limitBytes) / (1024 * 1024)));
      return `File too large. Max ${maxMb} MB.`;
    }
    return data?.error || data?.detail || error?.message || 'Import failed.';
  };

  const fetchImportHistory = async () => {
    try {
      const res = await adminRequest<any[]>('get', '/api/admin/import/history');
      setImportHistory(res.data || []);
    } catch {
      setImportHistory([]);
    }
  };

  const fetchImportStatus = async (id: string) => {
    try {
      const res = await adminRequest<any>('get', `/api/admin/import/${id}/status`);
      setImportStatus(res.data);
      return res.data;
    } catch {
      return null;
    }
  };

  const handleImportPreview = async () => {
    if (!importFile) {
      showNotice('Select a file to preview.', 'error');
      return;
    }
    if (!importIndex.trim()) {
      showNotice('Enter a target index.', 'error');
      return;
    }
    if (importParser === 'regex' && !importRegex.trim()) {
      showNotice('Regex pattern is required.', 'error');
      return;
    }
    setImportBusy(true);
    setImportPreview(null);
    try {
      const res = await axios.post('/api/admin/import/preview', buildImportFormData(), {
        headers: { ...adminHeaders }
      });
      setImportPreview(res.data);
    } catch (error: any) {
      showNotice(formatImportError(error), 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportRun = async () => {
    if (!importFile) {
      showNotice('Select a file to import.', 'error');
      return;
    }
    if (!importIndex.trim()) {
      showNotice('Enter a target index.', 'error');
      return;
    }
    if (importParser === 'regex' && !importRegex.trim()) {
      showNotice('Regex pattern is required.', 'error');
      return;
    }
    setImportBusy(true);
    setImportStatus(null);
    try {
      const res = await axios.post('/api/admin/import', buildImportFormData(), {
        headers: { ...adminHeaders }
      });
      if (res.data?.id) {
        setImportJobId(res.data.id);
        await fetchImportStatus(res.data.id);
        await fetchImportHistory();
      }
    } catch (error: any) {
      showNotice(formatImportError(error), 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const clearLocalCache = () => {
    if (!confirm('Clear browser storage for this tool?')) return;
    localStorage.clear();
    window.location.reload();
  };

  const restartServices = async (target: 'proxy' | 'frontend') => {
    const label = target === 'frontend' ? 'frontend + proxy' : 'proxy';
    if (!confirm(`Restart ${label}?`)) return;
    setRestartBusy(true);
    try {
      const res = await adminRequest<RestartResponse>('post', '/api/admin/restart', { target });
      if (res.data.ok) {
        showNotice(res.data.message || 'Restart requested.', 'success');
      } else {
        showNotice(res.data.error || 'Restart failed.', 'error');
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error;
      showNotice(detail || 'Restart failed.', 'error');
    } finally {
      setRestartBusy(false);
    }
  };

  const deleteTeamBookmark = async (id: string) => {
    await adminRequest<{ removed: number }>('delete', `/api/admin/team-bookmarks/${id}`);
    setTeamBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const addAdminTeam = async () => {
    const name = newAdminTeamName.trim();
    const description = newAdminTeamDesc.trim();
    if (!name) {
      showNotice('Team name is required.', 'error');
      return;
    }
    const res = await adminRequest<Team>('post', '/api/admin/teams', { name, description });
    const exists = teams.some((t) => t.id === res.data.id);
    if (!exists) {
      setTeams((prev) => [...prev, res.data]);
    }
    setNewAdminTeamName('');
    setNewAdminTeamDesc('');
  };

  const deleteAdminTeam = async (id: string) => {
    await adminRequest<{ removed: number }>('delete', `/api/admin/teams/${id}`);
    setTeams((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchIndexStats = async (refresh = false) => {
    setIndexStatsLoading(true);
    try {
      const url = refresh ? '/api/admin/indexes?refresh=true' : '/api/admin/indexes';
      const res = await adminRequest<IndexStatsResponse>('get', url);
      setIndexStats(res.data);
    } catch {
      showNotice('Failed to load index stats.', 'error');
    } finally {
      setIndexStatsLoading(false);
    }
  };


  const addTeamBookmark = async () => {
    const name = newTeamName.trim();
    const query = newTeamQuery.trim();
    const team = newTeamNameSpace.trim();
    if (!name || !query) {
      showNotice('Name and query are required.', 'error');
      return;
    }
    const payload: { name: string; query: string; team?: string } = { name, query };
    if (team) payload.team = team;
    const res = await adminRequest<TeamBookmark>('post', '/api/admin/team-bookmarks', payload);
    setTeamBookmarks((prev) => [...prev, res.data]);
    setNewTeamName('');
    setNewTeamQuery('');
    setNewTeamNameSpace('');
  };

  const addUser = async () => {
    const username = newUserName.trim();
    const password = newUserPass.trim();
    const teams = newUserTeams
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (!username || !password) {
      showNotice('Username and password required.', 'error');
      return;
    }
    const payload: { username: string; password: string; role: string; teams?: string[] } = {
      username,
      password,
      role: newUserRole
    };
    if (teams.length > 0) payload.teams = teams;
    const res = await adminRequest<{ id: string; username: string; role: string; teams: string[]; createdAt?: string; lastLoginAt?: string }>('post', '/api/admin/users', payload);
    setUsersList((prev) => [...prev, res.data]);
    setNewUserName('');
    setNewUserPass('');
    setNewUserTeams('');
  };

  const updateUser = async (userId: string, patch: { role?: string; teams?: string[]; password?: string }) => {
    const res = await adminRequest<{ id: string; username: string; role: string; teams: string[]; createdAt?: string; lastLoginAt?: string }>('put', `/api/admin/users/${userId}`, patch);
    setUsersList((prev) => prev.map((u) => (u.id === userId ? res.data : u)));
  };

  const saveUserTeams = async (userId: string) => {
    const raw = (userTeamsDraft[userId] || '').trim();
    const teams = raw
      ? raw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    await updateUser(userId, { teams });
  };

  const deleteUser = async (userId: string) => {
    await adminRequest<{ removed: number }>('delete', `/api/admin/users/${userId}`);
    setUsersList((prev) => prev.filter((u) => u.id !== userId));
  };

  const reloadUsers = async () => {
    const res = await adminRequest<{ loaded: number }>('post', '/api/admin/users/reload');
    showNotice(`Reloaded ${res.data.loaded} user(s).`, 'success');
    const usersRes = await adminRequest<{ id: string; username: string; role: string; teams: string[]; createdAt?: string; lastLoginAt?: string }[]>('get', '/api/admin/users');
    setUsersList(usersRes.data);
  };

  const saveFeatureToggles = async () => {
    const res = await adminRequest<{ teams: Record<string, { exports: boolean; bookmarks: boolean; rules: boolean; queryBuilder: boolean; limitTo7Days: boolean; piiUnmasked: boolean; showFullResults: boolean }> }>(
      'put',
      '/api/admin/feature-toggles',
      { teams: featureToggles }
    );
    setFeatureToggles(res.data.teams || {});
    showNotice('Feature toggles saved.', 'success');
  };

  const downloadBackup = async () => {
    const res = await adminRequest<any>('get', '/api/admin/backup');
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logsearch-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const restoreBackup = async (file: File | null) => {
    if (!file) return;
    setRestoreBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await adminRequest('post', '/api/admin/restore', payload);
      showNotice('Restore complete. Refreshing data.', 'success');
      await loadAll();
    } catch {
      showNotice('Restore failed. Check the backup file.', 'error');
    } finally {
      setRestoreBusy(false);
    }
  };

  const buildIndexOptionsText = (current: string, updates: Record<string, { enabled: boolean; alias: string }>) => {
    const lines = current
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const map = new Map<string, string>();
    for (const line of lines) {
      const { value, label } = parseIndexOptionLine(line);
      if (value) map.set(value, label);
    }
    Object.entries(updates).forEach(([value, entry]) => {
      if (!entry.enabled) {
        map.delete(value);
        return;
      }
      map.set(value, entry.alias.trim());
    });
    return Array.from(map.entries())
      .map(([value, label]) => (label ? `${value}|${label}` : value))
      .join('\n');
  };

  const updateDiscoverySelection = (indexName: string, patch: Partial<{ enabled: boolean; alias: string }>) => {
    setDiscoverySelections((prev) => {
      const current = prev[indexName] || {};
      const nextEntry = { enabled: current.enabled ?? false, alias: current.alias ?? '' };
      if (patch.enabled !== undefined) nextEntry.enabled = patch.enabled;
      if (patch.alias !== undefined) nextEntry.alias = patch.alias;
      setIndexOptionsText((currentText) => buildIndexOptionsText(currentText, { [indexName]: nextEntry }));
      return { ...prev, [indexName]: nextEntry };
    });
  };

  const indexStatsList = indexStats?.indices || [];
  const indexStatsFiltered = indexSearch
    ? indexStatsList.filter((idx) => idx.index.toLowerCase().includes(indexSearch.toLowerCase()))
    : indexStatsList;
  const indexStatsRows = indexStatsFiltered.slice(0, 50);
  const activityLimit = 500;
  const activityRows = [...activity]
    .sort((a, b) => {
      const aTime = Date.parse(a.time || '');
      const bTime = Date.parse(b.time || '');
      const aValue = Number.isNaN(aTime) ? 0 : aTime;
      const bValue = Number.isNaN(bTime) ? 0 : bTime;
      return bValue - aValue;
    })
    .slice(0, activityLimit);
  const healthRows = healthTrend?.hours ? healthTrend.hours.slice(-24) : [];
  const healthScore = (status: string) => {
    if (status === 'green') return 1;
    if (status === 'yellow') return 0.7;
    if (status === 'red') return 0.4;
    if (status === 'offline') return 0.1;
    return 0.2;
  };
  const healthCounts = healthRows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const uptimeCount = (healthCounts.green || 0) + (healthCounts.yellow || 0);
  const uptimePct = healthRows.length ? Math.round((uptimeCount / healthRows.length) * 100) : 0;
  const healthColor = (status: string) => {
    if (status === 'green') return 'bg-green-500';
    if (status === 'yellow') return 'bg-yellow-500';
    if (status === 'red') return 'bg-red-500';
    if (status === 'offline') return 'bg-gray-500';
    return 'bg-gray-300 dark:bg-gray-600';
  };
  const weeklyDays = weeklyUsage?.days || [];
  const userSearchTerm = userSearch.trim().toLowerCase();
  const filteredUsers = userSearchTerm
    ? usersList.filter((user) => {
        const haystack = [
          user.username,
          user.role,
          user.email,
          ...(user.teams || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(userSearchTerm);
      })
    : usersList;
  const topUsers = dailyTopUsers?.users || [];
  const hourlyRows = hourlyUsage?.hours || [];
  const osOk = Boolean(diagnostics?.opensearch?.reachable && diagnostics.opensearch.status !== 'red');
  const appVersion = diagnostics?.appVersion?.trim() || '';
  const appVersionLabel = appVersion || 'uat';
  const buildSha = (import.meta as any).env?.VITE_BUILD_SHA || '';
  const buildBranch = (import.meta as any).env?.VITE_BUILD_BRANCH || '';
  const buildEnv = (import.meta as any).env?.VITE_BUILD_ENV || (import.meta as any).env?.VITE_ENV || '';
  const buildLabel = buildSha ? buildSha.slice(0, 8) : 'dev';
  const buildSuffix = buildBranch ? ` (${buildBranch})` : '';
  const opensearchConnections = config.opensearchConnections || [];

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6 relative">
        <div className="absolute top-4 right-4">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            User Panel
          </button>
        </div>
        <form onSubmit={handleLogin} className="bg-white dark:bg-gray-800 shadow-md border dark:border-gray-700 rounded-lg p-6 w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {publicLogoDataUrl && (
                <img src={publicLogoDataUrl} alt="Brand logo" className={`${getLogoSizeClass(publicLogoSizeAdmin)} object-contain`} />
              )}
              <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Admin Login</h1>
            </div>
            <button
              type="button"
              onClick={() => setAdminDarkMode(!adminDarkMode)}
              className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 text-sm"
              title="Toggle theme"
            >
              {adminDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Username</label>
          <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded mb-3" />
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Password</label>
          <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded mb-3" />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
            <input
              type="checkbox"
              checked={rememberAdmin}
              onChange={(e) => {
                const next = e.target.checked;
                setRememberAdmin(next);
                localStorage.setItem('rememberMeAdmin', next ? 'true' : 'false');
              }}
              className="h-4 w-4"
            />
            Remember me
          </label>
          {loginError && <p className="text-sm text-red-600 mb-3">{loginError}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            {config.brandLogoDataUrl && (
              <img src={config.brandLogoDataUrl} alt="Brand logo" className={`${getLogoSizeClass(config.brandLogoSizeAdmin)} object-contain`} />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{config.brandName || 'WDTS Logging Solution'}</h1>
              <div className="text-xs text-gray-500 dark:text-gray-400">Admin Panel</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs" title={`OpenSearch: ${osOk ? 'ok' : 'down'}`}>
                <span className={`h-2 w-2 rounded-full ${osOk ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-500 dark:text-gray-400">OS</span>
              </div>
              {adminUser && <span className="text-xs text-gray-500 dark:text-gray-400">👤 {adminUser}</span>}
              {serverTime && <span className="text-sm font-mono text-gray-600 dark:text-gray-300">🕒 {serverTime}</span>}
              <button onClick={() => setAdminDarkMode(!adminDarkMode)} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 text-sm">
                {adminDarkMode ? '☀️' : '🌙'}
              </button>
              <Link
                to="/admin-faqs"
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 text-sm"
              >
                Admin FAQs
              </Link>
              <Link
                to="/upload"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 text-sm"
              >
                Upload
              </Link>
              <button onClick={loadAll} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 text-sm">Refresh</button>
              <button onClick={handleLogout} className="px-3 py-1 rounded bg-red-600 text-white text-sm">Logout</button>
            </div>
            {clientIp && (
              <div className="text-xs text-gray-500 dark:text-gray-400">YourIP : {clientIp}</div>
            )}
          </div>
        </div>
        {config.motdMessage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100 px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-base">📣</span>
              <div className="leading-relaxed">{config.motdMessage}</div>
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading admin data...</p>}

        {(config.customUrls || []).length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {config.customUrls.map((entry) => (
                <a
                  key={entry.id}
                  href={entry.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded border dark:border-gray-700 text-xs text-blue-700 dark:text-blue-300 hover:underline"
                >
                  {entry.name || entry.url}
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Usage Dashboard</h2>
          {metrics ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <div className="text-gray-500 dark:text-gray-400">Searches Today</div>
                <div className="text-xl font-semibold">{metrics.searchesToday}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <div className="text-gray-500 dark:text-gray-400">Exports Today</div>
                <div className="text-xl font-semibold">{metrics.exportsToday}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <div className="text-gray-500 dark:text-gray-400">Active Users</div>
                <div className="text-xl font-semibold">{metrics.activeUsers}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <div className="text-gray-500 dark:text-gray-400">Top Queries</div>
                <div className="mt-2 space-y-1">
                  {metrics.topQueries.map((q) => (
                    <div key={q.query} className="flex justify-between">
                      <span className="truncate">{q.query}</span>
                      <span>{q.count}</span>
                    </div>
                  ))}
                  {metrics.topQueries.length === 0 && <div className="text-gray-400 dark:text-gray-500">No queries yet.</div>}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No metrics available.</p>
          )}
          {metrics && metrics.activeUserIps.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Active IPs: {metrics.activeUserIps.join(', ')}
            </div>
          )}
          {anomalies && (
            <div className="mt-4 text-sm">
              {anomalies.hints.length > 0 ? (
                <div className="space-y-1 text-amber-700 dark:text-amber-300">
                  {anomalies.hints.map((hint) => (
                    <div key={hint.type}>
                      {hint.type === 'searches_spike' && `Search volume spike detected (${hint.current} vs avg ${hint.baseline}).`}
                      {hint.type === 'exports_spike' && `Export volume spike detected (${hint.current} vs avg ${hint.baseline}).`}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">No spikes detected this hour.</div>
              )}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Index Management</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Defaults, discovery, and per-index overrides.</div>
            </div>
            <button
              onClick={() => setShowIndexManagement((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showIndexManagement ? 'Manage index settings' : 'Manage index settings'}
            </button>
          </div>
          {showIndexManagement ? (
            <>
              <div className="space-y-4">
                <div className="rounded border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm">
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Default Index Pattern</div>
                  <input value={config.defaultIndexPattern} onChange={(e) => setConfig({ ...config, defaultIndexPattern: e.target.value })} className="w-full md:w-96 px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                </div>
                <div className="rounded border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Index Patterns (one per line)</label>
                  <textarea
                    value={indexOptionsText}
                    onChange={(e) => setIndexOptionsText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    placeholder="vector-*|My nginx server"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Optional alias: pattern|label (example: vector-*|My nginx server).</p>
                </div>
                <div className="rounded border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={() => fetchIndexStats(false)} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded" disabled={indexStatsLoading}>
                      {indexStats ? 'Load cached' : 'Load index stats'}
                    </button>
                    <button onClick={() => fetchIndexStats(true)} className="px-3 py-2 bg-blue-600 text-white rounded" disabled={indexStatsLoading}>
                      Refresh from OpenSearch
                    </button>
                    {indexStatsLoading && <span className="text-gray-500 dark:text-gray-400">Loading...</span>}
                  </div>
                  {!indexStats && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Load index stats on demand to avoid extra OpenSearch traffic.</p>
                  )}
                  {indexStats && (
                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                      <div className="flex flex-wrap gap-4">
                        <div>Total indices: {indexStats.summary.totalIndices}</div>
                        <div>Total docs: {indexStats.summary.totalDocs}</div>
                        <div>Total size: {formatBytes(indexStats.summary.totalStoreBytes)}</div>
                        <div>Fetched: {indexStats.fetchedAt}</div>
                        <div>{indexStats.cached ? 'Cache hit' : 'Live fetch'}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center text-xs">
                        <input
                          value={indexSearchText}
                          onChange={(e) => setIndexSearchText(e.target.value)}
                          placeholder="Search indexes"
                          className="w-full md:w-64 px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                        />
                        <button
                          onClick={() => setIndexSearch(indexSearchText.trim())}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded"
                        >
                          Search
                        </button>
                      </div>
                      <div className="overflow-auto border dark:border-gray-700 rounded max-h-96">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                            <tr>
                              <th className="text-left px-3 py-2">Index</th>
                              <th className="text-left px-3 py-2">Add</th>
                              <th className="text-left px-3 py-2">Alias Name</th>
                              <th className="text-left px-3 py-2">Health</th>
                              <th className="text-left px-3 py-2">Docs</th>
                              <th className="text-left px-3 py-2">Size</th>
                              <th className="text-left px-3 py-2">Pri/Rep</th>
                            </tr>
                          </thead>
                          <tbody>
                            {indexStatsRows.map((idx) => {
                              const isSystemIndex = idx.index.startsWith('.');
                              return (
                                <tr key={idx.index} className="border-t dark:border-gray-700">
                                  <td className={`px-3 py-2 ${isSystemIndex ? 'text-gray-400 dark:text-gray-500' : ''}`}>{idx.index}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={!isSystemIndex && Boolean(discoverySelections[idx.index]?.enabled)}
                                      onChange={(e) => {
                                        if (isSystemIndex) return;
                                        updateDiscoverySelection(idx.index, { enabled: e.target.checked });
                                      }}
                                      disabled={isSystemIndex}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      value={discoverySelections[idx.index]?.alias || ''}
                                      onChange={(e) => {
                                        if (isSystemIndex) return;
                                        updateDiscoverySelection(idx.index, { alias: e.target.value });
                                      }}
                                      placeholder="Optional alias"
                                      className="w-full px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded text-xs"
                                      disabled={isSystemIndex || !discoverySelections[idx.index]?.enabled}
                                    />
                                  </td>
                                  <td className="px-3 py-2">{idx.health}</td>
                                  <td className="px-3 py-2">{idx.docsCount}</td>
                                  <td className="px-3 py-2">{formatBytes(idx.storeBytes)}</td>
                                  <td className="px-3 py-2">{idx.pri}/{idx.rep}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {indexStatsFiltered.length > indexStatsRows.length && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">Showing first {indexStatsRows.length} of {indexStatsFiltered.length} indices.</div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400">Checked indices are added to Index Patterns; click "Save Config" to persist.</div>
                    </div>
                  )}
                </div>
                <div className="rounded border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm">
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Per-Index Search Overrides</div>
                  <div className="space-y-2">
                    {indexPatternSettings.length === 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">No overrides configured.</div>
                    )}
                    {indexPatternSettings.map((entry, idx) => (
                      <div key={`${entry.pattern}-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                        <div className="md:col-span-12 text-[11px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
                          {getIndexLabel(entry.pattern || 'Index')}
                        </div>
                        <select
                          value={entry.pattern}
                          onChange={(e) => updateIndexPatternSetting(idx, { pattern: e.target.value })}
                          className="md:col-span-4 w-full px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded text-xs"
                        >
                          <option value="">Choose index</option>
                          {indexOptionsText
                            .split('\n')
                            .map((line) => line.trim())
                            .filter((line) => line.length > 0)
                            .map(parseIndexOptionLine)
                            .filter((opt) => opt.value)
                            .map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label || opt.value}
                              </option>
                            ))}
                        </select>
                        <input
                          value={entry.pattern}
                          onChange={(e) => updateIndexPatternSetting(idx, { pattern: e.target.value })}
                          placeholder="Custom pattern (optional)"
                          className="md:col-span-12 w-full px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded text-xs"
                        />
                        <div className="md:col-span-3 w-full">
                          <select
                            value={entry.timeField || ''}
                            onChange={(e) => updateIndexPatternSetting(idx, { timeField: e.target.value })}
                            className="w-full px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded text-xs"
                          >
                            <option value="">Time field (select)</option>
                            {(timeFieldOptions[entry.pattern] || []).map((field) => (
                              <option key={field} value={field}>{field}</option>
                            ))}
                          </select>
                          {entry.timeField && !(timeFieldOptions[entry.pattern] || []).includes(entry.timeField) && (
                            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">Custom field: {entry.timeField}</div>
                          )}
                        </div>
                        <select
                          value={entry.searchMode || ''}
                          onChange={(e) => updateIndexPatternSetting(idx, { searchMode: e.target.value as IndexPatternSetting['searchMode'] })}
                          className="md:col-span-2 w-full px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded text-xs"
                        >
                          <option value="">Search mode (default)</option>
                          <option value="relevant">Relevant</option>
                          <option value="exact">Exact</option>
                        </select>
                        <textarea
                          value={(entry.searchFields || []).join('\n')}
                          onChange={(e) => updateIndexPatternSetting(idx, { searchFields: e.target.value.split('\n') })}
                          placeholder="Search fields (one per line)"
                          rows={2}
                          className="md:col-span-3 w-full px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded text-xs"
                        />
                        <button
                          onClick={() => removeIndexPatternSetting(idx)}
                          className="md:col-span-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <button onClick={addIndexPatternSetting} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-xs">Add override</button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Only exact index pattern matches. Leave fields blank to use defaults.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <button onClick={saveConfig} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Index Management</button>
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">App Configuration</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Default search behavior and UI options.
              </div>
            </div>
            <button
              onClick={() => setShowAppConfig((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showAppConfig ? 'Hide app configuration' : 'Manage app configuration'}
            </button>
          </div>
          {showAppConfig ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Time Zone</label>
                  <input value={config.timeZone} onChange={(e) => setConfig({ ...config, timeZone: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Max Export Size</label>
                  <input type="number" value={config.maxExportSize} onChange={(e) => setConfig({ ...config, maxExportSize: Number(e.target.value) })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={config.darkModeDefault} onChange={(e) => setConfig({ ...config, darkModeDefault: e.target.checked })} />
                  <span className="text-gray-600 dark:text-gray-300">Dark mode default</span>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Field Explorer Fields (one per line)</label>
                  <textarea
                    value={fieldExplorerText}
                    onChange={(e) => setFieldExplorerText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Field Explorer Top N</label>
                  <input
                    type="number"
                    value={config.fieldExplorerTopN}
                    onChange={(e) => setConfig({ ...config, fieldExplorerTopN: Number(e.target.value) })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">PII Masking Rules (one per line)</label>
                  <textarea
                    value={piiRulesText}
                    onChange={(e) => setPiiRulesText(e.target.value)}
                    rows={4}
                    placeholder="email=hide&#10;user.email=mask&#10;user.ssn=partial&#10;headers.*.authorization=hide"
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Use =hide, =mask, or =partial (keeps first/last 2 chars). Wildcards (*) are supported.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Highlight Rules (one per line)</label>
                  <textarea
                    value={highlightRulesText}
                    onChange={(e) => setHighlightRulesText(e.target.value)}
                    rows={4}
                    placeholder="response|equals|500|#fecaca&#10;request|contains|/login|#bfdbfe"
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Format: field|match|pattern|color. Match is contains or equals.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <button onClick={saveConfig} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Config</button>
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Branding</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Logo and header size.</div>
            </div>
            <button
              onClick={() => setShowBranding((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showBranding ? 'Hide branding' : 'Manage branding'}
            </button>
          </div>
          {showBranding ? (
            <>
              <div className="max-w-md text-sm">
                <label className="block text-gray-600 dark:text-gray-300 mb-1">Brand Name</label>
                <input
                  value={config.brandName}
                  onChange={(e) => setConfig((prev) => ({ ...prev, brandName: e.target.value }))}
                  placeholder="Brand name"
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center justify-center w-20 h-20 rounded border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  {config.brandLogoDataUrl ? (
                    <img src={config.brandLogoDataUrl} alt="Brand logo" className="max-h-16 max-w-16 object-contain" />
                  ) : (
                    <span className="text-xs text-gray-400">No logo</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded cursor-pointer text-sm">
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                    />
                  </label>
                  <button
                    onClick={() => setConfig((prev) => ({ ...prev, brandLogoDataUrl: '' }))}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
                    disabled={!config.brandLogoDataUrl}
                  >
                    Remove Logo
                  </button>
                  <button onClick={saveConfig} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Save Branding</button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">PNG/SVG/JPG, max 512KB.</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Logo Size (User)</label>
                  <select
                    value={config.brandLogoSizeUser}
                    onChange={(e) => setConfig((prev) => ({ ...prev, brandLogoSizeUser: e.target.value as AdminConfig['brandLogoSizeUser'] }))}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  >
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Logo Size (Admin)</label>
                  <select
                    value={config.brandLogoSizeAdmin}
                    onChange={(e) => setConfig((prev) => ({ ...prev, brandLogoSizeAdmin: e.target.value as AdminConfig['brandLogoSizeAdmin'] }))}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  >
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                  </select>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Alert Rules</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {rules.length} rule{rules.length === 1 ? '' : 's'} configured.
              </div>
            </div>
            <button
              onClick={() => setShowAlertRules((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showAlertRules ? 'Hide rules' : 'Manage rules'}
            </button>
          </div>
          {showAlertRules ? (
            <>
              <div className="border dark:border-gray-700 rounded max-h-96 overflow-auto">
                <div className="space-y-3 p-2">
                  {rules.map((rule, idx) => (
                    <div key={rule.id} className="grid grid-cols-1 md:grid-cols-7 gap-2 text-sm">
                    <input value={rule.name} onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, name: e.target.value };
                      setRules(next);
                    }} placeholder="Rule name" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    <input value={rule.query} onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, query: e.target.value };
                      setRules(next);
                    }} placeholder="Query text" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    <input type="number" value={rule.threshold} onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, threshold: Number(e.target.value) };
                      setRules(next);
                    }} className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    <input type="number" value={rule.windowMinutes} onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, windowMinutes: Number(e.target.value) };
                      setRules(next);
                    }} className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    <input value={rule.team || ''} onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, team: e.target.value };
                      setRules(next);
                    }} placeholder="Team (optional)" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    <input value={rule.email || ''} onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, email: e.target.value };
                      setRules(next);
                    }} placeholder="Email (optional)" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    <button onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))} className="px-2 py-1 bg-red-100 text-red-700 rounded">Remove</button>
                    </div>
                  ))}
                  {rules.length === 0 && <div className="text-sm text-gray-500 dark:text-gray-400">No rules configured.</div>}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={addRule} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded">Add Rule</button>
                <button onClick={saveRules} className="px-3 py-2 bg-blue-600 text-white rounded">Save Alert Rules</button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Threshold is the number of matches within the window (minutes) to trigger an email alert.</p>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Teams</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {teams.length} team{teams.length === 1 ? '' : 's'} configured.
              </div>
            </div>
            <button
              onClick={() => setShowTeams((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showTeams ? 'Hide teams' : 'Manage teams'}
            </button>
          </div>
          {showTeams ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4 text-sm">
                <input
                  value={newAdminTeamName}
                  onChange={(e) => setNewAdminTeamName(e.target.value)}
                  placeholder="Team name"
                  className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                />
                <input
                  value={newAdminTeamDesc}
                  onChange={(e) => setNewAdminTeamDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded md:col-span-2"
                />
                <button onClick={addAdminTeam} className="px-3 py-2 bg-blue-600 text-white rounded md:col-span-1">Create Team</button>
              </div>
              {teams.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No teams created yet.</p>}
              <div className="space-y-2 text-sm">
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-700 dark:text-gray-200">{team.name}</div>
                      {team.description && <div className="text-gray-500 dark:text-gray-400">{team.description}</div>}
                    </div>
                    <button onClick={() => deleteAdminTeam(team.id)} className="px-2 py-1 bg-red-100 text-red-700 rounded">Delete</button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Team Bookmarks</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {teamBookmarks.length} bookmark{teamBookmarks.length === 1 ? '' : 's'} shared.
              </div>
            </div>
            <button
              onClick={() => setShowTeamBookmarks((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showTeamBookmarks ? 'Hide team bookmarks' : 'Manage team bookmarks'}
            </button>
          </div>
          {showTeamBookmarks ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4 text-sm">
                <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Bookmark name" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                <input value={newTeamQuery} onChange={(e) => setNewTeamQuery(e.target.value)} placeholder="Query" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded md:col-span-2" />
                <input value={newTeamNameSpace} onChange={(e) => setNewTeamNameSpace(e.target.value)} placeholder="Team (optional)" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded md:col-span-2" />
                <button onClick={addTeamBookmark} className="px-3 py-2 bg-blue-600 text-white rounded md:col-span-1">Add Team Bookmark</button>
              </div>
              {teamBookmarks.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No shared bookmarks.</p>}
              <div className="space-y-2">
                {teamBookmarks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-gray-700 dark:text-gray-200">{b.name}</div>
                      <div className="text-gray-500 dark:text-gray-400">{b.query}</div>
                      {b.team && <div className="text-xs text-gray-400 dark:text-gray-500">Team: {b.team}</div>}
                    </div>
                    <button onClick={() => deleteTeamBookmark(b.id)} className="px-2 py-1 bg-red-100 text-red-700 rounded">Delete</button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">User Management</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {usersList.length} user{usersList.length === 1 ? '' : 's'} configured.
              </div>
            </div>
            <button
              onClick={() => setShowUserManagement((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showUserManagement ? 'Hide user tools' : 'Manage users'}
            </button>
          </div>
          {showUserManagement ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm mb-4">
                <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Username" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                <input type="password" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} placeholder="Password" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded">
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                  <option value="admin">admin</option>
                </select>
                <input value={newUserTeams} onChange={(e) => setNewUserTeams(e.target.value)} placeholder="Teams (comma)" className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                <button onClick={addUser} className="px-3 py-2 bg-blue-600 text-white rounded md:col-span-4">Add User</button>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users (name, email, role)"
                  className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded w-full md:w-64"
                />
                <button onClick={reloadUsers} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm">Reload users from disk</button>
              </div>
              {filteredUsers.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No users match that search.</p>
              )}
              <div className="border dark:border-gray-700 rounded max-h-96 overflow-auto">
                <div className="space-y-2 text-sm p-2">
                  {filteredUsers.map((u) => (
                    <div key={u.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-start">
                      <div className="text-sm">
                        <div className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${u.online ? 'bg-green-500' : 'bg-red-500'}`} />
                          {u.username}
                        </div>
                        {u.createdAt && <div className="text-xs text-gray-500 dark:text-gray-400">Created: {u.createdAt}</div>}
                        {u.lastLoginAt && <div className="text-xs text-gray-500 dark:text-gray-400">Last login: {u.lastLoginAt}</div>}
                      </div>
                      <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })} className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded">
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="admin">admin</option>
                      </select>
                      <input
                        value={userTeamsDraft[u.id] ?? ''}
                        onChange={(e) => setUserTeamsDraft((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                      />
                      <input type="password" placeholder="Reset password" onBlur={(e) => {
                        if (e.target.value.trim()) {
                          updateUser(u.id, { password: e.target.value.trim() });
                          e.target.value = '';
                        }
                      }} className="px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                      <div className="flex items-center gap-2 self-start">
                        <button onClick={() => saveUserTeams(u.id)} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded">Save teams</button>
                        <button onClick={() => deleteUser(u.id)} className="px-2 py-1 bg-red-100 text-red-700 rounded">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Feature Toggles</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {teamList.length} team{teamList.length === 1 ? '' : 's'} with toggle policies.
              </div>
            </div>
            <button
              onClick={() => setShowFeatureToggles((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showFeatureToggles ? 'Hide toggles' : 'Manage toggles'}
            </button>
          </div>
          {showFeatureToggles ? (
            <>
              <div className="space-y-2 text-sm">
                {Object.keys(featureToggles).length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No team toggles yet. Add users to create teams.</p>
                )}
                {teamList.map((team) => {
                  const toggles = featureToggles[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false };
                  return (
                  <div key={team} className="grid grid-cols-1 md:grid-cols-8 gap-2 items-center">
                    <div className="font-medium text-gray-700 dark:text-gray-200">{team}</div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.exports}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), exports: e.target.checked }
                        }))}
                      />
                      <span>Exports</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.bookmarks}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), bookmarks: e.target.checked }
                        }))}
                      />
                      <span>Bookmarks</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.rules}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), rules: e.target.checked }
                        }))}
                      />
                      <span>Alert Rules</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.queryBuilder}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), queryBuilder: e.target.checked }
                        }))}
                      />
                      <span>Query Builder</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.limitTo7Days}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), limitTo7Days: e.target.checked }
                        }))}
                      />
                      <span>Last 7 Days Only</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.piiUnmasked}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), piiUnmasked: e.target.checked }
                        }))}
                      />
                      <span>PII Unmasked</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={toggles.showFullResults}
                        onChange={(e) => setFeatureToggles((prev) => ({
                          ...prev,
                          [team]: { ...(prev[team] || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false }), showFullResults: e.target.checked }
                        }))}
                      />
                      <span>Full JSON View</span>
                    </label>
                  </div>
                )})}
              </div>
              <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/40">
                <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">User Access</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-600 dark:text-gray-300 mb-1">Team Index Access (one per line)</label>
                    <textarea
                      value={teamIndexAccessText}
                      onChange={(e) => setTeamIndexAccessText(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                      placeholder="TeamA=logs-*,app-*"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Format: Team=pattern1,pattern2. Leave empty to allow all indices.</p>
                  </div>
                  <div>
                    <label className="block text-gray-600 dark:text-gray-300 mb-1">User Index Access (one per line)</label>
                    <textarea
                      value={userIndexAccessText}
                      onChange={(e) => setUserIndexAccessText(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                      placeholder="alice=logs-*,app-*"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Format: username=pattern1,pattern2. Overrides team access when set.</p>
                  </div>
                </div>
              </div>
              <button onClick={saveFeatureToggles} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Toggles</button>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Top Users (Today)</h2>
          {!topUsers.length && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No user usage data yet.</p>
          )}
          {topUsers.length ? (
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="space-y-2">
                {topUsers.slice(0, 7).map((entry) => (
                  <div key={entry.user} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-500 dark:text-gray-400 truncate">{entry.user}</div>
                    <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded">
                      <div
                        className="h-3 bg-indigo-500 rounded"
                        style={{ width: `${Math.max(5, entry.percent)}%` }}
                        title={`${entry.user}: ${entry.count} actions`}
                      />
                    </div>
                    <div className="text-xs w-10 text-right">{entry.count}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Top 7 users by searches + exports today.
              </div>
            </div>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">OpenSearch Health (24h)</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Health timeline and diagnostics snapshot.</div>
            </div>
            <button
              onClick={() => setShowHealth((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showHealth ? 'Hide health' : 'Show health'}
            </button>
          </div>
          {showHealth ? (
            <>
              {healthRows.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No health data yet.</p>
              )}
              {healthRows.length > 0 && (
                <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                  <div className="flex items-end gap-1 h-24">
                    {healthRows.map((row) => (
                      <div key={row.hour} className="flex-1 flex flex-col items-center">
                        <div
                          className={`w-full rounded-sm ${healthColor(row.status)}`}
                          style={{ height: `${Math.max(10, Math.round(healthScore(row.status) * 100))}%` }}
                          title={`${row.hour}: ${row.status}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span>Uptime: {uptimePct}%</span>
                    <span>Green: {healthCounts.green || 0}</span>
                    <span>Yellow: {healthCounts.yellow || 0}</span>
                    <span>Red: {healthCounts.red || 0}</span>
                    <span>Offline: {healthCounts.offline || 0}</span>
                    <span>Unknown: {healthCounts.unknown || 0}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-green-500 rounded-sm" />Green</span>
                    <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-yellow-500 rounded-sm" />Yellow</span>
                    <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-red-500 rounded-sm" />Red</span>
                    <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-gray-500 rounded-sm" />Offline</span>
                    <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-gray-300 dark:bg-gray-600 rounded-sm" />Unknown</span>
                  </div>
                </div>
              )}
              {healthRows.length > 0 && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Health & Diagnostics</h3>
                  {(() => {
                    const badge = getHealthBadge();
                    return (
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`px-2 py-1 rounded ${badge.color}`}>{badge.label}</span>
                        <span className="text-gray-600 dark:text-gray-300">{badge.tip}</span>
                      </div>
                    );
                  })()}
                  {diagnostics ? (
                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${Number.isFinite(diagnostics.proxyUptimeSeconds) ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span>Backend</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${diagnostics.opensearch.reachable ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span>OpenSearch</span>
                        </span>
                      </div>
                      <div>Backend uptime: {Math.floor((diagnostics.proxyUptimeSeconds || 0) / 60)} mins</div>
                      <div>Cluster status: {diagnostics.opensearch.status || 'Unknown'}</div>
                      {diagnostics.opensearch.error && (
                        <div className="text-red-600">Error: {diagnostics.opensearch.error}</div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Diagnostics not available.</p>
                  )}
                </div>
              )}
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Logs & Storage Maintenance</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Cache cleanup, log rotation, and service controls.
              </div>
            </div>
            <button
              onClick={() => setShowMaintenance((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showMaintenance ? 'Hide maintenance' : 'Show maintenance'}
            </button>
          </div>
          {showMaintenance ? (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <button onClick={clearLocalCache} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded">Clear browser cache</button>
                <button onClick={rotateLogs} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded">Rotate access logs</button>
                <button onClick={pruneLogs} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded">Cleanup old logs</button>
              </div>
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Service Controls</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    onClick={() => restartServices('proxy')}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded"
                    disabled={restartBusy}
                  >
                    Restart Backend
                  </button>
                  <button
                    onClick={() => restartServices('frontend')}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded"
                    disabled={restartBusy}
                  >
                    Restart Frontend + Backend
                  </button>
                </div>
              </div>
              {storage && (
                <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                  <div>Total storage: {formatBytes(storage.totalBytes)}</div>
                  <div className="mt-2 space-y-1">
                    {storage.files.map((f) => (
                      <div key={f.file} className="flex justify-between">
                        <span>{f.file}</span>
                        <span>{formatBytes(f.bytes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Email Alerts (SMTP)</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Used by Alert Rules to send notifications.</div>
            </div>
            <button
              onClick={() => setShowEmailAlerts((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showEmailAlerts ? 'Hide email settings' : 'Manage email settings'}
            </button>
          </div>
          {showEmailAlerts ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">SMTP Host</label>
                  <input
                    value={config.smtpHost}
                    onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">SMTP Port</label>
                  <input
                    type="number"
                    value={config.smtpPort}
                    onChange={(e) => setConfig({ ...config, smtpPort: Number(e.target.value) })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">SMTP User</label>
                  <input
                    value={config.smtpUser}
                    onChange={(e) => setConfig({ ...config, smtpUser: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">SMTP Pass</label>
                  <input
                    type="password"
                    value={config.smtpPass}
                    onChange={(e) => setConfig({ ...config, smtpPass: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Alert Email To</label>
                  <input
                    value={config.alertEmailTo}
                    onChange={(e) => setConfig({ ...config, alertEmailTo: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    placeholder="alerts@example.com"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Alert Email From</label>
                  <input
                    value={config.alertEmailFrom}
                    onChange={(e) => setConfig({ ...config, alertEmailFrom: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    placeholder="logsearch@example.com"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={saveConfig}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm"
                >
                  Save email settings
                </button>
                <button
                  onClick={sendTestEmail}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
                  disabled={testEmailBusy}
                >
                  {testEmailBusy ? 'Sending test email...' : 'Send test email'}
                </button>
                {testEmailStatus && (
                  <span className={`text-sm ${testEmailStatus === 'Test email sent.' ? 'text-green-600' : testEmailStatus === 'Testing...' ? 'text-gray-600 dark:text-gray-300' : 'text-red-600'}`}>
                    {testEmailStatus}
                  </span>
                )}
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">OpenSearch Connection</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Host, port, and authentication.</div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className={`h-2.5 w-2.5 rounded-full ${connectionStatus.startsWith('Connection OK') ? 'bg-green-500' : connectionStatus ? 'bg-red-500' : 'bg-gray-400'}`} />
                <span className="text-gray-500 dark:text-gray-400">Status</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOpenSearch((prev) => !prev)}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
              >
                {showOpenSearch ? 'Hide connection' : 'Manage connection'}
              </button>
            </div>
          </div>
          {showOpenSearch ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="md:col-span-2">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Saved Connections</label>
                  <select
                    value={selectedConnectionId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedConnectionId(id);
                      const selected = opensearchConnections.find((conn) => conn.id === id);
                      if (!selected) return;
                      setConfig({
                        ...config,
                        opensearchHost: selected.host,
                        opensearchPort: selected.port,
                        opensearchScheme: selected.scheme,
                        opensearchBasePath: selected.basePath,
                        opensearchUsername: selected.username,
                        opensearchPassword: selected.password,
                        opensearchInsecureSSL: selected.insecureSSL
                      });
                      setConnectionStatus('');
                    }}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  >
                    <option value="">Select a saved connection</option>
                    {opensearchConnections.map((conn) => (
                      <option key={conn.id} value={conn.id}>
                        {buildOpensearchLabel(conn)}{conn.username ? ` (${conn.username})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">OpenSearch Host</label>
                  <input value={config.opensearchHost} onChange={(e) => setConfig({ ...config, opensearchHost: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">OpenSearch Port</label>
                  <input value={config.opensearchPort} onChange={(e) => setConfig({ ...config, opensearchPort: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">OpenSearch Base Path (optional)</label>
                  <input value={config.opensearchBasePath} onChange={(e) => setConfig({ ...config, opensearchBasePath: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" placeholder="/opensearch" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">OpenSearch Scheme</label>
                  <select
                    value={config.opensearchScheme || 'http'}
                    onChange={(e) => setConfig({ ...config, opensearchScheme: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  >
                    <option value="http">http</option>
                    <option value="https">https</option>
                  </select>
                </div>
                {config.opensearchScheme === 'https' && (
                  <>
                    <div>
                      <label className="block text-gray-600 dark:text-gray-300 mb-1">OpenSearch Username</label>
                      <input value={config.opensearchUsername} onChange={(e) => setConfig({ ...config, opensearchUsername: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    </div>
                    <div>
                      <label className="block text-gray-600 dark:text-gray-300 mb-1">OpenSearch Password</label>
                      <input type="password" value={config.opensearchPassword} onChange={(e) => setConfig({ ...config, opensearchPassword: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded" />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.opensearchInsecureSSL}
                        onChange={(e) => setConfig({ ...config, opensearchInsecureSSL: e.target.checked })}
                      />
                      <span className="text-gray-600 dark:text-gray-300">Allow self-signed SSL</span>
                    </div>
                  </>
                )}
                <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                  <button onClick={saveConfig} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Save OpenSearch Connection</button>
                  <button onClick={testConnection} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm">Test OpenSearch Connection</button>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Custom URLs</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Quick links for teams and tools.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCustomUrls((prev) => !prev)}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
              >
                {showCustomUrls ? 'Hide URLs' : 'Manage URLs'}
              </button>
              <button
                onClick={addCustomUrl}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
                disabled={!showCustomUrls}
              >
                Add URL
              </button>
            </div>
          </div>
          {showCustomUrls ? (
            <>
              <div className="space-y-2 text-sm">
                {(config.customUrls || []).map((entry) => (
                  <div key={entry.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <input
                      value={entry.name}
                      onChange={(e) => updateCustomUrl(entry.id, { name: e.target.value })}
                      placeholder="Name"
                      className="md:col-span-3 px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    />
                    <input
                      value={entry.url}
                      onChange={(e) => updateCustomUrl(entry.id, { url: e.target.value })}
                      placeholder="https://..."
                      className="md:col-span-7 px-2 py-1 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                    />
                    <div className="md:col-span-2 flex items-center gap-2">
                      <button
                        onClick={() => window.open(entry.url, '_blank', 'noopener,noreferrer')}
                        className="px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded"
                        disabled={!entry.url}
                      >
                        Open
                      </button>
                      <button onClick={() => removeCustomUrl(entry.id)} className="px-2 py-1 bg-red-100 text-red-700 rounded">Remove</button>
                    </div>
                  </div>
                ))}
                {(config.customUrls || []).length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No custom URLs added.</div>
                )}
              </div>
              <div className="mt-4">
                <button onClick={saveConfig} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Save Custom URLs</button>
              </div>
            </>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Message of the Day</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">Announcement banner for the user UI.</div>
            </div>
            <button
              onClick={() => setShowMotd((prev) => !prev)}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded text-sm"
            >
              {showMotd ? 'Hide MOTD' : 'Manage MOTD'}
            </button>
          </div>
          {showMotd ? (
            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(config.motdEnabled)}
                    onChange={(e) => setConfig({ ...config, motdEnabled: e.target.checked })}
                  />
                  <span className="text-gray-600 dark:text-gray-300">Enable MOTD in user UI</span>
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Message</label>
                  <textarea
                    value={config.motdMessage || ''}
                    onChange={(e) => setConfig({ ...config, motdMessage: e.target.value })}
                    rows={3}
                    placeholder="One message"
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Displayed below the header for all users when enabled.</p>
                </div>
                <div>
                  <button onClick={saveConfig} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save MOTD</button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Backup & Restore</h2>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <button onClick={downloadBackup} className="px-3 py-2 bg-blue-600 text-white rounded">Download Backup</button>
            <label className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded cursor-pointer">
              {restoreBusy ? 'Restoring...' : 'Restore Backup'}
              <input
                type="file"
                accept="application/json"
                onChange={(e) => restoreBackup(e.target.files?.[0] || null)}
                className="hidden"
                disabled={restoreBusy}
              />
            </label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Restores app config, users, teams, feature toggles, rules, and team bookmarks.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Weekly Activity Overview</h2>
          {weeklyDays.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No weekly usage data yet.</p>
          )}
          {weeklyDays.length > 0 && (
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-end gap-2 h-24">
                {weeklyDays.map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-sm bg-blue-500"
                      style={{ height: `${Math.max(8, day.percent)}%` }}
                      title={`${day.date}: ${day.total} events (${day.percent}%)`}
                    />
                    <div className="text-[10px] mt-1 text-gray-500 dark:text-gray-400">{day.date.slice(5)}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Percentage is relative to the highest day in the last 7 days.
              </div>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Global Load (Last 24h)</h2>
          {hourlyRows.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hourly data yet.</p>
          )}
          {hourlyRows.length > 0 && (
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-end gap-2 h-24">
                {hourlyRows.map((hour) => (
                  <div key={hour.hour} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-sm bg-teal-500"
                      style={{ height: `${Math.max(8, hour.percent)}%` }}
                      title={`${hour.hour}: ${hour.total} actions`}
                    />
                    <div className="text-[10px] mt-1 text-gray-500 dark:text-gray-400">{hour.hour.slice(11, 13)}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Total searches + exports per hour, last 24 hours.
              </div>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Activity Feed</h2>
          {activityRows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity.</p>}
          {activityRows.length > 0 && (
            <div className="overflow-auto border dark:border-gray-700 rounded max-h-96">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">User</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Query / Format</th>
                    <th className="text-left px-3 py-2">Index</th>
                    <th className="text-left px-3 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((entry, idx) => (
                    <tr key={`${entry.time}-${idx}`} className="border-t dark:border-gray-700">
                      <td className="px-3 py-2 whitespace-nowrap">{entry.time}</td>
                      <td className="px-3 py-2">{entry.user || 'public'}</td>
                      <td className="px-3 py-2">{entry.type}</td>
                      <td className="px-3 py-2">
                        {entry.type === 'export'
                          ? `${entry.format || 'export'}${entry.size ? ` (${entry.size})` : ''}`
                          : (entry.query || entry.message || '(match_all)')}
                      </td>
                      <td className="px-3 py-2">{entry.indexPattern || '-'}</td>
                      <td className="px-3 py-2">{entry.ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activity.length > activityRows.length && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Showing most recent {activityRows.length} entries.</div>
          )}
        </section>
      </div>
      <div className="mt-10 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-2 py-3 text-[11px] text-gray-500 dark:text-gray-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Build</span>
            <span className="font-mono">{buildLabel}{buildSuffix}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Env</span>
            <span className="font-mono">{buildEnv || 'dev'}</span>
          </div>
        </div>
      </div>
      {notice && (
        <div className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-50">
          <div
            className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${
              notice.type === 'success'
                ? 'bg-emerald-600 text-white'
                : notice.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-900 text-white'
            }`}
          >
            <span className="flex-1">{notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-white/80 hover:text-white"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminApp;

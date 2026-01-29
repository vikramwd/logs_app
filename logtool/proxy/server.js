// proxy/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const { createGzip } = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PROXY_PORT || 3001);

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'app-config.json');
const METRICS_PATH = path.join(DATA_DIR, 'metrics.json');
const RULES_PATH = path.join(DATA_DIR, 'rules.json');
const RULES_STATE_PATH = path.join(DATA_DIR, 'rules-state.json');
const TEAM_BOOKMARKS_PATH = path.join(DATA_DIR, 'team-bookmarks.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const FEATURE_TOGGLES_PATH = path.join(DATA_DIR, 'feature-toggles.json');
const TEAMS_PATH = path.join(DATA_DIR, 'teams.json');
const HEALTH_HISTORY_PATH = path.join(DATA_DIR, 'health-history.json');
const IMPORT_JOBS_PATH = path.join(DATA_DIR, 'import-jobs.json');
const IMPORT_INDICES_PATH = path.join(DATA_DIR, 'import-indices.json');
const MOTD_TEMPLATES_PATH = path.join(DATA_DIR, 'motd-templates.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ACCESS_LOG_PATH = path.join(DATA_DIR, 'access.log');
const ERROR_LOG_PATH = path.join(DATA_DIR, 'error.log');

const DEFAULT_IMPORT_MAX_FILE_BYTES = 100 * 1024 * 1024;
const IMPORT_MAX_FILE_BYTES = parseSizeBytes(process.env.IMPORT_MAX_FILE_BYTES, DEFAULT_IMPORT_MAX_FILE_BYTES);
const IMPORT_MAX_LINES = Number(process.env.IMPORT_MAX_LINES || 500000);
const IMPORT_PREVIEW_LINES = Number(process.env.IMPORT_PREVIEW_LINES || 10);
const IMPORT_AUTO_CREATE_INDEX = process.env.IMPORT_AUTO_CREATE_INDEX !== 'false';
const IMPORT_UI_VISIBLE = process.env.IMPORT_UI_VISIBLE !== 'false';
const DEFAULT_IMPORT_BATCH_BYTES = 10 * 1024 * 1024;

function parseSizeBytes(input, fallback) {
  if (input === undefined || input === null) return fallback;
  const raw = String(input).trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(mb|gb)$/);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  const unit = match[2];
  const multiplier = unit === 'gb' ? 1024 * 1024 * 1024 : 1024 * 1024;
  return Math.round(value * multiplier);
}

const IMPORT_BATCH_SIZE_BYTES = parseSizeBytes(process.env.IMPORT_BATCH_SIZE, DEFAULT_IMPORT_BATCH_BYTES);
const IMPORT_INDEX_RETENTION_DAYS = Math.min(
  7,
  Number.isFinite(Number(process.env.IMPORT_INDEX_RETENTION_DAYS))
    ? Number(process.env.IMPORT_INDEX_RETENTION_DAYS)
    : 7
);
const IMPORT_INDEX_RETENTION_ENABLED = process.env.IMPORT_INDEX_RETENTION_ENABLED !== 'false';

const DEFAULT_CONFIG = {
  opensearchHost: process.env.OPENSEARCH_HOST || 'host.docker.internal',
  opensearchPort: process.env.OPENSEARCH_PORT || '9200',
  opensearchScheme: process.env.OPENSEARCH_SCHEME || (process.env.OPENSEARCH_SSL === 'true' ? 'https' : 'http'),
  opensearchBasePath: process.env.OPENSEARCH_BASE_PATH || '',
  opensearchUsername: process.env.OPENSEARCH_USERNAME || '',
  opensearchPassword: process.env.OPENSEARCH_PASSWORD || '',
  opensearchInsecureSSL: process.env.OPENSEARCH_INSECURE_SSL === 'true',
  opensearchConnections: [],
  opensearchDashboardsUrl: process.env.OPENSEARCH_DASHBOARDS_URL || '',
  importEnabled: process.env.IMPORT_ENABLED === 'true',
  importMaxFileBytes: IMPORT_MAX_FILE_BYTES,
  importBatchSizeBytes: IMPORT_BATCH_SIZE_BYTES,
  importUiVisible: IMPORT_UI_VISIBLE,
  defaultIndexPattern: process.env.DEFAULT_INDEX_PATTERN || 'vector-*',
  indexOptions: [
    'vector-*',
    'app-logs-*',
    '*'
  ],
  indexPatternSettings: [],
  fieldExplorerFields: (process.env.FIELD_EXPLORER_FIELDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
  fieldExplorerTopN: Number(process.env.FIELD_EXPLORER_TOPN || 10),
  timeZone: process.env.DEFAULT_TIME_ZONE || 'UTC',
  maxExportSize: Number(process.env.MAX_EXPORT_SIZE || 100000),
  darkModeDefault: process.env.DARK_MODE_DEFAULT === 'true',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  alertEmailTo: process.env.ALERT_EMAIL_TO || '',
  alertEmailFrom: process.env.ALERT_EMAIL_FROM || '',
  brandName: process.env.BRAND_NAME || 'WDTS Logging Solution',
  brandLogoDataUrl: '',
  brandLogoSizeUser: 'md',
  brandLogoSizeAdmin: 'md',
  motdEnabled: false,
  motdMessage: '',
  teamIndexAccess: {},
  userIndexAccess: {},
  customUrls: [],
  piiFieldRules: [],
  highlightRules: [
    { field: 'response', match: 'equals', pattern: '500', color: '#fecaca' },
    { field: 'response', match: 'equals', pattern: '404', color: '#fde68a' },
    { field: 'response', match: 'equals', pattern: '401', color: '#fde68a' },
    { field: 'response', match: 'equals', pattern: '403', color: '#fde68a' },
    { field: 'request', match: 'contains', pattern: '/login', color: '#bfdbfe' },
    { field: 'request', match: 'contains', pattern: '/admin', color: '#bfdbfe' },
    { field: 'tags', match: 'contains', pattern: 'error', color: '#fecaca' },
    { field: 'geo.src', match: 'equals', pattern: 'IN', color: '#bbf7d0' },
    { field: 'geo.dest', match: 'equals', pattern: 'PT', color: '#bbf7d0' }
  ]
};

if (DEFAULT_CONFIG.fieldExplorerFields.length === 0) {
  DEFAULT_CONFIG.fieldExplorerFields = [
    'service',
    'level',
    'host',
    'env',
    'logger',
    'error_code'
  ];
}

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me';
const ADMIN_USER_B64 = process.env.ADMIN_USER_B64 || '';
const ADMIN_PASS_B64 = process.env.ADMIN_PASS_B64 || '';
const DEFAULT_TEAM = process.env.DEFAULT_TEAM || 'core';
const AUTH_TOKEN_TTL_MINUTES = Number(process.env.AUTH_TOKEN_TTL_MINUTES || 10);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15000);
const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 500);
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 7);
const INDEX_CACHE_TTL_MS = Number(process.env.INDEX_CACHE_TTL_MS || 60000);

const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || '';
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || '';
const OPENSEARCH_SCHEME = process.env.OPENSEARCH_SCHEME || (process.env.OPENSEARCH_SSL === 'true' ? 'https' : 'http');
const OPENSEARCH_INSECURE_SSL = process.env.OPENSEARCH_INSECURE_SSL === 'true';

ensureDir(DATA_DIR);
ensureDir(UPLOADS_DIR);

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: IMPORT_MAX_FILE_BYTES } });

let appConfig = loadJson(CONFIG_PATH, DEFAULT_CONFIG);
appConfig = normalizeConfig(appConfig);
saveJson(CONFIG_PATH, appConfig);

let metrics = loadJson(METRICS_PATH, { byDate: {}, hourlyQueries: {}, hourlyTotals: {}, activity: [] });
let rules = loadJson(RULES_PATH, { rules: [] });
let rulesState = loadJson(RULES_STATE_PATH, { lastTriggeredAt: {} });
let teamBookmarks = loadJson(TEAM_BOOKMARKS_PATH, { bookmarks: [] });
let users = loadJson(USERS_PATH, { users: [] });
let featureToggles = loadJson(FEATURE_TOGGLES_PATH, { teams: {} });
let teams = loadJson(TEAMS_PATH, { teams: [] });
let healthHistory = loadJson(HEALTH_HISTORY_PATH, { history: [] });
let importJobs = loadJson(IMPORT_JOBS_PATH, { jobs: [] });
let importIndices = loadJson(IMPORT_INDICES_PATH, { indices: [] });
let motdTemplates = normalizeMotdTemplates(loadJson(MOTD_TEMPLATES_PATH, { templates: [] }));
saveJson(MOTD_TEMPLATES_PATH, motdTemplates);

const tokenStore = new Map();
const responseCache = new Map();
let indexCache = { value: null, expiresAt: 0 };

function isUserOnline(userId) {
  const now = Date.now();
  for (const [token, entry] of tokenStore.entries()) {
    if (!entry || entry.expiresAt <= now) {
      tokenStore.delete(token);
      continue;
    }
    if (entry.userId === userId) return true;
  }
  return false;
}

function normalizeTeamBookmarks(data) {
  const list = Array.isArray(data.bookmarks) ? data.bookmarks : [];
  return {
    bookmarks: list.map((b) => ({
      id: b.id || crypto.randomUUID(),
      name: String(b.name || '').trim(),
      query: String(b.query || '').trim(),
      team: b.team ? String(b.team).trim() : undefined,
      createdAt: b.createdAt || new Date().toISOString()
    })).filter((b) => b.name && b.query)
  };
}

function normalizeMotdTemplates(data) {
  const list = Array.isArray(data.templates) ? data.templates : [];
  return {
    templates: list.map((entry) => ({
      id: entry.id || crypto.randomUUID(),
      category: String(entry.category || 'general').trim() || 'general',
      title: String(entry.title || '').trim(),
      message: String(entry.message || '').trim(),
      enabled: entry.enabled !== false,
      createdAt: entry.createdAt || new Date().toISOString()
    })).filter((entry) => entry.title && entry.message)
  };
}

function normalizeRules(data) {
  const list = Array.isArray(data.rules) ? data.rules : [];
  return {
    rules: list.map((rule) => ({
      id: rule.id || crypto.randomUUID(),
      name: String(rule.name || '').trim(),
      query: String(rule.query || '').trim(),
      threshold: Number(rule.threshold || 0),
      windowMinutes: Number(rule.windowMinutes || 60),
      team: rule.team ? String(rule.team).trim() : undefined,
      email: rule.email ? String(rule.email).trim() : undefined
    })).filter((r) => r.name && r.query)
  };
}

function normalizeUsers(data) {
  const list = Array.isArray(data.users) ? data.users : [];
  return {
    users: list
      .filter((u) => u && u.username && u.passwordB64)
      .map((u) => ({
        id: u.id || crypto.randomUUID(),
        username: String(u.username).trim(),
        passwordB64: String(u.passwordB64),
        role: ['viewer', 'editor', 'admin'].includes(u.role) ? u.role : 'viewer',
        teams: Array.isArray(u.teams) && u.teams.length > 0 ? u.teams : [DEFAULT_TEAM],
        createdAt: u.createdAt || new Date().toISOString(),
        lastLoginAt: u.lastLoginAt || ''
      }))
  };
}

function normalizeFeatureToggles(data) {
  const teams = data && typeof data.teams === 'object' && data.teams ? data.teams : {};
  const normalized = {};
  Object.entries(teams).forEach(([team, toggles]) => {
    if (!team) return;
    const value = toggles && typeof toggles === 'object' ? toggles : {};
    normalized[team] = {
      exports: value.exports !== false,
      bookmarks: value.bookmarks !== false,
      rules: value.rules !== false,
      queryBuilder: value.queryBuilder !== false,
      limitTo7Days: value.limitTo7Days === true,
      piiUnmasked: value.piiUnmasked === true,
      showFullResults: value.showFullResults === true
    };
  });
  return { teams: normalized };
}

function normalizeMetrics(data) {
  const byDate = data && typeof data.byDate === 'object' && data.byDate ? data.byDate : {};
  Object.values(byDate).forEach((day) => {
    if (!day.users || typeof day.users !== 'object') {
      day.users = {};
    }
  });
  return {
    byDate,
    hourlyQueries: data && typeof data.hourlyQueries === 'object' && data.hourlyQueries ? data.hourlyQueries : {},
    hourlyTotals: data && typeof data.hourlyTotals === 'object' && data.hourlyTotals ? data.hourlyTotals : {},
    activity: Array.isArray(data.activity) ? data.activity.slice(0, 500) : []
  };
}

function normalizeHealthHistory(data) {
  const list = Array.isArray(data.history) ? data.history : [];
  return {
    history: list
      .map((item) => ({
        time: item.time || new Date().toISOString(),
        status: item.status || 'unknown'
      }))
      .slice(0, 500)
  };
}

function saveImportJobs() {
  saveJson(IMPORT_JOBS_PATH, importJobs);
}

function saveImportIndices() {
  saveJson(IMPORT_INDICES_PATH, importIndices);
}

function normalizeImportIndices(data) {
  const list = Array.isArray(data.indices) ? data.indices : [];
  return {
    indices: list
      .map((item) => ({
        index: String(item.index || '').trim(),
        createdAt: item.createdAt || '',
        lastImportedAt: item.lastImportedAt || '',
        autoCreated: Boolean(item.autoCreated)
      }))
      .filter((item) => item.index)
  };
}

function updateImportIndexRegistry({ index, autoCreated }) {
  if (!index) return;
  if (!importIndices || typeof importIndices !== 'object') {
    importIndices = { indices: [] };
  }
  if (!Array.isArray(importIndices.indices)) {
    importIndices.indices = [];
  }
  const now = new Date().toISOString();
  const idx = importIndices.indices.findIndex((entry) => entry.index === index);
  if (idx === -1) {
    importIndices.indices.push({
      index,
      createdAt: autoCreated ? now : '',
      lastImportedAt: now,
      autoCreated: Boolean(autoCreated)
    });
  } else {
    const existing = importIndices.indices[idx];
    importIndices.indices[idx] = {
      ...existing,
      lastImportedAt: now,
      autoCreated: existing.autoCreated || Boolean(autoCreated),
      createdAt: existing.createdAt || (autoCreated ? now : '')
    };
  }
  saveImportIndices();
}

async function pruneImportIndices() {
  if (!IMPORT_INDEX_RETENTION_ENABLED) return;
  if (!Number.isFinite(IMPORT_INDEX_RETENTION_DAYS) || IMPORT_INDEX_RETENTION_DAYS <= 0) return;
  if (!importIndices || typeof importIndices !== 'object' || !Array.isArray(importIndices.indices)) return;
  const cutoffMs = Date.now() - IMPORT_INDEX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remaining = [];
  for (const entry of importIndices.indices) {
    if (!entry || !entry.index || !entry.autoCreated) {
      remaining.push(entry);
      continue;
    }
    const stamp = entry.lastImportedAt || entry.createdAt;
    const ts = stamp ? Date.parse(stamp) : NaN;
    if (!Number.isFinite(ts) || ts >= cutoffMs) {
      remaining.push(entry);
      continue;
    }
    try {
      await axios.delete(`${getOpensearchBaseUrl()}/${entry.index}`, getOpensearchRequestOptions());
    } catch (error) {
      if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
        remaining.push(entry);
        continue;
      }
    }
  }
  importIndices.indices = remaining;
  saveImportIndices();
}

function registerImportJob(job) {
  importJobs.jobs.unshift(job);
  importJobs.jobs = importJobs.jobs.slice(0, 200);
  saveImportJobs();
}

function updateImportJob(jobId, patch) {
  const idx = importJobs.jobs.findIndex((job) => job.id === jobId);
  if (idx === -1) return null;
  importJobs.jobs[idx] = { ...importJobs.jobs[idx], ...patch };
  saveImportJobs();
  return importJobs.jobs[idx];
}

function parseTimestampValue(value, format) {
  if (value === undefined || value === null || value === '') return null;
  if (format === 'epoch_ms') {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }
  if (format === 'epoch_s') {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return null;
    return new Date(seconds * 1000).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseImportLine(line, parserType, options, regex) {
  if (!line.trim()) return { ok: false, error: 'Empty line' };
  if (parserType === 'regex') {
    if (!regex) return { ok: false, error: 'Regex not configured' };
    const match = regex.exec(line);
    if (!match) return { ok: false, error: 'Regex no match' };
    const groups = match.groups || {};
    if (Object.keys(groups).length === 0) {
      return { ok: false, error: 'Regex requires named groups' };
    }
    const parsed = { ...groups };
    return { ok: true, parsed };
  }
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      if (keys.length === 1 && ['index', 'create', 'update', 'delete'].includes(keys[0])) {
        return { ok: false, skip: true, error: 'Bulk metadata line' };
      }
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

async function ensureImportIndexExists(index) {
  if (!IMPORT_AUTO_CREATE_INDEX) return { created: false };
  try {
    await axios.head(`${getOpensearchBaseUrl()}/${index}`, getOpensearchRequestOptions());
    return { created: false };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      await axios.put(`${getOpensearchBaseUrl()}/${index}`, {}, getOpensearchRequestOptions());
      return { created: true };
    }
    throw error;
  }
}

async function runImportJob(job, options) {
  const {
    filePath,
    index,
    parserType,
    regexPattern,
    timestampField,
    timestampFormat
  } = options;
  let regex = null;
  if (parserType === 'regex') {
    try {
      regex = new RegExp(regexPattern);
    } catch (error) {
      updateImportJob(job.id, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: `Invalid regex: ${error.message}`
      });
      return;
    }
  }
  updateImportJob(job.id, { status: 'running', startedAt: new Date().toISOString() });
  try {
    const ensureResult = await ensureImportIndexExists(index);
    updateImportIndexRegistry({ index, autoCreated: ensureResult.created });
  } catch (error) {
    const detail = axios.isAxiosError(error)
      ? (error.response?.data?.error?.reason || error.response?.data?.error || error.response?.data)
      : error.message;
    updateImportJob(job.id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: detail || 'Index creation failed.'
    });
    try {
      fs.unlinkSync(filePath);
    } catch {}
    return;
  }
  let total = 0;
  let ingested = 0;
  let failed = 0;
  let skipped = 0;
  const maxDocsPerBatch = 5000;
  const maxBatchBytes = Math.max(1024 * 1024, Math.round(IMPORT_BATCH_SIZE_BYTES));
  let bulkLines = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = require('readline').createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      total += 1;
      if (total > IMPORT_MAX_LINES) {
        throw new Error(`Max line limit exceeded (${IMPORT_MAX_LINES}).`);
      }
      const parsedResult = parseImportLine(line, parserType, options, regex);
      if (!parsedResult.ok) {
        if (parsedResult.skip) {
          skipped += 1;
          continue;
        }
        failed += 1;
        continue;
      }
      const parsed = parsedResult.parsed || {};
      const rawTimestamp = parsed[timestampField];
      const isoTimestamp = parseTimestampValue(rawTimestamp, timestampFormat);
      if (!isoTimestamp) {
        failed += 1;
        continue;
      }
      parsed[timestampField] = isoTimestamp;
      const actionLine = JSON.stringify({ index: { _index: index } });
      const docLine = JSON.stringify(parsed);
      bulkLines.push(actionLine);
      bulkLines.push(docLine);
      const batchDocs = Math.floor(bulkLines.length / 2);
      const estimatedBytes = bulkLines.reduce((sum, item) => sum + Buffer.byteLength(item) + 1, 0) + 1;
      if (batchDocs >= maxDocsPerBatch || estimatedBytes >= maxBatchBytes) {
        const payload = `${bulkLines.join('\n')}\n`;
        await axios.post(`${getOpensearchBaseUrl()}/_bulk`, payload, {
          ...getOpensearchRequestOptions(),
          headers: { 'Content-Type': 'application/x-ndjson' }
        });
        ingested += batchDocs;
        bulkLines = [];
        updateImportJob(job.id, { totalLines: total, ingested, failed, skipped });
      }
    }
    if (bulkLines.length > 0) {
      const payload = `${bulkLines.join('\n')}\n`;
      const batchDocs = Math.floor(bulkLines.length / 2);
      await axios.post(`${getOpensearchBaseUrl()}/_bulk`, payload, {
        ...getOpensearchRequestOptions(),
        headers: { 'Content-Type': 'application/x-ndjson' }
      });
      ingested += batchDocs;
    }
    updateImportJob(job.id, {
      status: 'completed',
      finishedAt: new Date().toISOString(),
      totalLines: total,
      ingested,
      failed,
      skipped
    });
  } catch (error) {
    updateImportJob(job.id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      totalLines: total,
      ingested,
      failed,
      skipped,
      error: error.message
    });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

function normalizeTeams(data) {
  const list = Array.isArray(data.teams) ? data.teams : [];
  return {
    teams: list
      .map((team) => ({
        id: team.id || crypto.randomUUID(),
        name: String(team.name || '').trim(),
        description: team.description ? String(team.description).trim() : '',
        createdAt: team.createdAt || new Date().toISOString()
      }))
      .filter((team) => team.name)
  };
}

function authEnabled() {
  return Array.isArray(users.users) && users.users.length > 0;
}

function createUser({ username, password, role, teams }) {
  return {
    id: crypto.randomUUID(),
    username,
    passwordB64: Buffer.from(password, 'utf8').toString('base64'),
    role,
    teams,
    createdAt: new Date().toISOString(),
    lastLoginAt: ''
  };
}

function verifyPassword(user, password) {
  const b64 = Buffer.from(password, 'utf8').toString('base64');
  return user.passwordB64 === b64;
}

function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + AUTH_TOKEN_TTL_MINUTES * 60 * 1000;
  tokenStore.set(token, { userId, expiresAt });
  return token;
}

function getUserForToken(token) {
  const entry = tokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(token);
    return null;
  }
  return users.users.find((u) => u.id === entry.userId) || null;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  const user = getUserForToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  return next();
}

function requireRole(role) {
  const roles = ['viewer', 'editor', 'admin'];
  const minIndex = roles.indexOf(role);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userIndex = roles.indexOf(req.user.role);
    if (userIndex < minIndex) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

function getTeamToggle(team) {
  if (!team) {
    return { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false };
  }
  return featureToggles.teams[team]
    || { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false };
}

function getUserFeatures(user) {
  if (!authEnabled()) {
    return { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false };
  }
  const defaults = { exports: false, bookmarks: false, rules: false, queryBuilder: false, limitTo7Days: false, piiUnmasked: false, showFullResults: false };
  if (!user) return defaults;
  return user.teams.reduce((acc, team) => {
    const t = getTeamToggle(team);
    return {
      exports: acc.exports || t.exports,
      bookmarks: acc.bookmarks || t.bookmarks,
      rules: acc.rules || t.rules,
      queryBuilder: acc.queryBuilder || t.queryBuilder,
      limitTo7Days: acc.limitTo7Days || t.limitTo7Days,
      piiUnmasked: acc.piiUnmasked || t.piiUnmasked,
      showFullResults: acc.showFullResults || t.showFullResults
    };
  }, defaults);
}

function getCacheKey(parts) {
  return parts.map((part) => String(part)).join('|');
}

function cacheGet(key) {
  if (!CACHE_TTL_MS) return null;
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (!CACHE_TTL_MS) return;
  responseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (responseCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

teamBookmarks = normalizeTeamBookmarks(teamBookmarks);
saveJson(TEAM_BOOKMARKS_PATH, teamBookmarks);

rules = normalizeRules(rules);
saveJson(RULES_PATH, rules);

users = normalizeUsers(users);
saveJson(USERS_PATH, users);

function reloadUsers() {
  const next = normalizeUsers(loadJson(USERS_PATH, { users: [] }));
  users = next;
  saveJson(USERS_PATH, users);
  return users.users.length;
}

featureToggles = normalizeFeatureToggles(featureToggles);
saveJson(FEATURE_TOGGLES_PATH, featureToggles);

teams = normalizeTeams(teams);
saveJson(TEAMS_PATH, teams);

metrics = normalizeMetrics(metrics);
saveJson(METRICS_PATH, metrics);

healthHistory = normalizeHealthHistory(healthHistory);
saveJson(HEALTH_HISTORY_PATH, healthHistory);

if (!importJobs || typeof importJobs !== 'object') {
  importJobs = { jobs: [] };
}
if (!Array.isArray(importJobs.jobs)) {
  importJobs.jobs = [];
}
importIndices = normalizeImportIndices(importIndices || {});
saveImportIndices();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err.message);
    return fallback;
  }
}

function saveJson(filePath, data) {
  try {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.error(`Failed to write ${filePath}:`, err.message);
  }
}

function normalizeConfig(config) {
  const next = { ...DEFAULT_CONFIG, ...config };
  next.opensearchHost = String(next.opensearchHost || '').trim() || DEFAULT_CONFIG.opensearchHost;
  next.opensearchPort = String(next.opensearchPort || '').trim() || DEFAULT_CONFIG.opensearchPort;
  const scheme = String(next.opensearchScheme || '').trim().toLowerCase();
  next.opensearchScheme = scheme == 'https' ? 'https' : 'http';
  next.opensearchBasePath = normalizeBasePath(next.opensearchBasePath);
  next.opensearchUsername = String(next.opensearchUsername || '').trim();
  next.opensearchPassword = String(next.opensearchPassword || '');
  next.opensearchInsecureSSL = Boolean(next.opensearchInsecureSSL);
  next.opensearchDashboardsUrl = String(next.opensearchDashboardsUrl || '').trim();
  next.importEnabled = process.env.IMPORT_ENABLED === 'true';
  const maxFileBytes = Number(next.importMaxFileBytes);
  next.importMaxFileBytes = Number.isFinite(maxFileBytes) && maxFileBytes > 0 ? maxFileBytes : IMPORT_MAX_FILE_BYTES;
  const batchBytes = Number(next.importBatchSizeBytes);
  next.importBatchSizeBytes = Number.isFinite(batchBytes) && batchBytes > 0 ? batchBytes : IMPORT_BATCH_SIZE_BYTES;
  next.importUiVisible = IMPORT_UI_VISIBLE;
  if (Array.isArray(next.opensearchConnections)) {
    next.opensearchConnections = next.opensearchConnections
      .map((entry) => {
        if (!entry) return null;
        const host = String(entry.host || '').trim();
        if (!host) return null;
        const port = String(entry.port || '').trim() || DEFAULT_CONFIG.opensearchPort;
        const scheme = String(entry.scheme || '').trim().toLowerCase() === 'https' ? 'https' : 'http';
        const basePath = normalizeBasePath(entry.basePath);
        const username = String(entry.username || '').trim();
        const password = String(entry.password || '');
        const insecureSSL = Boolean(entry.insecureSSL);
        return {
          id: entry.id || crypto.randomUUID(),
          host,
          port,
          scheme,
          basePath,
          username,
          password,
          insecureSSL
        };
      })
      .filter(Boolean);
  } else {
    next.opensearchConnections = [];
  }
  next.defaultIndexPattern = String(next.defaultIndexPattern || '').trim() || DEFAULT_CONFIG.defaultIndexPattern;
  if (Array.isArray(next.indexOptions)) {
    next.indexOptions = next.indexOptions
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } else {
    next.indexOptions = DEFAULT_CONFIG.indexOptions.slice();
  }
  if (Array.isArray(next.indexPatternSettings)) {
    next.indexPatternSettings = next.indexPatternSettings
      .map((entry) => {
        if (!entry) return null;
        const pattern = String(entry.pattern || '').split('|')[0].trim();
        const timeField = String(entry.timeField || '').trim();
        const searchFields = Array.isArray(entry.searchFields)
          ? entry.searchFields.map((field) => String(field).trim()).filter((field) => field.length > 0)
          : [];
        const searchMode = String(entry.searchMode || '').trim().toLowerCase();
        if (!pattern) return null;
        return { pattern, timeField, searchFields, searchMode: searchMode === 'exact' ? 'exact' : (searchMode === 'relevant' ? 'relevant' : '') };
      })
      .filter(Boolean);
  } else {
    next.indexPatternSettings = [];
  }
  if (Array.isArray(next.fieldExplorerFields)) {
    next.fieldExplorerFields = next.fieldExplorerFields
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } else {
    next.fieldExplorerFields = DEFAULT_CONFIG.fieldExplorerFields.slice();
  }
  next.fieldExplorerTopN = Number(next.fieldExplorerTopN || DEFAULT_CONFIG.fieldExplorerTopN);
  if (!Number.isFinite(next.fieldExplorerTopN) || next.fieldExplorerTopN < 1) {
    next.fieldExplorerTopN = DEFAULT_CONFIG.fieldExplorerTopN;
  }
  next.timeZone = String(next.timeZone || '').trim() || DEFAULT_CONFIG.timeZone;
  next.maxExportSize = Number(next.maxExportSize || DEFAULT_CONFIG.maxExportSize);
  if (!Number.isFinite(next.maxExportSize) || next.maxExportSize < 1) {
    next.maxExportSize = DEFAULT_CONFIG.maxExportSize;
  }
  next.darkModeDefault = Boolean(next.darkModeDefault);
  next.smtpHost = String(next.smtpHost || '').trim();
  next.smtpPort = Number(next.smtpPort || DEFAULT_CONFIG.smtpPort);
  if (!Number.isFinite(next.smtpPort) || next.smtpPort < 1) {
    next.smtpPort = DEFAULT_CONFIG.smtpPort;
  }
  next.smtpUser = String(next.smtpUser || '').trim();
  next.smtpPass = String(next.smtpPass || '');
  next.alertEmailTo = String(next.alertEmailTo || '').trim();
  next.alertEmailFrom = String(next.alertEmailFrom || '').trim();
  next.brandName = String(next.brandName || '').trim() || DEFAULT_CONFIG.brandName;
  next.brandLogoDataUrl = String(next.brandLogoDataUrl || '').trim();
  const legacySize = String(next.brandLogoSize || '').trim().toLowerCase();
  const userSize = String(next.brandLogoSizeUser || legacySize || '').trim().toLowerCase();
  const adminSize = String(next.brandLogoSizeAdmin || legacySize || '').trim().toLowerCase();
  next.brandLogoSizeUser = userSize === 'sm' || userSize === 'lg' ? userSize : 'md';
  next.brandLogoSizeAdmin = adminSize === 'sm' || adminSize === 'lg' ? adminSize : 'md';
  if (Array.isArray(next.customUrls)) {
    next.customUrls = next.customUrls
      .map((entry) => {
        if (!entry) return null;
        const name = String(entry.name || '').trim();
        const url = String(entry.url || '').trim();
        if (!name || !url) return null;
        return { id: entry.id || crypto.randomUUID(), name, url };
      })
      .filter(Boolean);
  } else {
    next.customUrls = [];
  }
  if (next.teamIndexAccess && typeof next.teamIndexAccess === 'object' && !Array.isArray(next.teamIndexAccess)) {
    const normalized = {};
    Object.entries(next.teamIndexAccess).forEach(([team, patterns]) => {
      const list = Array.isArray(patterns) ? patterns : [];
      const cleaned = list.map((item) => String(item).trim()).filter((item) => item.length > 0);
      if (cleaned.length > 0) normalized[String(team).trim()] = cleaned;
    });
    next.teamIndexAccess = normalized;
  } else {
    next.teamIndexAccess = {};
  }
  if (next.userIndexAccess && typeof next.userIndexAccess === 'object' && !Array.isArray(next.userIndexAccess)) {
    const normalized = {};
    Object.entries(next.userIndexAccess).forEach(([user, patterns]) => {
      const list = Array.isArray(patterns) ? patterns : [];
      const cleaned = list.map((item) => String(item).trim()).filter((item) => item.length > 0);
      if (cleaned.length > 0) normalized[String(user).trim()] = cleaned;
    });
    next.userIndexAccess = normalized;
  } else {
    next.userIndexAccess = {};
  }
  if (Array.isArray(next.piiFieldRules)) {
    next.piiFieldRules = next.piiFieldRules
      .map((rule) => {
        if (!rule) return null;
        if (typeof rule === 'string') {
          return { pattern: rule.trim(), action: 'mask' };
        }
        const pattern = String(rule.pattern || '').trim();
        const action = rule.action === 'hide' ? 'hide' : rule.action === 'partial' ? 'partial' : 'mask';
        return pattern ? { pattern, action } : null;
      })
      .filter(Boolean);
  } else {
    next.piiFieldRules = [];
  }
  if (Array.isArray(next.highlightRules)) {
    next.highlightRules = next.highlightRules
      .map((rule) => {
        if (!rule) return null;
        const field = String(rule.field || '').trim();
        const pattern = String(rule.pattern || '').trim();
        const color = String(rule.color || '').trim();
        const match = rule.match === 'equals' ? 'equals' : 'contains';
        if (!field || !pattern || !color) return null;
        return { field, pattern, color, match };
      })
      .filter(Boolean);
  } else {
    next.highlightRules = [];
  }
  return next;
}

function normalizeBasePath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, '');
}

function getOpensearchBaseUrl() {
  const scheme = appConfig.opensearchScheme || OPENSEARCH_SCHEME;
  const basePath = normalizeBasePath(appConfig.opensearchBasePath);
  return `${scheme}://${appConfig.opensearchHost}:${appConfig.opensearchPort}${basePath}`;
}

function getOpensearchAuth() {
  const username = appConfig.opensearchUsername || OPENSEARCH_USERNAME;
  const password = appConfig.opensearchPassword || OPENSEARCH_PASSWORD || '';
  if (!username) return undefined;
  return { username, password };
}

function getOpensearchRequestOptions() {
  const options = {};
  const auth = getOpensearchAuth();
  if (auth) options.auth = auth;
  const allowInsecure = appConfig.opensearchInsecureSSL || OPENSEARCH_INSECURE_SSL;
  if (allowInsecure) {
    options.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }
  return options;
}

function decodeB64(value) {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function adminAuth(req, res, next) {
  const effectiveUser = ADMIN_USER_B64 ? decodeB64(ADMIN_USER_B64) : ADMIN_USER;
  const effectivePass = ADMIN_PASS_B64 ? decodeB64(ADMIN_PASS_B64) : ADMIN_PASS;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const raw = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const [user, pass] = raw.split(':');
  if (user === effectiveUser && pass === effectivePass) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).json({ error: 'Unauthorized' });
}

function logAccess(req, res) {
  const now = new Date().toISOString();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const method = req.method;
  const url = req.originalUrl || req.url;
  const status = res.statusCode;
  const ua = req.headers['user-agent'] || '';
  const line = `${now} ${ip} ${method} ${url} ${status} "${ua}"\n`;
  fs.appendFile(ACCESS_LOG_PATH, line, () => {});
}

function logError(label, detail) {
  const now = new Date().toISOString();
  const payload = detail ? JSON.stringify(detail) : '';
  const line = `${now} ${label}${payload ? ` ${payload}` : ''}\n`;
  fs.appendFile(ERROR_LOG_PATH, line, () => {});
}

function getImportOptions(req) {
  const index = String(req.body?.index || '').trim();
  const parserType = req.body?.parserType === 'regex' ? 'regex' : 'ndjson';
  const regexPattern = String(req.body?.regexPattern || '').trim();
  const timestampField = String(req.body?.timestampField || '@timestamp').trim();
  const timestampFormat = String(req.body?.timestampFormat || '').trim();
  if (!index) return { error: 'Index is required.' };
  if (parserType === 'regex' && !regexPattern) return { error: 'Regex pattern is required.' };
  if (!timestampField) return { error: 'Timestamp field is required.' };
  return { index, parserType, regexPattern, timestampField, timestampFormat };
}

async function buildImportPreview(filePath, options) {
  const { parserType, regexPattern, timestampField, timestampFormat } = options;
  let regex = null;
  if (parserType === 'regex') {
    try {
      regex = new RegExp(regexPattern);
    } catch (error) {
      throw new Error(`Invalid regex: ${error.message}`);
    }
  }
  const samples = [];
  let errors = 0;
  let skipped = 0;
  let total = 0;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = require('readline').createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    total += 1;
    if (total > IMPORT_MAX_LINES) break;
    const parsedResult = parseImportLine(line, parserType, options, regex);
    if (!parsedResult.ok) {
      if (parsedResult.skip) {
        skipped += 1;
        continue;
      }
      errors += 1;
    } else {
      const parsed = parsedResult.parsed || {};
      const isoTimestamp = parseTimestampValue(parsed[timestampField], timestampFormat);
      if (!isoTimestamp) {
        errors += 1;
      } else {
        parsed[timestampField] = isoTimestamp;
        if (samples.length < IMPORT_PREVIEW_LINES) {
          samples.push(parsed);
        }
      }
    }
    if (samples.length >= IMPORT_PREVIEW_LINES) break;
  }
  return { samples, errors, skipped, totalChecked: total };
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(pattern) {
  return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
}

function getAllowedIndexPatterns(user) {
  if (!user || user.role === 'admin') return [];
  const userAccess = appConfig.userIndexAccess || {};
  const teamAccess = appConfig.teamIndexAccess || {};
  const username = String(user.username || '').trim();
  if (username && Array.isArray(userAccess[username]) && userAccess[username].length > 0) {
    return userAccess[username];
  }
  const teams = Array.isArray(user.teams) ? user.teams : [];
  return teams.flatMap((team) => Array.isArray(teamAccess[team]) ? teamAccess[team] : []);
}

function isIndexPatternAllowed(user, indexPattern) {
  if (!user || user.role === 'admin') return true;
  const allowed = getAllowedIndexPatterns(user);
  if (allowed.length === 0) return true;
  return allowed.some((pattern) => wildcardToRegex(String(pattern)).test(indexPattern));
}

function filterIndexOptionsForUser(user, options) {
  if (!Array.isArray(options)) return [];
  if (!user || user.role === 'admin') return options;
  const allowed = getAllowedIndexPatterns(user);
  if (allowed.length === 0) return options;
  return options.filter((raw) => {
    const pattern = String(raw || '').split('|')[0].trim();
    if (!pattern) return false;
    return allowed.some((allowedPattern) => wildcardToRegex(String(allowedPattern)).test(pattern));
  });
}

function buildPiiMatchers(rules) {
  return (rules || [])
    .map((rule) => {
      const pattern = String(rule.pattern || '').trim();
      if (!pattern) return null;
      const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
      return { pattern, action: rule.action === 'hide' ? 'hide' : rule.action === 'partial' ? 'partial' : 'mask', regex };
    })
    .filter(Boolean);
}

function getPiiAction(path, matchers) {
  let action = null;
  for (const matcher of matchers) {
    if (matcher.regex.test(path)) {
      if (matcher.action === 'hide') return 'hide';
      if (matcher.action === 'mask') {
        action = 'mask';
        continue;
      }
      if (matcher.action === 'partial' && action !== 'mask') action = 'partial';
    }
  }
  return action;
}

const REMOVE_FIELD = Symbol('remove_field');

function partialMaskValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') return '[masked]';
  const raw = String(value);
  if (raw.length === 0) return '';
  if (raw.length <= 2) return '*'.repeat(raw.length);
  if (raw.length <= 4) return `${raw[0]}***${raw[raw.length - 1]}`;
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

function applyPiiRules(value, path, matchers) {
  const action = getPiiAction(path, matchers);
  if (action === 'hide') return REMOVE_FIELD;
  if (action === 'mask') return '[masked]';
  if (action === 'partial') return partialMaskValue(value);
  if (Array.isArray(value)) {
    const nextArr = [];
    value.forEach((item, idx) => {
      const res = applyPiiRules(item, path ? `${path}.${idx}` : String(idx), matchers);
      if (res !== REMOVE_FIELD) nextArr.push(res);
    });
    return nextArr;
  }
  if (value && typeof value === 'object') {
    const nextObj = {};
    Object.entries(value).forEach(([key, val]) => {
      const res = applyPiiRules(val, path ? `${path}.${key}` : key, matchers);
      if (res !== REMOVE_FIELD) nextObj[key] = res;
    });
    return nextObj;
  }
  return value;
}

function applyPiiRulesToHits(hits, rules) {
  if (!Array.isArray(hits) || hits.length === 0) return hits;
  const matchers = buildPiiMatchers(rules);
  if (matchers.length === 0) return hits;
  return hits.map((hit) => {
    if (!hit || !hit._source) return hit;
    const masked = applyPiiRules(hit._source, '', matchers);
    return { ...hit, _source: masked === REMOVE_FIELD ? {} : masked };
  });
}

function maskSearchResponse(data, rules) {
  if (!data || !data.hits || !Array.isArray(data.hits.hits)) return data;
  const maskedHits = applyPiiRulesToHits(data.hits.hits, rules);
  return { ...data, hits: { ...data.hits, hits: maskedHits } };
}

function getIndexTimeFields(indexPattern) {
  const setting = appConfig.indexPatternSettings.find((entry) => entry.pattern === indexPattern);
  if (setting?.timeField) return [setting.timeField, 'timestamp', '@timestamp'];
  return ['timestamp', '@timestamp'];
}

function getRecentCutoffIso() {
  const graceMs = 5 * 60 * 1000;
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - graceMs).toISOString();
}

function buildRecentOnlyFilter(indexPattern) {
  const cutoff = getRecentCutoffIso();
  const fields = getIndexTimeFields(indexPattern);
  const rangeFor = (field) => ({
    range: {
      [field]: {
        gte: cutoff,
        format: 'strict_date_optional_time'
      }
    }
  });
  if (fields.length === 1) return rangeFor(fields[0]);
  return {
    bool: {
      should: fields.map((field) => rangeFor(field)),
      minimum_should_match: 1
    }
  };
}

function applyRecentOnlyFilterToQuery(query, indexPattern) {
  const recentFilter = buildRecentOnlyFilter(indexPattern);
  if (!query || typeof query !== 'object') {
    return { bool: { filter: [recentFilter] } };
  }
  if (query.bool && typeof query.bool === 'object') {
    const nextBool = { ...query.bool };
    if (Array.isArray(nextBool.filter)) {
      nextBool.filter = [...nextBool.filter, recentFilter];
    } else if (nextBool.filter) {
      nextBool.filter = [nextBool.filter, recentFilter];
    } else {
      nextBool.filter = [recentFilter];
    }
    return { ...query, bool: nextBool };
  }
  return { bool: { must: [query], filter: [recentFilter] } };
}

function buildTimeRangeFilter(indexPattern, start, end) {
  const fields = getIndexTimeFields(indexPattern);
  const rangeFor = (field) => ({
    range: {
      [field]: {
        gte: start,
        lte: end,
        format: 'strict_date_optional_time'
      }
    }
  });
  if (fields.length === 1) return rangeFor(fields[0]);
  return {
    bool: {
      should: fields.map((field) => rangeFor(field)),
      minimum_should_match: 1
    }
  };
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function restartComposeServices(services) {
  try {
    return await runCommand('docker', ['compose', 'restart', ...services]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return runCommand('docker-compose', ['restart', ...services]);
    }
    throw error;
  }
}

app.use((req, res, next) => {
  res.on('finish', () => logAccess(req, res));
  next();
});

app.use('/api', (req, res, next) => {
  if (!authEnabled()) return next();
  if (req.path.startsWith('/auth')) return next();
  if (req.path.startsWith('/admin')) return next();
  if (req.path === '/config') return next();
  return requireAuth(req, res, next);
});

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getHourKey(date = new Date()) {
  const iso = date.toISOString().slice(0, 13);
  return iso;
}

function logActivity(type, meta = {}) {
  metrics.activity.unshift({
    time: new Date().toISOString(),
    type,
    query: meta.query || '',
    format: meta.format || '',
    size: meta.size || 0,
    indexPattern: meta.indexPattern || '',
    user: meta.user || 'public',
    ip: meta.ip || '',
    message: meta.message || ''
  });
  metrics.activity = metrics.activity.slice(0, 500);
  saveJson(METRICS_PATH, metrics);
}

function recordSearch(query, ip, meta = {}) {
  const dayKey = getTodayKey();
  const hourKey = getHourKey();
  metrics.byDate[dayKey] = metrics.byDate[dayKey] || {
    searches: 0,
    exports: 0,
    queries: {},
    ips: {},
    users: {},
    exportsByFormat: {}
  };
  const day = metrics.byDate[dayKey];
  day.searches += 1;
  const q = query || '(match_all)';
  day.queries[q] = (day.queries[q] || 0) + 1;
  if (ip) {
    day.ips[ip] = (day.ips[ip] || 0) + 1;
  }
  const userKey = meta.user || 'public';
  day.users[userKey] = (day.users[userKey] || 0) + 1;
  metrics.hourlyQueries[hourKey] = metrics.hourlyQueries[hourKey] || {};
  metrics.hourlyQueries[hourKey][q] = (metrics.hourlyQueries[hourKey][q] || 0) + 1;
  metrics.hourlyTotals[hourKey] = metrics.hourlyTotals[hourKey] || { searches: 0, exports: 0 };
  metrics.hourlyTotals[hourKey].searches += 1;
  logActivity('search', { query: q, indexPattern: meta.indexPattern || '', user: meta.user || 'public', ip });
}

function recordExport(format, ip, meta = {}) {
  const dayKey = getTodayKey();
  metrics.byDate[dayKey] = metrics.byDate[dayKey] || {
    searches: 0,
    exports: 0,
    queries: {},
    ips: {},
    users: {},
    exportsByFormat: {}
  };
  const day = metrics.byDate[dayKey];
  day.exports += 1;
  day.exportsByFormat[format] = (day.exportsByFormat[format] || 0) + 1;
  if (ip) {
    day.ips[ip] = (day.ips[ip] || 0) + 1;
  }
  const userKey = meta.user || 'public';
  day.users[userKey] = (day.users[userKey] || 0) + 1;
  const hourKey = getHourKey();
  metrics.hourlyTotals[hourKey] = metrics.hourlyTotals[hourKey] || { searches: 0, exports: 0 };
  metrics.hourlyTotals[hourKey].exports += 1;
  logActivity('export', {
    format,
    size: meta.size || 0,
    indexPattern: meta.indexPattern || '',
    query: meta.query || '',
    user: meta.user || 'public',
    ip
  });
}

function extractQueryString(body) {
  if (!body || typeof body !== 'object') return '';
  if (body.query_string && typeof body.query_string.query === 'string') {
    return body.query_string.query;
  }
  for (const key of Object.keys(body)) {
    const val = body[key];
    if (val && typeof val === 'object') {
      const result = extractQueryString(val);
      if (result) return result;
    }
  }
  return '';
}

function getMetricsSnapshot() {
  const dayKey = getTodayKey();
  const emptyDay = {
    searches: 0,
    exports: 0,
    queries: {},
    ips: {},
    exportsByFormat: {}
  };
  let day = metrics.byDate[dayKey] || emptyDay;
  let effectiveKey = dayKey;
  if (day.searches === 0 && Object.keys(metrics.byDate || {}).length > 0) {
    const keys = Object.keys(metrics.byDate).sort();
    effectiveKey = keys[keys.length - 1];
    day = metrics.byDate[effectiveKey] || day;
  }
  const topQueries = Object.entries(day.queries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([query, count]) => ({ query, count }));
  return {
    date: effectiveKey,
    searchesToday: day.searches,
    topQueries,
    activeUsers: Object.keys(day.ips).length,
    activeUserIps: Object.keys(day.ips),
    exportsToday: day.exports,
    exportByFormat: day.exportsByFormat
  };
}

function getWeeklyUsage() {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = metrics.byDate[key] || { searches: 0, exports: 0 };
    const total = (day.searches || 0) + (day.exports || 0);
    days.push({ date: key, searches: day.searches || 0, exports: day.exports || 0, total });
  }
  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  const withPercent = days.map((d) => ({
    ...d,
    percent: Math.round((d.total / maxTotal) * 100)
  }));
  return { days: withPercent };
}

function getWeeklyUserEngagement() {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = metrics.byDate[key] || { searches: 0, exports: 0, ips: {} };
    const activeUsers = Object.keys(day.ips || {}).length;
    const total = (day.searches || 0) + (day.exports || 0);
    days.push({ date: key, activeUsers, total });
  }
  const maxUsers = Math.max(1, ...days.map((d) => d.activeUsers));
  const withPercent = days.map((d) => ({
    ...d,
    percent: Math.round((d.activeUsers / maxUsers) * 100)
  }));
  return { days: withPercent };
}

function getTopUsersToday(limit = 7) {
  const dayKey = getTodayKey();
  const day = metrics.byDate[dayKey] || { users: {} };
  const users = Object.entries(day.users || {})
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  const maxCount = Math.max(1, ...users.map((u) => u.count));
  return {
    users: users.map((u) => ({
      ...u,
      percent: Math.round((u.count / maxCount) * 100)
    }))
  };
}

function getHourlyUsage(hours = 24) {
  const series = getRecentHourlySeries(hours);
  const totals = series.map((s) => s.searches + s.exports);
  const maxTotal = Math.max(1, ...totals);
  return {
    hours: series.map((s) => ({
      hour: s.hour,
      total: s.searches + s.exports,
      percent: Math.round(((s.searches + s.exports) / maxTotal) * 100)
    }))
  };
}

function getUserWeeklyUsage(userKey) {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = metrics.byDate[key] || { users: {} };
    const count = day.users?.[userKey] || 0;
    days.push({ date: key, count });
  }
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  return {
    days: days.map((d) => ({
      ...d,
      percent: Math.round((d.count / maxCount) * 100)
    }))
  };
}

function recordHealthSnapshot(status) {
  healthHistory.history.unshift({ time: new Date().toISOString(), status });
  healthHistory.history = healthHistory.history.slice(0, 500);
  saveJson(HEALTH_HISTORY_PATH, healthHistory);
}

async function pollHealthSnapshot() {
  try {
    const health = await axios.get(`${getOpensearchBaseUrl()}/_cluster/health`, getOpensearchRequestOptions());
    const status = health.data?.status || 'unknown';
    recordHealthSnapshot(status);
  } catch {
    recordHealthSnapshot('offline');
  }
}

function getRecentHourlySeries(hours) {
  const series = [];
  const now = new Date();
  for (let i = hours - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - i);
    const key = getHourKey(d);
    const entry = metrics.hourlyTotals[key] || { searches: 0, exports: 0 };
    series.push({ hour: key, searches: entry.searches || 0, exports: entry.exports || 0 });
  }
  return series;
}

function getHealthTrend(hours = 24) {
  const now = new Date();
  const buckets = [];
  for (let i = hours - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - i);
    const key = getHourKey(d);
    const match = healthHistory.history.find((item) => item.time.slice(0, 13) === key);
    buckets.push({ hour: key, status: match ? match.status : 'unknown' });
  }
  return buckets;
}

function getAnomalyHints() {
  const windowHours = 6;
  const series = getRecentHourlySeries(windowHours + 1);
  const current = series[series.length - 1] || { searches: 0, exports: 0 };
  const baseline = series.slice(0, -1);
  const avg = (key) => {
    const sum = baseline.reduce((acc, item) => acc + (item[key] || 0), 0);
    return baseline.length ? sum / baseline.length : 0;
  };
  const avgSearches = avg('searches');
  const avgExports = avg('exports');
  const hints = [];
  if ((avgSearches > 0 && current.searches >= avgSearches * 2 && current.searches >= 10)
    || (avgSearches === 0 && current.searches >= 20)) {
    hints.push({ type: 'searches_spike', current: current.searches, baseline: Number(avgSearches.toFixed(1)) });
  }
  if ((avgExports > 0 && current.exports >= avgExports * 2 && current.exports >= 5)
    || (avgExports === 0 && current.exports >= 10)) {
    hints.push({ type: 'exports_spike', current: current.exports, baseline: Number(avgExports.toFixed(1)) });
  }
  return { hour: current.hour, hints };
}

function rotateAccessLog() {
  if (!fs.existsSync(ACCESS_LOG_PATH)) return { rotated: false, reason: 'No log file' };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const newPath = path.join(DATA_DIR, `access-${stamp}.log`);
  fs.renameSync(ACCESS_LOG_PATH, newPath);
  return { rotated: true, path: newPath };
}

function parseLogTimestamp(filename) {
  const match = filename.match(/^access-(.+)\.log$/);
  if (!match) return null;
  const stamp = match[1];
  const iso = stamp
    .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function pruneOldLogs(retentionDays) {
  if (retentionDays === 0) {
    const files = fs.readdirSync(DATA_DIR);
    let removed = 0;
    for (const file of files) {
      if (!file.startsWith('access-') || !file.endsWith('.log')) continue;
      try {
        fs.unlinkSync(path.join(DATA_DIR, file));
        removed += 1;
      } catch {
        // ignore delete errors
      }
    }
    return { removed };
  }
  if (!retentionDays || retentionDays < 1) return { removed: 0 };
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(DATA_DIR);
  let removed = 0;
  for (const file of files) {
    if (!file.startsWith('access-') || !file.endsWith('.log')) continue;
    const timestamp = parseLogTimestamp(file);
    if (!timestamp) continue;
    if (timestamp.getTime() < cutoff) {
      try {
        fs.unlinkSync(path.join(DATA_DIR, file));
        removed += 1;
      } catch {
        // ignore delete errors
      }
    }
  }
  return { removed };
}

function sanitizeAggName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function pickAggregatableField(baseField, fieldCaps) {
  const direct = fieldCaps[baseField];
  if (direct) {
    const types = Object.keys(direct);
    if (types.some((t) => direct[t]?.aggregatable)) return baseField;
  }
  const keywordField = `${baseField}.keyword`;
  const keyword = fieldCaps[keywordField];
  if (keyword) {
    const types = Object.keys(keyword);
    if (types.some((t) => keyword[t]?.aggregatable)) return keywordField;
  }
  return null;
}

async function getStorageUsage() {
  const files = fs.readdirSync(DATA_DIR);
  const details = [];
  let totalBytes = 0;
  for (const file of files) {
    const full = path.join(DATA_DIR, file);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      totalBytes += stat.size;
      details.push({ file, bytes: stat.size });
    }
  }
  return { totalBytes, files: details };
}

function getQueryCountSince(query, windowMinutes) {
  const now = new Date();
  const buckets = Math.ceil(windowMinutes / 60);
  let count = 0;
  for (let i = 0; i < buckets; i += 1) {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - i);
    const key = getHourKey(d);
    const bucket = metrics.hourlyQueries[key] || {};
    count += bucket[query] || 0;
  }
  return count;
}

async function sendAlertEmail(subject, text, options = {}) {
  const host = appConfig.smtpHost || process.env.SMTP_HOST || '';
  const port = Number(appConfig.smtpPort || process.env.SMTP_PORT || 587);
  const user = appConfig.smtpUser || process.env.SMTP_USER || '';
  const pass = appConfig.smtpPass || process.env.SMTP_PASS || '';
  const to = options.to || appConfig.alertEmailTo || process.env.ALERT_EMAIL_TO || '';
  const from = appConfig.alertEmailFrom || process.env.ALERT_EMAIL_FROM || '';

  if (!host || !to || !from) {
    console.warn('Email settings missing; skipping alert email.');
    return false;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined
  });

  await transport.sendMail({ from, to, subject, text });
  return true;
}

async function runRuleChecks() {
  if (!rules.rules || rules.rules.length === 0) return;
  const now = new Date();
  for (const rule of rules.rules) {
    const query = String(rule.query || '').trim();
    const threshold = Number(rule.threshold || 0);
    const windowMinutes = Number(rule.windowMinutes || 60);
    const email = rule.email ? String(rule.email).trim() : '';
    if (!query || !Number.isFinite(threshold) || threshold < 1) continue;
    const count = getQueryCountSince(query, windowMinutes);
    const last = rulesState.lastTriggeredAt[rule.id] || '';
    const lastTime = last ? new Date(last) : null;
    const withinWindow = lastTime && now.getTime() - lastTime.getTime() < windowMinutes * 60 * 1000;
    if (count > threshold && !withinWindow) {
      const ruleName = rule.name || rule.id;
      const subject = `Alert: "${query}" exceeded ${threshold}/${windowMinutes}m`;
      const text = [
        `Rule: ${ruleName}`,
        `Rule ID: ${rule.id}`,
        `Triggered at: ${now.toISOString()}`,
        `Query: ${query}`,
        `Threshold: ${threshold}`,
        `Window (minutes): ${windowMinutes}`,
        `Count: ${count}`,
        rule.team ? `Team: ${rule.team}` : null
      ].filter(Boolean).join('\n');
      try {
        await sendAlertEmail(subject, text, { to: email || undefined });
        rulesState.lastTriggeredAt[rule.id] = now.toISOString();
        saveJson(RULES_STATE_PATH, rulesState);
      } catch (err) {
        console.error('Failed to send alert email:', err.message);
      }
    }
  }
}

setInterval(runRuleChecks, 5 * 60 * 1000);
setInterval(() => {
  pruneOldLogs(LOG_RETENTION_DAYS);
}, 24 * 60 * 60 * 1000);
setInterval(() => {
  pollHealthSnapshot();
}, 10 * 60 * 1000);

pollHealthSnapshot();

app.get('/api/auth/status', (req, res) => {
  res.json({ enabled: authEnabled() });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = users.users.find((u) => u.username === username);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  user.lastLoginAt = new Date().toISOString();
  saveJson(USERS_PATH, users);
  const token = createToken(user.id);
  logActivity('login', { user: user.username, ip: req.ip, message: 'User login' });
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, teams: user.teams }
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = req.user;
  res.json({ id: user.id, username: user.username, role: user.role, teams: user.teams });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    tokenStore.delete(header.slice(7));
  }
  logActivity('logout', { user: req.user?.username || 'public', ip: req.ip, message: 'User logout' });
  res.json({ ok: true });
});

app.get('/api/feature-toggles', (req, res) => {
  if (!authEnabled()) {
    return res.json({ exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false });
  }
  return res.json(getUserFeatures(req.user));
});

// Public config for app defaults
app.get('/api/config', (req, res) => {
  const user = authEnabled() ? req.user : null;
  const indexOptions = filterIndexOptionsForUser(user, appConfig.indexOptions);
  const indexPatternSettings = Array.isArray(appConfig.indexPatternSettings)
    ? appConfig.indexPatternSettings.filter((entry) => {
        if (!entry || !entry.pattern) return false;
        return !user || user.role === 'admin' || isIndexPatternAllowed(user, entry.pattern);
      })
    : [];
  const defaultIndexPattern = appConfig.defaultIndexPattern && (!user || user.role === 'admin' || isIndexPatternAllowed(user, appConfig.defaultIndexPattern))
    ? appConfig.defaultIndexPattern
    : (indexOptions[0] ? String(indexOptions[0]).split('|')[0].trim() : '');
  let motdEnabled = Boolean(appConfig.motdEnabled);
  let motdMessage = appConfig.motdMessage || '';
  if (!motdMessage) {
    const enabledTemplates = motdTemplates.templates.filter((entry) => entry.enabled);
    if (enabledTemplates.length > 0) {
      const dayKey = Math.floor(Date.now() / 86400000);
      const selected = enabledTemplates[dayKey % enabledTemplates.length];
      motdEnabled = true;
      motdMessage = selected.message;
    }
  }
  res.json({
    defaultIndexPattern,
    indexOptions,
    indexPatternSettings,
    fieldExplorerFields: appConfig.fieldExplorerFields,
    fieldExplorerTopN: appConfig.fieldExplorerTopN,
    timeZone: appConfig.timeZone,
    maxExportSize: appConfig.maxExportSize,
    darkModeDefault: appConfig.darkModeDefault,
    highlightRules: appConfig.highlightRules || [],
    brandName: appConfig.brandName || DEFAULT_CONFIG.brandName,
    brandLogoDataUrl: appConfig.brandLogoDataUrl || '',
    brandLogoSizeUser: appConfig.brandLogoSizeUser || 'md',
    brandLogoSizeAdmin: appConfig.brandLogoSizeAdmin || 'md',
    customUrls: appConfig.customUrls || [],
    motdEnabled,
    motdMessage
  });
});

app.get('/api/time', async (req, res) => {
  try {
    const response = await axios.get(`${getOpensearchBaseUrl()}`, getOpensearchRequestOptions());
    const headerDate = response.headers?.date;
    const serverTime = headerDate ? new Date(headerDate).toISOString() : new Date().toISOString();
    res.json({ serverTime });
  } catch {
    res.json({ serverTime: new Date().toISOString() });
  }
});

app.get('/api/opensearch/status', async (req, res) => {
  const result = { reachable: false, status: null, error: null };
  try {
    const health = await axios.get(`${getOpensearchBaseUrl()}/_cluster/health`, getOpensearchRequestOptions());
    result.reachable = true;
    result.status = health.data?.status || null;
  } catch (err) {
    result.error = err.message;
  }
  res.json(result);
});

// Team bookmarks (shared)
app.get('/api/team-bookmarks', (req, res) => {
  if (!authEnabled()) return res.json(teamBookmarks.bookmarks || []);
  const features = getUserFeatures(req.user);
  if (!features.bookmarks) return res.status(403).json({ error: 'Feature disabled' });
  const user = req.user;
  const filtered = user.role === 'admin'
    ? teamBookmarks.bookmarks
    : teamBookmarks.bookmarks.filter((b) => user.teams.includes(b.team));
  return res.json(filtered);
});

app.post('/api/team-bookmarks', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const query = String(req.body?.query || '').trim();
  let team = req.body?.team ? String(req.body.team).trim() : undefined;
  if (authEnabled()) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const features = getUserFeatures(req.user);
    if (!features.bookmarks) return res.status(403).json({ error: 'Feature disabled' });
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    team = team || req.user.teams[0] || DEFAULT_TEAM;
  }
  if (!name || !query) {
    return res.status(400).json({ error: 'Name and query are required.' });
  }
  if (authEnabled() && req.user.role !== 'admin' && !req.user.teams.includes(team)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const existing = teamBookmarks.bookmarks.find(
    (b) => b.name === name && b.query === query && b.team === team
  );
  if (existing) return res.json(existing);
  const bookmark = { id: crypto.randomUUID(), name, query, team, createdAt: new Date().toISOString() };
  teamBookmarks.bookmarks.push(bookmark);
  saveJson(TEAM_BOOKMARKS_PATH, teamBookmarks);
  logActivity('bookmark_add', {
    user: req.user?.username || 'public',
    ip: req.ip,
    indexPattern: appConfig.defaultIndexPattern || '',
    message: `Bookmark "${name}" added`
  });
  res.json(bookmark);
});

app.delete('/api/team-bookmarks/:id', (req, res) => {
  const id = req.params.id;
  if (authEnabled()) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const features = getUserFeatures(req.user);
    if (!features.bookmarks) return res.status(403).json({ error: 'Feature disabled' });
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const target = teamBookmarks.bookmarks.find((b) => b.id === id);
    if (target && req.user.role !== 'admin' && !req.user.teams.includes(target.team)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const before = teamBookmarks.bookmarks.length;
  teamBookmarks.bookmarks = teamBookmarks.bookmarks.filter((b) => b.id !== id);
  saveJson(TEAM_BOOKMARKS_PATH, teamBookmarks);
  logActivity('bookmark_remove', {
    user: req.user?.username || 'public',
    ip: req.ip,
    message: `Bookmark removed (${id})`
  });
  res.json({ removed: before - teamBookmarks.bookmarks.length });
});

app.post('/api/field-explorer', async (req, res) => {
  const indexPattern = req.body?.indexPattern || appConfig.defaultIndexPattern;
  const start = req.body?.start;
  const end = req.body?.end;
  const topN = Number(req.body?.topN || appConfig.fieldExplorerTopN || 10);
  const fields = Array.isArray(req.body?.fields) && req.body.fields.length > 0
    ? req.body.fields
    : appConfig.fieldExplorerFields;

  const userKey = authEnabled() && req.user ? req.user.id : 'public';
  const features = authEnabled() && req.user ? getUserFeatures(req.user) : { limitTo7Days: false };
  if (authEnabled() && req.user) {
    if (!isIndexPatternAllowed(req.user, indexPattern)) {
      return res.status(403).json({ error: 'Index not allowed for your team.' });
    }
    if (features.limitTo7Days) {
      // Enforce 7-day limit by clamping on the backend, not by blocking.
    }
  }
  const cacheKey = getCacheKey([
    'field-explorer',
    userKey,
    indexPattern,
    features.limitTo7Days ? 'recent-only' : 'all',
    start,
    end,
    topN,
    JSON.stringify(fields)
  ]);
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  if (!Array.isArray(fields) || fields.length === 0) {
    return res.json({ fields: [] });
  }

  const fieldList = fields.slice(0, 30).map((f) => String(f).trim()).filter(Boolean);
  const fieldsToCheck = fieldList.flatMap((f) => [f, `${f}.keyword`]);
  let fieldCaps = {};

  try {
    const capsRes = await axios.get(
      `${getOpensearchBaseUrl()}/${indexPattern}/_field_caps`,
      {
        params: { fields: fieldsToCheck.join(',') },
        ...getOpensearchRequestOptions()
      }
    );
    fieldCaps = capsRes.data?.fields || {};
  } catch (err) {
    console.warn('Field caps failed, falling back to raw fields.');
  }

  const aggs = {};
  const aggMap = [];
  fieldList.forEach((field) => {
    const actualField = Object.keys(fieldCaps).length
      ? pickAggregatableField(field, fieldCaps)
      : field;
    if (!actualField) return;
    const aggName = sanitizeAggName(field);
    aggs[aggName] = {
      terms: {
        field: actualField,
        size: Math.min(Math.max(topN, 1), 50)
      }
    };
    aggMap.push({ aggName, field, actualField });
  });

  if (aggMap.length === 0) {
    return res.json({ fields: [] });
  }

  const query = {
    bool: {
      filter: []
    }
  };
  if (start && end) {
    query.bool.filter.push(buildTimeRangeFilter(indexPattern, start, end));
  }
  if (features.limitTo7Days) {
    query.bool.filter.push(buildRecentOnlyFilter(indexPattern));
  }

  try {
    const response = await axios.post(
      `${getOpensearchBaseUrl()}/${indexPattern}/_search`,
      { size: 0, query, aggs },
      { headers: { 'Content-Type': 'application/json' }, ...getOpensearchRequestOptions() }
    );
    const aggregations = response.data?.aggregations || {};
    const result = aggMap.map(({ aggName, field, actualField }) => {
      const buckets = aggregations[aggName]?.buckets || [];
      return {
        field,
        actualField,
        values: buckets.map((b) => ({ value: b.key, count: b.doc_count }))
      };
    });
    cacheSet(cacheKey, { fields: result });
    res.json({ fields: result });
  } catch (error) {
    console.error('Field explorer error:', error.message);
    res.status(500).json({ error: 'Field explorer failed' });
  }
});

// === Search endpoint ===
app.post('/api/search/:indexPattern/_search', async (req, res) => {
  try {
    const userKey = authEnabled() && req.user ? req.user.id : 'public';
    const features = authEnabled() && req.user ? getUserFeatures(req.user) : { limitTo7Days: false, piiUnmasked: false };
    if (authEnabled() && req.user && !isIndexPatternAllowed(req.user, req.params.indexPattern)) {
      return res.status(403).json({ error: 'Index not allowed for your team.' });
    }
    const effectiveBody = features.limitTo7Days
      ? { ...req.body, query: applyRecentOnlyFilterToQuery(req.body?.query, req.params.indexPattern) }
      : req.body;
    const cacheKey = getCacheKey([
      'search',
      userKey,
      req.params.indexPattern,
      features.piiUnmasked ? 'pii-unmasked' : 'pii-masked',
      JSON.stringify(appConfig.piiFieldRules || []),
      JSON.stringify(effectiveBody || {})
    ]);
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    const response = await axios.post(
      `${getOpensearchBaseUrl()}/${req.params.indexPattern}/_search`,
      effectiveBody,
      {
        headers: { 'Content-Type': 'application/json' },
        ...getOpensearchRequestOptions()
      }
    );
    const query = extractQueryString(req.body);
    recordSearch(query, req.ip, { indexPattern: req.params.indexPattern, user: req.user?.username || 'public' });
    const masked = features.piiUnmasked
      ? response.data
      : maskSearchResponse(response.data, appConfig.piiFieldRules);
    cacheSet(cacheKey, masked);
    res.json(masked);
  } catch (error) {
    const isAxios = axios.isAxiosError(error);
    const status = isAxios && error.response?.status ? error.response.status : 500;
    const detail = isAxios
      ? (error.response?.data?.error?.reason || error.response?.data?.error || error.response?.data)
      : error.message;
    console.error('Search error:', detail || error.message);
    logError('search', { status, detail, indexPattern: req.params.indexPattern });
    res.status(status).json({ error: 'Search failed', detail });
  }
});

// === Export endpoint (fixed) ===
app.post('/api/export/estimate', async (req, res) => {
  const { query, indexPattern = appConfig.defaultIndexPattern } = req.body || {};
  const features = authEnabled() && req.user ? getUserFeatures(req.user) : { limitTo7Days: false };
  if (authEnabled()) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!features.exports) return res.status(403).json({ error: 'Feature disabled' });
    if (!isIndexPatternAllowed(req.user, indexPattern)) {
      return res.status(403).json({ error: 'Index not allowed for your team.' });
    }
  }
  const effectiveQuery = features.limitTo7Days
    ? applyRecentOnlyFilterToQuery(query, indexPattern)
    : (query || { match_all: {} });

  try {
    const searchBody = {
      query: effectiveQuery,
      size: 10,
      track_total_hits: true,
      sort: [
        { timestamp: { order: 'desc', unmapped_type: 'date' } },
        { '@timestamp': { order: 'desc', unmapped_type: 'date' } }
      ]
    };
    const response = await axios.post(
      `${getOpensearchBaseUrl()}/${indexPattern}/_search`,
      searchBody,
      {
        headers: { 'Content-Type': 'application/json' },
        ...getOpensearchRequestOptions()
      }
    );
    const totalHits = response.data?.hits?.total?.value ?? response.data?.hits?.total ?? 0;
    const hits = response.data?.hits?.hits || [];
    const sizes = hits.map((h) => JSON.stringify(h._source || {}).length);
    const avgBytes = sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;
    const estimatedBytes = avgBytes * totalHits;
    res.json({
      totalHits,
      sampleSize: sizes.length,
      avgBytes,
      estimatedBytes,
      maxExportSize: appConfig.maxExportSize
    });
  } catch (error) {
    res.status(500).json({ error: 'Estimate failed' });
  }
});

app.post('/api/export/:format', async (req, res) => {
  const { format } = req.params;
  const { query, indexPattern = appConfig.defaultIndexPattern, size = appConfig.maxExportSize } = req.body;

  const features = authEnabled() && req.user ? getUserFeatures(req.user) : { limitTo7Days: false, piiUnmasked: false };
  if (authEnabled()) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!features.exports) return res.status(403).json({ error: 'Feature disabled' });
    if (!isIndexPatternAllowed(req.user, indexPattern)) {
      return res.status(403).json({ error: 'Index not allowed for your team.' });
    }
  }
  const effectiveQuery = features.limitTo7Days
    ? applyRecentOnlyFilterToQuery(query, indexPattern)
    : (query || { match_all: {} });

  if (size > appConfig.maxExportSize) {
    return res.status(400).json({ error: `Max export size: ${appConfig.maxExportSize} records` });
  }

  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `logs-${timestamp}.${format}.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const gzip = createGzip({ level: 9 });
    gzip.pipe(res);

    // Build query
    const searchBody = {
      query: effectiveQuery,
      size: Math.min(1000, size),
      sort: [
        { timestamp: { order: 'desc', unmapped_type: 'date' } },
        { '@timestamp': { order: 'desc', unmapped_type: 'date' } }
      ]
    };

    // Initial search
    const initialRes = await axios.post(
      `${getOpensearchBaseUrl()}/${indexPattern}/_search?scroll=1m`,
      searchBody,
      {
        headers: { 'Content-Type': 'application/json' },
        ...getOpensearchRequestOptions()
      }
    );

    let scrollId = initialRes.data._scroll_id;
    let hits = features.piiUnmasked
      ? initialRes.data.hits.hits
      : applyPiiRulesToHits(initialRes.data.hits.hits, appConfig.piiFieldRules);
    let totalExported = 0;

    // Handle empty result
    if (hits.length === 0) {
      if (format === 'csv') {
        gzip.write('"message"\n"No logs found"\n');
      } else {
        gzip.write(JSON.stringify({ message: 'No logs found' }) + '\n');
      }
      gzip.end();
      recordExport(format, req.ip, {
        indexPattern,
        size,
        query: extractQueryString(query),
        user: req.user?.username || 'public'
      });
      return;
    }

    // Write header for CSV
    if (format === 'csv') {
      const headers = Object.keys(hits[0]._source);
      const headerLine = headers.map(h => `"${h}"`).join(',') + '\n';
      gzip.write(headerLine);
    }

    // Process first batch
    writeBatch(hits, format, gzip);
    totalExported += hits.length;

    // Scroll remaining
    while (hits.length > 0 && totalExported < size) {
      const next = await axios.post(
        `${getOpensearchBaseUrl()}/_search/scroll`,
        { scroll: '1m', scroll_id: scrollId },
        {
          headers: { 'Content-Type': 'application/json' },
          ...getOpensearchRequestOptions()
        }
      );
      scrollId = next.data._scroll_id;
      const nextHits = features.piiUnmasked
        ? next.data.hits.hits
        : applyPiiRulesToHits(next.data.hits.hits, appConfig.piiFieldRules);
      hits = nextHits.slice(0, size - totalExported);
      if (hits.length > 0) {
        writeBatch(hits, format, gzip);
        totalExported += hits.length;
      }
    }

    // Clean up
    axios.delete(`${getOpensearchBaseUrl()}/_search/scroll`, {
      data: { scroll_id: scrollId },
      ...getOpensearchRequestOptions()
    }).catch(() => {});

    recordExport(format, req.ip, {
      indexPattern,
      size,
      query: extractQueryString(query),
      user: req.user?.username || 'public'
    });
    gzip.end();
  } catch (error) {
    console.error('Export error:', error.message);
    // Send error as JSON in gzip (so browser doesn't hang)
    const gzip = createGzip({ level: 9 });
    gzip.pipe(res);
    gzip.write(JSON.stringify({ error: 'Export failed: ' + error.message }));
    gzip.end();
  }
});

function writeBatch(hits, format, stream) {
  if (format === 'json') {
    const lines = hits.map(h => JSON.stringify(h._source)).join('\n');
    stream.write(lines + '\n');
  } else if (format === 'csv') {
    const headers = Object.keys(hits[0]._source);
    const lines = hits.map(hit => {
      return headers.map(h => {
        const val = hit._source[h];
        if (val == null) return '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    }).join('\n');
    stream.write(lines + '\n');
  }
}

// Admin API (Basic Auth)
app.use('/api/admin', adminAuth);

app.get('/api/admin/ping', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/config', (req, res) => {
  const payload = { ...appConfig, importUiVisible: IMPORT_UI_VISIBLE, importEnabled: process.env.IMPORT_ENABLED === 'true' };
  res.json(payload);
});

app.post('/api/admin/restart', async (req, res) => {
  const target = String(req.body?.target || '').toLowerCase();
  if (target !== 'proxy' && target !== 'frontend') {
    return res.status(400).json({ error: 'Invalid restart target.' });
  }
  const services = target === 'frontend' ? ['proxy', 'frontend'] : ['proxy'];
  try {
    const result = await restartComposeServices(services);
    res.json({
      ok: true,
      message: `Restarted ${services.join(', ')}.`,
      output: [result.stdout, result.stderr].filter(Boolean).join('\n')
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Restart failed.',
      detail: error.stderr || error.stdout || error.message
    });
  }
});

app.post('/api/admin/email/test', async (req, res) => {
  try {
    const ok = await sendAlertEmail('LogSearch Test Email', 'This is a test email from LogSearch.');
    if (!ok) {
      return res.status(400).json({ error: 'Email settings missing or incomplete.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Test email failed.', detail: error.message });
  }
});

app.put('/api/admin/config', (req, res) => {
  const next = { ...appConfig };
  if (req.body?.opensearchHost !== undefined) next.opensearchHost = String(req.body.opensearchHost).trim();
  if (req.body?.opensearchPort !== undefined) next.opensearchPort = String(req.body.opensearchPort).trim();
  if (req.body?.opensearchScheme !== undefined) next.opensearchScheme = String(req.body.opensearchScheme).trim();
  if (req.body?.opensearchBasePath !== undefined) next.opensearchBasePath = String(req.body.opensearchBasePath).trim();
  if (req.body?.opensearchUsername !== undefined) next.opensearchUsername = String(req.body.opensearchUsername).trim();
  if (req.body?.opensearchPassword !== undefined) next.opensearchPassword = String(req.body.opensearchPassword);
  if (req.body?.opensearchInsecureSSL !== undefined) next.opensearchInsecureSSL = Boolean(req.body.opensearchInsecureSSL);
  if (req.body?.opensearchDashboardsUrl !== undefined) next.opensearchDashboardsUrl = String(req.body.opensearchDashboardsUrl);
  if (req.body?.opensearchConnections !== undefined && Array.isArray(req.body.opensearchConnections)) {
    next.opensearchConnections = req.body.opensearchConnections;
  }
  // importEnabled/importUiVisible are controlled by env only
  if (req.body?.customUrls !== undefined && Array.isArray(req.body.customUrls)) {
    next.customUrls = req.body.customUrls;
  }
  if (req.body?.motdEnabled !== undefined) next.motdEnabled = Boolean(req.body.motdEnabled);
  if (req.body?.motdMessage !== undefined) next.motdMessage = String(req.body.motdMessage);
  if (req.body?.defaultIndexPattern !== undefined) next.defaultIndexPattern = String(req.body.defaultIndexPattern).trim();
  if (req.body?.indexOptions !== undefined && Array.isArray(req.body.indexOptions)) {
    next.indexOptions = req.body.indexOptions;
  }
  if (req.body?.indexPatternSettings !== undefined && Array.isArray(req.body.indexPatternSettings)) {
    next.indexPatternSettings = req.body.indexPatternSettings;
  }
  if (req.body?.fieldExplorerFields !== undefined && Array.isArray(req.body.fieldExplorerFields)) {
    next.fieldExplorerFields = req.body.fieldExplorerFields;
  }
  if (req.body?.piiFieldRules !== undefined && Array.isArray(req.body.piiFieldRules)) {
    next.piiFieldRules = req.body.piiFieldRules;
  }
  if (req.body?.highlightRules !== undefined && Array.isArray(req.body.highlightRules)) {
    next.highlightRules = req.body.highlightRules;
  }
  if (req.body?.teamIndexAccess !== undefined && typeof req.body.teamIndexAccess === 'object' && !Array.isArray(req.body.teamIndexAccess)) {
    next.teamIndexAccess = req.body.teamIndexAccess;
  }
  if (req.body?.userIndexAccess !== undefined && typeof req.body.userIndexAccess === 'object' && !Array.isArray(req.body.userIndexAccess)) {
    next.userIndexAccess = req.body.userIndexAccess;
  }
  if (req.body?.fieldExplorerTopN !== undefined) {
    next.fieldExplorerTopN = Number(req.body.fieldExplorerTopN);
  }
  if (req.body?.timeZone !== undefined) next.timeZone = String(req.body.timeZone).trim();
  if (req.body?.maxExportSize !== undefined) next.maxExportSize = Number(req.body.maxExportSize);
  if (req.body?.darkModeDefault !== undefined) next.darkModeDefault = Boolean(req.body.darkModeDefault);
  if (req.body?.smtpHost !== undefined) next.smtpHost = String(req.body.smtpHost).trim();
  if (req.body?.smtpPort !== undefined) next.smtpPort = Number(req.body.smtpPort);
  if (req.body?.smtpUser !== undefined) next.smtpUser = String(req.body.smtpUser).trim();
  if (req.body?.smtpPass !== undefined) next.smtpPass = String(req.body.smtpPass);
  if (req.body?.alertEmailTo !== undefined) next.alertEmailTo = String(req.body.alertEmailTo).trim();
  if (req.body?.alertEmailFrom !== undefined) next.alertEmailFrom = String(req.body.alertEmailFrom).trim();
  if (req.body?.brandName !== undefined) next.brandName = String(req.body.brandName).trim();
  if (req.body?.brandLogoDataUrl !== undefined) next.brandLogoDataUrl = String(req.body.brandLogoDataUrl);
  if (req.body?.brandLogoSizeUser !== undefined) next.brandLogoSizeUser = String(req.body.brandLogoSizeUser);
  if (req.body?.brandLogoSizeAdmin !== undefined) next.brandLogoSizeAdmin = String(req.body.brandLogoSizeAdmin);
  appConfig = normalizeConfig(next);
  saveJson(CONFIG_PATH, appConfig);
  logActivity('config_update', { user: 'admin', ip: req.ip, message: 'App config updated' });
  res.json(appConfig);
});

app.get('/api/admin/metrics', (req, res) => {
  res.json(getMetricsSnapshot());
});

app.get('/api/admin/metrics-weekly', (req, res) => {
  res.json(getWeeklyUsage());
});

app.get('/api/admin/metrics-users-daily', (req, res) => {
  res.json(getTopUsersToday(7));
});

app.get('/api/admin/metrics-hourly', (req, res) => {
  res.json(getHourlyUsage(24));
});

app.get('/api/metrics-weekly', (req, res) => {
  res.json(getWeeklyUserEngagement());
});

app.get('/api/metrics-user-weekly', (req, res) => {
  const userKey = authEnabled() && req.user ? req.user.username : req.ip || 'public';
  res.json(getUserWeeklyUsage(userKey));
});

app.get('/api/admin/anomalies', (req, res) => {
  res.json(getAnomalyHints());
});

app.get('/api/admin/activity', (req, res) => {
  res.json(metrics.activity || []);
});

app.get('/api/admin/health-trend', (req, res) => {
  res.json({ hours: getHealthTrend(24) });
});

app.get('/api/admin/indexes', async (req, res) => {
  const refresh = String(req.query?.refresh || '') === 'true';
  if (!refresh && indexCache.value && Date.now() < indexCache.expiresAt) {
    return res.json({ ...indexCache.value, cached: true });
  }
  try {
    const response = await axios.get(
      `${getOpensearchBaseUrl()}/_cat/indices`,
      {
        params: { format: 'json', bytes: 'b' },
        ...getOpensearchRequestOptions()
      }
    );
    const indices = (response.data || []).map((item) => ({
      index: item.index,
      health: item.health,
      status: item.status,
      pri: Number(item.pri || 0),
      rep: Number(item.rep || 0),
      docsCount: Number(item['docs.count'] || 0),
      storeBytes: Number(item['store.size'] || 0)
    }));
    const summary = {
      totalIndices: indices.length,
      totalDocs: indices.reduce((acc, i) => acc + i.docsCount, 0),
      totalStoreBytes: indices.reduce((acc, i) => acc + i.storeBytes, 0)
    };
    const payload = {
      fetchedAt: new Date().toISOString(),
      summary,
      indices
    };
    indexCache = { value: payload, expiresAt: Date.now() + INDEX_CACHE_TTL_MS };
    res.json({ ...payload, cached: false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load index stats.' });
  }
});

app.get('/api/admin/time-fields', async (req, res) => {
  const indexPattern = String(req.query?.indexPattern || '').trim();
  if (!indexPattern) return res.status(400).json({ error: 'indexPattern required' });
  const cacheKey = getCacheKey(['time-fields', indexPattern]);
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);
  try {
    const capsRes = await axios.get(
      `${getOpensearchBaseUrl()}/${indexPattern}/_field_caps`,
      {
        params: { fields: '*' },
        ...getOpensearchRequestOptions()
      }
    );
    const fields = capsRes.data?.fields || {};
    const timeFields = Object.entries(fields)
      .filter(([, types]) => types?.date || types?.date_nanos)
      .map(([field]) => field)
      .sort();
    const payload = { fields: timeFields };
    cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    const detail = axios.isAxiosError(error)
      ? (error.response?.data?.error?.reason || error.response?.data?.error || error.response?.data)
      : error.message;
    console.error('Time field lookup error:', detail || error.message);
    logError('time-fields', { detail, indexPattern });
    res.status(502).json({ error: 'Time field lookup failed', detail });
  }
});

app.get('/api/admin/storage', async (req, res) => {
  const usage = await getStorageUsage();
  res.json(usage);
});

app.get('/api/admin/import/history', (req, res) => {
  res.json((importJobs.jobs || []).slice(0, 5));
});

app.get('/api/admin/import/:id/status', (req, res) => {
  const job = (importJobs.jobs || []).find((entry) => entry.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Import job not found.' });
  res.json(job);
});

app.post('/api/admin/import/preview', upload.single('file'), async (req, res) => {
  if (!appConfig.importEnabled) {
    return res.status(403).json({ error: 'Import is disabled.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'File is required.' });
  }
  const options = getImportOptions(req);
  if (options.error) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: options.error });
  }
  try {
    const preview = await buildImportPreview(req.file.path, options);
    return res.json(preview);
  } catch (error) {
    return res.status(400).json({ error: 'Preview failed.', detail: error.message });
  } finally {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
  }
});

app.post('/api/admin/import', upload.single('file'), async (req, res) => {
  if (!appConfig.importEnabled) {
    return res.status(403).json({ error: 'Import is disabled.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'File is required.' });
  }
  const options = getImportOptions(req);
  if (options.error) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: options.error });
  }
  const job = {
    id: crypto.randomUUID(),
    status: 'pending',
    index: options.index,
    parserType: options.parserType,
    fileName: req.file.originalname,
    createdAt: new Date().toISOString(),
    totalLines: 0,
    ingested: 0,
    failed: 0,
    skipped: 0
  };
  registerImportJob(job);
  res.json({ id: job.id });
  runImportJob(job, {
    filePath: req.file.path,
    index: options.index,
    parserType: options.parserType,
    regexPattern: options.regexPattern,
    timestampField: options.timestampField,
    timestampFormat: options.timestampFormat
  });
});

app.post('/api/admin/logs/rotate', (req, res) => {
  res.json(rotateAccessLog());
});

app.post('/api/admin/logs/prune', (req, res) => {
  const days = Number(req.body?.days || LOG_RETENTION_DAYS);
  res.json(pruneOldLogs(days));
});

app.get('/api/admin/diagnostics', async (req, res) => {
  const result = {
    time: new Date().toISOString(),
    proxyUptimeSeconds: Math.floor(process.uptime()),
    appVersion: process.env.APP_VERSION || process.env.IMAGE_TAG || '',
    opensearch: { reachable: false, status: null, info: null }
  };
  try {
    const info = await axios.get(`${getOpensearchBaseUrl()}`, getOpensearchRequestOptions());
    const health = await axios.get(`${getOpensearchBaseUrl()}/_cluster/health`, getOpensearchRequestOptions());
    result.opensearch.reachable = true;
    result.opensearch.status = health.data?.status || null;
    result.opensearch.info = info.data;
  } catch (err) {
    result.opensearch.error = err.message;
  }
  res.json(result);
});

app.get('/api/admin/rules', (req, res) => {
  res.json(rules.rules || []);
});

app.put('/api/admin/rules', (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : [];
  const normalized = normalizeRules({ rules: incoming });
  rules.rules = normalized.rules;
  saveJson(RULES_PATH, rules);
  logActivity('alert_rules_update', { user: 'admin', ip: req.ip, message: 'Alert rules updated' });
  res.json(rules.rules);
});

app.get('/api/admin/motd-templates', (req, res) => {
  res.json(motdTemplates.templates || []);
});

app.put('/api/admin/motd-templates', (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : [];
  motdTemplates = normalizeMotdTemplates({ templates: incoming });
  saveJson(MOTD_TEMPLATES_PATH, motdTemplates);
  res.json(motdTemplates.templates);
});

app.get('/api/admin/team-bookmarks', (req, res) => {
  res.json(teamBookmarks.bookmarks || []);
});

app.post('/api/admin/team-bookmarks', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const query = String(req.body?.query || '').trim();
  const team = req.body?.team ? String(req.body.team).trim() : undefined;
  if (!name || !query) {
    return res.status(400).json({ error: 'Name and query are required.' });
  }
  const existing = teamBookmarks.bookmarks.find(
    (b) => b.name === name && b.query === query && b.team === team
  );
  if (existing) return res.json(existing);
  const bookmark = { id: crypto.randomUUID(), name, query, team, createdAt: new Date().toISOString() };
  teamBookmarks.bookmarks.push(bookmark);
  saveJson(TEAM_BOOKMARKS_PATH, teamBookmarks);
  res.json(bookmark);
});

app.delete('/api/admin/team-bookmarks/:id', (req, res) => {
  const before = teamBookmarks.bookmarks.length;
  teamBookmarks.bookmarks = teamBookmarks.bookmarks.filter((b) => b.id !== req.params.id);
  saveJson(TEAM_BOOKMARKS_PATH, teamBookmarks);
  res.json({ removed: before - teamBookmarks.bookmarks.length });
});

app.get('/api/rules', (req, res) => {
  if (!authEnabled()) return res.json(rules.rules || []);
  const features = getUserFeatures(req.user);
  if (!features.rules) return res.status(403).json({ error: 'Feature disabled' });
  const user = req.user;
  const list = user.role === 'admin'
    ? rules.rules
    : rules.rules.filter((r) => user.teams.includes(r.team));
  res.json(list);
});

app.put('/api/rules', (req, res) => {
  if (authEnabled()) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const features = getUserFeatures(req.user);
    if (!features.rules) return res.status(403).json({ error: 'Feature disabled' });
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
  }
  const incoming = Array.isArray(req.body) ? req.body : [];
  const normalized = normalizeRules({ rules: incoming }).rules;
  if (!authEnabled() || req.user.role === 'admin') {
    rules.rules = normalized;
  } else {
    const allowedTeams = new Set(req.user.teams);
    const filtered = normalized.filter((r) => allowedTeams.has(r.team));
    const preserved = rules.rules.filter((r) => !allowedTeams.has(r.team));
    rules.rules = [...preserved, ...filtered];
  }
  saveJson(RULES_PATH, rules);
  logActivity('alert_rules_update', { user: req.user?.username || 'public', ip: req.ip, message: 'Alert rules updated' });
  const responseList = authEnabled()
    ? rules.rules.filter((r) => req.user.role === 'admin' || req.user.teams.includes(r.team))
    : rules.rules;
  res.json(responseList);
});

app.get('/api/admin/users', (req, res) => {
  res.json(users.users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    teams: u.teams,
    online: isUserOnline(u.id),
    createdAt: u.createdAt || '',
    lastLoginAt: u.lastLoginAt || ''
  })));
});

app.post('/api/admin/users', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const role = ['viewer', 'editor', 'admin'].includes(req.body?.role) ? req.body.role : 'viewer';
  const teams = Array.isArray(req.body?.teams) && req.body.teams.length > 0 ? req.body.teams : [DEFAULT_TEAM];
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  if (users.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists.' });
  }
  const user = createUser({ username, password, role, teams });
  users.users.push(user);
  saveJson(USERS_PATH, users);
  logActivity('user_create', { user: 'admin', ip: req.ip, message: `User created: ${user.username}` });
  res.json({ id: user.id, username: user.username, role: user.role, teams: user.teams, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt });
});

app.put('/api/admin/users/:id', (req, res) => {
  const user = users.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (req.body?.password) {
    user.passwordB64 = Buffer.from(String(req.body.password), 'utf8').toString('base64');
  }
  if (req.body?.role && ['viewer', 'editor', 'admin'].includes(req.body.role)) {
    user.role = req.body.role;
  }
  if (Array.isArray(req.body?.teams) && req.body.teams.length > 0) {
    user.teams = req.body.teams;
  }
  saveJson(USERS_PATH, users);
  logActivity('user_update', { user: 'admin', ip: req.ip, message: `User updated: ${user.username}` });
  res.json({ id: user.id, username: user.username, role: user.role, teams: user.teams, createdAt: user.createdAt || '', lastLoginAt: user.lastLoginAt || '' });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const before = users.users.length;
  users.users = users.users.filter((u) => u.id !== req.params.id);
  saveJson(USERS_PATH, users);
  logActivity('user_delete', { user: 'admin', ip: req.ip, message: `User deleted (${req.params.id})` });
  res.json({ removed: before - users.users.length });
});

app.post('/api/admin/users/reload', (req, res) => {
  const count = reloadUsers();
  res.json({ loaded: count });
});

app.get('/api/admin/feature-toggles', (req, res) => {
  res.json(featureToggles);
});

app.put('/api/admin/feature-toggles', (req, res) => {
  featureToggles = normalizeFeatureToggles(req.body || {});
  saveJson(FEATURE_TOGGLES_PATH, featureToggles);
  logActivity('feature_toggles_update', { user: 'admin', ip: req.ip, message: 'Feature toggles updated' });
  res.json(featureToggles);
});

app.get('/api/admin/backup', (req, res) => {
  logActivity('backup', { user: 'admin', ip: req.ip, message: 'Backup exported' });
  res.json({
    exportedAt: new Date().toISOString(),
    appConfig,
    rules,
    teamBookmarks,
    users,
    featureToggles,
    teams
  });
});

app.post('/api/admin/restore', (req, res) => {
  const incoming = req.body || {};
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid payload.' });
  }
  const payload = incoming;
  if (payload.appConfig) {
    appConfig = normalizeConfig(payload.appConfig);
    saveJson(CONFIG_PATH, appConfig);
  }
  if (payload.rules) {
    rules = normalizeRules(payload.rules);
    saveJson(RULES_PATH, rules);
  }
  if (payload.teamBookmarks) {
    teamBookmarks = normalizeTeamBookmarks(payload.teamBookmarks);
    saveJson(TEAM_BOOKMARKS_PATH, teamBookmarks);
  }
  if (payload.users) {
    users = normalizeUsers(payload.users);
    saveJson(USERS_PATH, users);
  }
  if (payload.featureToggles) {
    featureToggles = normalizeFeatureToggles(payload.featureToggles);
    saveJson(FEATURE_TOGGLES_PATH, featureToggles);
  }
  if (payload.teams) {
    teams = normalizeTeams(payload.teams);
    saveJson(TEAMS_PATH, teams);
  }
  logActivity('restore', { user: 'admin', ip: req.ip, message: 'Backup restored' });
  res.json({ ok: true });
});

app.get('/api/admin/teams', (req, res) => {
  res.json(teams.teams || []);
});

app.post('/api/admin/teams', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = req.body?.description ? String(req.body.description).trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'Team name is required.' });
  }
  const existing = teams.teams.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.json(existing);
  const team = { id: crypto.randomUUID(), name, description, createdAt: new Date().toISOString() };
  teams.teams.push(team);
  saveJson(TEAMS_PATH, teams);
  logActivity('team_create', { user: 'admin', ip: req.ip, message: `Team created: ${team.name}` });
  res.json(team);
});

app.delete('/api/admin/teams/:id', (req, res) => {
  const before = teams.teams.length;
  teams.teams = teams.teams.filter((t) => t.id !== req.params.id);
  saveJson(TEAMS_PATH, teams);
  logActivity('team_delete', { user: 'admin', ip: req.ip, message: `Team deleted (${req.params.id})` });
  res.json({ removed: before - teams.teams.length });
});

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError || err.code === 'LIMIT_FILE_SIZE') {
    const maxMb = Math.max(1, Math.round(IMPORT_MAX_FILE_BYTES / (1024 * 1024)));
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `File too large. Max ${maxMb} MB.`
      : err.message || 'Upload failed.';
    return res.status(413).json({ error: message, code: err.code, limitBytes: IMPORT_MAX_FILE_BYTES });
  }
  const detail = err.message || String(err);
  return res.status(500).json({ error: 'Import failed.', detail });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

if (IMPORT_INDEX_RETENTION_ENABLED) {
  const intervalMs = 6 * 60 * 60 * 1000;
  setTimeout(() => {
    pruneImportIndices().catch(() => {});
  }, 60 * 1000);
  setInterval(() => {
    pruneImportIndices().catch(() => {});
  }, intervalMs);
}

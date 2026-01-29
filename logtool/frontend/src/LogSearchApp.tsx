// frontend/src/LogSearchApp.tsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import { subMinutes, startOfToday, subHours, subDays, formatISO } from 'date-fns';
import JsonHighlighter from './components/SyntaxHighlighter';

interface SearchResult {
  _id: string;
  _source: Record<string, any>;
  _index: string;
}

const TIME_PRESETS = [
  { label: 'Last 15 mins', value: '15m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Custom', value: 'custom' },
];

interface IndexPatternSetting {
  pattern: string;
  timeField: string;
  searchFields: string[];
  searchMode?: 'relevant' | 'exact' | '';
}

interface AppConfig {
  defaultIndexPattern: string;
  indexOptions: string[];
  indexPatternSettings: IndexPatternSetting[];
  fieldExplorerFields: string[];
  fieldExplorerTopN: number;
  timeZone: string;
  maxExportSize: number;
  darkModeDefault: boolean;
  highlightRules: HighlightRule[];
  brandName: string;
  brandLogoDataUrl: string;
  brandLogoSizeUser: 'sm' | 'md' | 'lg';
  brandLogoSizeAdmin: 'sm' | 'md' | 'lg';
  customUrls?: { id: string; name: string; url: string }[];
  motdEnabled?: boolean;
  motdMessage?: string;
}

interface TeamBookmark {
  id: string;
  name: string;
  query: string;
  createdAt?: string;
}

interface FieldExplorerValue {
  value: string;
  count: number;
}

interface FieldExplorerField {
  field: string;
  actualField?: string;
  values: FieldExplorerValue[];
}

interface HighlightRule {
  field: string;
  pattern: string;
  color: string;
  match?: 'contains' | 'equals';
}

interface ExportEstimate {
  totalHits: number;
  sampleSize: number;
  avgBytes: number;
  estimatedBytes: number;
  maxExportSize: number;
}

interface IndexOption {
  value: string;
  label: string;
}

interface WeeklyEngagement {
  days: { date: string; count: number; percent: number }[];
}

interface BuilderChip {
  field: string;
  operator: 'is' | 'contains' | 'exists' | 'not_exists';
  value?: string;
}

interface PinnedFilter {
  field: string;
  value: string;
}

function LogSearchApp({ user, onLogout, authEnabled }: { user: { username: string; role: string; teams: string[] } | null; onLogout: () => void; authEnabled: boolean }) {
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState<Date>(subHours(new Date(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [timePreset, setTimePreset] = useState<string>('1h');
  const [indexPattern, setIndexPattern] = useState<string>('vector-*');
  const [rememberIndex, setRememberIndex] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFullResults, setShowFullResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<'relevant' | 'exact'>('relevant');
  const [darkMode, setDarkMode] = useState(false);
  const [darkModeUserSet, setDarkModeUserSet] = useState(false);
  const [highlightScope, setHighlightScope] = useState<'message' | 'json'>('message');
  const [bookmarks, setBookmarks] = useState<{ name: string; query: string }[]>([]);
  const [teamBookmarks, setTeamBookmarks] = useState<TeamBookmark[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [opensearchStatus, setOpensearchStatus] = useState<'ok' | 'down' | 'unknown'>('unknown');
  const [customUrls, setCustomUrls] = useState<{ id: string; name: string; url: string }[]>([]);
  const [timeZone, setTimeZone] = useState<string>('UTC');
  const [maxExportSize, setMaxExportSize] = useState<number>(100000);
  const [indexOptions, setIndexOptions] = useState<string[]>(['vector-*', 'app-logs-*', '*']);
  const [indexPatternSettings, setIndexPatternSettings] = useState<IndexPatternSetting[]>([]);
  const [fieldExplorerFields, setFieldExplorerFields] = useState<string[]>([]);
  const [fieldExplorerTopN, setFieldExplorerTopN] = useState<number>(10);
  const [fieldExplorerData, setFieldExplorerData] = useState<FieldExplorerField[]>([]);
  const [fieldExplorerLoading, setFieldExplorerLoading] = useState(false);
  const [highlightRules, setHighlightRules] = useState<HighlightRule[]>([]);
  const [brandName, setBrandName] = useState('');
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState('');
  const [brandLogoSizeUser, setBrandLogoSizeUser] = useState<'sm' | 'md' | 'lg'>('md');
  const [motdEnabled, setMotdEnabled] = useState(false);
  const [motdMessage, setMotdMessage] = useState('');
  const [weeklyEngagement, setWeeklyEngagement] = useState<WeeklyEngagement | null>(null);
  const [featureAccess, setFeatureAccess] = useState<{ exports: boolean; bookmarks: boolean; rules: boolean; queryBuilder: boolean; limitTo7Days: boolean; piiUnmasked: boolean; showFullResults: boolean }>({
    exports: true,
    bookmarks: true,
    rules: true,
    queryBuilder: true,
    limitTo7Days: false,
    piiUnmasked: false,
    showFullResults: false
  });
  const [builderField, setBuilderField] = useState('message');
  const [builderOp, setBuilderOp] = useState<BuilderChip['operator']>('contains');
  const [builderValue, setBuilderValue] = useState('');
  const [builderChips, setBuilderChips] = useState<BuilderChip[]>([]);
  const [builderActive, setBuilderActive] = useState(false);
  const [builderJoin, setBuilderJoin] = useState<'AND' | 'OR'>('AND');
  const [quickFilterJoin, setQuickFilterJoin] = useState<'AND' | 'OR'>('AND');
  const [pinnedFilters, setPinnedFilters] = useState<PinnedFilter[]>([]);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date(Date.now() + timeOffsetMs);
      try {
        const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
        if (timeZone && timeZone !== 'local') {
          options.timeZone = timeZone;
        }
        setCurrentTime(now.toLocaleTimeString([], options));
      } catch {
        setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [timeZone, timeOffsetMs]);

  // Load saved data
  useEffect(() => {
    const savedDarkRaw = localStorage.getItem('darkMode');
    const savedDark = savedDarkRaw === 'true';
    const savedDarkUserSet = localStorage.getItem('darkModeUserSet') === 'true';
    const savedPreset = localStorage.getItem('timePreset') || '1h';
    const savedBookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
    const savedRecents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    const savedFullResults = localStorage.getItem('showFullResults') === 'true';
    const savedRememberIndex = localStorage.getItem('rememberIndexPattern') === 'true';
    const savedIndex = localStorage.getItem('indexPattern') || '';

    if (savedDarkRaw !== null) {
      setDarkMode(savedDark);
      setDarkModeUserSet(true);
    }
    setTimePreset(savedPreset);
    setBookmarks(savedBookmarks);
    setRecentSearches(savedRecents);
    setShowFullResults(savedFullResults);
    setRememberIndex(savedRememberIndex);

    applyTimePreset(savedPreset);

    const loadConfig = async () => {
      try {
        const response = await axios.get<AppConfig>('/api/config');
        const config = response.data;
        if (savedRememberIndex && savedIndex) {
          setIndexPattern(savedIndex);
        } else if (config.defaultIndexPattern) {
          setIndexPattern(config.defaultIndexPattern);
          // Keep index pattern controlled by admin config.
        }
        if (Array.isArray(config.indexOptions) && config.indexOptions.length > 0) {
          setIndexOptions(config.indexOptions);
        }
        if (Array.isArray(config.indexPatternSettings)) {
          setIndexPatternSettings(config.indexPatternSettings);
        }
        if (Array.isArray(config.fieldExplorerFields)) {
          setFieldExplorerFields(config.fieldExplorerFields);
        }
        if (config.fieldExplorerTopN) {
          setFieldExplorerTopN(config.fieldExplorerTopN);
        }
        if (savedDarkRaw === null && !savedDarkUserSet) {
          setDarkMode(Boolean(config.darkModeDefault));
        }
        if (config.timeZone) setTimeZone(config.timeZone);
        if (config.maxExportSize) setMaxExportSize(config.maxExportSize);
        if (Array.isArray(config.highlightRules)) setHighlightRules(config.highlightRules);
        setBrandName(config.brandName || 'WDTS Logging Solution');
        setBrandLogoDataUrl(config.brandLogoDataUrl || '');
        setBrandLogoSizeUser(config.brandLogoSizeUser === 'sm' || config.brandLogoSizeUser === 'lg' ? config.brandLogoSizeUser : 'md');
        setCustomUrls(Array.isArray(config.customUrls) ? config.customUrls : []);
        setMotdEnabled(Boolean(config.motdEnabled));
        setMotdMessage(config.motdMessage || '');
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          if (authEnabled) onLogout();
          return;
        }
        console.warn('Failed to load config defaults.');
      }
    };

    const loadServerTime = async () => {
      try {
        const response = await axios.get<{ serverTime: string }>('/api/time');
        const serverTime = new Date(response.data.serverTime).getTime();
        if (!Number.isNaN(serverTime)) {
          setTimeOffsetMs(serverTime - Date.now());
        }
      } catch {
        setTimeOffsetMs(0);
      }
    };

    const loadTeamBookmarks = async () => {
      try {
        const response = await axios.get<TeamBookmark[]>('/api/team-bookmarks');
        setTeamBookmarks(response.data);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          if (authEnabled) onLogout();
          return;
        }
        console.warn('Failed to load team bookmarks.');
      }
    };

    const loadFeatureAccess = async () => {
      try {
        const defaultAccess = { exports: true, bookmarks: true, rules: true, queryBuilder: true, limitTo7Days: false, piiUnmasked: false, showFullResults: false };
        if (!authEnabled) {
          setFeatureAccess(defaultAccess);
          return;
        }
        const response = await axios.get<{ exports: boolean; bookmarks: boolean; rules: boolean; queryBuilder: boolean; limitTo7Days: boolean; piiUnmasked: boolean; showFullResults?: boolean }>('/api/feature-toggles');
        setFeatureAccess({ ...defaultAccess, ...response.data });
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          if (authEnabled) onLogout();
          return;
        }
      }
    };

    loadConfig();
    loadServerTime();
    loadTeamBookmarks();
    loadFeatureAccess();
    axios.get<WeeklyEngagement>('/api/metrics-user-weekly')
      .then((res) => setWeeklyEngagement(res.data))
      .catch(() => {});
    const syncTimer = setInterval(loadServerTime, 5 * 60 * 1000);
    return () => clearInterval(syncTimer);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (darkModeUserSet) {
      localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
      localStorage.setItem('darkModeUserSet', 'true');
    }
  }, [darkMode, darkModeUserSet]);

  useEffect(() => {
    if (!featureAccess.queryBuilder) {
      setBuilderChips([]);
      setBuilderActive(false);
      setBuilderValue('');
    }
  }, [featureAccess.queryBuilder]);

  useEffect(() => {
    if (featureAccess.showFullResults) return;
    setShowFullResults(false);
    localStorage.setItem('showFullResults', 'false');
  }, [featureAccess.showFullResults]);

  useEffect(() => {
    if (!featureAccess.limitTo7Days) return;
    const now = new Date();
    const minStart = subDays(now, 7);
    if (timePreset === 'custom') {
      setTimePreset('7d');
      localStorage.setItem('timePreset', '7d');
      applyTimePreset('7d');
      return;
    }
    if (startDate < minStart) {
      setStartDate(minStart);
    }
    if (endDate > now) {
      setEndDate(now);
    }
  }, [featureAccess.limitTo7Days]);

  const applyTimePreset = (preset: string) => {
    const now = new Date();
    let start: Date;
    switch (preset) {
      case '15m': start = subMinutes(now, 15); break;
      case '1h': start = subHours(now, 1); break;
      case '6h': start = subHours(now, 6); break;
      case 'today': start = startOfToday(); break;
      case '7d': start = subDays(now, 7); break;
      default: return;
    }
    setStartDate(start);
    setEndDate(now);
  };

  const handleTimePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = e.target.value;
    if (featureAccess.limitTo7Days && preset === 'custom') {
      return;
    }
    setTimePreset(preset);
    localStorage.setItem('timePreset', preset);
    if (preset !== 'custom') applyTimePreset(preset);
  };

  const handleCustomDateChange = ([start, end]: [Date, Date]) => {
    setStartDate(start);
    setEndDate(end);
    setTimePreset('custom');
    localStorage.setItem('timePreset', 'custom');
  };

  const handleSearch = async (searchQuery: string) => {
    const emptyQuery = !searchQuery.trim();
    const rangeMs = endDate.getTime() - startDate.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (emptyQuery && rangeMs > oneDayMs) {
      alert('Empty search is limited to 24 hours. Please reduce the time range or enter a query.');
      return;
    }
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
      setRecentSearches(getRecentSearches());
    }
    setCurrentPage(1);
    await fetchResults(searchQuery, 1, indexPattern);
  };

  const handleResultViewToggle = () => {
    setShowFullResults((prev) => {
      const next = !prev;
      localStorage.setItem('showFullResults', String(next));
      return next;
    });
  };

  const saveRecentSearch = (query: string) => {
    if (!query.trim()) return;
    const recent = getRecentSearches();
    const updated = [query, ...recent.filter(q => q !== query)].slice(0, 5);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const getRecentSearches = (): string[] => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : [];
  };

  const fetchResults = async (q: string, page: number, indexPat: string) => {
    setLoading(true);
    setSearchError(null);
    try {
      const pageSize = 100;
      const rangeFilter = buildTimeRangeFilter(indexPat);
      const body: any = {
        query: {
          bool: {
            must: [],
            filter: [rangeFilter]
          }
        },
        size: pageSize,
        from: (page - 1) * pageSize,
        sort: [
          { timestamp: { order: 'desc', unmapped_type: 'date' } },
          { '@timestamp': { order: 'desc', unmapped_type: 'date' } }
        ]
      };

      if (q.trim()) {
        body.query.bool.must.push(buildQueryClause(indexPat, q));
      }

      if (body.query.bool.must.length === 0) {
        body.query = { match_all: {} };
      }

      const response = await axios.post(`/api/search/${indexPat}/_search`, body);
      setResults(response.data.hits.hits);
      setTotalHits(response.data.hits.total.value || response.data.hits.total);
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        if (authEnabled) onLogout();
        return;
      }
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setResults([]);
        setTotalHits(0);
        setSearchError(String(err.response.data.detail));
        return;
      }
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setResults([]);
        setTotalHits(0);
        setSearchError(String(err.response.data.error));
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setResults([]);
        setTotalHits(0);
        setSearchError('No logs found for that query/time range.');
        return;
      }
      setResults([]);
      setTotalHits(0);
      setSearchError('Search failed. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const getIndexPatternSetting = (pattern: string) => indexPatternSettings.find((entry) => entry.pattern === pattern);

  const getActiveTimeFields = (pattern: string) => {
    const setting = getIndexPatternSetting(pattern);
    return setting?.timeField ? [setting.timeField] : ['timestamp', '@timestamp'];
  };

  const getActiveSearchFields = (pattern: string) => {
    const setting = getIndexPatternSetting(pattern);
    return Array.isArray(setting?.searchFields) ? setting?.searchFields.filter((field) => field.trim().length > 0) : [];
  };

  const getStoredSearchMode = (pattern: string) => {
    const perIndex = localStorage.getItem(`searchMode:${pattern}`);
    if (perIndex === 'exact' || perIndex === 'relevant') return perIndex;
    const legacy = localStorage.getItem('searchMode');
    if (legacy === 'exact' || legacy === 'relevant') return legacy;
    return null;
  };

  const getIndexSearchMode = (pattern: string) => {
    const setting = getIndexPatternSetting(pattern);
    if (setting?.searchMode === 'exact' || setting?.searchMode === 'relevant') return setting.searchMode;
    return null;
  };

  const buildTimeRangeFilter = (pattern: string) => {
    const fields = getActiveTimeFields(pattern);
    const rangeFor = (field: string) => ({
      range: {
        [field]: {
          gte: formatISO(startDate),
          lte: formatISO(endDate),
          format: 'strict_date_optional_time'
        }
      }
    });
    if (fields.length === 1) {
      return rangeFor(fields[0]);
    }
    return {
      bool: {
        should: fields.map((field) => rangeFor(field)),
        minimum_should_match: 1
      }
    };
  };

  const buildQueryStringClause = (pattern: string, q: string) => {
    const fields = getActiveSearchFields(pattern);
    return fields.length > 0
      ? { query_string: { query: q, fields } }
      : { query_string: { query: q, default_field: 'message' } };
  };

  const isAdvancedQuery = (q: string) => {
    return /[:()]/.test(q) || /\b(AND|OR|NOT)\b/.test(q) || q.includes('"');
  };

  const buildQueryClause = (pattern: string, q: string) => {
    if (searchMode === 'exact' && !isAdvancedQuery(q)) {
      const fields = getActiveSearchFields(pattern);
      return fields.length > 0
        ? { multi_match: { query: q, fields, type: 'phrase' } }
        : { match_phrase: { message: q } };
    }
    return buildQueryStringClause(pattern, q);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleSearchModeChange = (mode: 'relevant' | 'exact') => {
    setSearchMode(mode);
    localStorage.setItem(`searchMode:${indexPattern}`, mode);
  };

  useEffect(() => {
    const stored = getStoredSearchMode(indexPattern);
    const configured = getIndexSearchMode(indexPattern);
    setSearchMode(stored || configured || 'relevant');
  }, [indexPattern, indexPatternSettings]);

  const handleRecentClick = (q: string) => {
    setQuery(q);
    handleSearch(q);
  };

  const handleIndexChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = e.target.value;
    setIndexPattern(newIndex);
    if (rememberIndex) {
      localStorage.setItem('indexPattern', newIndex);
    }
    if (query.trim()) fetchResults(query, currentPage, newIndex);
  };

  const handleRememberIndexToggle = (nextValue: boolean) => {
    setRememberIndex(nextValue);
    localStorage.setItem('rememberIndexPattern', nextValue ? 'true' : 'false');
    if (!nextValue) {
      localStorage.removeItem('indexPattern');
    } else {
      localStorage.setItem('indexPattern', indexPattern);
    }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setBuilderActive(false);
    if (!value.trim()) {
      setResults([]);
      setTotalHits(0);
      setCurrentPage(1);
      setSearchError(null);
    }
  };

  const fetchFieldExplorer = async () => {
    if (!fieldExplorerFields || fieldExplorerFields.length === 0) {
      setFieldExplorerData([]);
      return;
    }
    setFieldExplorerLoading(true);
    try {
      const response = await axios.post<{ fields: FieldExplorerField[] }>('/api/field-explorer', {
        indexPattern,
        start: formatISO(startDate),
        end: formatISO(endDate),
        fields: fieldExplorerFields,
        topN: fieldExplorerTopN
      });
      setFieldExplorerData(response.data.fields || []);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        if (authEnabled) onLogout();
        return;
      }
      console.warn('Field explorer failed.');
    } finally {
      setFieldExplorerLoading(false);
    }
  };

  useEffect(() => {
    fetchFieldExplorer();
  }, [indexPattern, startDate, endDate, fieldExplorerFields, fieldExplorerTopN]);

  const formatQueryValue = (value: string) => {
    if (value === null || value === undefined) return '""';
    const raw = String(value);
    if (/^[a-zA-Z0-9_.:-]+$/.test(raw)) return raw;
    return `"${raw.replace(/"/g, '\\"')}"`;
  };

  const formatContainsValue = (value: string) => {
    const raw = String(value || '');
    if (/^[a-zA-Z0-9_.:-]+$/.test(raw)) return `*${raw}*`;
    return `"*${raw.replace(/"/g, '\\"')}*"`;
  };

  const buildClause = (chip: BuilderChip) => {
    if (chip.operator === 'exists') return `_exists_:${chip.field}`;
    if (chip.operator === 'not_exists') return `NOT _exists_:${chip.field}`;
    if (chip.operator === 'contains') return `${chip.field}:${formatContainsValue(chip.value || '')}`;
    return `${chip.field}:${formatQueryValue(chip.value || '')}`;
  };

  const buildQueryFromChips = (chips: BuilderChip[]) => {
    return chips.map(buildClause).join(` ${builderJoin} `);
  };

  const addBuilderChip = () => {
    if (!builderField) return;
    if ((builderOp === 'is' || builderOp === 'contains') && !builderValue.trim()) {
      alert('Enter a value.');
      return;
    }
    const next = [...builderChips, { field: builderField, operator: builderOp, value: builderValue.trim() }];
    setBuilderChips(next);
    setBuilderValue('');
    const built = buildQueryFromChips(next);
    setQuery(built);
    setBuilderActive(true);
  };

  const removeBuilderChip = (index: number) => {
    const next = builderChips.filter((_, i) => i !== index);
    setBuilderChips(next);
    const built = buildQueryFromChips(next);
    setQuery(built);
    setBuilderActive(true);
  };

  const clearBuilder = () => {
    setBuilderChips([]);
    setBuilderValue('');
    setBuilderActive(false);
  };

  useEffect(() => {
    if (!builderActive) return;
    const built = buildQueryFromChips(builderChips);
    setQuery(built);
  }, [builderJoin]);

  const addQuickFilter = (field: string, value: string) => {
    const filter = `${field}:${formatQueryValue(value)}`;
    if (!query.trim()) {
      setQuery(filter);
      return;
    }
    setQuery(`${query.trim()} ${quickFilterJoin} ${filter}`);
  };

  const getFieldValue = (source: Record<string, any>, field: string) => {
    if (!source || !field) return '';
    if (field === 'message') return source.message || '';
    if (field === '*') return JSON.stringify(source);
    const parts = field.split('.');
    let current: any = source;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return '';
      }
    }
    return current ?? '';
  };

  const getMatchedHighlightRules = (hit: SearchResult) => {
    if (!highlightRules.length) return [];
    const matches: { rule: HighlightRule; matchedValue: string }[] = [];
    for (const rule of highlightRules) {
      const value = getFieldValue(hit._source || {}, rule.field);
      if (value === undefined || value === null) continue;
      const raw = String(value);
      const pattern = String(rule.pattern || '');
      const matchType = rule.match === 'equals' ? 'equals' : 'contains';
      if (matchType === 'equals') {
        if (raw.toLowerCase() === pattern.toLowerCase()) matches.push({ rule, matchedValue: raw });
      } else if (raw.toLowerCase().includes(pattern.toLowerCase())) {
        matches.push({ rule, matchedValue: raw });
      }
    }
    return matches;
  };

  const getPrimaryHighlightColor = (rules: { rule: HighlightRule }[]) => {
    if (!rules.length) return '';
    return rules[0].rule.color;
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getHighlightTerms = (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return [];
    const terms: string[] = [];
    for (const match of trimmed.matchAll(/"([^"]+)"/g)) {
      if (match[1]) terms.push(match[1]);
    }
    const remaining = trimmed.replace(/"[^"]+"/g, ' ');
    const tokens = remaining.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const upper = token.toUpperCase();
      if (upper === 'AND' || upper === 'OR' || upper === 'NOT' || upper === 'TO') continue;
      const cleaned = token.replace(/^[+\\-]/, '').replace(/[()]/g, '');
      if (!cleaned || cleaned === '*') continue;
      const colonIndex = cleaned.indexOf(':');
      if (colonIndex > 0) {
        const value = cleaned.slice(colonIndex + 1).replace(/^[\\[\\{]+|[\\]\\}]+$/g, '');
        if (value && value !== '*') terms.push(value);
      } else {
        const value = cleaned.replace(/^[\\[\\{]+|[\\]\\}]+$/g, '');
        if (value && value !== '*') terms.push(value);
      }
    }
    return Array.from(new Set(terms));
  };

  const renderHighlightedText = (text: string, terms: string[]) => {
    if (!terms.length) return text;
    const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, idx) => {
      if (!part) return null;
      const isMatch = terms.some((term) => part.toLowerCase() === term.toLowerCase());
      return isMatch ? (
        <mark key={idx} className="bg-sky-200 dark:bg-sky-500/60 text-gray-900 dark:text-gray-900 rounded px-0.5">
          {part}
        </mark>
      ) : (
        <span key={idx}>{part}</span>
      );
    });
  };

  const formatJsonValue = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return null;
    }
  };

  const buildMessageContent = (message: unknown, formattedMessageJson: string | null, fallback: string) => {
    if (formattedMessageJson) return formattedMessageJson;
    if (typeof message === 'string' && message.trim()) return message.trim();
    return fallback;
  };

  const buildSnippet = (text: string, maxLength: number) => {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= maxLength) return collapsed;
    return `${collapsed.slice(0, maxLength).trim()}…`;
  };

  const buildTitle = (text: string, maxLength: number) => {
    const firstLine = text.split('\n')[0]?.trim() || text.trim();
    if (firstLine.length <= maxLength) return firstLine;
    return `${firstLine.slice(0, maxLength).trim()}…`;
  };

  const toggleResultExpanded = (id: string) => {
    setExpandedResults((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePinnedFilter = (field: string, value: string) => {
    const exists = pinnedFilters.some((p) => p.field === field && p.value === value);
    if (exists) {
      setPinnedFilters((prev) => prev.filter((p) => !(p.field === field && p.value === value)));
    } else {
      setPinnedFilters((prev) => [...prev, { field, value }]);
    }
  };

  const isPinned = (field: string, value: string) => {
    return pinnedFilters.some((p) => p.field === field && p.value === value);
  };

  const addBookmark = () => {
    const name = prompt('Enter a name for this search:');
    if (name && query.trim()) {
      const newBookmark = { name, query: query.trim() };
      const updated = [...bookmarks, newBookmark];
      setBookmarks(updated);
      localStorage.setItem('bookmarks', JSON.stringify(updated));
    }
  };

  const runBookmark = (q: string) => {
    setQuery(q);
    handleSearch(q);
  };

  const promoteBookmark = async (bookmark: { name: string; query: string }) => {
    try {
      const response = await axios.post<TeamBookmark>('/api/team-bookmarks', bookmark);
      const exists = teamBookmarks.some((b) => b.id === response.data.id);
      if (!exists) {
        setTeamBookmarks((prev) => [...prev, response.data]);
      }
      alert('Promoted to Team Bookmarks.');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        if (authEnabled) onLogout();
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        alert('Bookmarks are disabled for your team.');
        return;
      }
      alert('Failed to promote bookmark.');
    }
  };

  const clearAllSearches = () => {
    if (window.confirm('Clear all recent searches and bookmarks?')) {
      localStorage.removeItem('recentSearches');
      localStorage.removeItem('bookmarks');
      setRecentSearches([]);
      setBookmarks([]);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes < 1) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(1)} ${units[idx]}`;
  };

  const exportResults = async (format: 'json' | 'csv') => {
    if (!query.trim() && !confirm('Export all logs in time range?')) return;

    const rangeFilter = buildTimeRangeFilter(indexPattern);
    const exportQuery = query.trim()
      ? {
          bool: {
            must: [buildQueryStringClause(indexPattern, query)],
            filter: [rangeFilter]
          }
        }
      : {
          bool: {
            filter: [rangeFilter]
          }
        };

    const exportData = {
      query: exportQuery,
      indexPattern,
      size: maxExportSize
    };

    try {
      let estimate: ExportEstimate | null = null;
      try {
        const estimateRes = await axios.post<ExportEstimate>('/api/export/estimate', exportData);
        estimate = estimateRes.data;
      } catch {
        estimate = null;
      }
      if (estimate) {
        if (estimate.totalHits === 0) {
          alert('No logs found for this range/query.');
          return;
        }
        const sizeNote = estimate.estimatedBytes
          ? `Estimated size: ~${formatBytes(estimate.estimatedBytes)}.`
          : 'Estimated size unavailable.';
        const limitNote = estimate.maxExportSize
          ? `Max export size: ${estimate.maxExportSize}.`
          : '';
        const ok = confirm(`About to export ${estimate.totalHits} logs. ${sizeNote} ${limitNote} Continue?`);
        if (!ok) return;
      }
      const authHeader = localStorage.getItem('authToken');
      const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authEnabled && authHeader ? { Authorization: `Bearer ${authHeader}` } : {})
        },
        body: JSON.stringify(exportData)
      });

      if (response.status === 403) {
        alert('Exports are disabled for your team.');
        return;
      }
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString().slice(0,10)}.${format}.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed. Try reducing time range.');
    }
  };

  const parseIndexOption = (raw: string): IndexOption => {
    const [valueRaw, labelRaw] = raw.split('|');
    const value = (valueRaw || '').trim();
    const label = (labelRaw || '').trim();
    return { value, label: label || value || raw.trim() };
  };

  const pageSize = 100;
  const totalPages = Math.ceil(totalHits / pageSize);
  const parsedIndexOptions = indexOptions
    .map(parseIndexOption)
    .filter((option) => option.value.length > 0);
  const hasIndexOption = parsedIndexOptions.some((option) => option.value === indexPattern);
  const availableIndexOptions = hasIndexOption
    ? parsedIndexOptions
    : [{ value: indexPattern, label: indexPattern }, ...parsedIndexOptions];
  const builderFields = fieldExplorerFields.length > 0
    ? fieldExplorerFields
    : ['message', 'level', 'service', 'host', 'env'];
  const availableTimePresets = featureAccess.limitTo7Days
    ? TIME_PRESETS.filter((preset) => preset.value !== 'custom')
    : TIME_PRESETS;

  useEffect(() => {
    if (!builderFields.includes(builderField)) {
      setBuilderField(builderFields[0]);
    }
  }, [builderFields, builderField]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const fetchStatus = async () => {
      try {
        const response = await axios.get('/api/opensearch/status', { params: { _ts: Date.now() } });
        const reachable = Boolean(response.data?.reachable);
        const status = String(response.data?.status || '').toLowerCase();
        if (!alive) return;
        setOpensearchStatus(reachable && status !== 'red' ? 'ok' : 'down');
      } catch {
        if (alive) setOpensearchStatus('down');
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [user]);

  const getLogoSizeClass = (size: 'sm' | 'md' | 'lg') => {
    if (size === 'sm') return 'h-12 w-12';
    if (size === 'lg') return 'h-20 w-20';
    return 'h-16 w-16';
  };

  return (
    <div className={`min-h-screen p-4 md:p-6 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            {brandLogoDataUrl ? (
              <img src={brandLogoDataUrl} alt="Brand logo" className={`${getLogoSizeClass(brandLogoSizeUser)} object-contain`} />
            ) : (
              <span className="text-3xl">🔍</span>
            )}
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{brandName || 'WDTS Logging Solution'}</h1>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="flex items-center gap-1 text-xs" title={`OpenSearch: ${opensearchStatus === 'ok' ? 'ok' : 'down'}`}>
                  <span className={`h-2 w-2 rounded-full ${opensearchStatus === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-gray-500 dark:text-gray-400">OS</span>
                </div>
              </>
            )}
            {authEnabled && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${user ? 'bg-green-500' : 'bg-red-500'}`} />
                {user ? user.username : 'Logged out'}
              </span>
            )}
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">🕒 {currentTime}</span>
            <button onClick={() => {
              setDarkModeUserSet(true);
              setDarkMode(!darkMode);
            }} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm">
              {darkMode ? '☀️' : '🌙'}
            </button>
            {authEnabled && (
              <button onClick={onLogout} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm">
                Logout
              </button>
            )}
            <button onClick={clearAllSearches} className="px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700" title="Clear recent searches & bookmarks">
              🧹 Clear
            </button>
          </div>
        </div>

        {motdEnabled && motdMessage && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100 px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-base">📣</span>
              <div className="leading-relaxed">{motdMessage}</div>
            </div>
          </div>
        )}

        {customUrls.length > 0 && (
          <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {customUrls.map((entry) => (
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
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Index Pattern</label>
          <div className="flex flex-wrap items-center gap-3">
            <select value={indexPattern} onChange={handleIndexChange} className="w-full md:w-64 px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white">
              {availableIndexOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === '*' ? 'All Indices' : option.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={rememberIndex}
                onChange={(e) => handleRememberIndexToggle(e.target.checked)}
              />
              Remember my index
            </label>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Range</label>
          <div className="flex gap-2 flex-wrap">
            <select value={timePreset} onChange={handleTimePresetChange} className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white">
              {availableTimePresets.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
            {timePreset === 'custom' && !featureAccess.limitTo7Days && (
              <div className="flex gap-2">
                <input type="datetime-local" value={startDate.toISOString().slice(0, 16)} onChange={(e) => handleCustomDateChange([new Date(e.target.value), endDate])} className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                <input type="datetime-local" value={endDate.toISOString().slice(0, 16)} onChange={(e) => handleCustomDateChange([startDate, new Date(e.target.value)])} className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
            )}
          </div>
          {featureAccess.limitTo7Days && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Restricted to last 7 days by team policy.</p>
          )}
        </div>

        <div className="mb-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Field Explorer</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Quick filters</span>
              <select
                value={quickFilterJoin}
                onChange={(e) => setQuickFilterJoin(e.target.value as 'AND' | 'OR')}
                className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
              <button onClick={fetchFieldExplorer} className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                Refresh
              </button>
            </div>
          </div>
          {pinnedFilters.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Pinned</div>
              <div className="flex flex-wrap gap-2">
                {pinnedFilters.map((pin) => (
                  <button
                    key={`${pin.field}-${pin.value}`}
                    onClick={() => addQuickFilter(pin.field, pin.value)}
                    className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 hover:bg-amber-200"
                  >
                    {pin.field}:{String(pin.value)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {fieldExplorerLoading && <p className="text-xs text-gray-500">Loading fields...</p>}
          {!fieldExplorerLoading && fieldExplorerData.length === 0 && (
            <p className="text-xs text-gray-500">No field data. Configure fields in /admin.</p>
          )}
          <div className="space-y-3">
            {fieldExplorerData.map((field) => (
              <div key={field.field}>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{field.field}</div>
                <div className="flex flex-wrap gap-2">
                  {field.values.map((val) => (
                    <div key={`${field.field}-${val.value}`} className="flex items-center gap-1">
                      <button
                        onClick={() => addQuickFilter(field.field, String(val.value))}
                        className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200"
                        title={`Count: ${val.count}`}
                      >
                        {String(val.value)} ({val.count})
                      </button>
                      <button
                        onClick={() => togglePinnedFilter(field.field, String(val.value))}
                        className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                        title={isPinned(field.field, String(val.value)) ? 'Unpin' : 'Pin'}
                      >
                        {isPinned(field.field, String(val.value)) ? '📌' : '📍'}
                      </button>
                    </div>
                  ))}
                  {field.values.length === 0 && (
                    <span className="text-xs text-gray-400">No values in range.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {featureAccess.queryBuilder && (
          <div className="mb-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Query Builder</h2>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Join</label>
                <select
                  value={builderJoin}
                  onChange={(e) => setBuilderJoin(e.target.value as 'AND' | 'OR')}
                  className="px-2 py-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Field</label>
                <select value={builderField} onChange={(e) => setBuilderField(e.target.value)} className="px-2 py-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  {builderFields.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Operator</label>
                <select value={builderOp} onChange={(e) => setBuilderOp(e.target.value as BuilderChip['operator'])} className="px-2 py-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  <option value="is">is</option>
                  <option value="contains">contains</option>
                  <option value="exists">exists</option>
                  <option value="not_exists">not exists</option>
                </select>
              </div>
              <div className="flex-grow min-w-[200px]">
                <label className="block text-xs text-gray-500 mb-1">Value</label>
                <input
                  value={builderValue}
                  onChange={(e) => setBuilderValue(e.target.value)}
                  disabled={builderOp === 'exists' || builderOp === 'not_exists'}
                  placeholder={builderOp === 'exists' || builderOp === 'not_exists' ? 'Not required' : 'Enter value'}
                  className="w-full px-2 py-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white disabled:opacity-60"
                />
              </div>
              <button onClick={addBuilderChip} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Add Filter</button>
              <button onClick={clearBuilder} className="px-3 py-2 bg-gray-200 rounded text-sm">Clear</button>
            </div>
            {builderChips.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {builderChips.map((chip, index) => (
                    <span key={`${chip.field}-${index}`} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1 rounded inline-flex items-center gap-1">
                      {buildClause(chip)}
                      <button onClick={() => removeBuilderChip(index)} className="text-gray-500 hover:text-gray-700">✕</button>
                    </span>
                  ))}
                </div>
                {builderActive && (
                  <div className="text-xs text-gray-500">Generated query: {query}</div>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="mb-6 flex gap-2">
          <input type="text" value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder='Search logs...' className="flex-grow px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white" autoFocus />
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">Search</button>
          <button type="button" onClick={addBookmark} disabled={!query.trim()} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50" title="Save this search">🔖</button>
        </form>
        <div className="mb-6 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span>Search mode:</span>
          <button
            type="button"
            onClick={() => handleSearchModeChange('relevant')}
            className={`px-3 py-1 rounded-full border ${searchMode === 'relevant' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Relevant
          </button>
          <button
            type="button"
            onClick={() => handleSearchModeChange('exact')}
            className={`px-3 py-1 rounded-full border ${searchMode === 'exact' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Exact
          </button>
        </div>

        {(bookmarks.length > 0 || recentSearches.length > 0) && (
          <div className="mb-6 space-y-3">
            {bookmarks.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">🔖 Bookmarks:</p>
                <div className="flex flex-wrap gap-2">
                  {bookmarks.map((b, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <button onClick={() => runBookmark(b.query)} className="text-xs bg-purple-200 dark:bg-purple-900 hover:bg-purple-300 px-2 py-1 rounded text-purple-800 dark:text-purple-200">{b.name}</button>
                      {featureAccess.bookmarks && (!authEnabled || user?.role !== 'viewer') && (
                        <button onClick={() => promoteBookmark(b)} className="text-[10px] px-2 py-1 rounded bg-indigo-200 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-300">Promote</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {featureAccess.bookmarks && teamBookmarks.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">👥 Team Bookmarks:</p>
                <div className="flex flex-wrap gap-2">
                  {teamBookmarks.map((b) => (
                    <button key={b.id} onClick={() => runBookmark(b.query)} className="text-xs bg-indigo-200 dark:bg-indigo-900 hover:bg-indigo-300 px-2 py-1 rounded text-indigo-800 dark:text-indigo-200">{b.name}</button>
                  ))}
                </div>
              </div>
            )}
            {recentSearches.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">💡 Recent Searches:</p>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((q, i) => (
                    <button key={i} onClick={() => handleRecentClick(q)} className="text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-2 py-1 rounded text-gray-800 dark:text-white">{q}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {featureAccess.showFullResults && (
              <button
                onClick={handleResultViewToggle}
                className="text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                {showFullResults ? 'Show message only' : 'Show full JSON'}
              </button>
            )}
            {featureAccess.exports && (
              <>
                <button onClick={() => exportResults('json')} className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">📥 Export JSON</button>
                <button onClick={() => exportResults('csv')} className="text-sm bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700">📥 Export CSV</button>
              </>
            )}
          </div>
        )}

        {totalHits > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">Results</div>
            <div className="rounded-full border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 px-3 py-1 text-xs text-gray-700 dark:text-gray-300 shadow-sm">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalHits)} of {totalHits}
            </div>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <span className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-gray-400">Highlight scope</span>
          <button
            onClick={() => setHighlightScope('message')}
            className={`px-2 py-1 rounded ${highlightScope === 'message' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-100'}`}
          >
            Message
          </button>
          <button
            onClick={() => setHighlightScope('json')}
            className={`px-2 py-1 rounded ${highlightScope === 'json' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-100'}`}
          >
            Full JSON
          </button>
        </div>
        <div className="space-y-4">
          {results.map((hit) => {
            const timestamp = hit._source.timestamp || hit._source['@timestamp'] || 'No timestamp';
            const message = hit._source.message;
            const fullLog = JSON.stringify(hit._source, null, 2);
            const highlightTerms = getHighlightTerms(query);
            const messageHighlightTerms = highlightScope === 'message' ? highlightTerms : [];
            const jsonHighlightTerms = highlightScope === 'json' ? highlightTerms : [];
            const matchedHighlightRules = getMatchedHighlightRules(hit);
            const highlightColor = getPrimaryHighlightColor(matchedHighlightRules);
            const formattedMessageJson = formatJsonValue(message);
            const canShowFullResults = featureAccess.showFullResults;
            const isExpanded = canShowFullResults && (showFullResults || expandedResults[hit._id]);
            const messageContent = buildMessageContent(message, formattedMessageJson, fullLog);
            const messageTitle = buildTitle(messageContent, 90);
            const messageSnippet = buildSnippet(messageContent, 220);
            return (
              <div
                key={hit._id}
                className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"
                style={highlightColor ? { borderLeft: `4px solid ${highlightColor}` } : undefined}
              >
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">[{hit._index}] {timestamp}</div>
                {matchedHighlightRules.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-700 dark:text-gray-300">
                    {matchedHighlightRules.map((match, idx) => (
                      <span
                        key={`${match.rule.field}-${match.rule.pattern}-${match.rule.color}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 bg-gray-50 dark:bg-gray-900"
                      >
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: match.rule.color }} />
                        <span>{match.rule.field} {match.rule.match === 'equals' ? '=' : '~'} {match.matchedValue}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{messageTitle || 'Log entry'}</div>
                <div className="mt-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {renderHighlightedText(messageSnippet || 'No message provided.', messageHighlightTerms)}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Result {hit._id}</span>
                  {canShowFullResults && (
                    <button onClick={() => copyToClipboard(fullLog)} className="hover:text-gray-800 dark:hover:text-gray-200" title="Copy full log">Copy JSON</button>
                  )}
                </div>
                {canShowFullResults && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-blue-600 dark:text-blue-400 hover:underline">
                      {isExpanded ? 'Hide full JSON' : 'Show full JSON'}
                    </summary>
                    <div className="mt-2">
                      <JsonHighlighter maxHeight={isExpanded ? 420 : 200} highlightTerms={jsonHighlightTerms}>{fullLog}</JsonHighlighter>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
          {results.length === 0 && !loading && (
            <p className="text-center text-gray-500 dark:text-gray-400">
              {searchError || 'No logs found.'}
            </p>
          )}
          {loading && <p className="text-center text-gray-500 dark:text-gray-400">Searching...</p>}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center mt-6 space-x-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border rounded disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white">◄ Previous</button>
            {[...Array(Math.min(5, totalPages)).keys()].map(i => {
              const pageNum = i + 1;
              return <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`px-3 py-1 border rounded ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'dark:bg-gray-800 dark:border-gray-600 dark:text-white'}`}>{pageNum}</button>;
            })}
            {totalPages > 5 && <span className="px-2 dark:text-gray-400">...</span>}
            {totalPages > 5 && <button onClick={() => setCurrentPage(totalPages)} className={`px-3 py-1 border rounded ${currentPage === totalPages ? 'bg-blue-600 text-white' : 'dark:bg-gray-800 dark:border-gray-600 dark:text-white'}`}>{totalPages}</button>}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border rounded disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white">Next ►</button>
          </div>
        )}

        <div className="mt-8 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Your Weekly Usage</h2>
          {weeklyEngagement?.days?.length ? (
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-end gap-2 h-20">
                {weeklyEngagement.days.map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-sm bg-blue-500"
                      style={{ height: `${Math.max(8, day.percent)}%` }}
                      title={`${day.date}: ${day.count} actions`}
                    />
                    <div className="text-[10px] mt-1 text-gray-500 dark:text-gray-400">{day.date.slice(5)}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Based on your searches + exports over the last 7 days.
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No weekly data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogSearchApp;

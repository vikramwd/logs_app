const RECENT_SEARCHES_KEY = 'recentSearches';
const MAX_RECENT = 5;

export const saveRecentSearch = (query: string) => {
  if (!query.trim()) return;
  const recent = getRecentSearches();
  const updated = [query, ...recent.filter(q => q !== query)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
};

export const getRecentSearches = (): string[] => {
  const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
  return saved ? JSON.parse(saved) : [];
};
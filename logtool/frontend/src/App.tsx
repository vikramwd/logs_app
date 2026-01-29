import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import axios from 'axios';
import LogSearchApp from './LogSearchApp';
import AdminApp from './AdminApp';
import HelpPage from './HelpPage';
import UploadPage from './UploadPage';

interface AuthUser {
  id: string;
  username: string;
  role: string;
  teams: string[];
}

function applyTheme(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function Login({
  onLogin,
  brandLogoDataUrl,
  brandLogoSize
}: {
  onLogin: (token: string, user: AuthUser) => void;
  brandLogoDataUrl: string;
  brandLogoSize: 'sm' | 'md' | 'lg';
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    applyTheme(darkMode);
    localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
  }, [darkMode]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      onLogin(response.data.token, response.data.user);
      setPassword('');
    } catch {
      setError('Invalid username or password.');
    }
  };

  const resolvedLogo = brandLogoDataUrl || localStorage.getItem('brandLogoDataUrl') || '';
  const storedSize = localStorage.getItem('brandLogoSizeUser');
  const resolvedSize = storedSize === 'sm' || storedSize === 'lg' ? storedSize : (storedSize === 'md' ? 'md' : brandLogoSize);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6 relative">
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={() => {
            window.location.href = '/admin';
          }}
          className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          Admin
        </button>
      </div>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow-md border dark:border-gray-700 rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt="Brand logo"
                className={`${resolvedSize === 'sm' ? 'h-12 w-12' : resolvedSize === 'lg' ? 'h-20 w-20' : 'h-16 w-16'} object-contain`}
              />
            ) : null}
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">LogSearch Login</h1>
          </div>
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
            title="Toggle theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded mb-3" />
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded mb-4" />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Sign in</button>
      </form>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-800">404</div>
        <p className="text-gray-600 mt-2">Page not found.</p>
        <a href="/" className="inline-block mt-4 text-blue-600 underline">Go home</a>
      </div>
    </div>
  );
}

function App() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || '');
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('authUser');
    return raw ? JSON.parse(raw) : null;
  });
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState('');
  const [brandLogoSizeUser, setBrandLogoSizeUser] = useState<'sm' | 'md' | 'lg'>('md');

  useEffect(() => {
    axios.get('/api/auth/status')
      .then((res) => setAuthEnabled(Boolean(res.data.enabled)))
      .catch(() => setAuthEnabled(false));
  }, []);

  useEffect(() => {
    const cachedLogo = localStorage.getItem('brandLogoDataUrl') || '';
    const cachedSize = localStorage.getItem('brandLogoSizeUser');
    if (cachedLogo) setBrandLogoDataUrl(cachedLogo);
    if (cachedSize === 'sm' || cachedSize === 'lg' || cachedSize === 'md') {
      setBrandLogoSizeUser(cachedSize);
    }
    const savedDarkRaw = localStorage.getItem('darkMode');
    if (savedDarkRaw !== null) {
      applyTheme(savedDarkRaw === 'true');
      return;
    }
    localStorage.setItem('darkMode', 'true');
    applyTheme(true);
    axios.get('/api/config').then((res) => {
      const isDark = res.data?.darkModeDefault === undefined ? true : Boolean(res.data?.darkModeDefault);
      const nextLogo = res.data?.brandLogoDataUrl || '';
      const nextSize = res.data?.brandLogoSizeUser === 'sm' || res.data?.brandLogoSizeUser === 'lg' ? res.data.brandLogoSizeUser : 'md';
      setBrandLogoDataUrl(nextLogo);
      setBrandLogoSizeUser(nextSize);
      if (nextLogo) localStorage.setItem('brandLogoDataUrl', nextLogo);
      localStorage.setItem('brandLogoSizeUser', nextSize);
      localStorage.setItem('darkMode', isDark ? 'true' : 'false');
      applyTheme(isDark);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }
  }, [token]);

  const handleLogin = (newToken: string, authUser: AuthUser) => {
    axios.defaults.headers.common.Authorization = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(authUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(authUser));
  };

  const handleLogout = () => {
    if (token) {
      axios.post('/api/auth/logout').catch(() => {});
    }
    setToken('');
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  useEffect(() => {
    if (authEnabled && token && !user) {
      axios.get('/api/auth/me').then((res) => {
        setUser(res.data);
        localStorage.setItem('authUser', JSON.stringify(res.data));
      }).catch(() => {
        handleLogout();
      });
    }
  }, [authEnabled, token, user]);

  useEffect(() => {
    if (!authEnabled || !token) return;
    const interval = setInterval(() => {
      axios.get('/api/auth/me').then((res) => {
        setUser(res.data);
        localStorage.setItem('authUser', JSON.stringify(res.data));
      }).catch(() => {
        handleLogout();
      });
    }, 20000);
    return () => clearInterval(interval);
  }, [authEnabled, token]);

  if (authEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppRoutes
        authEnabled={authEnabled}
        token={token}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        brandLogoDataUrl={brandLogoDataUrl}
        brandLogoSize={brandLogoSizeUser}
      />
    </BrowserRouter>
  );
}

export default App;

function AppRoutes({
  authEnabled,
  token,
  user,
  onLogin,
  onLogout,
  brandLogoDataUrl,
  brandLogoSize
}: {
  authEnabled: boolean;
  token: string;
  user: AuthUser | null;
  onLogin: (tokenValue: string, authUser: AuthUser) => void;
  onLogout: () => void;
  brandLogoDataUrl: string;
  brandLogoSize: 'sm' | 'md' | 'lg';
}) {
  const location = useLocation();
  const onAdminRoute = location.pathname.startsWith('/admin');
  const onUploadRoute = location.pathname.startsWith('/upload');
  const adminTtlMinutes = Number(import.meta.env.VITE_ADMIN_SESSION_TTL_MINUTES || 5);
  const adminTtlMs = (Number.isFinite(adminTtlMinutes) && adminTtlMinutes > 0 ? adminTtlMinutes : 5) * 60 * 1000;
  const adminAuth = sessionStorage.getItem('adminAuth') || localStorage.getItem('adminAuth') || '';
  const adminTs = Number(sessionStorage.getItem('adminAuthAt') || localStorage.getItem('adminAuthAt') || '');
  const hasAdminSession = Boolean(adminAuth && adminTs && Date.now() - adminTs <= adminTtlMs);

  if (authEnabled && !token && !onAdminRoute && !(onUploadRoute && hasAdminSession)) {
    return <Login onLogin={onLogin} brandLogoDataUrl={brandLogoDataUrl} brandLogoSize={brandLogoSize} />;
  }

  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  return (
    <Routes>
      <Route path="/" element={<LogSearchApp user={user} onLogout={onLogout} authEnabled={authEnabled} />} />
      <Route path="/help" element={<HelpPage />} />
      <Route
        path="/upload"
        element={<UploadPage authEnabled={Boolean(authEnabled)} userRole={user?.role} />}
      />
      <Route path="/admin" element={<AdminApp />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

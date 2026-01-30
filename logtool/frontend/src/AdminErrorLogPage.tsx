import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const getAdminAuth = () => sessionStorage.getItem('adminAuth') || localStorage.getItem('adminAuth') || '';

function AdminErrorLogPage() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('adminDarkMode');
    setDarkMode(stored === 'true');
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadLog = async () => {
    setLoading(true);
    try {
      const auth = getAdminAuth();
      const res = await axios.get<{ lines: string[] }>('/api/admin/error-log', {
        headers: auth ? { Authorization: auth } : undefined,
        params: { lines: 800, _ts: Date.now() }
      });
      setLines(Array.isArray(res.data?.lines) ? res.data.lines : []);
    } catch {
      setLines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLog();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Error Log</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last 800 lines from server error log.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadLog}
              className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
            >
              Back
            </button>
            <Link
              to="/admin"
              className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Admin Panel
            </Link>
          </div>
        </div>

        <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="px-4 py-3 border-b dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">error.log</span>
          </div>
          <div className="p-4">
            <div className="max-h-[60vh] overflow-auto rounded bg-gray-900 text-gray-100 text-xs font-mono p-3">
              {lines.length > 0 ? lines.join('\n') : 'No log lines available.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminErrorLogPage;

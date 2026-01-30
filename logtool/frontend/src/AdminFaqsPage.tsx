import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

const getAdminAuth = () => sessionStorage.getItem('adminAuth') || localStorage.getItem('adminAuth') || '';

function AdminFaqsPage() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');
  const [sections, setSections] = useState<FaqSection[]>([]);

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

  useEffect(() => {
    const auth = getAdminAuth();
    const loadFaqs = async () => {
      try {
        const res = await axios.get<FaqSection[]>('/api/admin/admin-faqs', {
          headers: auth ? { Authorization: auth } : undefined,
          params: { _ts: Date.now() }
        });
        setSections(Array.isArray(res.data) ? res.data : []);
      } catch {
        setSections([]);
      }
    };
    loadFaqs();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Admin FAQs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Reference for admin workflows and troubleshooting.</p>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
              <div className="px-4 py-3 border-b dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{section.title}</span>
              </div>
              <div className="px-4 py-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                {section.items.map((item, idx) => (
                  <div key={`${section.id}-${idx}`} className="rounded-md bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.q}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{item.a}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">No admin FAQs available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminFaqsPage;

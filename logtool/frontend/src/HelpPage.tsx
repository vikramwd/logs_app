import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface HelpItem {
  q: string;
  a: string;
}

interface HelpSection {
  id: string;
  title: string;
  items: HelpItem[];
}

function HelpPage() {
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [quickTips, setQuickTips] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/config').then((res) => {
      setSections(Array.isArray(res.data?.helpSections) ? res.data.helpSections : []);
      setQuickTips(Array.isArray(res.data?.helpQuickTips) ? res.data.helpQuickTips : []);
    }).catch(() => {
      setSections([]);
      setQuickTips([]);
    });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('darkMode');
    setDarkMode(stored === 'true');
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Help & FAQs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Quick guidance for using LogSearch.</p>
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
              to="/"
              className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              User Panel
            </Link>
          </div>
        </div>

        {quickTips.length > 0 && (
          <div className="mb-6 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Quick tips</div>
            <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300 space-y-1">
              {quickTips.map((tip, idx) => (
                <li key={`${tip}-${idx}`}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

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
            <div className="text-sm text-gray-500 dark:text-gray-400">No help content available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HelpPage;

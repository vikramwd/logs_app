import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

const ADMIN_FAQS: FaqSection[] = [
  {
    id: 'login-sessions',
    title: 'Login & Sessions',
    items: [
      { q: 'Why did I get logged out?', a: 'Admin sessions expire after the configured TTL. Log in again from /admin.' },
      { q: 'Can I open multiple admin tabs?', a: 'Yes, but inactivity may expire the session. Use Refresh in the admin header if needed.' }
    ]
  },
  {
    id: 'motd',
    title: 'Message of the Day',
    items: [
      { q: 'How do I publish a MOTD?', a: 'Go to Admin → Message of the Day, enter the message, and click Save MOTD.' },
      { q: 'Why does MOTD not show on login?', a: 'Ensure a non-empty message is saved, then refresh the login page.' },
      { q: 'Where is MOTD shown?', a: 'It appears on the user login page and at the top of the logged-in user UI.' }
    ]
  },
  {
    id: 'index-management',
    title: 'Index Management',
    items: [
      { q: 'How do I set the default index pattern?', a: 'Use Admin → Index Management and set the default pattern at the top.' },
      { q: 'How do overrides work?', a: 'Overrides apply by exact pattern match and can set time field and search fields.' },
      { q: 'Why can’t a user see an index?', a: 'Check Team/User index access rules and feature toggles for that team.' }
    ]
  },
  {
    id: 'app-config',
    title: 'App Configuration',
    items: [
      { q: 'How do I change the time zone?', a: 'Update Time Zone in App Configuration and click Save Config.' },
      { q: 'How do I limit export size?', a: 'Set Max Export Size in App Configuration to enforce a cap.' },
      { q: 'How do I change default dark mode?', a: 'Toggle Dark mode default in App Configuration and save.' },
      { q: 'How do Field Explorer fields work?', a: 'List fields (one per line). These become quick field filters in the UI.' }
    ]
  },
  {
    id: 'branding',
    title: 'Branding',
    items: [
      { q: 'How do I update the logo?', a: 'Use Branding → Upload Logo and then Save Branding.' },
      { q: 'Why is the logo too large/small?', a: 'Adjust Logo Size (User/Admin) and save.' }
    ]
  },
  {
    id: 'users-roles',
    title: 'Users & Roles',
    items: [
      { q: 'How do I add a user?', a: 'Go to Admin → Users, fill in the form, then click Create User.' },
      { q: 'What roles exist?', a: 'Admins manage config and users; viewers have limited actions based on toggles.' },
      { q: 'How do I reset access?', a: 'Update the user and save; logout/login may be required for changes to apply.' }
    ]
  },
  {
    id: 'teams-access',
    title: 'Teams & Access',
    items: [
      { q: 'How do I create a team?', a: 'Go to Admin → Teams and create a new team.' },
      { q: 'How do I restrict index access?', a: 'Use User/Team Index Access in App Configuration to limit patterns.' },
      { q: 'How do team bookmarks work?', a: 'Team bookmarks are shared across team members when enabled.' }
    ]
  },
  {
    id: 'feature-toggles',
    title: 'Feature Toggles',
    items: [
      { q: 'How do toggles work?', a: 'Toggles are per team. Disable exports/bookmarks/rules/query builder as needed.' },
      { q: 'Why does a user not see a feature?', a: 'Check their team’s toggles in Admin → Feature Toggles.' }
    ]
  },
  {
    id: 'alert-rules',
    title: 'Alert Rules',
    items: [
      { q: 'How do alert rules trigger?', a: 'Rules evaluate query matches per window and send email when threshold is exceeded.' },
      { q: 'Why is alert email not sent?', a: 'Verify SMTP settings and alert recipients in App Configuration.' }
    ]
  },
  {
    id: 'opensearch',
    title: 'OpenSearch Connection & Diagnostics',
    items: [
      { q: 'How do I update the OpenSearch host?', a: 'Go to Admin → OpenSearch Connection and Save.' },
      { q: 'What does the OS status mean?', a: 'Green is healthy, yellow is warning, red is unhealthy.' },
      { q: 'Why is connection failing?', a: 'Check host/port/scheme and credentials; test connection after saving.' }
    ]
  },
  {
    id: 'imports',
    title: 'Log Imports',
    items: [
      { q: 'Why is Upload hidden?', a: 'Check Import settings in App Configuration and ensure Import UI is enabled.' },
      { q: 'Where do import indices go?', a: 'Imports go to the target index you specify; auto-created import indices can be retained for 7 days.' },
      { q: 'Why does upload fail?', a: 'Check file size limits, parser type, and required fields.' }
    ]
  },
  {
    id: 'backup-restore',
    title: 'Backup & Restore',
    items: [
      { q: 'What does Backup include?', a: 'Config, users, teams, feature toggles, rules, and bookmarks.' },
      { q: 'How do I restore?', a: 'Use Backup & Restore in Admin and upload a valid JSON backup.' }
    ]
  },
  {
    id: 'custom-urls',
    title: 'Custom URLs',
    items: [
      { q: 'How do custom URLs show up?', a: 'They appear below the user header as quick links after saving.' },
      { q: 'Why is a link missing?', a: 'Ensure the name and URL are set and saved in Admin.' }
    ]
  },
  {
    id: 'maintenance',
    title: 'Maintenance & Restart',
    items: [
      { q: 'When should I restart services?', a: 'After config changes to OpenSearch/proxy behavior or when instructed by ops.' },
      { q: 'What does Restart do?', a: 'It restarts proxy (or proxy+frontend) without changing config.' }
    ]
  }
];

function AdminFaqsPage() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');

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
          {ADMIN_FAQS.map((section) => (
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
        </div>
      </div>
    </div>
  );
}

export default AdminFaqsPage;

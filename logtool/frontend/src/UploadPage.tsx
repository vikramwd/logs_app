import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface ImportStatus {
  id: string;
  status: string;
  index: string;
  parserType: string;
  createdAt: string;
  totalLines?: number;
  ingested?: number;
  failed?: number;
  skipped?: number;
  error?: string;
}

function UploadPage({ authEnabled, userRole }: { authEnabled: boolean; userRole?: string }) {
  const navigate = useNavigate();
  const [adminDarkMode, setAdminDarkMode] = useState(() => {
    const saved = localStorage.getItem('adminDarkMode');
    return saved === null ? true : saved === 'true';
  });
  const [importEnabled, setImportEnabled] = useState(false);
  const [importUiVisible, setImportUiVisible] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importIndex, setImportIndex] = useState('');
  const [importParser, setImportParser] = useState<'ndjson' | 'regex'>('ndjson');
  const [parserTouched, setParserTouched] = useState(false);
  const [importTimestampField, setImportTimestampField] = useState('@timestamp');
  const [importRegex, setImportRegex] = useState('');
  const [importPreview, setImportPreview] = useState<{
    samples: Record<string, any>[];
    errors: number;
    skipped?: number;
    totalChecked: number;
    estimatedTotalLines?: number;
    fileSizeBytes?: number;
    estimatedIndexBytes?: number;
    estimateNote?: string;
    inferredMapping?: Record<string, string>;
    index?: string;
    detectedParser?: 'ndjson' | 'regex';
    detectionConfidence?: number;
    detectionReason?: string;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importJobId, setImportJobId] = useState('');
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [importHistory, setImportHistory] = useState<ImportStatus[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/admin');
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || !Number.isFinite(bytes)) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  useEffect(() => {
    axios.get('/api/config').then((res) => {
      setImportEnabled(Boolean(res.data?.importEnabled));
      setImportUiVisible(Boolean(res.data?.importUiVisible));
    }).catch(() => {
      setImportEnabled(false);
      setImportUiVisible(false);
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('adminDarkMode');
    const next = saved === null ? true : saved === 'true';
    setAdminDarkMode(next);
  }, []);

  useEffect(() => {
    if (adminDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [adminDarkMode]);

  const adminTtlMinutes = Number(import.meta.env.VITE_ADMIN_SESSION_TTL_MINUTES || 5);
  const adminTtlMs = (Number.isFinite(adminTtlMinutes) && adminTtlMinutes > 0 ? adminTtlMinutes : 5) * 60 * 1000;
  const adminAuth = sessionStorage.getItem('adminAuth') || localStorage.getItem('adminAuth') || '';
  const adminTs = Number(sessionStorage.getItem('adminAuthAt') || localStorage.getItem('adminAuthAt') || '');
  const hasAdminSession = Boolean(adminAuth && adminTs && Date.now() - adminTs <= adminTtlMs);
  if (adminAuth && !sessionStorage.getItem('adminAuth')) {
    sessionStorage.setItem('adminAuth', adminAuth);
  }
  if (adminTs && !sessionStorage.getItem('adminAuthAt')) {
    sessionStorage.setItem('adminAuthAt', String(adminTs));
  }
  const isAdmin = hasAdminSession;
  const importBase = hasAdminSession ? '/api/admin/import' : '/api/import';
  const adminHeaders = hasAdminSession ? { Authorization: adminAuth } : undefined;

  const buildFormData = () => {
    const form = new FormData();
    if (importFile) form.append('file', importFile);
    form.append('index', importIndex.trim());
    form.append('parserType', importParser);
    form.append('timestampField', importTimestampField.trim());
    if (importParser === 'regex') {
      form.append('regexPattern', importRegex.trim());
    }
    return form;
  };

  const loadHistory = async () => {
    try {
      const res = await axios.get(`${importBase}/history`, { headers: adminHeaders });
      setImportHistory(Array.isArray(res.data) ? res.data : []);
    } catch {
      setImportHistory([]);
    }
  };

  const loadStatus = async (id: string) => {
    try {
      const res = await axios.get(`${importBase}/${id}/status`, { headers: adminHeaders });
      setImportStatus(res.data);
    } catch {
      setImportStatus(null);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handlePreview = async () => {
    if (!importFile) {
      setErrorMessage('Select a file to preview.');
      return;
    }
    if (!importIndex.trim()) {
      setErrorMessage('Enter a target index.');
      return;
    }
    if (importParser === 'regex' && !importRegex.trim()) {
      setErrorMessage('Regex pattern is required.');
      return;
    }
    setErrorMessage('');
    setImportBusy(true);
    setImportPreview(null);
    try {
      const res = await axios.post(`${importBase}/preview`, buildFormData(), { headers: adminHeaders });
      setImportPreview(res.data);
      if (res.data?.detectedParser && !parserTouched) {
        setImportParser(res.data.detectedParser as 'ndjson' | 'regex');
      }
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.error || 'Preview failed.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setErrorMessage('Select a file to upload.');
      return;
    }
    if (!importIndex.trim()) {
      setErrorMessage('Enter a target index.');
      return;
    }
    if (importParser === 'regex' && !importRegex.trim()) {
      setErrorMessage('Regex pattern is required.');
      return;
    }
    setErrorMessage('');
    setImportBusy(true);
    setImportStatus(null);
    try {
      const res = await axios.post(`${importBase}`, buildFormData(), { headers: adminHeaders });
      if (res.data?.id) {
        setImportJobId(res.data.id);
        await loadStatus(res.data.id);
        await loadHistory();
      }
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.error || 'Import failed.');
    } finally {
      setImportBusy(false);
    }
  };

  const historyItems = useMemo(() => importHistory.slice(0, 5), [importHistory]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6 text-gray-800 dark:text-gray-100">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              onClick={handleBack}
              className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
            >
              Back
            </button>
            <Link
              to="/admin"
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Admin Panel
            </Link>
          </div>
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 shadow-sm">
            <h1 className="text-2xl font-semibold mb-2">Upload Logs</h1>
            <p className="text-gray-600 dark:text-gray-300">Uploads are available to admins only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Upload Logs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Upload structured logs and index them into OpenSearch.</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">Auto-created import indices are deleted after 7 days (max).</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
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

        {!importUiVisible && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100 px-4 py-3 text-sm">
            Uploads are hidden by configuration.
          </div>
        )}

        {importUiVisible && !importEnabled && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100 px-4 py-3 text-sm">
            Uploads are disabled. Please contact an admin.
          </div>
        )}

        {importUiVisible && importEnabled && (
          <div className="space-y-6">
            <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 space-y-4 text-sm">
              <div>
                <label className="block text-gray-600 dark:text-gray-300 mb-1">Upload file (.ndjson or text)</label>
                <input
                  type="file"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] || null);
                    setParserTouched(false);
                    setImportPreview(null);
                  }}
                  className="block w-full text-sm text-gray-600 dark:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-gray-600 dark:text-gray-300 mb-1">Target index</label>
                <input
                  value={importIndex}
                  onChange={(e) => setImportIndex(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  placeholder="logs-import-*"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Parser</label>
                  <select
                    value={importParser}
                    onChange={(e) => {
                      setImportParser(e.target.value as 'ndjson' | 'regex');
                      setParserTouched(true);
                    }}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  >
                    <option value="ndjson">NDJSON</option>
                    <option value="regex">Regex</option>
                  </select>
                  {importPreview?.detectedParser && (
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                      Detected: <span className="text-gray-700 dark:text-gray-200">{importPreview.detectedParser.toUpperCase()}</span>
                      {typeof importPreview.detectionConfidence === 'number' && (
                        <> · {Math.round(importPreview.detectionConfidence * 100)}% confidence</>
                      )}
                      {importPreview.detectionReason && (
                        <> · {importPreview.detectionReason}</>
                      )}
                      {importPreview.detectedParser !== importParser && (
                        <button
                          type="button"
                          onClick={() => {
                            setImportParser(importPreview.detectedParser as 'ndjson' | 'regex');
                            setParserTouched(true);
                          }}
                          className="ml-2 underline text-blue-600 dark:text-blue-400"
                        >
                          Use detected
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Timestamp field</label>
                  <input
                    value={importTimestampField}
                    onChange={(e) => setImportTimestampField(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                </div>
              </div>
              {importParser === 'regex' && (
                <div>
                  <label className="block text-gray-600 dark:text-gray-300 mb-1">Regex pattern</label>
                  <input
                    value={importRegex}
                    onChange={(e) => setImportRegex(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded"
                  />
                </div>
              )}
              {errorMessage && (
                <div className="text-sm text-red-600">{errorMessage}</div>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={handlePreview} disabled={importBusy} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-100 rounded">
                  {importBusy ? 'Working...' : 'Preview'}
                </button>
                <button onClick={handleImport} disabled={importBusy} className="px-3 py-2 bg-blue-600 text-white rounded">
                  Upload & Import
                </button>
              </div>
            </div>

            {importPreview && (
              <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 text-sm">
                <div className="text-gray-600 dark:text-gray-300 mb-4">
                  Preview ({importPreview.samples.length} rows, {importPreview.errors} errors{importPreview.skipped ? `, ${importPreview.skipped} skipped` : ''})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-xs text-gray-600 dark:text-gray-300">
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-700 dark:text-gray-200">Pre-import summary</div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Target index</span>
                      <span className="text-gray-800 dark:text-gray-100">{importPreview.index || importIndex}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>File size</span>
                      <span className="text-gray-800 dark:text-gray-100">{formatBytes(importPreview.fileSizeBytes)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Estimated records</span>
                      <span className="text-gray-800 dark:text-gray-100">{importPreview.estimatedTotalLines || importPreview.totalChecked} (estimated)</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Estimated index size</span>
                      <span className="text-gray-800 dark:text-gray-100">{formatBytes(importPreview.estimatedIndexBytes)} (estimated)</span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                      {importPreview.estimateNote || 'Estimates are approximate.'}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Inferred mapping</div>
                    {importPreview.inferredMapping && Object.keys(importPreview.inferredMapping).length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowMapping(true)}
                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs"
                      >
                        View mapping
                      </button>
                    ) : (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">No fields inferred.</div>
                    )}
                  </div>
                </div>
                <pre className="text-xs bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-auto max-h-64">
                  {JSON.stringify(importPreview.samples.slice(0, 5), null, 2)}
                </pre>
              </div>
            )}

            {showMapping && importPreview?.inferredMapping && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-900 border dark:border-gray-700">
                  <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
                    <div className="font-semibold text-gray-800 dark:text-gray-100">Inferred mapping</div>
                    <button
                      type="button"
                      onClick={() => setShowMapping(false)}
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs"
                    >
                      Close
                    </button>
                  </div>
                  <div className="p-4 max-h-[70vh] overflow-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-700 dark:text-gray-200">
                      {Object.entries(importPreview.inferredMapping).map(([field, type]) => (
                        <div key={field} className="flex items-center justify-between gap-2">
                          <span>{field}</span>
                          <span className="text-gray-500 dark:text-gray-400">{type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {importStatus && (
              <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 text-sm">
                <div className="font-semibold text-gray-800 dark:text-gray-100">Latest import status</div>
                <div className="text-gray-600 dark:text-gray-300 mt-2">Index: {importStatus.index}</div>
                <div className="text-gray-600 dark:text-gray-300">Status: {importStatus.status}</div>
                <div className="text-gray-600 dark:text-gray-300">Ingested: {importStatus.ingested || 0}</div>
                <div className="text-gray-600 dark:text-gray-300">Failed: {importStatus.failed || 0}</div>
                {importStatus.error && <div className="text-red-600">Error: {importStatus.error}</div>}
              </div>
            )}

            {historyItems.length > 0 && (
              <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 text-sm">
                <div className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Recent imports</div>
                <div className="space-y-2">
                  {historyItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setImportJobId(item.id);
                        loadStatus(item.id);
                      }}
                      className="w-full text-left border dark:border-gray-700 rounded px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <div className="text-gray-800 dark:text-gray-100">{item.index}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{item.status} · {item.createdAt}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UploadPage;

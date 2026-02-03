import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  children: string;
  maxHeight?: number;
  highlightTerms?: string[];
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, terms: string[]) {
  if (!terms.length) return text;
  const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (!part) return null;
    const isMatch = terms.some((term) => part.toLowerCase() === term.toLowerCase());
    return isMatch ? (
      <mark key={idx} className="bg-yellow-200 text-gray-900 rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    );
  });
}

export default function JsonHighlighter({ children, maxHeight, highlightTerms = [] }: Props) {
  let parsed;
  try {
    parsed = JSON.stringify(JSON.parse(children), null, 2);
  } catch {
    return <pre className="whitespace-pre-wrap">{children}</pre>;
  }
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-hidden">
      <div style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, overflow: 'auto' }}>
        {highlightTerms.length > 0 ? (
          <pre className="whitespace-pre-wrap break-words text-[12px] font-mono text-gray-800 dark:text-gray-100 px-3 py-2">
            {highlightText(parsed, highlightTerms)}
          </pre>
        ) : (
          <SyntaxHighlighter
            language="json"
            style={vscDarkPlus}
            wrapLongLines
            customStyle={{
              margin: 0,
              padding: '0.75rem',
              background: 'transparent',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowX: 'hidden'
            }}
          >
            {parsed}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}

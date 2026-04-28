import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownFieldProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export function MarkdownField({
  value,
  onChange,
  onKeyDown,
  rows = 4,
  placeholder,
  className = '',
  readOnly = false,
}: MarkdownFieldProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
      return;
    }
    onKeyDown?.(e);
  };

  if (readOnly || (!editing && value)) {
    return (
      <div
        onClick={() => { if (!readOnly) setEditing(true); }}
        className={`markdown-preview px-3 py-2 border border-slate-600 bg-slate-900 text-slate-300 rounded-md text-sm leading-relaxed ${readOnly ? '' : 'cursor-text hover:border-slate-500'} ${className}`}
        style={{ minHeight: `${rows * 1.5}em` }}
      >
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="text-slate-100 font-semibold">{children}</strong>,
            em: ({ children }) => <em className="text-slate-200">{children}</em>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
            li: ({ children }) => <li className="text-slate-300">{children}</li>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                {children}
              </a>
            ),
            h1: ({ children }) => <h1 className="text-lg font-bold text-slate-100 mb-1">{children}</h1>,
            h2: ({ children }) => <h2 className="text-base font-bold text-slate-100 mb-1">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-bold text-slate-100 mb-1">{children}</h3>,
            code: ({ children }) => <code className="bg-slate-800 text-slate-200 px-1 py-0.5 rounded text-xs">{children}</code>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-slate-600 pl-3 text-slate-400 italic mb-2">{children}</blockquote>
            ),
            table: ({ children }) => (
              <table className="w-full text-xs border-collapse mb-2">{children}</table>
            ),
            th: ({ children }) => (
              <th className="border border-slate-600 px-2 py-1 text-left text-slate-200 bg-slate-800">{children}</th>
            ),
            td: ({ children }) => (
              <td className="border border-slate-600 px-2 py-1 text-slate-300">{children}</td>
            ),
          }}
        >
          {value}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={handleKeyDown}
      rows={rows}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border border-slate-600 bg-slate-900 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm ${className}`}
    />
  );
}

interface MarkdownInlineProps {
  value: string;
  className?: string;
}

export function MarkdownInline({ value, className = '' }: MarkdownInlineProps) {
  if (!value) return null;

  return (
    <span className={`markdown-inline ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <>{children}</>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="bg-slate-800 px-0.5 rounded text-xs">{children}</code>,
        }}
      >
        {value}
      </ReactMarkdown>
    </span>
  );
}

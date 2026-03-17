import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

SyntaxHighlighter.registerLanguage('javascript', javascript);

interface CodeBlockProps {
  code: string;
  /** Show line numbers alongside the code (default: true) */
  showLineNumbers?: boolean;
  /** Highlight specific line numbers (1-based) */
  highlightLines?: number[];
  className?: string;
  'data-testid'?: string;
}

export function CodeBlock({
  code,
  showLineNumbers = true,
  highlightLines = [],
  className,
  'data-testid': testId,
}: CodeBlockProps) {
  return (
    <div
      className={cn('rounded-md overflow-hidden text-xs max-h-80 overflow-y-auto', className)}
      data-testid={testId}
    >
      <SyntaxHighlighter
        language="javascript"
        style={vscDarkPlus}
        showLineNumbers={showLineNumbers}
        wrapLines
        lineProps={(lineNumber: number) => {
          const isHighlighted = highlightLines.includes(lineNumber);
          return {
            style: isHighlighted
              ? { display: 'block', backgroundColor: 'rgba(255, 80, 80, 0.15)' }
              : { display: 'block' },
          };
        }}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.75rem',
          lineHeight: '1.6',
        }}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#6b7280',
          userSelect: 'none',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/** Inline snippet used inside violation rows */
export function InlineCode({ children }: { children: string }) {
  return (
    <div className="mt-1.5 rounded overflow-hidden text-[11px]">
      <SyntaxHighlighter
        language="javascript"
        style={vscDarkPlus}
        showLineNumbers={false}
        customStyle={{ margin: 0, borderRadius: 0, padding: '4px 10px', fontSize: '0.7rem' }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

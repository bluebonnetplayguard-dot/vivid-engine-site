import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true); setError(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1500);
    } catch { setError(true); }
  }
  return <span className="inline-flex flex-wrap items-center gap-2">
    <button type="button" onClick={copy} className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Copy message">
      {done ? <Check size={14} /> : <Copy size={14} />}{done ? 'Copied' : 'Copy'}
    </button>
    {error && <span role="alert" className="text-xs text-destructive">Unable to copy. Select and copy the text.</span>}
  </span>;
}
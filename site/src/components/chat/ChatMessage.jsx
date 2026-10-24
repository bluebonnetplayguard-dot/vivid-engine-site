import { Link } from 'react-router-dom';
import CopyButton from '@/components/chat/CopyButton';

export default function ChatMessage({ message, mode }) {
  const user = message.role === 'user';
  const content = message.content.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => /^https?:\/\//.test(part)
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={user ? 'break-all underline' : 'break-all text-primary underline'}>{part}</a>
    : <span key={i}>{part}</span>);
  return <div className={user
    ? 'ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2.5 text-sm text-accent-foreground'
    : `rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs ${mode === 'admin' ? 'max-w-full' : 'max-w-[85%]'}`}>
    <div className="whitespace-pre-wrap wrap-break-word">{content}</div>
    {!user && mode === 'admin' && <div className="flex flex-wrap items-center gap-3">
      <CopyButton text={message.content} />
      {message.drafts > 0 && <Link to="/admin/marketing-drafts" className="text-xs text-primary underline">{message.drafts} draft{message.drafts > 1 ? 's' : ''} saved to Marketing Drafts</Link>}
    </div>}
  </div>;
}
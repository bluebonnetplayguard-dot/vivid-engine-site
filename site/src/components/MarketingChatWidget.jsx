import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import ChatWindow from '@/components/chat/ChatWindow';

export default function MarketingChatWidget() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'admin';
  return <ChatWindow key={`${user?.id || 'visitor'}:${isAdmin}`} userId={user?.id} isAdmin={isAdmin} portal={/^\/(admin|portal|settings)(\/|$)/.test(pathname)} />;
}
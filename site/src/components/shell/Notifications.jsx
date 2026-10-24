import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// The bell in the sidebar. Anything can call notify({ title, text, link, level }); notices last for the session.
const NotifyContext = createContext({ items: [], notify: () => {}, markRead: () => {}, unread: 0 });

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const notify = useCallback(n => setItems(list => (list.some(x => x.key && x.key === n.key) ? list : [{ id: `${Date.now()}-${Math.random()}`, at: new Date(), read: false, level: 'info', ...n }, ...list].slice(0, 30))), []);
  const markRead = useCallback(() => setItems(list => list.map(x => ({ ...x, read: true }))), []);
  const value = useMemo(() => ({ items, notify, markRead, unread: items.filter(x => !x.read).length }), [items, notify, markRead]);
  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}
export const useNotify = () => useContext(NotifyContext);

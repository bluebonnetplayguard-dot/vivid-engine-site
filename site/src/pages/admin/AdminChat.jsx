import { useState, useEffect, useRef } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Bot, User, Hand } from "lucide-react";

const STATUS_STYLE = {
  ai_handled: "bg-primary/15 text-primary",
  human_handled: "bg-accent/15 text-accent",
  escalated: "bg-destructive/15 text-destructive",
  booked: "bg-emerald-500/15 text-emerald-400",
};

export default function AdminChat() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [user, setUser] = useState(null);
  const [takingOver, setTakingOver] = useState(false);
  const scrollRef = useRef(null);

  const loadSessions = () => {
    api.entities.ChatSession.list("-created_date", 100)
      .then((d) => { setSessions(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    api.auth.me().then((u) => setUser(u)).catch(() => {});
    loadSessions();
    const unsub = api.entities.ChatSession.subscribe((event) => {
      if (event.type === "create") loadSessions();
      else if (event.type === "update" && activeId && event.data && event.data.id === activeId) loadSessions();
    });
    return unsub;
  }, [activeId]);

  const loadMessages = (sid) => {
    api.entities.ChatMessage.filter({ session_id: sid }, "created_date", 200)
      .then((d) => setMessages(d))
      .catch(() => setMessages([]));
  };

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const unsub = api.entities.ChatMessage.subscribe((event) => {
      if (event.type === "create" && event.data && event.data.session_id === activeId) {
        setMessages((prev) => [...prev, event.data]);
      }
    });
    return unsub;
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const takeOver = async (s) => {
    setTakingOver(true);
    try {
      await api.entities.ChatSession.update(s.id, { status: "human_handled", assigned_to_name: user?.full_name || "Vivid Engine" });
      loadSessions();
    } finally {
      setTakingOver(false);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !activeId) return;
    setReply("");
    await api.entities.ChatMessage.create({ session_id: activeId, role: "human", content: text });
  };

  const active = sessions.find((s) => s.id === activeId);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col md:h-screen">
      <PageMeta {...PAGE_META.adminChat} noindex />
      <div className="border-b border-border px-6 py-4">
        <h1 className="font-heading text-2xl font-bold">Live Chat Inbox</h1>
        <p className="text-sm text-muted-foreground">AI-handled conversations escalate here. Take over to chat live with a visitor.</p>
      </div>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-3">
        {/* Session list */}
        <div className="overflow-y-auto border-r border-border md:col-span-1">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No conversations yet.</div>
          ) : sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors ${activeId === s.id ? "bg-primary/10" : "hover:bg-accent/5"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{s.visitor_name || "New visitor"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status] || "bg-secondary text-muted-foreground"}`}>{s.status.replace("_", " ")}</span>
              </div>
              <span className="truncate text-xs text-muted-foreground">{s.last_message || "—"}</span>
              {s.business_type && <span className="text-xs text-muted-foreground">{s.business_type}{s.budget_range ? ` · ${s.budget_range}` : ""}</span>}
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className="flex flex-col md:col-span-2">
          {active ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="leading-tight">
                  <div className="text-sm font-semibold">{active.visitor_name || "New visitor"}</div>
                  <div className="text-xs text-muted-foreground">
                    {active.visitor_email ? `${active.visitor_email} · ` : ""}
                    {active.business_type || "—"}{active.current_site_status ? ` · ${active.current_site_status}` : ""}{active.budget_range ? ` · ${active.budget_range}` : ""}
                  </div>
                </div>
                {active.status !== "human_handled" && (
                  <Button size="sm" onClick={() => takeOver(active)} disabled={takingOver}>
                    <Hand className="mr-2 h-4 w-4" /> Take over
                  </Button>
                )}
                {active.status === "human_handled" && <Badge className="bg-accent/15 text-accent">You're live</Badge>}
              </div>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-2 ${m.role === "visitor" ? "justify-end" : "justify-start"}`}>
                    {m.role !== "visitor" && <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "human" ? "bg-accent/20 text-accent" : "bg-primary/15 text-primary"}`}>{m.role === "human" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>}
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.role === "visitor" ? "bg-primary text-primary-foreground" : m.role === "human" ? "bg-accent/15 text-foreground" : "bg-secondary text-foreground"}`}>{m.content}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }} placeholder="Reply as staff…" />
                  <Button onClick={sendReply} size="icon"><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10" />
              <p className="text-sm">Select a conversation to view and take over.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
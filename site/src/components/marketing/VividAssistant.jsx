import { useState, useEffect, useRef } from "react";
import invokePublicFunction from '@/lib/invokePublicFunction';
import { MessageCircle, X, Send, Loader2, Bot, CalendarCheck } from "lucide-react";

const GREETING = "Hi there! I'm Vivid. Ask me about our websites, apps, POS, CRM, pricing, or service area — or tell me about your business and I'll point you in the right direction.";

function getSessionId() {
  let id = localStorage.getItem("ve_session_id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem("ve_session_id", id);
  }
  return id;
}

export default function VividAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "ai", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(getSessionId);
  const [consultRequested, setConsultRequested] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const tempId = Date.now();
    setMessages((prev) => [...prev, { role: "visitor", content: text, _pending: true, _localId: tempId }]);
    setLoading(true);
    try {
      const res = await invokePublicFunction("chatAssistant", { sessionId, message: text });
      const data = res.data || res;
      if (data && data.error) throw new Error(data.error);
      setMessages((prev) =>
        prev.map((m) => (m._localId === tempId ? { ...m, _pending: false } : m)).concat({ role: "ai", content: data.reply })
      );
      if (data.escalated) setConsultRequested(true);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m._localId === tempId ? { ...m, _pending: false } : m)).concat({ role: "ai", content: "Sorry, I had trouble just now. Could you try again?" })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="chat-bubble fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-primary to-accent text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105"
        aria-label="Chat with us"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-120 w-88 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-3 border-b border-border bg-linear-to-r from-primary/15 to-accent/15 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-primary to-accent text-white"><Bot className="h-5 w-5" /></span>
            <div className="leading-tight">
              <div className="font-heading text-sm font-bold">Vivid</div>
              <div className="text-xs text-muted-foreground">AI assistant — typically replies instantly</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "visitor" ? "justify-end" : "justify-start"}`}>
                {m.role !== "visitor" && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-4 w-4" /></span>}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m._pending ? "opacity-60" : ""} ${m.role === "visitor" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-4 w-4" /></span>
                <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
              </div>
            )}
            {consultRequested && (
              <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
                <CalendarCheck className="h-4 w-4 shrink-0" />
                <span>Consultation request captured — our team will call you to confirm.</span>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {[["Get a quote", "inquiry"], ["See pricing", "pricing"], ["Services", "services"]].map(([label, id]) => (
                <button key={id} type="button" onClick={() => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary">{label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Type a message..."
                className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button onClick={send} disabled={loading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
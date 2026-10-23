import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from '@/api/client';
import { PageMeta } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Send, Loader2, Circle, CircleDot, CheckCircle2 } from "lucide-react";

const statusColor = {
  planning: "bg-blue-500/10 text-blue-400",
  scheduled: "bg-purple-500/10 text-purple-400",
  "in-progress": "bg-amber-500/10 text-amber-400",
  review: "bg-cyan-500/10 text-cyan-400",
  completed: "bg-green-500/10 text-green-400",
};

const taskIcon = { todo: Circle, "in-progress": CircleDot, done: CheckCircle2 };
const taskColor = { todo: "text-muted-foreground", "in-progress": "text-amber-400", done: "text-green-400" };

export default function ProjectDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => {
    Promise.all([
      api.entities.Project.get(id).catch(() => null),
      api.entities.Task.filter({ project_id: id }, "-order", 50).catch(() => []),
      api.entities.Message.filter({ project_id: id }, "created_date", 100).catch(() => []),
    ]).then(([p, t, m]) => {
      setProject(p);
      setTasks(t);
      setMessages(m);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [id]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (sending || !msg.trim()) return;
    const text = msg.trim();
    const tempId = "temp_" + Date.now();
    setMessages((prev) => [...prev, { id: tempId, project_id: id, sender_name: "You", content: text, is_from_client: true, _pending: true }]);
    setMsg("");
    setSending(true);
    try {
      const { data } = await api.functions.invoke('sendProjectMessage', { project_id: id, content: text });
      if (!data?.message) throw new Error(data?.error || 'Unable to send your message.');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
      toast({ title: "Message sent" });
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMsg(text);
      toast({ variant: "destructive", title: "Failed to send", description: error.response?.data?.error || error.message });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <PageMeta title={`Client Project ${id}`} description={`Private project progress, tasks and messages for Vivid Engine client project ${id}.`} path={`/portal/projects/${id}`} noindex />
        <h1 className="sr-only">Client Project Details</h1>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-10">
        <PageMeta title={`Client Project ${id}`} description={`Private project progress, tasks and messages for Vivid Engine client project ${id}.`} path={`/portal/projects/${id}`} noindex />
        <h1 className="sr-only">Project Not Found</h1>
        <p className="text-muted-foreground">Job not found.</p>
        <Link to="/portal" className="hidden md:inline-block"><Button variant="outline" size="sm" className="mt-4">Back to dashboard</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <PageMeta title={`Client Project ${id}`} description={`Private project progress, tasks and messages for Vivid Engine client project ${id}.`} path={`/portal/projects/${id}`} noindex />
      <Link to="/portal" className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground md:inline-flex"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{project.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
        </div>
        <span className={`h-fit rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColor[project.status] || "bg-muted text-muted-foreground"}`}>{project.status}</span>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Progress</span><span className="font-medium">{project.progress || 0}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-linear-to-r from-primary to-accent" style={{ width: `${project.progress || 0}%` }} /></div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">Job tasks</h2>
          <div className="mt-4 space-y-2">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            ) : tasks.map((t) => {
              const Icon = taskIcon[t.status] || Circle;
              return (
                <div key={t.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${taskColor[t.status] || "text-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-medium">{t.title}</div>
                    {t.description && <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Messages</h2>
          <div className="mt-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet. Start the conversation below.</p>
            ) : messages.map((m) => (
              <div key={m.id} className={`flex ${m.is_from_client ? "justify-end" : ""}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m._pending ? "opacity-60" : ""} ${m.is_from_client ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>
                  <div className="text-xs opacity-70">{m.sender_name}</div>
                  <div className="mt-0.5">{m.content}</div>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="mt-4 flex gap-2">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message..." maxLength={5000} disabled={sending} rows={2} className="min-h-0 flex-1" />
            <Button type="submit" disabled={sending || !msg.trim()} size="icon" className="h-10 w-10 self-end">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Loader2, ShieldAlert } from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
  }, []);

  const requestDeletion = async () => {
    setLoading(true);
    try {
      const res = await api.functions.invoke("requestAccountDeletion", {
        confirm: true,
      });
      if (res.data?.success) {
        setDone(true);
        toast({ title: "Deletion request received" });
      } else {
        toast({ variant: "destructive", title: res.data?.error || "Request failed" });
      }
    } catch {
      toast({ variant: "destructive", title: "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.settings} noindex />
      <h1 className="font-heading text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your account and preferences.</p>
      <Link to="/delete-account" className="mt-3 inline-block text-sm text-primary underline">Delete account and review data retention</Link>

      <div className="mt-8 max-w-xl rounded-2xl border border-destructive/30 bg-card p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <h2 className="font-heading text-lg font-semibold">Account deletion</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Request permanent deletion of your account and associated data. Our team will process your request within 30 days, subject to legal retention requirements.
            </p>
          </div>
        </div>
        {done ? (
          <div className="mt-5 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-400">
            Your deletion request has been received. We'll contact you at your email on file to confirm.
          </div>
        ) : confirming ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium">Are you sure? This action cannot be undone.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" disabled={loading} onClick={requestDeletion}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Confirm deletion request
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="mt-5" onClick={() => setConfirming(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Request account deletion
          </Button>
        )}
      </div>
    </div>
  );
}
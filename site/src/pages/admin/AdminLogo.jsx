import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Image } from "@/components/ui/image";
import { Sparkles, Loader2, Download, Save } from "lucide-react";
import RadixSelect from "@/components/admin/RadixSelect";

const styles = ["modern minimalist", "bold emblem", "vintage badge", "geometric", "lettermark", "mascot"];

export default function AdminLogo() {
  const { toast } = useToast();
  const [form, setForm] = useState({ business_name: "", style: "modern minimalist" });
  const [imgUrl, setImgUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [logos, setLogos] = useState([]);

  const load = () => { api.entities.LogoDesign.list("-created_date", 20).then(setLogos).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const generate = async (e) => {
    e.preventDefault();
    if (!form.business_name) return;
    setLoading(true); setImgUrl("");
    try {
      const res = await api.functions.invoke("generateLogo", { business_name: form.business_name, style: form.style });
      if (res.data.url) setImgUrl(res.data.url);
      else toast({ variant: "destructive", title: res.data.error || "Generation failed" });
    } catch { toast({ variant: "destructive", title: "Generation failed" }); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!imgUrl) return;
    try {
      await api.entities.LogoDesign.create({ business_name: form.business_name, style: form.style, prompt: `${form.business_name} - ${form.style}`, image_url: imgUrl });
      load();
      toast({ title: "Logo saved" });
    } catch { toast({ variant: "destructive", title: "Failed to save" }); }
  };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminLogo} noindex />
      <h1 className="font-heading text-2xl font-bold">Logo Designer</h1>
      <p className="mt-1 text-sm text-muted-foreground">Generate a logo for your business or a client's brand with AI.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <form onSubmit={generate} className="rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-2"><Label>Business name</Label><Input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Texas Drain Solutions" /></div>
          <div className="mt-4 grid gap-2"><Label>Style</Label><RadixSelect value={form.style} onValueChange={(v) => setForm({ ...form, style: v })} options={styles} className="h-10" /></div>
          <Button type="submit" disabled={loading} className="mt-6 w-full">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate logo</>}</Button>
        </form>
        <div className="rounded-2xl border border-border bg-card p-6">
          {loading ? (
            <div className="flex aspect-square items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : imgUrl ? (
            <div>
              <div className="aspect-square overflow-hidden rounded-xl bg-muted"><Image src={imgUrl} alt={`${form.business_name || 'Business'} logo`} fittingType="contain" className="h-full w-full" /></div>
              <div className="mt-4 flex gap-2"><Button variant="outline" size="sm" asChild><a href={imgUrl} download="logo.png"><Download className="mr-2 h-4 w-4" /> Download</a></Button><Button size="sm" onClick={save}><Save className="mr-2 h-4 w-4" /> Save to gallery</Button></div>
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center text-sm text-muted-foreground">Your generated logo will appear here.</div>
          )}
        </div>
      </div>
      {logos.length > 0 && (
        <div className="mt-10">
          <h2 className="font-heading text-lg font-semibold">Saved logos</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {logos.map((l) => (
              <div key={l.id} className="overflow-hidden rounded-xl border border-border bg-card p-3">
                <div className="aspect-square overflow-hidden rounded-lg bg-muted"><Image src={l.image_url} alt={l.image_alt || `${l.business_name || 'Business'} logo`} fittingType="contain" className="h-full w-full" /></div>
                <div className="mt-2 text-xs font-medium">{l.business_name}</div>
                <div className="text-xs text-muted-foreground">{l.style}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
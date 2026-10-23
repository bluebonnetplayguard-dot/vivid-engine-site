import { useState, useEffect } from "react";
import { useSearchParams } from 'react-router-dom';
import { PLANS } from '@/config/pricing';
import { useToast } from "@/components/ui/use-toast";
import BottomDrawerSelect from "@/components/ui/BottomDrawerSelect";

const CONTACT_EMAIL = 'hello@vividenginesolutions.com';

const SERVICE_OPTIONS = [...PLANS.map(plan => `${plan.name} plan`), "New website", "POS system", "CRM", "SEO", "Google Ads", "Not sure yet"];
const CONTACT_METHODS = [
  { label: "Phone call", value: "phone" },
  { label: "Text", value: "text" },
  { label: "Email", value: "email" },
];

export default function InquirySection({ requireBusiness = false }) {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const selectedPlan = PLANS.find(plan => plan.id === searchParams.get('plan'));
  const initialForm = () => ({ business_name: "", contact_name: "", phone: "", email: "", website_url: "", contact_method: "", services: selectedPlan ? [`${selectedPlan.name} plan`] : [], project_details: selectedPlan ? `Interested in: ${selectedPlan.name} plan` : "", website: "" });
  const [form, setForm] = useState(initialForm);
  useEffect(() => {
    if (!selectedPlan) return;
    setForm(previous => ({ ...previous, services: [...previous.services.filter(service => !PLANS.some(plan => service === `${plan.name} plan`)), `${selectedPlan.name} plan`], project_details: previous.project_details.replace(/^Interested in: (Starter|Launch|Full Engine|Basic Care|Turnkey Care) plan\n?/, '').trim() ? `Interested in: ${selectedPlan.name} plan\n${previous.project_details.replace(/^Interested in: (Starter|Launch|Full Engine|Basic Care|Turnkey Care) plan\n?/, '').trim()}` : `Interested in: ${selectedPlan.name} plan` }));
  }, [selectedPlan?.id]);
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleService = (s) => setForm((f) => {
    const has = f.services.includes(s);
    return { ...f, services: has ? f.services.filter((x) => x !== s) : [...f.services, s] };
  });

  const submit = (e) => {
    e.preventDefault();
    if (form.website) return; // honeypot filled — silently ignore
    const biz = form.business_name.trim();
    const name = form.contact_name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (!biz || !name) {
      toast({ title: "Please add your business name and your name.", variant: "destructive" });
      return;
    }
    if (!phone && !email) {
      toast({ title: "Please add a phone number or email so we can reach you.", variant: "destructive" });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "That email address doesn't look right.", variant: "destructive" });
      return;
    }
    const needs = form.services.join(", ");
    const body = [
      "Business: " + biz,
      "Contact: " + name,
      "Phone: " + (phone || "-"),
      "Email: " + (email || "-"),
      "Current website: " + (form.website_url.trim() || "-"),
      "Preferred contact: " + (form.contact_method || "-"),
      "Looking for: " + (needs || "-"),
      "",
      "Details:",
      form.project_details.trim() || "-",
    ].join("\r\n");
    window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent("New inquiry — " + biz) + "&body=" + encodeURIComponent(body);
    setDone(true);
    toast({ title: "Thanks, " + name + "!", description: "Your email app should open with your inquiry ready to send." });
  };

  const reset = () => setForm(initialForm());

  if (done) {
    return (
      <section id="inquiry" className="inquiry scroll-mt-24">
        <div className="wrap">
          <div className="section-head">
            <span className="mono" style={{ color: "var(--mk-primary)" }}>06 — Inquiry</span>
            <h2>Thanks — we've got it.</h2>
            <p>A local team member follows up — usually the same day.</p>
          </div>
          <div className="workorder" style={{ maxWidth: 560 }}>
            <span className="mono" style={{ color: "var(--mk-primary)", display: "block", marginBottom: 10 }}>RECEIVED</span>
            <p style={{ color: "var(--mk-text)", fontSize: "0.95rem", margin: 0 }}>
              Your email app should have opened with your inquiry ready to send. If it didn't, email us directly at {CONTACT_EMAIL}.
            </p>
            <button className="btn-ghost" style={{ marginTop: 20 }} onClick={() => { setDone(false); reset(); }}>
              Send another inquiry
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="inquiry" className="inquiry scroll-mt-24">
      <div className="wrap">
        <div>
          <div className="section-head">
            <span className="mono" style={{ color: "var(--mk-primary)" }}>06 — Inquiry</span>
            <h2>Tell us about your business</h2>
            <p>A local team member follows up — usually the same day.</p>
          </div>
          <div className="side-info">
            <div><b>SERVICE AREA</b>Southeast Texas &amp; Southwest Louisiana</div>
            <div><b>MEET IN PERSON</b>Sit-downs available at your business — no Zoom required</div>
            <div><b>RESPONSE TIME</b>Same-business-day on inquiries submitted before 4pm</div>
          </div>
        </div>
        <form className="workorder" id="inquiryForm" onSubmit={submit}>
          {/* Honeypot: hidden field bots fill, humans never see */}
          <input type="text" name="website" value={form.website} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <div className="form-row">
            <div className="field"><label htmlFor="biz">Business name</label><input id="biz" name="business" type="text" required={requireBusiness} autoComplete="organization" placeholder="e.g. Bayou Coastal Hardware" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} /></div>
            <div className="field"><label htmlFor="contact">Contact name</label><input id="contact" name="name" type="text" required autoComplete="name" placeholder="Your name" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(409) 555-0113" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" placeholder="you@business.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="site">Current website (if any)</label><input id="site" name="current_website" type="text" autoComplete="url" placeholder="yourbusiness.com or 'none'" value={form.website_url} onChange={(e) => set("website_url", e.target.value)} /></div>
            <div className="field"><label htmlFor="method">Preferred contact</label>
              <BottomDrawerSelect
                value={form.contact_method}
                onChange={(v) => set("contact_method", v)}
                options={CONTACT_METHODS}
                placeholder="Select…"
                title="Preferred contact"
                variant="blueprint"
                triggerClassName="flex w-full items-center justify-between rounded-md border border-(--mk-border) bg-(--mk-card) px-3 py-2.5 text-sm text-(--mk-text)"
              />
            </div>
          </div>
          <div className="field full" style={{ marginBottom: 16 }}>
            <label>What are you looking for?</label>
            <div className="checks">
              {SERVICE_OPTIONS.map((s) => (
                <label key={s} className="chip">
                  <input type="checkbox" checked={form.services.includes(s)} onChange={() => toggleService(s)} /> {s}
                </label>
              ))}
            </div>
          </div>
          <div className="field full" style={{ marginBottom: 16 }}>
            <label htmlFor="details">Project details</label>
            <textarea id="details" rows={3} placeholder="Tell us what's not working with your current setup, or what you're hoping to launch." value={form.project_details} onChange={(e) => set("project_details", e.target.value)} />
          </div>
          <button className="submit-btn" type="submit">Send inquiry</button>
        </form>
      </div>
    </section>
  );
}
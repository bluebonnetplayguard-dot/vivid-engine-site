import { useEffect, useState, useCallback } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import DomainCancellationRequestButton from "@/components/DomainCancellationRequestButton";
import MobilePortalBack from '@/components/portal/MobilePortalBack';
import { ShieldCheck, ExternalLink, LifeBuoy } from "lucide-react";

function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}
function formatDate(v) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(v));
}

const BADGE_STYLES = {
  "Domain Active": "border-emerald-800 bg-emerald-950 text-emerald-300",
  Connected: "border-emerald-800 bg-emerald-950 text-emerald-300",
  Active: "border-emerald-800 bg-emerald-950 text-emerald-300",
  Current: "border-emerald-800 bg-emerald-950 text-emerald-300",
  "Payment Pending": "border-amber-800 bg-amber-950 text-amber-300",
  "Past Due": "border-red-800 bg-red-950 text-red-300",
  "Cancellation Requested": "border-amber-800 bg-amber-950 text-amber-300",
  "Cancellation Review": "border-amber-800 bg-amber-950 text-amber-300",
};
function StatusBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${BADGE_STYLES[value] || "border-slate-700 bg-slate-900 text-slate-300"}`}>
      {value || "Not available"}
    </span>
  );
}

function StatusItem({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-bold text-slate-100">{value || "—"}</p>
    </div>
  );
}
function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default function ClientDomain() {
  const [lease, setLease] = useState(null);
  const [cancellationStatus, setCancellationStatus] = useState("None");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.functions.invoke("getMyDomainLeaseStatus", {});
      setLease(res.data?.lease || null);
      setCancellationStatus(res.data?.cancellationRequestStatus || "None");
    } catch {
      setError("We could not load your managed-domain status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-300"><PageMeta {...PAGE_META.clientDomain} path={window.location.pathname} noindex /><MobilePortalBack /><h1 className="sr-only">Managed Domain</h1>Loading managed-domain service…</div>;
  }

  if (!lease) {
    return (
      <section className="rounded-2xl border border-slate-700 bg-slate-950 p-6 text-white">
        <PageMeta {...PAGE_META.clientDomain} path={window.location.pathname} noindex />
        <MobilePortalBack />
        <h1 className="text-2xl font-black">Managed Domain</h1>
        <p className="mt-3 text-slate-400">No managed domain service is currently linked to your account.</p>
        <a href="mailto:info@vividenginesolutions.com" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-500">Contact Support</a>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5 text-white">
      <PageMeta {...PAGE_META.clientDomain} path={window.location.pathname} noindex />
      <header>
        <MobilePortalBack />
        <p className="text-xs font-black tracking-[0.18em] text-blue-300">CLIENT PORTAL</p>
        <h1 className="mt-2 text-3xl font-black">Managed Domain</h1>
        <p className="mt-2 text-slate-400">View your managed domain service status, website connection details, and current service information.</p>
      </header>

      {error && <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-200">{error}</div>}

      {notice && <div className="rounded-xl border border-emerald-800 bg-emerald-950 p-4 text-sm text-emerald-200">{notice}</div>}

      {/* Domain status card */}
      <article className="rounded-2xl border border-slate-700 bg-slate-950 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold text-slate-400">Domain name</p>
            <h2 className="mt-1 break-all text-2xl font-black">{lease.domainName}</h2>
          </div>
          <StatusBadge value={lease.domainStatus} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusItem label="Website" value={lease.websiteConnectionStatus} />
          <StatusItem label="SSL certificate" value={lease.sslStatus} />
          <StatusItem label="DNS management" value={lease.dnsManagementStatus} />
          <StatusItem label="Service status" value={lease.serviceStatus} />
        </div>
        <p className="mt-4 text-xs text-slate-500">Last updated: {formatDate(lease.updated_date)}</p>
      </article>

      {/* Lease details card */}
      <article className="rounded-2xl border border-slate-700 bg-slate-950 p-5">
        <h2 className="text-lg font-black">Lease details</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <DetailItem label="Managed domain service" value={`${formatMoney(lease.monthlyLeaseCents)}/month`} />
          <DetailItem label="Next billing date" value={formatDate(lease.nextBillingDate)} />
          <DetailItem label="Lease started" value={formatDate(lease.leaseStartDate)} />
          <DetailItem label="Minimum term ends" value={formatDate(lease.minimumTermEndDate)} />
          <DetailItem label="Domain renewal date" value={formatDate(lease.renewalDate)} />
          <DetailItem label="Renewal setting" value={lease.autoRenewStatus} />
          <DetailItem label="Transfer status" value={lease.transferEligibilityStatus} />
          <DetailItem label="Billing status" value={lease.billingStatus} />
        </div>
        {lease.clientVisibleNotes && (
          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-sm font-bold text-slate-200">Service note</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{lease.clientVisibleNotes}</p>
          </div>
        )}
      </article>

      {/* Client notice */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-5 text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <p>This page displays the status of your managed domain service. It does not provide registrar credentials, direct DNS controls, or automatic ownership transfer. Transfer, cancellation, renewal, and billing requests are reviewed according to your signed agreement and applicable terms.</p>
      </div>

      {/* Actions */}
      <article className="rounded-2xl border border-slate-700 bg-slate-950 p-5">
        <h2 className="text-lg font-black">Need help?</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href="mailto:info@vividenginesolutions.com?subject=Domain%20Support%20Request" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500">
            <LifeBuoy className="h-4 w-4" /> Request Support
          </a>
          <DomainCancellationRequestButton
            lease={{ ...lease, cancellationRequestStatus: cancellationStatus }}
            onSubmitted={async (result) => {
              setNotice(result?.message || "Your cancellation request was submitted for review.");
              await load();
            }}
          />
          <a href="mailto:info@vividenginesolutions.com?subject=Domain%20Transfer%20Options" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 text-sm font-bold text-slate-200 hover:bg-slate-900">
            Ask About Transfer Options
          </a>
          <a href="#" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 text-sm font-bold text-slate-200 hover:bg-slate-900">
            <ExternalLink className="h-4 w-4" /> View Service Agreement
          </a>
        </div>
      </article>
    </section>
  );
}
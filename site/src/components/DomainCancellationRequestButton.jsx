import { useState } from "react";
import { api } from '@/api/client';
import CancellationReasonSelect from '@/components/portal/CancellationReasonSelect';

function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value || "—"}</p>
    </div>
  );
}

export default function DomainCancellationRequestButton({ lease, onSubmitted }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [acknowledgment, setAcknowledgment] = useState(false);
  const [agreementAcknowledgment, setAgreementAcknowledgment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const hasOpenRequest =
    lease?.billingStatus === "Cancellation Requested" ||
    lease?.serviceStatus === "Cancellation Review" ||
    (lease?.cancellationRequestStatus && lease.cancellationRequestStatus !== "None");

  async function submitCancellationRequest(event) {
    event.preventDefault();
    setError("");

    if (!lease?.id) {
      setError("Managed-domain service information is unavailable.");
      return;
    }
    if (!reason) {
      setError("Please select a reason for your request.");
      return;
    }
    if (!acknowledgment || !agreementAcknowledgment) {
      setError("Please review and accept both acknowledgments.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.functions.invoke("requestDomainLeaseCancellation", {
        managedDomainLeaseId: lease.id,
        requestReason: reason,
        requestDetails: details.trim(),
        clientAcknowledgment: true,
        agreementAcknowledgment: true
      });

      const result = response.data;
      if (!result?.success) {
        throw new Error(result?.error || "We could not submit your request.");
      }

      setIsOpen(false);
      setReason("");
      setDetails("");
      setAcknowledgment(false);
      setAgreementAcknowledgment(false);
      onSubmitted?.(result);
    } catch (requestError) {
      const message =
        requestError?.response?.data?.error ||
        requestError?.message ||
        "We could not submit your request. Please try again or contact support.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={!lease?.id || hasOpenRequest}
        onClick={() => { setError(""); setIsOpen(true); }}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-600 px-4 text-sm font-bold text-slate-100 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {hasOpenRequest ? "Cancellation Request Under Review" : "Request Cancellation Review"}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/80 p-0 backdrop-blur-xs sm:items-center sm:justify-center sm:p-5"
          onMouseDown={() => !isSubmitting && setIsOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-domain-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:rounded-2xl sm:p-7"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-orange-300">MANAGED DOMAIN SERVICE</p>
                <h2 id="cancel-domain-title" className="mt-2 text-2xl font-black text-white">Request Cancellation</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Your request will be reviewed. It does not immediately stop domain service, website service, DNS, renewal, or billing.
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsOpen(false)}
                aria-label="Close cancellation request"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-xl text-slate-300 hover:bg-slate-900 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm">
              <p className="font-bold text-white">{lease.domainName}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Detail label="Monthly service" value={`$${((lease.monthlyLeaseCents || 899) / 100).toFixed(2)}/month`} />
                <Detail label="Minimum term ends" value={formatDate(lease.minimumTermEndDate)} />
                <Detail label="Next billing date" value={formatDate(lease.nextBillingDate)} />
                <Detail label="Current status" value={lease.serviceStatus || "Active"} />
              </div>
            </div>

            <form className="mt-6 space-y-5" onSubmit={submitCancellationRequest}>
              <div>
                <label htmlFor="domain-cancellation-reason" className="text-sm font-bold text-white">Reason for request</label>
                <CancellationReasonSelect value={reason} onChange={setReason} disabled={isSubmitting} />
              </div>

              <div>
                <label htmlFor="domain-cancellation-details" className="text-sm font-bold text-white">
                  Additional details <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <textarea
                  id="domain-cancellation-details"
                  rows={4}
                  maxLength={1500}
                  value={details}
                  disabled={isSubmitting}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Add any information that may help us review your request."
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-hidden placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <p className="text-sm font-black text-white">Important information</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                  <li>Your service remains active until Vivid Engine Solutions confirms the request and effective date in writing.</li>
                  <li>The managed-domain service has a six-month minimum term when included in your agreement.</li>
                  <li>Domain transfer, renewal, website connection, DNS, hosting, billing, and third-party actions may need separate review.</li>
                  <li>Fees for setup, completed work, services already delivered, and third-party costs may not be refundable under your signed agreement and applicable law.</li>
                </ul>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 p-4 hover:border-slate-500">
                <input type="checkbox" checked={acknowledgment} disabled={isSubmitting} onChange={(event) => setAcknowledgment(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-500" />
                <span className="text-sm leading-6 text-slate-300">
                  I understand that this is a cancellation request for review, not an immediate cancellation. My service remains active unless and until I receive confirmation.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 p-4 hover:border-slate-500">
                <input type="checkbox" checked={agreementAcknowledgment} disabled={isSubmitting} onChange={(event) => setAgreementAcknowledgment(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-500" />
                <span className="text-sm leading-6 text-slate-300">
                  I have reviewed the{" "}
                  <a href="/service-terms" target="_blank" rel="noreferrer" className="font-bold text-blue-300 underline underline-offset-4">Service Terms</a>
                  , including the minimum term, recurring billing, cancellation, and managed-domain provisions.
                </span>
              </label>

              {error && (
                <div role="alert" className="rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{error}</div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-end">
                <button type="button" disabled={isSubmitting} onClick={() => setIsOpen(false)} className="min-h-12 rounded-xl border border-slate-600 px-5 text-sm font-bold text-slate-100 hover:bg-slate-900 disabled:opacity-50">
                  Keep My Service
                </button>
                <button type="submit" disabled={isSubmitting || !reason || !acknowledgment || !agreementAcknowledgment} className="min-h-12 rounded-xl bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? "Submitting Request…" : "Submit Cancellation Request"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
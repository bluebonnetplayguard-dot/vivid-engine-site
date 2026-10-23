import { CreditCard, Lock, ExternalLink } from 'lucide-react';
import { SQUARE_PAY_URL, withSource } from '@/components/payments/paymentLinks';
import { BUSINESS } from '@/config/business';

export default function SquareCard({ source }) {
  return <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-primary/60 bg-linear-to-b from-primary/15 to-primary/5 p-6 shadow-xl shadow-primary/20">
    <CreditCard className="h-10 w-10 text-primary" strokeWidth={1.6} aria-hidden="true" />
    <div>
      <h3 className="text-xl font-extrabold">Make a payment</h3>
      <p className="mt-1 text-sm text-muted-foreground">Website builds, maintenance plans, domain leasing and add-ons</p>
    </div>
    <a href={withSource(SQUARE_PAY_URL, source)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/50 transition hover:shadow-xl hover:shadow-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:opacity-80">
      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Pay securely with Square</span>
      <ExternalLink className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
    <p className="text-xs leading-relaxed text-muted-foreground">Payments are processed securely by Square for <b className="font-semibold text-foreground">{BUSINESS.brandName}</b>. Your card details go straight to Square and are never stored by us.</p>
  </div>;
}
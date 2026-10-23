import { CalendarClock, ExternalLink, Check } from 'lucide-react';
import { HEARTH_FINANCING_URL } from '@/components/payments/paymentLinks';
import { BUSINESS } from '@/config/business';

export default function HearthCard({ compact }) {
  return <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-6">
    <div className="flex items-center gap-3">
      <CalendarClock className="h-9 w-9 shrink-0 text-primary" strokeWidth={1.6} aria-hidden="true" />
      <div><h3 className="text-lg font-extrabold">Pay over time</h3><p className="text-sm text-muted-foreground">Spread a bigger project into monthly payments</p></div>
    </div>
    {!compact && <ul className="flex flex-col gap-2 text-sm">
      {['See your options in about two minutes', "Checking your options won't affect your credit score", 'Several lenders compete, and you choose the offer you want'].map(text => <li key={text} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{text}</span></li>)}
    </ul>}
    <a href={HEARTH_FINANCING_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-primary/50 px-6 py-3 text-center text-sm font-bold uppercase tracking-wider transition hover:border-primary hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:opacity-80">
      <span>See monthly payment options</span><ExternalLink className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
    </a>
    <p className="text-xs leading-relaxed text-muted-foreground">Financing is arranged through <b className="font-semibold text-foreground">Hearth</b> and its lending partners and shows our account under our legal name, <b className="font-semibold text-foreground">{BUSINESS.legalName}</b>. Subject to credit approval. Rates and terms are set by the lender, not by Vivid Engine Solutions.</p>
  </div>;
}
import SquareCard from '@/components/payments/SquareCard';
import HearthCard from '@/components/payments/HearthCard';
export { SQUARE_PAY_URL, HEARTH_FINANCING_URL } from '@/components/payments/paymentLinks';

export default function PaymentOptions({ variant = 'section' }) {
  if (variant === 'compact') return <section aria-labelledby="pay-title-compact" className="flex flex-col gap-4">
    <h2 id="pay-title-compact" className="text-lg font-bold">Payments</h2>
    <div className="grid gap-4 md:grid-cols-2"><SquareCard source="portal" /><HearthCard compact /></div>
  </section>;

  return <section id="pay" aria-labelledby="pay-title" className="scroll-mt-24 border-t border-border py-16 md:py-20">
    <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 md:grid-cols-2 md:gap-14 md:px-6">
      <div className="flex min-w-0 flex-col gap-4 md:row-span-2 md:self-center">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Pay online</span>
        <h2 id="pay-title" className="text-3xl font-extrabold leading-tight md:text-4xl">Pay an invoice, deposit or <span className="text-primary">monthly plan</span></h2>
        <p className="text-muted-foreground">Pay securely through Square in under a minute. No account needed.</p>
        <ol className="mt-2 flex flex-col">
          {[
            ['Tap Pay securely with Square.', "Square's checkout opens in a new tab."],
            ['Enter the amount', 'from your invoice, quote or plan.'],
            ['Pay by card.', 'Square emails you a receipt right away.'],
          ].map(([bold, text], i) => <li key={bold} className="grid grid-cols-[34px_1fr] gap-3 border-t border-border py-3 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 text-xs font-bold text-primary">{i + 1}</span>
            <span><b className="font-semibold">{bold}</b> {text}</span>
          </li>)}
        </ol>
        <p className="text-sm text-muted-foreground">Bigger project? <a href="#financing" className="font-semibold text-primary hover:underline">Pay over time with monthly payments →</a></p>
      </div>
      <SquareCard source="website" />
      <div id="financing" className="min-w-0 scroll-mt-24"><HearthCard /></div>
    </div>
  </section>;
}
import { Check, X } from 'lucide-react';
export default function ComparisonCell({ value }) {
  if (value === true) return <Check size={18} className="mx-auto text-primary" aria-label="Included" />;
  if (value === false) return <X size={18} className="mx-auto text-muted-foreground" aria-label="Not included" />;
  return <span className="text-sm text-foreground">{value}</span>;
}
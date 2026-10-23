import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function RadixSelect({ value, onValueChange, options = [], className, placeholder, capitalize = false }) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value} className={capitalize ? "capitalize" : ""}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
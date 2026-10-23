import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LineItemsEditor({ items, onChange }) {
  const update = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: field === "description" ? val : Number(val) || 0 };
    onChange(next);
  };
  const add = () => onChange([...items, { description: "", qty: 1, price: 0 }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Description" value={it.description} onChange={(e) => update(i, "description", e.target.value)} className="flex-1" />
          <Input type="number" min="0" placeholder="Qty" value={it.qty} onChange={(e) => update(i, "qty", e.target.value)} className="w-20" />
          <Input type="number" min="0" step="0.01" placeholder="Price" value={it.price} onChange={(e) => update(i, "price", e.target.value)} className="w-28" />
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-2 h-4 w-4" /> Add line</Button>
    </div>
  );
}
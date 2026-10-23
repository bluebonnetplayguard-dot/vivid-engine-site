import { useState } from "react";
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Check, ChevronDown } from "lucide-react";

const BP_CONTENT = "bg-[#161b22] border-[#30363d] text-[#f0f6fc]";
const BP_ITEM = "hover:bg-[#30363d] text-[#f0f6fc]";

export default function BottomDrawerSelect({ value, onChange, options = [], placeholder = "Select…", triggerClassName = "", title = "Choose an option", variant = "default", id, disabled = false }) {
  const [open, setOpen] = useState(false);
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const current = items.find((i) => i.value === value);
  const isBp = variant === "blueprint";

  return (
    <Drawer shouldScaleBackground={false} open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button id={id} type="button" disabled={disabled} className={triggerClassName} aria-label={title}>
          <span className="truncate">{current ? current.label : placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </DrawerTrigger>
      <DrawerContent className={`max-h-[60vh] ${isBp ? BP_CONTENT : ""}`}>
        <DrawerHeader className={isBp ? "text-[#f0f6fc]" : ""}>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {items.map((i) => (
            <button
              key={i.value}
              type="button"
              disabled={disabled}
              onClick={() => { onChange(i.value); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm ${isBp ? BP_ITEM : "hover:bg-accent/10"}`}
            >
              <span>{i.label}</span>
              {i.value === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
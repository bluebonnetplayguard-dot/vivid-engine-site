import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

const MOBILE_QUERY = "(max-width: 767px)";
function useIsPhone() {
  const get = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  const [isPhone, setIsPhone] = React.useState(get);
  React.useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return isPhone;
}
const SheetContext = React.createContext(null);
const ItemModeContext = React.createContext("sheet");
function Select(props) {
  const isPhone = useIsPhone();
  if (!isPhone) return <SelectPrimitive.Root {...props} />;
  return <PhoneSelect {...props} />;
}
function PhoneSelect({ value: valueProp, defaultValue, onValueChange, open: openProp, defaultOpen = false, onOpenChange, disabled = false, name, required, children }) {
  const [innerValue, setInnerValue] = React.useState(defaultValue);
  const value = valueProp !== undefined ? valueProp : innerValue;
  const [innerOpen, setInnerOpen] = React.useState(defaultOpen);
  const open = openProp !== undefined ? openProp : innerOpen;
  const [labels, setLabels] = React.useState({});
  const placeholderRef = React.useRef("");
  const triggerRef = React.useRef(null);
  const setOpen = React.useCallback((next) => {
    if (disabled && next) return;
    if (openProp === undefined) setInnerOpen(next);
    if (onOpenChange) onOpenChange(next);
    if (!next && triggerRef.current) setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0);
  }, [disabled, openProp, onOpenChange]);
  const choose = React.useCallback((next) => {
    if (valueProp === undefined) setInnerValue(next);
    if (onValueChange && next !== value) onValueChange(next);
    setOpen(false);
  }, [valueProp, onValueChange, value, setOpen]);
  const ctx = React.useMemo(() => ({ value, open, setOpen, choose, disabled, labels, setLabels, placeholderRef, triggerRef }), [value, open, setOpen, choose, disabled, labels]);
  return <SheetContext.Provider value={ctx}>{children}{name ? <input type="hidden" name={name} value={value == null ? "" : value} required={required} disabled={disabled} /> : null}</SheetContext.Provider>;
}
const TRIGGER_CLASSES = "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background data-placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1";
const SelectTrigger = React.forwardRef(({ className, children, onClick, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  if (!sheet) return <SelectPrimitive.Trigger ref={ref} className={cn(TRIGGER_CLASSES, className)} onClick={onClick} {...props}>{children}<SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 opacity-50" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
  const setRefs = (node) => {
    sheet.triggerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  return <button ref={setRefs} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={sheet.open} disabled={sheet.disabled} data-state={sheet.open ? "open" : "closed"} data-placeholder={sheet.value == null || sheet.value === "" ? "" : undefined} className={cn(TRIGGER_CLASSES, "min-h-11 text-base select-none touch-manipulation", className)} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) sheet.setOpen(true); }} {...props}>{children}<ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" /></button>;
});
SelectTrigger.displayName = "SelectTrigger";
const SelectValue = React.forwardRef(({ placeholder, className, children, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  if (!sheet) return <SelectPrimitive.Value ref={ref} placeholder={placeholder} className={className} {...props}>{children}</SelectPrimitive.Value>;
  if (placeholder != null) sheet.placeholderRef.current = typeof placeholder === "string" ? placeholder : "";
  const hasValue = sheet.value != null && sheet.value !== "";
  const label = children != null ? children : hasValue ? sheet.labels[sheet.value] : null;
  return <span ref={ref} className={cn("pointer-events-none truncate text-left", !hasValue && "text-muted-foreground", className)} {...props}>{hasValue ? (label != null ? label : sheet.value) : placeholder}</span>;
});
SelectValue.displayName = "SelectValue";
const SelectContent = React.forwardRef(({ className, children, position = "popper", title, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  if (sheet) return <PhoneSheet sheet={sheet} title={title} className={className} contentRef={ref}>{children}</PhoneSheet>;
  return <SelectPrimitive.Portal><SelectPrimitive.Content ref={ref} className={cn(
    "relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className
  )} position={position} {...props}><SelectScrollUpButton /><SelectPrimitive.Viewport className={cn("p-1", position === "popper" && "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)")}>{children}</SelectPrimitive.Viewport><SelectScrollDownButton /></SelectPrimitive.Content></SelectPrimitive.Portal>;
});
SelectContent.displayName = "SelectContent";
function PhoneSheet({ sheet, title, className, children, contentRef }) {
  const registryRef = React.useRef(null);
  const listRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const root = registryRef.current;
    if (!root) return;
    const next = {};
    root.querySelectorAll("[data-select-value]").forEach((el) => { next[el.getAttribute("data-select-value")] = el.textContent.trim(); });
    const prev = sheet.labels;
    const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[k] === next[k]);
    if (!same) sheet.setLabels(next);
  });
  React.useEffect(() => {
    if (!sheet.open) return;
    const t = setTimeout(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" }), 50);
    return () => clearTimeout(t);
  }, [sheet.open]);
  const heading = title || sheet.placeholderRef.current || "Choose an option";
  return <>
    <div ref={registryRef} hidden aria-hidden="true"><ItemModeContext.Provider value="registry">{children}</ItemModeContext.Provider></div>
    <Drawer open={sheet.open} onOpenChange={sheet.setOpen}>
      <DrawerContent ref={contentRef} className={cn("max-h-[85vh]", className)}>
        <DrawerHeader className="pb-2 text-left"><DrawerTitle className="text-base">{heading}</DrawerTitle><DrawerDescription className="sr-only">Swipe down or tap outside to close.</DrawerDescription></DrawerHeader>
        <div ref={listRef} role="listbox" aria-label={heading} className="min-h-0 overflow-y-auto overscroll-contain px-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}><ItemModeContext.Provider value="sheet">{children}</ItemModeContext.Provider></div>
      </DrawerContent>
    </Drawer>
  </>;
}
const SelectItem = React.forwardRef(({ className, children, value, disabled, onClick, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  const mode = React.useContext(ItemModeContext);
  if (!sheet) return <SelectPrimitive.Item ref={ref} value={value} disabled={disabled} className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50", className)} onClick={onClick} {...props}><span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>;
  if (mode === "registry") return <span data-select-value={value}>{children}</span>;
  const selected = sheet.value === value;
  return <button ref={ref} type="button" role="option" aria-selected={selected} aria-disabled={disabled || undefined} disabled={disabled} data-state={selected ? "checked" : "unchecked"} {...props} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) sheet.choose(value); }} className={cn("flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-base", "select-none touch-manipulation transition-colors active:bg-accent", "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring", selected && "font-semibold text-primary", disabled && "pointer-events-none opacity-50", className)}><span className="min-w-0 flex-1">{children}</span>{selected ? <Check className="h-5 w-5 shrink-0" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0" />}</button>;
});
SelectItem.displayName = "SelectItem";
const SelectGroup = React.forwardRef(({ className, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  if (!sheet) return <SelectPrimitive.Group ref={ref} className={className} {...props} />;
  return <div ref={ref} role="group" className={cn("py-1", className)} {...props} />;
});
SelectGroup.displayName = "SelectGroup";
const SelectLabel = React.forwardRef(({ className, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  const mode = React.useContext(ItemModeContext);
  if (!sheet) return <SelectPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />;
  if (mode === "registry") return null;
  return <div ref={ref} className={cn("px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)} {...props} />;
});
SelectLabel.displayName = "SelectLabel";
const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  const mode = React.useContext(ItemModeContext);
  if (!sheet) return <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
  if (mode === "registry") return null;
  return <div ref={ref} role="separator" className={cn("mx-3 my-1 h-px bg-border", className)} {...props} />;
});
SelectSeparator.displayName = "SelectSeparator";
const SelectScrollUpButton = React.forwardRef(({ className, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  if (sheet) return null;
  return <SelectPrimitive.ScrollUpButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}><ChevronUp className="h-4 w-4" /></SelectPrimitive.ScrollUpButton>;
});
SelectScrollUpButton.displayName = "SelectScrollUpButton";
const SelectScrollDownButton = React.forwardRef(({ className, ...props }, ref) => {
  const sheet = React.useContext(SheetContext);
  if (sheet) return null;
  return <SelectPrimitive.ScrollDownButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}><ChevronDown className="h-4 w-4" /></SelectPrimitive.ScrollDownButton>;
});
SelectScrollDownButton.displayName = "SelectScrollDownButton";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton };
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


// Safe during build-time prerendering, where there is no window.
export const isIframe = typeof window !== "undefined" && window.self !== window.top;

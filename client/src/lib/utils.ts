import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"
import { parseDbTimestamp } from "./date-utils"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely formats a date with a fallback, adjusted for GMT+3 timezone.
 */
export function safeFormat(dateStr: string | Date | null | undefined, formatStr: string, fallback: string = "-"): string {
  if (!dateStr) return fallback;
  try {
    const date = typeof dateStr === 'string' ? parseDbTimestamp(dateStr) : dateStr;
    if (!date || isNaN(date.getTime())) return fallback;
    return format(date, formatStr);
  } catch (err) {
    return fallback;
  }
}

/**
 * Formats a date to GMT+3 (Saudi Arabia Time)
 */
export function formatGMT3(dateStr: string | Date | null | undefined, formatStr: string, fallback: string = "-"): string {
  if (!dateStr) return fallback;
  try {
    const date = typeof dateStr === 'string' ? parseDbTimestamp(dateStr) : dateStr;
    if (!date || isNaN(date.getTime())) return fallback;

    // Use Intl.DateTimeFormat to get Riyadh time parts
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const p: Record<string, string> = {};
    parts.forEach(part => p[part.type] = part.value);

    // Create a date object that has these local values for formatting
    const shiftedDate = new Date(
      parseInt(p.year),
      parseInt(p.month) - 1,
      parseInt(p.day),
      parseInt(p.hour),
      parseInt(p.minute),
      parseInt(p.second)
    );

    return format(shiftedDate, formatStr);
  } catch (err) {
    return fallback;
  }
}

/**
 * Formats a file size in bytes to a human-readable string (e.g., 1.2 MB)
 */
export function formatFileSize(size: number | string | undefined | null): string {
  if (size === undefined || size === null || size === "") return "0 B";
  
  // If it's already a formatted string (contains units like KB, MB), return as is
  if (typeof size === 'string' && /[a-zA-Z]/.test(size)) {
    return size.trim();
  }
  
  const bytes = typeof size === 'string' ? parseInt(size, 10) : Number(size);
  
  if (isNaN(bytes)) return "0 B";
  if (bytes === 0) return "0 B";
  
  const k = 1024;
  const dm = 1;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

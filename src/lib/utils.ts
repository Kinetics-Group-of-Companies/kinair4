import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Smart number formatting that preserves precision for small values.
 * For values < 1: uses 3 decimal places (e.g., 0.045 stays as 0.045)
 * For values 1-10: uses 2 decimal places
 * For values 10-100: uses 1 decimal place
 * For values >= 100: uses no decimal places with locale formatting
 */
export function formatNumber(value: number, options?: { 
  minDecimals?: number; 
  maxDecimals?: number;
  forceDecimals?: number;
}): string {
  if (value === 0) return '0';
  
  // If specific decimal places are forced, use them
  if (options?.forceDecimals !== undefined) {
    return value.toFixed(options.forceDecimals);
  }
  
  const absValue = Math.abs(value);
  
  if (absValue < 1) {
    return value.toFixed(options?.maxDecimals ?? 3);
  } else if (absValue < 10) {
    return value.toFixed(options?.maxDecimals ?? 2);
  } else if (absValue < 100) {
    return value.toFixed(options?.maxDecimals ?? 1);
  } else {
    return Math.round(value).toLocaleString();
  }
}

/**
 * Format power values (kW) with appropriate precision.
 * Small motors like 0.045 kW will display as "0.045"
 * Larger motors like 7.5 kW will display as "7.5"
 */
export function formatPower(value: number): string {
  if (value === 0) return '0';
  const absValue = Math.abs(value);
  
  if (absValue < 1) {
    return value.toFixed(3);
  } else if (absValue < 10) {
    return value.toFixed(2);
  } else {
    return value.toFixed(1);
  }
}

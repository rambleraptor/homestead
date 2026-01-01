/**
 * Currency formatting utilities
 */

/**
 * Formats a number as USD currency with comma separators
 * @param amount - The amount to format
 * @returns Formatted string like "$1,234.56"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

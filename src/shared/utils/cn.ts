/** Joins class names, leaving out the ones that are false, null or undefined. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

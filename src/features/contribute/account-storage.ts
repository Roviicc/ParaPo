/**
 * A phone-stored answer that belongs to one account: kept under `<baseKey>.<accountId>`. What an
 * earlier build stored phone-wide under `baseKey` goes to the first account that reads it, once.
 */
export function readAccountAnswer(baseKey: string, accountId: string | null): string | null {
  if (accountId === null) return localStorage.getItem(baseKey);
  const scopedKey = `${baseKey}.${accountId}`;
  const scoped = localStorage.getItem(scopedKey);
  if (scoped !== null) return scoped;
  const phoneWide = localStorage.getItem(baseKey);
  if (phoneWide === null) return null;
  localStorage.setItem(scopedKey, phoneWide);
  localStorage.removeItem(baseKey);
  return phoneWide;
}

export function writeAccountAnswer(baseKey: string, accountId: string | null, value: string): void {
  localStorage.setItem(accountId === null ? baseKey : `${baseKey}.${accountId}`, value);
}

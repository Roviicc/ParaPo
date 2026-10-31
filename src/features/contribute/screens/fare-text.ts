import { FARE_PHP_MAX } from '../api/upload-fare';

/** The fare field's one complaint: what it takes, in the words the field shows under itself. */
export const FARE_ERROR = 'Enter an amount from ₱0 to ₱2,000';

/** Pesos, and at most two digits of centavos: "13", "13.5", "13.50", ".5". */
const FARE_PATTERN = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;

/** One comma and one or two digits after it, the last thing typed: a decimal comma ("13,50"). */
const DECIMAL_COMMA = /^(\d*),(\d{1,2})$/;
/** Commas only between thousands, each followed by three digits ("1,350", "1,350.50"). */
const THOUSANDS_COMMAS = /^\d{1,3}(,\d{3})+(\.\d{0,2})?$/;

/**
 * The fare with its commas read, or null when they cannot be read without a guess. A phone set
 * to a comma-decimal locale may give "13,50"; a thousands comma may come as "1,350". Any other
 * comma ("1,3,5", "13,5000") is never guessed at: it is the field's error.
 */
function withoutCommas(typed: string): string | null {
  if (!typed.includes(',')) return typed;
  const decimal = DECIMAL_COMMA.exec(typed);
  if (decimal) return `${decimal[1]}.${decimal[2]}`;
  if (THOUSANDS_COMMAS.test(typed)) return typed.replaceAll(',', '');
  return null;
}

/**
 * The fare as typed, read: none for an empty field, the pesos for an amount from 0 to
 * FARE_PHP_MAX with at most two decimals, and an error for anything else. "0" is a free ride,
 * ₱0; an empty field is no fare said. Spaces around it are let through, and a comma as
 * withoutCommas reads it.
 */
export function fareFromText(text: string): { farePhp?: number; error?: string } {
  const trimmed = text.trim();
  if (trimmed === '') return {};
  const typed = withoutCommas(trimmed);
  if (typed === null || !FARE_PATTERN.test(typed)) return { error: FARE_ERROR };
  const farePhp = Number(typed);
  if (!Number.isFinite(farePhp) || farePhp < 0 || farePhp > FARE_PHP_MAX) {
    return { error: FARE_ERROR };
  }
  return { farePhp };
}

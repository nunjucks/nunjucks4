import {
  Markup,
  MISSING,
  isMarkup,
  isUndefinedInstance,
  nunjucksFunction,
  Float,
} from "@nunjucks/runtime";
import type { Environment } from "./environment";

/** Return true if the variable is odd */
export function odd(value: number): boolean {
  return Number.isInteger(value) && value % 2 === 1;
}

/** Return true if the variable is even */
export function even(value: number): boolean {
  return Number.isInteger(value) && value % 2 === 0;
}

/** Check if a variable is divisible by a number. */
export function divisibleby(value: number, num: number): boolean {
  return Number.isInteger(value) && Number.isInteger(num) && value % num === 0;
}

/** Return true if the variable is defined */
export function defined(value: unknown): boolean {
  return !isUndefinedInstance(value) && value !== MISSING;
}

/**
 * Check if a filter exists by name. Useful if a filter may be optionally
 * available.
 */
export const filter = nunjucksFunction(["value"], { passArg: "environment" })(
  function filter(env: Environment, value: string): boolean {
    return Object.prototype.hasOwnProperty.call(env.filters, value);
  },
);

/**
 * Check if a test exists by name. Useful if a test may be optionally
 * available.
 */
export const test = nunjucksFunction(["value"], { passArg: "environment" })(
  function test(env: Environment, value: string): boolean {
    return Object.prototype.hasOwnProperty.call(env.tests, value);
  },
);

export function none(value: unknown): value is null {
  return value === null;
}

export function boolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function false_(value: unknown): value is false {
  return value === false;
}

export function true_(value: unknown): value is true {
  return value === true;
}

export function integer(value: unknown): value is number | bigint {
  return (
    (Number.isInteger(value) && !(value instanceof Float)) ||
    typeof value === "bigint"
  );
}

export function float(value: unknown): value is number {
  return (
    value instanceof Float ||
    (typeof value === "number" && !Number.isInteger(value))
  );
}

export function string(obj: unknown): obj is string {
  return (
    typeof obj === "string" ||
    Object.prototype.toString.call(obj) === "[object String]"
  );
}

export function lower(value: unknown): value is string {
  return string(value) && value.toLowerCase() == `${value}`;
}

export function upper(value: unknown): value is string {
  return string(value) && value.toUpperCase() == `${value}`;
}

export function mapping(
  value: unknown,
): value is Record<string, unknown> | Map<unknown, unknown> {
  return (
    value instanceof Map ||
    (typeof value === "object" && !!value && !Array.isArray(value))
  );
}

export function number(value: unknown): value is number | bigint {
  return (
    typeof value === "number" ||
    value instanceof Number ||
    typeof value === "bigint"
  );
}

export function sequence(
  value: unknown,
): value is
  | unknown[]
  | string
  | Iterable<unknown>
  | Set<unknown>
  | Map<unknown, unknown> {
  return (
    value instanceof Set ||
    value instanceof Map ||
    typeof value === "string" ||
    (typeof value === "object" &&
      !!value &&
      "length" in value &&
      typeof value.length === "number" &&
      Symbol.iterator in value)
  );
}

export function sameas<T = unknown>(value: T, other: unknown): other is T {
  return value === other;
}

export function iterable(
  value: unknown,
): value is Iterable<unknown> | AsyncIterable<unknown> {
  if (typeof value === "object" && !!value) {
    if (Symbol.iterator in value || Symbol.asyncIterator in value) {
      return true;
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const x of value as any) break;
  } catch (e) {
    return false;
  }
  return true;
}

export function escaped(value: unknown): value is Markup {
  return isMarkup(value);
}

export function in_(value: unknown, seq: unknown): boolean {
  if (Array.isArray(seq)) {
    return seq.includes(value);
  } else if (seq instanceof Set) {
    return seq.has(value);
  } else if (seq instanceof Map) {
    return seq.has(value);
  } else if (string(seq)) {
    return seq.indexOf(value as any) >= 0;
  } else {
    try {
      return (value as any) in (seq as any);
    } catch (e) {
      // pass
    }
    return false;
  }
}

export function eq(value: unknown, other: unknown): boolean {
  return value == other;
}

export function ne(value: unknown, other: unknown): boolean {
  return value !== other;
}

export function gt(value: unknown, other: unknown): boolean {
  return (value as any) > (other as any);
}

export function ge(value: unknown, other: unknown): boolean {
  return (value as any) >= (other as any);
}

export function lt(value: unknown, other: unknown): boolean {
  return (value as any) < (other as any);
}

export function le(value: unknown, other: unknown): boolean {
  return (value as any) <= (other as any);
}

export function callable(
  value: unknown,
): value is (...args: unknown[]) => unknown {
  return typeof value === "function" || value instanceof Function;
}

export default {
  odd,
  even,
  defined,
  undefined: (value: unknown): boolean => !defined(value),
  filter,
  test,
  none,
  boolean,
  false: false_,
  true: true_,
  integer,
  float,
  string,
  lower,
  upper,
  number,
  mapping,
  sequence,
  sameas,
  iterable,
  in: in_,
  "==": eq,
  eq,
  equalto: eq,
  "!=": ne,
  ne,
  ">": gt,
  gt,
  greaterthan: gt,
  ">=": ge,
  ge,
  "<": lt,
  lt,
  lessthan: lt,
  "<=": le,
  le,
  callable,
  escaped,
};

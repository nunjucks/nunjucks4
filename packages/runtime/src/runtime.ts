import { KeyError, TemplateRuntimeError } from "./exceptions";
import { LoopContext } from "./loops";
import { BlockReference, Context, EvalContext } from "./context";
import {
  isPlainObject,
  nunjucksFunction,
  isKwargs,
  hasOwn,
  identity,
  concat,
  getObjectTypeName,
} from "./utils";
import arrayFromAsync from "./arrayFromAsync";

import { Macro } from "./macro";
import { escape, isMarkup, markSafe, Markup, MarkupType, str } from "./markup";
import { MISSING, Undefined } from "./undef";

export class TemplateReference<IsAsync extends boolean> {
  constructor(context: Context<IsAsync>) {
    return new Proxy(this, {
      get(_target, name: string) {
        // todo: throw an exception if not found?
        const blocks = context.blocks[name];
        return new BlockReference({
          name,
          context,
          stack: blocks,
          depth: 0,
        });
      },
      has(target, prop) {
        return Reflect.has(context.blocks, prop);
      },
    });
  }
}

export function strJoin(seq: Iterable<unknown>): string {
  return concat(Array.from(seq).map((item) => str(item)));
}

export function markupJoin(seq: Iterable<unknown>): string {
  const buf: (string | MarkupType)[] = [];
  let hasMarkup = false;
  for (const item of seq) {
    buf.push(str(item));
    if (isMarkup(item)) {
      hasMarkup = true;
    }
  }
  if (hasMarkup) {
    return new Markup("").concat(...buf);
  } else {
    return concat(buf);
  }
}

function call(func: (...args: any[]) => any, args: any[]) {
  return func(...args);
}

function test(obj: unknown): boolean {
  if (obj instanceof Undefined || obj === MISSING) return false;
  return !!obj;
}

const INFINITY = 1 / 0;

function toFinite(value: number): number {
  if (value === INFINITY || value === -INFINITY) {
    const sign = value < 0 ? -1 : 1;
    return sign * Number.MAX_SAFE_INTEGER;
  }
  return value === value ? value : 0;
}

export function* range(start: number, end?: number, step = 1) {
  if (step === 0) {
    throw new Error("range() arg 3 must not be zero");
  }
  start = toFinite(start);
  if (end === undefined) {
    end = start;
    start = 0;
  } else {
    end = toFinite(end);
  }
  step = step === undefined ? (start < end ? 1 : -1) : toFinite(step);

  let value = start;
  while ((step < 0 && end < value) || value < end) {
    yield value;
    value += step;
  }
}

export function* enumerate<T>(
  iter: Iterable<T>,
  offset = 0,
): Generator<[number, T]> {
  let i = offset;
  for (const item of iter) {
    yield [i, item];
    i++;
  }
}

export function* arrayslice<T>(
  array: T[],
  start?: number,
  stop?: number,
  step = 1,
): Generator<T> {
  const direction = Math.sign(step);
  const len = array.length;

  if (direction >= 0) {
    start = (start ??= 0) < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    stop = (stop ??= len) < 0 ? Math.max(len + stop, 0) : Math.min(stop, len);
  } else {
    start =
      (start ??= len - 1) < 0
        ? Math.max(len + start, -1)
        : Math.min(start, len - 1);
    stop =
      (stop ??= -1) < -1 ? Math.max(len + stop, -1) : Math.min(stop, len - 1);
  }

  for (let i = start; direction * i < direction * stop; i += step) {
    yield array[i];
  }
}

export function* slice<T = any>(
  iterable: Iterable<T>,
  start?: number,
  stop?: number,
  step = 1,
): Generator<T> {
  if ((start ?? 0) < 0 || (stop ?? 0) < 0 || step < 0) {
    yield* arrayslice([...iterable], start, stop, step);
    return;
  }
  start = start ?? 0;
  stop = stop ?? Infinity;
  const it = range(start, stop, step)[Symbol.iterator]();
  let next = it.next();
  let index = 0;
  for (const item of iterable) {
    if (next.done) return;

    if (index === next.value) {
      yield item;
      next = it.next();
    }
    index++;
  }
}

export async function* asyncSlice<T = any>(
  iterable: Iterable<T> | AsyncIterable<T>,
  start?: number,
  stop?: number,
  step = 1,
): AsyncGenerator<T> {
  if ((start ?? 0) < 0 || (stop ?? 0) < 0 || step < 0) {
    const arr: T[] = [];
    for await (const item of iterable) {
      arr.push(item);
    }
    yield* arrayslice(arr, start, stop, step);
  }
  start = start ?? 0;
  stop = stop ?? Infinity;
  const it = range(start, stop, step)[Symbol.iterator]();
  let next = it.next();
  let index = 0;
  for await (const item of iterable) {
    if (next.done) return;

    if (index === next.value) {
      yield item;
      next = it.next();
    }
    index++;
  }
}

export function setAdd<T>(set: Set<T>, ...values: T[]): void {
  values.forEach((value) => set.add(value));
}

export function setDelete<T>(set: Set<T>, ...values: T[]): void {
  values.forEach((value) => set.delete(value));
}

type Namespace = Record<string, any> & { __isNamespace: true };

export const namespace = nunjucksFunction(["__init"], { kwargs: true })(
  function namespace(...args): Namespace {
    let kwargs: Record<string, any> = {};
    if (args.length) {
      const kwargsIndex = args.findIndex((o) => isKwargs(o));
      if (kwargsIndex > -1) {
        const kwargs_ = args.splice(kwargsIndex, 1)[0];
        if (isKwargs(kwargs_)) kwargs = kwargs_;
      }
    }
    const attrs: Record<string, any> =
      args.length && isPlainObject(args[0])
        ? Object.fromEntries(Object.entries(args[0]))
        : {};
    return Object.assign(Object.create(null), {
      __isNamespace: true,
      ...attrs,
      ...kwargs,
    });
  },
);

function assertNamespace(obj: unknown): asserts obj is Namespace {
  if (!isPlainObject(obj) || !("__isNamespace" in obj && obj.__isNamespace)) {
    throw new TemplateRuntimeError(
      "Cannot assign attribute on non-namespace object",
    );
  }
}

export function isObject(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" || (typeof o === "function" && !!o);
}

export function isString(o: unknown): o is string {
  return isMarkup(o) || typeof o === "string";
}

export function isIterable(o: unknown): o is Iterable<unknown> {
  return (
    typeof o === "object" &&
    !!o &&
    Symbol.iterator in o &&
    typeof o[Symbol.iterator] === "function"
  );
}

export function isAsyncIterable(o: unknown): o is AsyncIterable<unknown> {
  return (
    typeof o === "object" &&
    !!o &&
    Symbol.asyncIterator in o &&
    typeof o[Symbol.asyncIterator] === "function"
  );
}

export function includes(obj: unknown, lookup: unknown): boolean {
  if (obj instanceof Set || obj instanceof Map) {
    return obj.has(lookup);
  } else if (Array.isArray(obj)) {
    return obj.includes(lookup);
  } else if (typeof obj === "string" || isMarkup(obj)) {
    if (typeof lookup === "string" || isMarkup(lookup)) {
      return obj.includes(lookup);
    } else {
      throw new Error(
        `'in <string>' requires string as left operand, not ${getObjectTypeName(lookup)}`,
      );
    }
  } else if (isIterable(obj)) {
    return Array.from(obj).includes(lookup);
  } else if (isObject(obj)) {
    if (lookup === null || lookup === undefined) return false;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `${lookup}` in obj;
  } else {
    throw new TypeError(`object ${getObjectTypeName(obj)} is not iterable`);
  }
}

export async function asyncIncludes(
  obj: unknown,
  lookup: unknown,
): Promise<boolean> {
  if (isAsyncIterable(obj)) {
    return arrayFromAsync(obj).then((arr) => arr.includes(lookup));
  } else {
    return includes(obj, lookup);
  }
}

export class Float extends Number {
  toString(radix?: number | undefined) {
    const s = super.toString(radix);
    if (radix !== undefined && radix !== 10) return s;
    if (Number(s) === Number(Number(s).toFixed(0))) {
      return this.toFixed(1);
    }
    return s;
  }
}

export default {
  str,
  call,
  test,
  identity,
  Context,
  LoopContext,
  EvalContext,
  KeyError,
  concat,
  BlockReference,
  TemplateReference,
  markSafe,
  Markup,
  Macro,
  enumerate,
  slice,
  asyncSlice,
  hasOwn,
  setAdd,
  setDelete,
  TemplateRuntimeError,
  nunjucksFunction,
  escape,
  namespace,
  assertNamespace,
  arrayFromAsync,
  markupJoin,
  strJoin,
  includes,
  asyncIncludes,
};

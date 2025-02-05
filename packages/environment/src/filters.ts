"use strict";

import {
  markSafe,
  MarkupType,
  isMarkup,
  copySafeness,
  nunjucksFunction,
  escape,
  isUndefinedInstance,
  EvalContext,
  str,
  isObject,
  isString,
  isIterable,
  isAsyncIterable,
  Markup,
  Context,
  FilterArgumentError,
  Float,
  strMod,
} from "@nunjucks/runtime";
import type { IEnvironment as Environment } from "@nunjucks/runtime";
import { TemplateError } from "@nunjucks/utils";

function normalize<T>(value: T | null | undefined | false, defaultValue: T): T {
  if (value === null || value === undefined || value === false) {
    return defaultValue;
  }
  return value;
}

export const abs = Math.abs;

export function isNaN(num: unknown): boolean {
  return global.isNaN(num as number);
}

function _prepareAttributeParts(attr: null | undefined): never[];
function _prepareAttributeParts(attr: string): string[];
function _prepareAttributeParts<T extends Exclude<unknown, string>>(
  attr: T,
): T[];

function _prepareAttributeParts<T>(
  attr: T | string | undefined,
): T[] | (string | number)[] | never[] {
  if (!attr) {
    return [];
  }

  if (typeof attr === "string") {
    return attr.split(".").map((a) => (a.match(/^\d+$/) ? parseInt(a) : a));
  }

  return [attr];
}

const ignoreCase: {
  <V extends string>(value: V): Lowercase<V>;
  <V>(value: V): V;
} = <V>(value: V): any => {
  return typeof value === "string"
    ? copySafeness(value, value.toLowerCase())
    : value;
};

function syncMakeAttrGetter(
  environment: Environment,
  attribute: string | number | null,
  options: { postprocess?: null | ((val: any) => any); default?: any } = {},
): (value: any) => any {
  const parts = _prepareAttributeParts(attribute);

  return (item: any): any => {
    for (const part of parts) {
      item = environment.getitem(item, part);
      if (isUndefinedInstance(item) && typeof options.default !== "undefined") {
        item = options.default;
      }
      if (typeof options.postprocess === "function") {
        item = options.postprocess(item);
      }
    }
    return item;
  };
}

function asyncMakeAttrGetter(
  environment: Environment,
  attribute: string | number | null,
  options: { postprocess?: null | ((val: any) => any); default?: any } = {},
): (value: any) => Promise<any> {
  const parts = _prepareAttributeParts(attribute);

  return async (item: any): Promise<any> => {
    for (const part of parts) {
      item = await environment.getitem(item, part);
      if (isUndefinedInstance(item) && typeof options.default !== "undefined") {
        item = options.default;
      }
      if (typeof options.postprocess === "function") {
        item = await options.postprocess(item);
      }
    }
    return item;
  };
}

function syncMakeMultiAttrGetter(
  environment: Environment,
  attribute: string | number | null,
  options: { postprocess?: null | ((val: any) => any); default?: any } = {},
): (value: any) => any[] {
  const split: (string | number | null)[] =
    typeof attribute === "string" ? attribute.split(",") : [attribute];
  const parts = split.map((item) => _prepareAttributeParts(item));

  return (item: any): any[] =>
    parts.map((attributePart) => {
      let partItem = item;
      for (const part of attributePart) {
        partItem = environment.getitem(partItem, part);
      }
      if (typeof options.postprocess === "function") {
        partItem = options.postprocess(partItem);
      }
      return partItem;
    });
}

function asyncMakeMultiAttrGetter(
  environment: Environment,
  attribute: string | number | null,
  options: { postprocess?: null | ((val: any) => any); default?: any } = {},
): (value: any) => Promise<any[]> {
  const split: (string | number | null)[] =
    typeof attribute === "string" ? attribute.split(",") : [attribute];
  const parts = split.map((item) => _prepareAttributeParts(item));

  return async (item: any): Promise<any[]> =>
    Promise.all(
      parts.map(async (attributePart) => {
        let partItem = item;
        for (const part of attributePart) {
          partItem = await environment.getitem(partItem, part);
        }
        if (typeof options.postprocess === "function") {
          partItem = options.postprocess(partItem);
        }
        return partItem;
      }),
    );
}
export function* batch<V>(
  value: Iterable<V>,
  linecount: number,
  fillWith: V | null = null,
): Generator<V[]> {
  let tmp: V[] = [];

  for (const item of value) {
    if (tmp.length === linecount) {
      yield tmp;
      tmp = [];
    }
    tmp.push(item);
  }
  if (tmp.length) {
    if (fillWith !== null && tmp.length < linecount) {
      for (let i = tmp.length; i < linecount; i++) {
        tmp.push(fillWith);
      }
    }
    yield tmp;
  }
}

export function capitalize(s: string): string {
  const ret = normalize(str(s), "").toLowerCase();
  return copySafeness(s, ret.charAt(0).toUpperCase() + ret.slice(1));
}

function center(s: string, width = 80): string {
  const string = normalize(str(s), "");

  if (string.length >= width) {
    return copySafeness(s, string);
  }

  const spaces = width - string.length;
  const pre = " ".repeat(Math.floor(spaces / 2) - (spaces % 2));
  const post = " ".repeat(Math.floor(spaces / 2));
  return copySafeness(s, pre + string + post);
}

export const default_ = nunjucksFunction(["value", "default_value", "boolean"])(
  function default_<T, U>(val: T, def: U, bool?: boolean): T | U {
    return isUndefinedInstance(val) || (bool && !val) ? def : val;
  },
);

export const dictsort = nunjucksFunction([
  "value",
  "case_sensitive",
  "by",
  "reverse",
])(function dictsort<V>(
  value: Record<string, V>,
  caseSensitive = false,
  by: "key" | "value" = "key",
  reverse = false,
): [string, V][] {
  if (!isObject(value)) {
    throw new TemplateError("dictsort filter: value must be an object");
  }

  const array: [string, V][] = [];
  // deliberately include properties from the object's prototype
  for (const k in value) {
    array.push([k, value[k]]);
  }
  const pos = by === "key" ? 0 : by === "value" ? 1 : null;
  if (pos === null)
    throw new TemplateError(
      "dictsort filter: You can only sort by either key or value",
    );

  array.sort((x, y) => {
    let a = x[pos];
    let b = y[pos];
    if (!caseSensitive) {
      a = ignoreCase(a);
      b = ignoreCase(b);
    }
    return a > b ? 1 : a === b ? 0 : -1;
  });

  if (reverse) array.reverse();

  return array;
});

export function dump(obj: unknown, spaces: string) {
  return JSON.stringify(obj, null, spaces);
}

export function safe(str: unknown): MarkupType {
  if (isMarkup(str)) {
    return str;
  }
  str = str ?? "";
  return markSafe(`${str}`);
}

export function first<T>(arr: T[]): T {
  return arr[0];
}

export function forceescape(value: unknown): MarkupType {
  value = value ?? "";
  return escape(`${str(value)}`);
}

/**
 * Return a copy of the string with each line indented by 4 spaces. The
 * first line and blank lines are not indented by default.
 *
 * @param str The string to indent
 * @param width Number of spaces, or a string, to indent by.
 * @param first Indent the first line.
 * @param blank Indent empty lines.
 */
export const indent = nunjucksFunction(["str", "width", "first", "blank"])(
  function indent(
    str: unknown,
    width: number | string = 4,
    first = false,
    blank = false,
  ): string {
    str = normalize(str, "");

    if (str === "") {
      return "";
    }

    const sp = typeof width === "string" ? width : " ".repeat(width);

    // eslint-disable-next-line no-control-regex
    const lines = `${str}`.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);

    let ret = "";

    if (blank) {
      ret = lines.join(`\n${sp}`);
    } else {
      ret = lines
        .map((line, i) => (line && i > 0 ? `${sp}${line}` : line))
        .join("\n");
    }
    if (first) {
      ret = sp + ret;
    }
    return copySafeness(str, ret);
  },
);

function syncJoin(
  evalCtx: EvalContext,
  value: unknown,
  d = "",
  attribute: string | number | null = null,
): string {
  let arr = syncList(value);

  if (attribute !== null) {
    arr = arr.map(syncMakeAttrGetter(evalCtx.environment, attribute));
  }

  if (!evalCtx.autoescape) {
    return arr.map((o) => str(o)).join(str(d));
  }

  // if the delimiter doesn't have an html representation we check
  // if any of the items has.  If yes we do a coercion to Markup
  if (!isMarkup(d)) {
    let doEscape = false;
    for (let i = 0; i < arr.length; i++) {
      if (isMarkup(arr[i])) {
        doEscape = true;
      } else {
        arr[i] = escape(arr[i]);
      }
    }

    d = doEscape ? escape(d) : str(d);

    return copySafeness(d, arr.join(d));
  }

  return copySafeness(d, arr.map((o) => str(o)).join(d));
}

async function asyncJoin(
  evalCtx: EvalContext,
  value: unknown,
  d = "",
  attribute: string | number | null = null,
): Promise<string> {
  const arr = await asyncList(value);
  if (attribute !== null) {
    const attrGetter = asyncMakeAttrGetter(evalCtx.environment, attribute);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = await attrGetter(arr[i]);
    }
  }
  return syncJoin(evalCtx, arr, d);
}

const doJoin: {
  (
    evalCtx: EvalContext<true>,
    value: unknown,
    d?: string,
    attribute?: string | number,
  ): Promise<string>;
  (
    evalCtx: EvalContext<false>,
    value: unknown,
    d?: string,
    attribute?: string | number,
  ): string;
} = (
  evalCtx: EvalContext,
  value: unknown,
  d = "",
  attribute: string | number | null = null,
): any =>
  evalCtx.isAsync()
    ? asyncJoin(evalCtx, value, d, attribute)
    : syncJoin(evalCtx, value, d, attribute);

export const join = nunjucksFunction(["value", "d", "attribute"], {
  passArg: "evalContext",
})(doJoin);

// TODO support async
export function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

export function length(
  val: string | unknown[] | undefined | Record<PropertyKey, unknown>,
): number {
  const value = normalize(val, "");

  if (value !== undefined) {
    if (value instanceof Map || value instanceof Set) {
      // ECMAScript 2015 Maps and Sets
      return value.size;
    }
    if (isObject(value) && !isMarkup(value)) {
      // Objects (besides SafeStrings), non-primative Arrays
      return [...Object.keys(value)].length;
    }
    return value.length;
  }
  return 0;
}

function syncList(value: unknown): unknown[] {
  if (isString(value)) {
    return value.split("");
  } else if (Array.isArray(value)) {
    return value;
  } else if (isIterable(value)) {
    const ret: unknown[] = [];
    for (const item of value) {
      ret.push(item);
    }
    return ret;
  } else if (isObject(value)) {
    return [...Object.keys(value)];
  } else {
    throw new TemplateError("list filter: type not iterable");
  }
}

async function asyncList(value: unknown): Promise<unknown[]> {
  if (isAsyncIterable(value)) {
    const ret: unknown[] = [];
    for await (const item of value) {
      ret.push(item);
    }
    return ret;
  } else {
    return syncList(value);
  }
}

const doList: {
  (environment: Environment<true>, value: unknown): Promise<unknown[]>;
  (environment: Environment<false>, value: unknown): unknown[];
} = (environment: Environment, value: unknown): any =>
  environment.isAsync() ? asyncList(value) : syncList(value);

export const list = nunjucksFunction(["value"], { passArg: "environment" })(
  doList,
);

export function lower(str: unknown): string {
  str = normalize(str, "");
  return `${str}`.toLowerCase();
}

export function nl2br(string: unknown) {
  if (string === null || string === undefined) {
    return "";
  }

  return copySafeness(string, str(string).replace(/\r\n|\n/g, "<br />\n"));
}

export function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function replaceCount(
  str: string,
  old: RegExp | string | number,
  new_: string,
  maxCount = -1,
): string {
  const originalStr = str;

  // Cast numbers in the replacement to string
  if (typeof str === "number" || (str as any) instanceof Number) {
    str = "" + (str as unknown as number);
  }

  // If by now, we don't have a string, throw it back
  if (typeof str !== "string" && !isMarkup(str)) {
    return str;
  }
  if (old instanceof RegExp) {
    if (typeof maxCount !== "undefined") {
      // ensure global flag is set
      if (!old.flags.includes("g")) {
        old = new RegExp(old.source, old.flags + "g");
      }
      let n = 0;
      return str.replace(old, (match) => (++n > maxCount ? match : new_));
    }
    return str.replace(old, new_);
  }

  // Cast Numbers in the search term to string
  if (typeof old === "number" || (old as any) instanceof Number) {
    old = "" + old;
  } else if (typeof old !== "string") {
    // If it is something other than number or string,
    // return the original string
    return str;
  }

  if (old === "") {
    // Mimic the python behaviour: empty string is replaced
    // by replacement e.g. "abc"|replace("", ".") -> .a.b.c.
    return new_ + str.split("").join(new_) + new_;
  }

  let res = ""; // Output

  if (isMarkup(str)) {
    old = escape(old);
    new_ = escape(new_);
  }

  let nextIndex = str.indexOf(old);
  // if # of replacements to perform is 0, or the string to does
  // not contain the old value, return the string
  if (maxCount === 0 || nextIndex === -1) {
    return str;
  }

  let pos = 0;
  let count = 0; // # of replacements made

  while (nextIndex > -1 && (maxCount === -1 || count < maxCount)) {
    // Grab the next chunk of src string and add it with the
    // replacement, to the result
    res += str.substring(pos, nextIndex) + new_;
    // Increment our pointer in the src string
    pos = nextIndex + old.length;
    count++;
    // See if there are any more replacements to be made
    nextIndex = str.indexOf(old, pos);
  }

  // We've either reached the end, or done the max # of
  // replacements, tack on any remaining string
  if (pos < str.length) {
    res += str.substring(pos);
  }

  return copySafeness(originalStr, res);
}

export const replace = nunjucksFunction(["s", "old", "new", "count"], {
  passArg: "evalContext",
})(function replace(
  evalContext: EvalContext,
  str: string,
  old: RegExp | string,
  new_: string,
  maxCount?: number,
) {
  if (!evalContext.autoescape) {
    return replaceCount(str, old, new_, maxCount);
  }

  if (!isMarkup(str)) {
    str = escape(str);
  }

  return markSafe(replaceCount(str, old, new_, maxCount));
});

export function reverse<T>(val: string | T[]): string | T[] {
  if (isString(val) && !Array.isArray(val)) {
    const arr = Array.from(val);
    arr.reverse();
    return copySafeness(val, arr.join(""));
  }
  const arr = [...val];
  arr.reverse();
  return arr;
}

export const round = nunjucksFunction(["value", "precision", "method"])(
  function round(
    value: number,
    precision: number = 0,
    method: "common" | "ceil" | "floor" = "common",
  ): number {
    const factor = Math.pow(10, precision);
    const rounder =
      method === "ceil"
        ? Math.ceil
        : method === "floor"
          ? Math.floor
          : Math.round;
    return rounder(value * factor) / factor;
  },
);

function syncDoSlice<T>(
  value: Iterable<T>,
  slices: number,
  fillWith: T | null = null,
): T[][] {
  const res: T[][] = [];
  const seq = [...value];
  const length = seq.length;
  const itemsPerSlice = Math.floor(length / slices);
  const slicesWithExtra = length % slices;
  let offset = 0;
  for (let sliceNumber = 0; sliceNumber < slices; sliceNumber++) {
    const start = offset + sliceNumber * itemsPerSlice;
    if (sliceNumber < slicesWithExtra) {
      offset++;
    }
    const end = offset + (sliceNumber + 1) * itemsPerSlice;
    const curr = seq.slice(start, end);
    if (fillWith !== null && sliceNumber >= slicesWithExtra) {
      curr.push(fillWith);
    }
    res.push(curr);
  }
  return res;
}

async function asyncDoSlice<T>(
  value:
    | Iterable<T>
    | AsyncIterable<T>
    | Promise<Iterable<T> | AsyncIterable<T>>,
  slices: number | Promise<number>,
  fillWith: T | null | Promise<T | null> = null,
): Promise<T[][]> {
  const arr: T[] = [];
  for await (const x of await value) {
    arr.push(x);
  }
  return syncDoSlice(arr, await slices, await fillWith);
}

function doSlice<T>(
  environment: Environment<false>,
  arr: Iterable<T>,
  slices: number,
  fillWith?: T | null,
): T[][];
function doSlice<T>(
  environment: Environment<true>,
  arr: Iterable<T> | AsyncIterable<T>,
  slices: number | Promise<number>,
  fillWith?: T | null | Promise<T | null>,
): Promise<T[][]>;

function doSlice<T>(
  environment: Environment,
  value:
    | Iterable<T>
    | AsyncIterable<T>
    | Promise<Iterable<T> | AsyncIterable<T>>,
  slices: number | Promise<number>,
  fillWith: T | null | Promise<T | null> = null,
): T[][] | Promise<T[][]> {
  if (environment.isAsync()) {
    return asyncDoSlice(value, slices, fillWith);
  } else {
    if (
      value instanceof Promise ||
      slices instanceof Promise ||
      fillWith instanceof Promise
    ) {
      throw new Error("Promise passed to sync slice filter");
    }
    return syncDoSlice(value as Iterable<T>, slices, fillWith);
  }
}

export const slice = nunjucksFunction(["value", "slices", "fill_with"], {
  passArg: "environment",
})(doSlice);

export function string(obj: unknown) {
  return copySafeness(obj, str(obj));
}

function syncSum(
  environment: Environment,
  iterable: Iterable<any>,
  attribute: string | number | null = null,
  start = 0,
): number {
  let arr: any[] = [];
  for (const item of iterable) {
    arr.push(item);
  }
  if (attribute !== null) {
    arr = arr.map(syncMakeAttrGetter(environment, attribute));
  }
  return arr.reduce((prev, curr) => prev + curr, start);
}

async function asyncSum(
  environment: Environment,
  iterable: Iterable<any>,
  attribute: string | number | null = null,
  start = 0,
): Promise<number> {
  let arr: any[] = [];
  for await (const item of iterable) {
    arr.push(item);
  }
  if (attribute !== null) {
    arr = arr.map(asyncMakeAttrGetter(environment, attribute));
  }
  return await arr.reduce(
    async (prev, curr) => (await prev) + (await curr),
    start,
  );
}

export const sum: {
  (
    environment: Environment<false>,
    iterable: Iterable<any>,
    attribute?: string | number | null,
    start?: number,
  ): number;
  (
    environment: Environment<true>,
    iterable: Iterable<any>,
    attribute?: string | number | null,
    start?: number,
  ): Promise<number>;
} = nunjucksFunction(["iterable", "attribute", "start"], {
  passArg: "environment",
})((environment, iterable, attribute, start): any =>
  (environment.isAsync() ? asyncSum : syncSum)(
    environment,
    iterable,
    attribute,
    start,
  ),
);

function syncSort(
  environment: Environment,
  value: unknown,
  reverse: boolean = false,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): unknown[] | string {
  const arr = syncList(value);
  const keyFunc = syncMakeMultiAttrGetter(environment, attribute, {
    postprocess: caseSensitive ? null : ignoreCase,
  });
  arr.sort((a, b) => {
    const cmpA = keyFunc(a);
    const cmpB = keyFunc(b);
    return cmpA > cmpB ? 1 : cmpA === cmpB ? 0 : -1;
  });
  if (reverse) arr.reverse();
  return isString(value) ? copySafeness(value, arr.join("")) : arr;
}

async function asyncSort(
  environment: Environment,
  value: unknown,
  reverse: boolean = false,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): Promise<unknown[] | string> {
  const arr = await asyncList(value);
  const keyFunc = asyncMakeMultiAttrGetter(environment, attribute, {
    postprocess: caseSensitive ? null : ignoreCase,
  });
  const sortTransform: [unknown, any][] = await Promise.all(
    arr.map<Promise<[unknown, any]>>(async (el) => [el, await keyFunc(el)]),
  );
  const ret = sortTransform
    .sort(([, a], [, b]) => (a > b ? 1 : a === b ? 0 : -1))
    .map(([val]) => val);
  if (reverse) ret.reverse();
  return isString(value) ? copySafeness(value, ret.join("")) : ret;
}

export const sort: {
  <V>(
    environment: Environment<false>,
    iterable: Iterable<V>,
    reverse?: boolean,
    caseSensitive?: boolean,
    attribute?: string | number | null,
  ): V[];
  <V>(
    environment: Environment<true>,
    iterable: Iterable<V> | AsyncIterable<V>,
    reverse?: boolean,
    caseSensitive?: boolean,
    attribute?: string | number | null,
  ): Promise<V[]>;
  (
    environment: Environment<false>,
    iterable: string,
    reverse?: boolean,
    caseSensitive?: boolean,
    attribute?: string | number | null,
  ): string;
  (
    environment: Environment<true>,
    iterable: string,
    reverse?: boolean,
    caseSensitive?: boolean,
    attribute?: string | number | null,
  ): Promise<string>;
  (
    environment: Environment<false>,
    iterable: unknown,
    reverse?: boolean,
    caseSensitive?: boolean,
    attribute?: string | number | null,
  ): unknown[];
  (
    environment: Environment<true>,
    iterable: unknown,
    reverse?: boolean,
    caseSensitive?: boolean,
    attribute?: string | number | null,
  ): Promise<unknown[]>;
} = nunjucksFunction(["value", "reverse", "case_sensitive", "attribute"], {
  passArg: "environment",
})(function sort(
  environment: Environment,
  value: any,
  reverse: boolean = false,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): any {
  return (environment.isAsync() ? asyncSort : syncSort)(
    environment,
    value,
    reverse,
    caseSensitive,
    attribute,
  );
});

function prepareMap(
  context: Context<boolean>,
  {
    args = [],
    kwargs: { attribute = null, default: default_ = null, ...kwargs } = {},
  }: {
    args?: any[];
    kwargs?: Record<string, any>;
  },
): (val: any) => any {
  if (!args.length && attribute !== null) {
    const kwargKeys = [...Object.keys(kwargs)];
    if (kwargKeys.length) {
      throw new FilterArgumentError(
        `Unexpected keyword argument '${kwargKeys[0]}'`,
      );
    }
    return syncMakeAttrGetter(context.environment, attribute, {
      default: default_,
    });
  } else {
    if (!args.length)
      throw new FilterArgumentError("map requires a filter argument");

    const name = args.shift();

    return (item: any): any =>
      context.environment.callFilter(name, item, { args, kwargs, context });
  }
}

/**
 * Applies a filter on a sequence of objects or looks up an attribute.
 * This is useful when dealing with lists of objects but you are really
 * only interested in a certain value of it.
 *
 * The basic usage is mapping on an attribute.  Imagine you have a list
 * of users but you are only interested in a list of usernames:
 *
 * ```jinja
 * Users on this page: {{ users|map(attribute='username')|join(', ') }}
 * ```
 *
 * You can specify a `default` value to use if an object in the list
 * does not have the given attribute.
 *
 * ```jinja
 * {{ users|map(attribute="username", default="Anonymous")|join(", ") }}
 * ```
 *
 * Alternatively you can let it invoke a filter by passing the name of the
 * filter and the arguments afterwards.  A good example would be applying a
 * text conversion filter on a sequence:
 *
 * ```jinja
 * Users on this page: {{ titles|map('lower')|join(', ') }}
 * ```
 */
function* syncDoMap(
  context: Context<boolean>,
  value: Iterable<any>,
  { args = [], kwargs = {} }: { args: any[]; kwargs: Record<string, any> },
): Generator<any> {
  let func: ((val: any) => any) | null = null;
  if (value) {
    for (const item of value) {
      if (func === null) {
        func = prepareMap(context, { args, kwargs });
      }
      yield func(item);
    }
  }
}

async function* asyncDoMap(
  context: Context<boolean>,
  value: Iterable<any> | AsyncIterable<any>,
  { args = [], kwargs = {} }: { args: any[]; kwargs: Record<string, any> },
) {
  let func: ((val: any) => any) | null = null;
  if (value) {
    for await (const item of value) {
      if (func === null) {
        func = prepareMap(context, { args, kwargs });
      }
      yield await func(item);
    }
  }
}

export const map: {
  (
    context: Context<false>,
    value: Iterable<any>,
    kwargs?: Record<string, any>,
    ...args: any[]
  ): Generator<any>;
  (
    context: Context<true>,
    value: Iterable<any> | AsyncIterable<any>,
    kwargs?: Record<string, any>,
    ...args: any[]
  ): AsyncGenerator<any>;
} = nunjucksFunction(["value"], {
  passArg: "context",
  kwargs: true,
  varargs: true,
})(function map(
  context: Context<boolean>,
  value: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { __isKwargs, name, ...kwargs } = {},
  ...args
): any {
  if (typeof name !== "undefined") {
    args.unshift(name);
  }
  return (context.isAsync() ? asyncDoMap : syncDoMap)(context, value, {
    args,
    kwargs,
  });
});

function doMinMax<V>(
  environment: Environment,
  value: Iterable<V>,
  caseSensitive: boolean,
  attribute: string | number | null,
  min: boolean,
): V {
  const arr = [...value];
  if (!arr.length) return "" as V;
  const keyFunc = syncMakeMultiAttrGetter(environment, attribute, {
    postprocess: caseSensitive ? null : ignoreCase,
  });
  return arr
    .slice(1)
    .reduce(
      (a, b) => (keyFunc(a) > keyFunc(b) ? (min ? b : a) : min ? a : b),
      arr[0],
    );
}

/**
 * Return the smallest item from the sequence.
 *
 * @param value The iterable to get minimum item from.
 * @param case_sensitive Treat upper and lower case strings as distinct.
 * @param attribute Get the object with the min value of this attribute.
 */
export const min = nunjucksFunction(["value", "case_sensitive", "attribute"], {
  passArg: "environment",
})(function min<V>(
  environment: Environment,
  value: Iterable<V>,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): V {
  return doMinMax(environment, value, caseSensitive, attribute, true);
});

/**
 * Return the largest item from the sequence.
 *
 * @param value The iterable to get minimum item from.
 * @param case_sensitive Treat upper and lower case strings as distinct.
 * @param attribute Get the object with the max value of this attribute.
 */
export const max = nunjucksFunction(["value", "case_sensitive", "attribute"], {
  passArg: "environment",
})(function max<V>(
  environment: Environment,
  value: Iterable<V>,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): V {
  return doMinMax(environment, value, caseSensitive, attribute, false);
});

export function upper(str: unknown): string {
  str = normalize(str, "");
  return `${str}`.toUpperCase();
}

function urlquote(
  str: string,
  { query = false }: { query?: boolean } = {},
): string {
  const encode = query ? encodeURIComponent : encodeURI;
  const ret = encode(str)
    .replace(/%5B/g, "[")
    .replace(/%5D/g, "]")
    .replace(
      /[!'()*,]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  return query ? ret.replace(/%20/g, "+") : ret;
}

export function urlencode(
  obj: [string, string][] | Record<PropertyKey, unknown> | string,
): string {
  if (isString(obj)) {
    return urlquote(obj);
  } else {
    const keyvals = Array.isArray(obj) ? obj : [...Object.entries(obj)];
    return keyvals
      .map(([k, v]) => {
        const val = `${v}`;
        return `${urlquote(k, { query: true })}=${urlquote(val, { query: true })}`;
      })
      .join("&");
  }
}

const _wordBeginningSplitRe = /([-\s({\\[<]+)/g;

export function title(s: string): string {
  return s
    .split(_wordBeginningSplitRe)
    .map((i) => (!i ? i : i[0].toUpperCase() + i.substring(1).toLowerCase()))
    .join("");
}

// For the jinja regexp, see
// https://github.com/mitsuhiko/jinja2/blob/f15b814dcba6aa12bc74d1f7d0c881d55f7126be/jinja2/utils.py#L20-L23
const puncRe = /^(?:\(|<|&lt;)?(.*?)(?:\.|,|\)|\n|&gt;)?$/;
// from http://blog.gerv.net/2011/05/html5_email_address_regexp/
const emailRe = /^[\w.!#$%&'*+\-/=?^`{|}~]+@[a-z\d-]+(\.[a-z\d-]+)+$/i;
const httpHttpsRe = /^https?:\/\/.*$/;
// const wwwRe = /^www\./;
const tldRe = /\.(?:org|net|com)(?::|\/|$)/;

// TODO rewrite
export function urlize(
  str: string,
  length: number,
  nofollow?: boolean,
): string {
  if (isNaN(length)) {
    length = Infinity;
  }

  const noFollowAttr = nofollow === true ? ' rel="nofollow"' : "";

  const words = str
    .split(/(\s+)/)
    .filter((word) => {
      // If the word has no length, bail. This can happen for str with
      // trailing whitespace.
      return word?.length;
    })
    .map((word) => {
      const matches = word.match(puncRe);
      const possibleUrl = matches ? matches[1] : word;
      const shortUrl = possibleUrl.substr(0, length);

      // url that starts with http or https
      if (httpHttpsRe.test(possibleUrl)) {
        return `<a href="${possibleUrl}"${noFollowAttr}>${shortUrl}</a>`;
      }

      // url that starts with www.
      if (possibleUrl.startsWith("www.")) {
        return `<a href="http://${possibleUrl}"${noFollowAttr}>${shortUrl}</a>`;
      }

      // an email address of the form username@domain.tld
      if (emailRe.test(possibleUrl)) {
        return `<a href="mailto:${possibleUrl}">${possibleUrl}</a>`;
      }

      // url that ends in .com, .org or .net that is not an email address
      if (tldRe.test(possibleUrl)) {
        return `<a href="http://${possibleUrl}"${noFollowAttr}>${shortUrl}</a>`;
      }

      return word;
    });

  return words.join("");
}

export function wordcount(string: unknown): number | null {
  const s = str(normalize(string, ""));
  const words = s ? `${s}`.match(/\w+/g) : null;
  return words ? words.length : null;
}

function isArrayLike<T = unknown>(x: any): x is ArrayLike<T> {
  return x && typeof x.length === "number" && typeof x !== "function";
}

export function items(obj: unknown) {
  if (isUndefinedInstance(obj)) return [];
  if (isObject(obj) || typeof obj === "string" || isArrayLike(obj))
    return Object.entries(obj);
}

export { escape };

// Aliases
export { default_ as d };
export { escape as e };

function regexEscape(str: string): string {
  return str.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
}

const trim = nunjucksFunction(["value", "chars"])(function trim(
  value: unknown,
  chars: string | null = null,
): string {
  if (chars === null) return copySafeness(value, str(value).trim());
  const regexChars = regexEscape(chars);
  const startRegex = new RegExp(`^[${regexChars}]+`);
  const endRegex = new RegExp(`[${regexChars}]+$`);
  return copySafeness(
    value,
    str(value).replace(startRegex, "").replace(endRegex, ""),
  );
});

/**
 * Create an SGML/XML attribute string based on the items in a dict.
 *
 * If any key contains a space, this fails with an error. Values that
 * are neither `none` nor `undefined` are automatically escaped.
 */
export const xmlattr = nunjucksFunction(["d", "autospace"], {
  passArg: "evalContext",
})(function xmlattr(
  evalCtx: EvalContext,
  d: Record<string, any>,
  autospace = true,
): string {
  const items: string[] = [];
  for (const [key, value] of Object.entries(d)) {
    if (value === null || value === undefined || isUndefinedInstance(value)) {
      continue;
    }
    if (key.match(/\s/)) {
      throw new Error(`Spaces are not allowed in attributes: '${key}'`);
    }

    items.push(`${escape(key)}="${escape(value)}"`);
  }
  let rv = items.join(" ");
  if (autospace && rv) {
    rv = ` ${rv}`;
  }

  if (evalCtx.autoescape) {
    rv = markSafe(rv);
  }

  return rv;
});

function striptags(value: string | MarkupType): string {
  return new Markup(str(value)).striptags();
}

export const float = nunjucksFunction(["value", "default"])(function float(
  value: unknown,
  default_: number = 0,
): Float {
  if (typeof value === "string") {
    value = value.replace(/_/g, "");
  }
  const ret = Number(value);
  return new Float(isNaN(ret) ? default_ : ret);
});

export const int = nunjucksFunction(["value", "default", "base"])(function int(
  value: unknown,
  default_: number = 0,
  base: number = 10,
): number {
  if (typeof value === "string") {
    let s = value.replace(/_/g, "");
    if (base === 2) {
      if (!s.startsWith("0b") && !s.startsWith("0B")) s = `0b${s}`;
      base = 10;
    }
    if (base === 8) {
      if (!s.startsWith("0o") && !s.startsWith("0O")) s = `0o${s}`;
      base = 10;
    }
    if (base === 16) {
      if (!s.startsWith("0x") && !s.startsWith("0X")) s = `0x${s}`;
      base = 10;
    }
    value = s;
  }
  const ret =
    base === 10
      ? Number(float(value, NaN).toFixed(0))
      : parseInt(`${value}`, base);

  return isNaN(ret) ? default_ : ret;
});

const format = nunjucksFunction(["value"], { kwargs: true, varargs: true })(
  function format(
    value: string,
    kwargs: Record<string, any> = {},
    ...args: any[]
  ): string {
    if (args.length) {
      return strMod(value, ...args);
    } else {
      return strMod(value, kwargs);
    }
  },
);

/**
 * Format the value like a 'human-readable' file size (i.e. 13 kB,
 * 4.1 MB, 102 Bytes, etc).  Per default decimal prefixes are used (Mega,
 * Giga, etc.), if the second parameter is set to `true` the binary
 * prefixes are used (Mebi, Gibi).
 */
const filesizeformat = nunjucksFunction(["value", "binary"])(
  function filesizeformat(
    value: string | number,
    binary: boolean = false,
  ): string {
    const bytes = Number(value);
    const base = binary ? 1024 : 1000;
    const prefixes = [
      binary ? "KiB" : "kB",
      binary ? "MiB" : "MB",
      binary ? "GiB" : "GB",
      binary ? "TiB" : "TB",
      binary ? "PiB" : "PB",
      binary ? "EiB" : "EB",
      binary ? "ZiB" : "ZB",
      binary ? "YiB" : "YB",
    ];
    if (bytes === 1) {
      return "1 Byte";
    } else if (bytes < base) {
      return `${bytes.toFixed(0)} Bytes`;
    } else {
      let unit = base;
      for (const [i, prefix] of prefixes.entries()) {
        unit = Math.pow(base, i + 2);
        if (bytes < unit) {
          return `${((base * bytes) / unit).toFixed(1)} ${prefix}`;
        }
      }
      unit = Math.pow(base, prefixes.length + 1);
      const prefix = prefixes[prefixes.length - 1];
      return `${((base * bytes) / unit).toFixed(1)} ${prefix}`;
    }
  },
);

/**
 * Return a truncated copy of the string. The length is specified
 * with the first parameter which defaults to ``255``. If the second
 * parameter is ``true`` the filter will cut the text at length. Otherwise
 * it will discard the last word. If the text was in fact
 * truncated it will append an ellipsis sign (``"..."``). If you want a
 * different ellipsis sign than ``"..."`` you can specify it using the
 * third parameter. Strings that only exceed the length by the tolerance
 * margin given in the fourth parameter will not be truncated.
 *
 * The default leeway is 5 and can be reconfigured by setting the
 * truncate.leeway policy on the Environment.
 *
 * @example
 *
 * ```jinja
 *  {{ "foo bar baz qux"|truncate(9) }}
 *      -> "foo..."
 *  {{ "foo bar baz qux"|truncate(9, true) }}
 *      -> "foo ba..."
 *  {{ "foo bar baz qux"|truncate(11) }}
 *      -> "foo bar baz qux"
 *  {{ "foo bar baz qux"|truncate(11, false, '...', 0) }}
 *      -> "foo bar..."
 * ```
 */
export const truncate = nunjucksFunction(
  ["s", "length", "killwords", "end", "leeway"],
  { passArg: "environment" },
)(function truncate(
  env: Environment,
  s: string,
  length: number = 255,
  killwords: boolean = false,
  end: string = "...",
  leeway: number | null = null,
) {
  if (leeway === null) leeway = env.policies["truncate.leeway"];
  if (length < end.length)
    throw new Error(`expected length >= ${end.length}, got ${length}`);
  if (leeway < 0) throw new Error(`expected leeway >= 0, got ${leeway}`);

  if (s.length <= length + leeway) return s;
  let truncated = s.substring(0, length - end.length);
  if (!killwords) {
    const index = truncated.lastIndexOf(" ");
    if (index > -1) truncated = truncated.substring(0, index);
  }
  return truncated + end;
});

function prepareSelectOrRejectSync(
  context: Context<false>,
  args: any[],
  kwargs: Record<string, any>,
  modfunc: (arg: any) => any,
  lookupAttr: boolean,
): (arg: any) => any {
  let off = 0;
  let transfunc = <V>(x: V): V => x;
  if (lookupAttr) {
    if (!args.length)
      throw new FilterArgumentError("Missing parameter for attribute name");
    transfunc = syncMakeAttrGetter(context.environment, args[0]);
    off = 1;
  }
  let func = (x: unknown): boolean => !!x;
  if (args.length > off) {
    const name = `${args[off]}`;
    func = (item: any): any =>
      context.environment.callTest(name, item, {
        args: args.slice(off + 1),
        kwargs,
        context,
      });
  }
  return (item: unknown) => modfunc(func(transfunc(item)));
}

function prepareSelectOrRejectAsync(
  context: Context<true>,
  args: any[],
  kwargs: Record<string, any>,
  modfunc: (arg: any) => any,
  lookupAttr: boolean,
): (arg: any) => Promise<any> {
  let off = 0;
  let transfunc = async <V>(x: V): Promise<V> => await Promise.resolve(x);
  if (lookupAttr) {
    if (!args.length)
      throw new FilterArgumentError("Missing parameter for attribute name");
    transfunc = asyncMakeAttrGetter(context.environment, args[0]);
    off = 1;
  }
  let func = (x: unknown): Promise<boolean> => Promise.resolve(!!x);
  if (args.length > off) {
    const name = `${args[off]}`;
    func = async (item: any): Promise<any> =>
      await context.environment.callTest(name, item, {
        args: args.slice(off + 1),
        kwargs,
        context,
      });
  }
  return async (item: unknown) =>
    await modfunc(await func(await transfunc(item)));
}

function* selectOrRejectSync<V = unknown>(
  context: Context<false>,
  value: Iterable<V>,
  args: any[],
  kwargs: Record<string, any>,
  modfunc: (arg: any) => any,
  lookupAttr: boolean,
): Iterator<V> {
  if (value) {
    const func = prepareSelectOrRejectSync(
      context,
      args,
      kwargs,
      modfunc,
      lookupAttr,
    );
    for (const item of value) {
      if (func(item)) yield item;
    }
  }
}

async function* selectOrRejectAsync<V = unknown>(
  context: Context<true>,
  value: Iterable<V>,
  args: any[],
  kwargs: Record<string, any>,
  modfunc: (arg: any) => any,
  lookupAttr: boolean,
): AsyncIterator<V> {
  if (value) {
    const func = prepareSelectOrRejectAsync(
      context,
      args,
      kwargs,
      modfunc,
      lookupAttr,
    );
    for await (const item of value) {
      if (await func(item)) yield item;
    }
  }
}

type SelectReject = {
  <V = unknown>(
    context: Context<false>,
    value: Iterable<V>,
    kwargs?: Record<string, any>,
    ...args: any[]
  ): Iterator<V>;
  <V = unknown>(
    context: Context<true>,
    value: Iterable<V> | AsyncIterable<V>,
    kwargs?: Record<string, any>,
    ...args: any[]
  ): AsyncIterator<V>;
};

export const select: SelectReject = nunjucksFunction(["value"], {
  varargs: true,
  kwargs: true,
  passArg: "context",
})(function select(
  context: Context<boolean>,
  value: any,
  kwargs: Record<string, any> = {},
  ...args: any[]
): any {
  if (context.isAsync()) {
    return selectOrRejectAsync(context, value, args, kwargs, (x) => !!x, false);
  } else if (context.isSync()) {
    return selectOrRejectSync(context, value, args, kwargs, (x) => !!x, false);
  } else throw new Error("unreachable");
});

export const reject: SelectReject = nunjucksFunction(["value"], {
  varargs: true,
  kwargs: true,
  passArg: "context",
})(function select(
  context: Context<boolean>,
  value: any,
  kwargs: Record<string, any> = {},
  ...args: any[]
): any {
  if (context.isAsync()) {
    return selectOrRejectAsync(context, value, args, kwargs, (x) => !x, false);
  } else if (context.isSync()) {
    return selectOrRejectSync(context, value, args, kwargs, (x) => !x, false);
  } else throw new Error("unreachable");
});

export const selectattr: SelectReject = nunjucksFunction(["value"], {
  varargs: true,
  kwargs: true,
  passArg: "context",
})(function selectattr(
  context: Context<boolean>,
  value: any,
  kwargs: Record<string, any> = {},
  ...args: any[]
): any {
  if (context.isAsync()) {
    return selectOrRejectAsync(context, value, args, kwargs, (x) => !!x, true);
  } else if (context.isSync()) {
    return selectOrRejectSync(context, value, args, kwargs, (x) => !!x, true);
  } else throw new Error("unreachable");
});

export const rejectattr: SelectReject = nunjucksFunction(["value"], {
  varargs: true,
  kwargs: true,
  passArg: "context",
})(function rejectattr(
  context: Context<boolean>,
  value: any,
  kwargs: Record<string, any> = {},
  ...args: any[]
): any {
  if (context.isAsync()) {
    return selectOrRejectAsync(context, value, args, kwargs, (x) => !x, true);
  } else if (context.isSync()) {
    return selectOrRejectSync(context, value, args, kwargs, (x) => !x, true);
  } else throw new Error("unreachable");
});

/**
 * Return JSON string representation of the object.
 *
 * @param o Object to convert to JSON string.
 * @param indent Number of spaces, or a string, to indent by.
 */
export const tojson = nunjucksFunction(["o", "indent"])(function tojson(
  o: unknown,
  indent: number = 0,
): string {
  if (o === undefined) {
    return "undefined";
  }

  return markSafe(
    JSON.stringify(
      o,
      (_, v) =>
        typeof v === "bigint" || typeof v === "symbol" ? v.toString() : v,
      indent,
    )
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/'/g, "\\u0027"),
  );
});

function syncUnique(
  evalCtx: EvalContext,
  value: unknown,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): unknown[] {
  let arr = syncList(value);

  if (attribute !== null) {
    arr = arr.map(syncMakeAttrGetter(evalCtx.environment, attribute));
  }

  const res: unknown[] = [];

  for (const item of arr) {
    if (
      !res.some((x) =>
        caseSensitive ? x === item : ignoreCase(x) === ignoreCase(item),
      )
    )
      res.push(item);
  }

  return res;
}

async function asyncUnique(
  evalCtx: EvalContext,
  value: unknown,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): Promise<unknown[]> {
  const arr = await asyncList(value);

  if (attribute !== null) {
    const attrGetter = asyncMakeAttrGetter(evalCtx.environment, attribute);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = await attrGetter(arr[i]);
    }
  }
  return syncUnique(evalCtx, arr, caseSensitive);
}

const doUnique: {
  (
    evalCtx: EvalContext<true>,
    value: unknown,
    caseSensitive: boolean,
    attribute: string | number | null,
  ): Promise<unknown>;
  (
    evalCtx: EvalContext<false>,
    value: unknown,
    caseSensitive: boolean,
    attribute: string | number | null,
  ): unknown;
} = (
  evalCtx: EvalContext,
  value: unknown,
  caseSensitive: boolean = false,
  attribute: string | number | null = null,
): any => {
  return evalCtx.isAsync()
    ? asyncUnique(evalCtx, value, caseSensitive, attribute)
    : syncUnique(evalCtx, value, caseSensitive, attribute);
};

/**
 * Returns a list of unique items from the given iterable.
 *
 * @param value The iterable to get unique items from.
 * @param case_sensitive Treat upper and lower case strings as distinct.
 * @param attribute Filter objects with unique values for this attribute.
 */
export const unique = nunjucksFunction(
  ["value", "case_sensitive", "attribute"],
  {
    passArg: "evalContext",
  },
)(doUnique);

/**
 * Wrap a string to the given width. Existing newlines are treated as paragraphs
 * to be wrapped separately.
 *
 * @param s Original text to wrap.
 * @param width Maximum length of wrapped lines.
 * @param breakLongWords If a word is longer than `width`, break it across lines.
 * @param wrapString String to join each wrapped line. Defaults to `\n`.
 * Only supports space and newline characters.
 * @param breakOnHyphens If a word contains hyphens, it may be split across lines.
 * If disabled, `breakLongWords` will be disabled too.
 */
export const wordwrap = nunjucksFunction(
  ["s", "width", "breakLongWords", "wrapString", "breakOnHyphens"],
  {
    passArg: "evalContext",
  },
)(function wordwrap(
  evalContext: EvalContext,
  s: string,
  width: number = 79,
  breakLongWords: boolean = true,
  /**
   * @warning Only support space and newline
   */
  wrapString: string = "\n",
  breakOnHyphens: boolean = true,
): string {
  // If breaking on hyphens is disabled, disable breaking long words too
  if (breakOnHyphens === false) {
    breakLongWords = false;
  }

  const re = new RegExp(
    breakLongWords
      ? `\\S.{1,${width - 1}}`
      : breakOnHyphens
        ? `\\S.{1,${width - 1}}(?:-|\\s+|$)`
        : `\\S.{1,${width - 1}}(?:\\s+|$)`,
    "g",
  );

  const shouldEscape = evalContext.autoescape && !isMarkup(s);

  s = s
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const { length } = line;

      if (length <= width) {
        return line;
      }

      return line
        .replace(re, (match, offset) => {
          if (offset + match.length === length) {
            return match;
          }

          return `${match}${wrapString}`;
        })
        .split(wrapString);
    })
    .flat()
    .map((line) => line.trim())
    .join(wrapString);

  return shouldEscape ? markSafe(escape(s)) : s;
});

export default {
  abs,
  // attr,
  batch,
  capitalize,
  center,
  // count,
  d: default_,
  default: default_,
  dictsort,
  e: escape,
  escape,
  filesizeformat,
  first,
  float,
  forceescape,
  format,
  // groupBy,
  indent,
  int,
  join,
  last,
  length,
  list,
  lower,
  items,
  map,
  min,
  max,
  // pprint,
  // random,
  reject,
  rejectattr,
  replace,
  reverse,
  round,
  safe,
  select,
  selectattr,
  slice,
  sort,
  string,
  striptags,
  sum,
  title,
  trim,
  truncate,
  unique,
  upper,
  urlencode,
  urlize,
  wordcount,
  wordwrap,
  xmlattr,
  tojson,
};

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
} from "@nunjucks/runtime";
import { TemplateError } from "@nunjucks/utils";
import { Environment } from "./environment";

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
  attr: T
): T[];

function _prepareAttributeParts<T extends unknown>(
  attr: T | string | undefined
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

function makeAttrGetter(
  environment: Environment,
  attribute: string | number,
  options: { postprocess?: null | ((val: any) => any); default?: any } = {}
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

function makeMultiAttrGetter(
  environment: Environment,
  attribute: string | number,
  options: { postprocess?: null | ((val: any) => any); default?: any } = {}
): (value: any) => any {
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

export function* batch<V>(
  value: Iterable<V>,
  linecount: number,
  fillWith: V | null = null
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

export function capitalize(str: string): string {
  const s = normalize(`${str}`, "");
  const ret = s.toLowerCase();
  return copySafeness(str, ret.charAt(0).toUpperCase() + ret.slice(1));
}

function center(str: string, width: number = 80): string {
  str = `${str || ""}`;

  if (str.length >= width) {
    return str;
  }

  const spaces = width - str.length;
  const pre = " ".repeat(Math.floor(spaces / 2) - (spaces % 2));
  const post = " ".repeat(Math.floor(spaces / 2));
  return copySafeness(str, pre + str + post);
}

exports.center = center;

export function default_<T, U>(val: T, def: U, bool?: boolean): T | U {
  if (bool) {
    return val || def;
  } else {
    return val !== undefined ? val : def;
  }
}

function isObject(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" || (typeof o === "function" && !!o);
}

function isString(o: unknown): o is string {
  return isMarkup(o) || typeof o === "string";
}

export const dictsort = nunjucksFunction([
  "value",
  "case_sensitive",
  "by",
  "reverse",
])(function dictsort<V>(
  value: Record<string, V>,
  caseSensitive: boolean = false,
  by: "key" | "value" = "key",
  reverse: boolean = false
): [string, V][] {
  if (!isObject(value)) {
    throw new TemplateError("dictsort filter: value must be an object");
  }

  let array: [string, V][] = [];
  // deliberately include properties from the object's prototype
  for (let k in value) {
    // eslint-disable-line guard-for-in, no-restricted-syntax
    array.push([k, value[k]]);
  }
  const pos = by === "key" ? 0 : by === "value" ? 1 : null;
  if (pos === null)
    throw new TemplateError(
      "dictsort filter: You can only sort by either key or value"
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
  str = str === null || str === undefined ? "" : str;
  return markSafe(`${str}`);
}

export function first<T>(arr: T[]): T {
  return arr[0];
}

// TODO
export const forceescape = escape;

// function forceescape(str: unknown) {
//   str = str === null || str === undefined ? "" : str;
//   return r.markSafe(lib.escape(str.toString()));
// }

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
    first: boolean = false,
    blank: boolean = false
  ): string {
    str = normalize(str, "");

    if (str === "") {
      return "";
    }

    const sp = typeof width === "string" ? width : " ".repeat(width);

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
  }
);

function syncJoin(
  evalCtx: EvalContext,
  value: unknown,
  d: string = "",
  attribute: string | number | null = null
): string {
  let arr = syncList(value);

  if (attribute !== null) {
    arr = arr.map(makeAttrGetter(evalCtx.environment, attribute));
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
  d: string = "",
  attribute: string | number | null = null
): Promise<string> {
  let arr = await asyncList(value);
  if (attribute !== null) {
    const attrGetter = makeAttrGetter(evalCtx.environment, attribute);
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
    attribute?: string | number
  ): Promise<string>;
  (
    evalCtx: EvalContext<false>,
    value: unknown,
    d?: string,
    attribute?: string | number
  ): string;
} = (
  evalCtx: EvalContext,
  value: unknown,
  d: string = "",
  attribute: string | number | null = null
): any =>
  evalCtx.isAsync()
    ? asyncJoin(evalCtx, value, d, attribute)
    : syncJoin(evalCtx, value, d, attribute);

export const join = nunjucksFunction(["value", "d", "attribute"], {
  passArg: "evalContext",
})(doJoin);

export function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

export function length(
  val: string | unknown[] | undefined | Record<PropertyKey, unknown>
): number {
  var value = normalize(val, "");

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

function isIterable(o: unknown): o is Iterable<unknown> {
  return (
    typeof o === "object" &&
    !!o &&
    Symbol.iterator in o &&
    typeof o[Symbol.iterator] === "function"
  );
}

function isAsyncIterable(o: unknown): o is AsyncIterable<unknown> {
  return (
    typeof o === "object" &&
    !!o &&
    Symbol.asyncIterator in o &&
    typeof o[Symbol.asyncIterator] === "function"
  );
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
  doList
);

export function lower(str: unknown): string {
  str = normalize(str, "");
  return `${str}`.toLowerCase();
}

export function nl2br(str: unknown) {
  if (str === null || str === undefined) {
    return "";
  }
  return copySafeness(str, `${str}`.replace(/\r\n|\n/g, "<br />\n"));
}

export function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function replaceCount(
  str: string,
  old: RegExp | string | number,
  new_: string,
  maxCount = -1
): string {
  const originalStr = str;

  // Cast numbers in the replacement to string
  if (typeof str === "number") {
    str = "" + str;
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
  if (typeof old === "number") {
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
  maxCount?: number
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
    method: "common" | "ceil" | "floor" = "common"
  ): number {
    const factor = Math.pow(10, precision);
    const rounder =
      method === "ceil"
        ? Math.ceil
        : method === "floor"
          ? Math.floor
          : Math.round;
    return rounder(value * factor) / factor;
  }
);

function syncDoSlice<T>(
  value: Iterable<T>,
  slices: number,
  fillWith: T | null = null
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
  fillWith: T | null | Promise<T | null> = null
): Promise<T[][]> {
  const arr: T[] = [];
  for await (const x of await value) {
    arr.push(await x);
  }
  return syncDoSlice(arr, await slices, await fillWith);
}

function doSlice<T>(
  environment: Environment<false>,
  arr: Iterable<T>,
  slices: number,
  fillWith?: T | null
): T[][];
function doSlice<T>(
  environment: Environment<true>,
  arr: Iterable<T> | AsyncIterable<T>,
  slices: number | Promise<number>,
  fillWith?: T | null | Promise<T | null>
): Promise<T[][]>;

function doSlice<T>(
  environment: Environment,
  value:
    | Iterable<T>
    | AsyncIterable<T>
    | Promise<Iterable<T> | AsyncIterable<T>>,
  slices: number | Promise<number>,
  fillWith: T | null | Promise<T | null> = null
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
  start: number = 0
): number {
  let arr: any[] = [];
  for (const item of iterable) {
    arr.push(item);
  }
  if (attribute !== null) {
    arr = arr.map(makeAttrGetter(environment, attribute));
  }
  return arr.reduce((prev, curr) => prev + curr, start);
}

async function asyncSum(
  environment: Environment,
  iterable: Iterable<any>,
  attribute: string | number | null = null,
  start: number = 0
): Promise<number> {
  const arr: any[] = [];
  for await (const item of iterable) {
    arr.push(item);
  }
  return syncSum(environment, arr, attribute, start);
}

export const sum: {
  (
    environment: Environment<false>,
    iterable: Iterable<any>,
    attribute?: string | number | null,
    start?: number
  ): number;
  (
    environment: Environment<true>,
    iterable: Iterable<any>,
    attribute?: string | number | null,
    start?: number
  ): Promise<number>;
} = nunjucksFunction(["iterable", "attribute", "start"], {
  passArg: "environment",
})((environment, iterable, attribute, start): any =>
  (environment.isAsync() ? asyncSum : syncSum)(
    environment,
    iterable,
    attribute,
    start
  )
);

export function upper(str: unknown): string {
  str = normalize(str, "");
  return `${str}`.toUpperCase();
}

function urlquote(
  str: string,
  { query = false }: { query?: boolean } = {}
): string {
  const encode = query ? encodeURIComponent : encodeURI;
  const ret = encode(str)
    .replace(/%5B/g, "[")
    .replace(/%5D/g, "]")
    .replace(
      /[!'()*,]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
  return query ? ret.replace(/%20/g, "+") : ret;
}

export function urlencode(
  obj: [string, string][] | Record<PropertyKey, unknown> | string
): string {
  if (isString(obj)) {
    return urlquote(obj);
  } else {
    let keyvals = Array.isArray(obj) ? obj : [...Object.entries(obj)];
    return keyvals
      .map(([k, v]) => {
        const val = `${v}`;
        return `${urlquote(k, { query: true })}=${urlquote(val, { query: true })}`;
      })
      .join("&");
  }
}

// For the jinja regexp, see
// https://github.com/mitsuhiko/jinja2/blob/f15b814dcba6aa12bc74d1f7d0c881d55f7126be/jinja2/utils.py#L20-L23
const puncRe = /^(?:\(|<|&lt;)?(.*?)(?:\.|,|\)|\n|&gt;)?$/;
// from http://blog.gerv.net/2011/05/html5_email_address_regexp/
const emailRe = /^[\w.!#$%&'*+\-\/=?\^`{|}~]+@[a-z\d\-]+(\.[a-z\d\-]+)+$/i;
const httpHttpsRe = /^https?:\/\/.*$/;
const wwwRe = /^www\./;
const tldRe = /\.(?:org|net|com)(?:\:|\/|$)/;

// TODO rewrite
export function urlize(
  str: string,
  length: number,
  nofollow?: boolean
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
      return word && word.length;
    })
    .map((word) => {
      var matches = word.match(puncRe);
      var possibleUrl = matches ? matches[1] : word;
      var shortUrl = possibleUrl.substr(0, length);

      // url that starts with http or https
      if (httpHttpsRe.test(possibleUrl)) {
        return `<a href="${possibleUrl}"${noFollowAttr}>${shortUrl}</a>`;
      }

      // url that starts with www.
      if (wwwRe.test(possibleUrl)) {
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

export function wordcount(str: unknown): number | null {
  str = normalize(str, "");
  const words = str ? `${str}`.match(/\w+/g) : null;
  return words ? words.length : null;
}

export function float(val: string, def: number): number {
  var res = parseFloat(val);
  return isNaN(res) ? def : res;
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
  first,
  float,
  // forceescape,
  // format,
  // groupBy,
  indent,
  // int,
  join,
  last,
  length,
  list,
  lower,
  items,
  // map
  // min,
  // max,
  // pprint,
  // random,
  // reject,
  // rejectattr,
  replace,
  reverse,
  round,
  safe,
  // select,
  // selectattr,
  slice,
  // sort,
  string,
  // striptags,
  sum,
  // title,
  // trim,
  // truncate,
  // unique,
  upper,
  urlencode,
  urlize,
  wordcount,
  // wordwrap,
  // xmlattr,
  // tosjon,
};
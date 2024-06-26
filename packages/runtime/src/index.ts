import type { Environment } from "@nunjucks/environment";
import { LoopContext } from "./loops";
import type { IfAsync } from "./types";
import {
  isPlainObject,
  nunjucksFunction,
  NunjucksFunction,
  isVarargs,
  isKwargs,
  hasOwn,
  identity,
} from "./utils";
import arrayFromAsync from "./arrayFromAsync";

import { Macro } from "./macro";

export type { IfAsync } from "./types";

export { nunjucksFunction, isVarargs, isKwargs, hasOwn, identity };

export class Missing {}

export const MISSING = Object.freeze(new Missing());

export class UndefinedError extends Error {
  name = "UndefinedError";
}

export interface UndefinedOpts {
  hint?: string | null;
  obj?: any;
  name?: string | null;
  exc?: new (message?: string) => Error;
}

export function getObjectTypeName(obj: unknown) {
  if (obj === undefined || obj === null) {
    return `${obj}`;
  }
  const prototype = Object.getPrototypeOf(obj);
  return prototype.constructor.name;
}

export class Undefined extends Function {
  undefinedHint: string | null;
  undefinedObj: any;
  undefinedName: string | null;
  undefinedException: new (message?: string) => Error;

  constructor(opts?: UndefinedOpts);
  constructor(
    hint?: string | null,
    obj?: any,
    name?: string | null,
    exc?: new (message?: string) => Error,
  );
  constructor(arg1?: UndefinedOpts | string | null, ...args: any[]) {
    super();
    let opts: UndefinedOpts = {};
    if (
      typeof arg1 === "string" ||
      arg1 === null ||
      typeof arg1 === "undefined"
    ) {
      opts.hint = arg1;
      [opts.obj, opts.name, opts.exc] = args || [];
    } else {
      opts = arg1;
    }
    const { hint, obj, name, exc } = opts;
    this.undefinedHint = hint ?? null;
    this.undefinedObj = obj ?? MISSING;
    this.undefinedName = name ?? null;
    this.undefinedException = exc ?? UndefinedError;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        // In async mode, Undefined values are often awaited. This causes an
        // Object.get for "then" which would prematurely trigger an undefined
        // error if we didn't have special handling here.
        if (prop === "then") return undefined;

        target._failWithUndefinedError();
      },
      has(target, prop) {
        if (Reflect.has(target, prop)) {
          return true;
        }
        return target._failWithUndefinedError();
      },
      set(target, prop, value) {
        if (prop === "__isVarargs" || prop === "__isKwargs") {
          return Reflect.set(target, prop, value);
        }
        return target._failWithUndefinedError();
      },
      apply(target) {
        return target._failWithUndefinedError();
      },
      construct(target) {
        return target._failWithUndefinedError();
      },
    });
  }
  [Symbol.iterator]() {
    return [][Symbol.iterator]();
  }
  [Symbol.toPrimitive]() {
    return "";
  }
  [Symbol.asyncIterator]() {
    return (async function* () {
      /* do nothing */
    })()[Symbol.asyncIterator]();
  }
  toString() {
    return this._failWithUndefinedError();
  }

  valueOf() {
    return this._failWithUndefinedError();
  }

  get [Symbol.toStringTag]() {
    return "Undefined";
  }
  /**
   * Build a message about the undefined value based on how it was accessed.
   */
  get _undefinedMessage(): string {
    if (this.undefinedHint) {
      return this.undefinedHint;
    }
    if (this.undefinedObj === MISSING) {
      return `"${this.undefinedName}" is undefined`;
    }
    if (typeof this.undefinedName !== "string") {
      return `${getObjectTypeName(this.undefinedObj)} has no element "${
        this.undefinedName
      }"`;
    }
    return `${getObjectTypeName(this.undefinedObj)} has no property "${
      this.undefinedName
    }"`;
  }

  _failWithUndefinedError(): never {
    throw new this.undefinedException(this._undefinedMessage);
  }
}

export function isUndefinedInstance(obj: unknown): obj is Undefined {
  if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
    return false;
  }
  if (Object.prototype.toString.call(obj) !== "[object Undefined]")
    return false;
  return "_failWithUndefinedError" in obj;
}

export type Block<IsAsync extends boolean> = IsAsync extends true
  ? (context: Context<IsAsync>) => AsyncGenerator<string> | Generator<string>
  : (context: Context<IsAsync>) => Generator<string>;

export class KeyError extends Error {}

function concat(values: unknown[]): string {
  return values.map((val) => `${val}`).join("");
}

export function newContext<IsAsync extends boolean>({
  environment,
  name = null,
  blocks,
  vars = {},
  shared = false,
  globals = {},
  locals = {},
  async,
}: {
  environment: Environment<IsAsync>;
  name: string | null;
  blocks: Record<string, Block<IsAsync>>;
  vars: Record<string, any>;
  shared: boolean;
  globals: Record<string, any> | null;
  locals: Record<string, any>;
  async: IsAsync;
}) {
  let parent = shared ? vars : Object.assign({}, globals, vars);
  if (locals) {
    if (shared) {
      parent = Object.assign({}, parent);
    }
    Object.entries(locals).forEach(([key, value]) => {
      if (value !== MISSING) {
        parent[key] = value;
      }
    });
  }
  return new environment.contextClass<IsAsync>({
    environment,
    parent,
    name,
    blocks,
    globals,
    async,
  });
}

export class EvalContext<IsAsync extends boolean = boolean> {
  environment: Environment<IsAsync>;
  name: string | null;
  volatile = false;
  autoescape = false;

  [Symbol.toStringTag]() {
    return "EvalContext";
  }

  constructor({
    environment,
    name = null,
  }: {
    environment: Environment<IsAsync>;
    name?: string | null;
  }) {
    this.environment = environment;
    this.name = name;
    if (typeof environment.autoescape === "function") {
      this.autoescape = environment.autoescape(name);
    } else {
      this.autoescape = environment.autoescape;
    }
  }

  isAsync(): this is EvalContext<true> {
    return this.environment.isAsync();
  }
  isSync(): this is EvalContext<false> {
    return !this.environment.isSync();
  }

  save(): Record<string, unknown> {
    const ret: Record<string, unknown> = {};
    for (const prop of Object.getOwnPropertyNames(this)) {
      ret[prop] = (this as any)[prop];
    }
    return ret;
  }

  revert(old: Record<string, unknown>): void {
    for (const prop of Object.getOwnPropertyNames(this)) {
      delete (this as any)[prop];
    }
    for (const [key, value] of Object.entries(old)) {
      (this as any)[key] = value;
    }
  }
}

/**
 * The template context holds the variables of a template. It stores the
 * values passed to the template and also the names the template exports.
 * Creating instances is neither supported nor useful as it's created
 * automatically at various stages of the template evaluation and should
 * not be created by hand.
 *
 * The context is immutable. Modifications on `parent` **must not** happen
 * and modifications on `vars` are allowed from generated template code
 * only. Template filters and global functions marked as `pass_context` get
 * the active context passed as first argument and are allowed to access
 * the context read-only.
 *
 * The template context supports read only dict operations
 * (`get`, `keys`, `values`, `items`, `iterkeys`, `itervalues`, `iteritems`,
 * `__getitem__`, `__contains__`). Additionally there is a `resolve` method
 * that doesn't fail with a `KeyError` but returns an `Undefined` object for
 * missing variables.
 */

export class Context<IsAsync extends boolean> {
  async: IsAsync;
  parent: Record<string, any>;
  name: string | null;
  /**
   * The initial mapping of blocks.  Whenever template inheritance
   * takes place the runtime will update this mapping with the new blocks
   * from the template.
   */
  blocks: Record<string, Block<IsAsync>[]>;
  vars: Record<string, any>;
  environment: Environment<IsAsync>;
  evalCtx: EvalContext<IsAsync>;
  exportedVars: Set<string>;
  globalKeys: Set<string>;

  constructor({
    environment,
    parent,
    name,
    blocks,
    globals = null,
    async,
  }: {
    parent: Record<string, any>;
    name: string | null;
    blocks: Record<string, Block<IsAsync>>;
    environment: Environment<IsAsync>;
    globals: Record<string, any> | null;
    async: IsAsync;
  }) {
    this.async = async;
    this.parent = parent;
    this.vars = {};
    this.environment = environment;
    this.evalCtx = new EvalContext({ environment, name });
    this.exportedVars = new Set();
    this.name = name;
    this.globalKeys =
      globals === null ? new Set() : new Set(Array.from(Object.keys(globals)));
    this.blocks = {};
    Object.entries(blocks).forEach(([key, value]) => {
      this.blocks[key] = [value];
    });

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        return target.__getitem__(prop);
      },
      has(target, prop) {
        if (typeof prop === "symbol") return Reflect.has(target, prop);
        return target.__contains__(prop);
      },
      set(target, prop, value, receiver) {
        if (Reflect.has(target, prop)) {
          return Reflect.set(target, prop, value, receiver);
        } else {
          throw new Error("Context is immutable");
        }
      },
    });
  }
  super({
    name,
    current,
  }: {
    name: string;
    current: Block<IsAsync>;
  }): BlockReference<IsAsync> | Undefined {
    if (!(name in this.blocks)) {
      return this.environment.undef(`there is no parent block called ${name}`, {
        name: "super",
      });
    }
    const blocks = this.blocks[name];
    const index =
      blocks.findIndex(
        (block) =>
          current === block ||
          Object.create(current.prototype) instanceof block,
      ) + 1;
    if (index === 0 || index >= blocks.length) {
      return this.environment.undef(`there is no parent block called ${name}`, {
        name: "super",
      });
    }
    return new BlockReference<IsAsync>({
      name,
      context: this,
      stack: blocks,
      depth: index,
    });
  }
  __contains__(key: string): boolean {
    return hasOwn(this.vars, key) || hasOwn(this.parent, key);
  }
  __getitem__(key: string): any {
    const retval = this.resolveOrMissing(key);
    if (retval === MISSING) {
      throw new KeyError(key);
    }
    return retval;
  }
  get(key: string, default_: any = null): any {
    const retval = this.resolveOrMissing(key);
    return retval === MISSING ? default_ : retval;
  }
  resolveOrMissing(key: string): any {
    return hasOwn(this.vars, key)
      ? this.vars[key]
      : hasOwn(this.parent, key)
        ? this.parent[key]
        : MISSING;
  }
  resolve(key: string): any {
    const retval = this.resolveOrMissing(key);
    return retval === MISSING ? this.environment.undef({ name: key }) : retval;
  }
  getExported(): Record<string, any> {
    const ret: Record<string, any> = {};
    Object.entries(this.vars).forEach(([key, value]) => {
      if (this.exportedVars.has(key)) {
        ret[key] = value;
      }
    });
    return ret;
  }
  keys(): string[] {
    return Array.from(Object.keys(this.getAll()));
  }
  values(): string[] {
    return Array.from(Object.values(this.getAll()));
  }
  items(): [string, string][] {
    return Array.from(Object.entries(this.getAll()));
  }
  getAll(): Record<string, any> {
    if (!this.vars) {
      return this.parent;
    } else if (!this.parent) {
      return this.vars;
    } else {
      return Object.assign({}, this.parent, this.vars);
    }
  }

  derived(locals: Record<string, any> = {}): Context<IsAsync> {
    const context = newContext<IsAsync>({
      environment: this.environment,
      name: this.name,
      blocks: {},
      vars: this.getAll(),
      shared: true,
      globals: null,
      locals,
      async: this.async,
    });
    Object.entries(this.blocks).forEach(([key, value]) => {
      context.blocks[key] = [...value];
    });
    context.evalCtx = this.evalCtx;
    return context;
  }

  call(func: NunjucksFunction, args: any[]): any {
    let varargs: any[] = [];
    let kwargs: Record<string, any> = {};
    if (args.length) {
      const kwargsIndex = args.findIndex((o) => isKwargs(o));
      if (kwargsIndex > -1) {
        [kwargs] = args.splice(kwargsIndex, 1);
      }

      const varargsIndex = args.findIndex((o) => isVarargs(o));
      if (varargsIndex > -1) {
        [varargs] = args.splice(varargsIndex, 1);
      }
    }

    const passArg = func.__nunjucksPassArg;
    if (passArg === "context") {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let context: Context<IsAsync> = this;
      if (kwargs._loopVars) {
        context = this.derived(kwargs._loopVars);
      }
      if (kwargs._blockVars) {
        context = this.derived(kwargs._blockVars);
      }
      args.unshift(context);
    } else if (passArg === "evalContext") {
      args.unshift(this.evalCtx);
    } else if (passArg === "environment") {
      args.unshift(this.environment);
    }

    delete kwargs._blockVars;
    delete kwargs._loopVars;

    if (
      func instanceof Macro ||
      Object.prototype.toString.call(func) === "[object Macro]" ||
      func.__nunjucksArgs?.kwargs
    ) {
      if (
        func instanceof Macro ||
        Object.prototype.toString.call(func) === "[object Macro]"
      ) {
        args.push(varargs);
        varargs = [];
      }
      Object.defineProperty(kwargs, "__isKwargs", { value: true });
      args.push(kwargs);
    }
    return func(...args, ...varargs);
  }

  isAsync(): this is Context<true> {
    return this.async;
  }
  isSync(): this is Context<false> {
    return !this.async;
  }
}

/**
 * One block on a template reference.
 */
export class BlockReference<IsAsync extends boolean> extends Function {
  name: string;
  _context: Context<IsAsync>;
  _stack: Block<IsAsync>[];
  _depth: number;
  async: IsAsync;

  constructor({
    name,
    context,
    stack,
    depth,
  }: {
    name: string;
    context: Context<IsAsync>;
    stack: Block<IsAsync>[];
    depth: number;
  }) {
    super();
    this.name = name;
    this._context = context;
    this._stack = stack;
    this._depth = depth;
    this.async = context.async;

    return new Proxy(this, {
      apply: (target, thisArg, argArray) =>
        target.__call__.apply(this, argArray),
    });
  }
  __call__(): IfAsync<IsAsync, Promise<string>, string> {
    // TODO: if self._context.eval_ctx.autoescape:
    if (this.async) {
      return (async () => {
        const ret: string[] = [];
        const context = this._context as Context<true>;
        const block = this._stack[this._depth] as Block<true>;
        for await (const x of block(context)) {
          ret.push(x);
        }
        return concat(ret);
      })() as IfAsync<IsAsync, Promise<string>, string>;
    } else {
      const ret: string[] = [];
      const context = this._context as Context<false>;
      const block = this._stack[this._depth] as Block<false>;
      for (const x of block(context)) {
        ret.push(x);
      }
      return concat(ret) as IfAsync<IsAsync, Promise<string>, string>;
    }
  }

  super(): BlockReference<IsAsync> | Undefined {
    if (!this._stack || this._depth + 1 >= this._stack.length) {
      return this._context.environment.undef(
        `there is no parent block called ${this.name}.`,
        { name: "super" },
      );
    }
    return new BlockReference({
      name: this.name,
      context: this._context,
      stack: this._stack,
      depth: this._depth + 1,
    });
  }
}

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

/*
def markup_join(seq: t.Iterable[t.Any]) -> str:
    """Concatenation that escapes if necessary and converts to string."""
    buf = []
    iterator = map(soft_str, seq)
    for arg in iterator:
        buf.append(arg)
        if hasattr(arg, "__html__"):
            return Markup("").join(chain(buf, iterator))
    return concat(buf)
*/

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

export { concat, LoopContext };

export function str(o: unknown): string {
  if (Array.isArray(o) || isPlainObject(o)) {
    // Roughly resembles python repr
    try {
      return JSON.stringify(o, null, 1)
        .replace(/^ +/gm, " ")
        .replace(/\n/g, "")
        .replace(/{ /g, "{")
        .replace(/ }/g, "}")
        .replace(/\[ /g, "[")
        .replace(/ \]/g, "]")
        .replace(/\\([\s\S])|(')/g, "\\$1$2")
        .replace(/\\([\s\S])|(")/g, (match, p1, p2) =>
          p2 ? "'" : match === '\\"' ? '"' : match,
        );
    } catch (e) {
      // do nothing
    }
  }
  return copySafeness(o, `${o}`);
}

function call(func: (...args: any[]) => any, args: any[]) {
  return func(...args);
}

function test(obj: unknown): boolean {
  if (obj instanceof Undefined || obj === MISSING) return false;
  return !!obj;
}

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  '"': "&#34;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};

const escapeRegex = new RegExp(
  `[${[...Object.keys(escapeMap)].join("")}]`,
  "g",
);

export function isMarkup(obj: unknown): obj is MarkupType {
  return (
    Object.prototype.toString.call(obj) === "[object String]" &&
    !!(obj as any).__isMarkup
  );
}

export function escape(obj: unknown): MarkupType {
  if (isMarkup(obj)) return obj;
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const s = obj === null || obj === undefined ? "" : `${obj}`;
  return markSafe(
    s.replace(escapeRegex, (c) => (c in escapeMap ? escapeMap[c] : c)),
  );
}

export function markSafe(s: unknown) {
  return new Markup(s) as MarkupType;
}

export class Markup extends String {
  val: string;
  __isMarkup: true;

  constructor(value: unknown) {
    if (
      value &&
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      hasOwn(value, "__html__") &&
      typeof value.__html__ === "function"
    ) {
      value = value.__html__();
    }
    const val = `${value}`;
    super(val);
    this.val = val;
    this.__isMarkup = true;
  }

  concat(...strings: (string | Markup)[]): MarkupType {
    const args: string[] = [];
    for (const s of strings) {
      if (isMarkup(s)) {
        args.push(`${s}`);
      } else {
        args.push(`${escape(s)}`);
      }
    }
    return markSafe(super.concat(...args));
  }
  split(
    separator:
      | string
      | RegExp
      | {
          [Symbol.split](string: string, limit?: number | undefined): string[];
        },
    limit?: number | undefined,
  ): MarkupType[] {
    const ret =
      typeof separator === "string"
        ? super.split(separator, limit)
        : separator instanceof RegExp
          ? super.split(separator, limit)
          : typeof separator === "object" && Symbol.split in separator
            ? super.split(separator, limit)
            : super.split(`${separator}`, limit);

    return ret.map((s) => markSafe(s));
  }
  slice(start?: number | undefined, end?: number | undefined): MarkupType {
    return markSafe(super.slice(start, end));
  }
  substring(start: number, end?: number | undefined): MarkupType {
    return markSafe(super.substring(start, end));
  }
  toUpperCase(): MarkupType {
    return markSafe(super.toUpperCase());
  }
  toLowerCase(): MarkupType {
    return markSafe(super.toLowerCase());
  }
  trim(): MarkupType {
    return markSafe(super.trim());
  }
  trimStart(): MarkupType {
    return markSafe(super.trimStart());
  }
  trimEnd(): MarkupType {
    return markSafe(super.trimEnd());
  }
  repeat(count: number): MarkupType {
    return markSafe(super.repeat(count));
  }
  charAt(pos: number): MarkupType {
    return markSafe(super.charAt(pos));
  }
  padStart(maxLength: number, padString?: string | undefined): MarkupType {
    return markSafe(super.padStart(maxLength, padString));
  }
  padEnd(maxLength: number, padString?: string | undefined): MarkupType {
    return markSafe(super.padEnd(maxLength, padString));
  }

  replace(...args: unknown[]): MarkupType {
    return markSafe(
      super.replace.apply(
        this,
        args.map((arg) => escape(arg)),
      ),
    );
  }
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

function* enumerate<T>(iter: Iterable<T>, offset = 0): Generator<[number, T]> {
  let i = offset;
  for (const item of iter) {
    yield [i, item];
    i++;
  }
}

function* arrayslice<T>(
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

export type MarkupType = Markup & string;

export function copySafeness<T>(src: unknown, dest: T): T | MarkupType {
  return isMarkup(src) ? markSafe(dest) : dest;
}

// export const Markup = _Markup as unknown as (String & string) & {
//   constructor(value: unknown): _Markup;
// };
// export type Markup = typeof Markup;

export function setAdd<T>(set: Set<T>, ...values: T[]): void {
  values.forEach((value) => set.add(value));
}

export function setDelete<T>(set: Set<T>, ...values: T[]): void {
  values.forEach((value) => set.delete(value));
}

export class TemplateRuntimeError extends Error {
  name = "TemplateRuntimeError";
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

export { arrayFromAsync };

import { KeyError } from "./exceptions";
import { NunjucksFunction, isVarargs, isKwargs, hasOwn, concat } from "./utils";
import type { IfAsync, IEnvironment } from "./types";

import { Macro } from "./macro";
import { MISSING, Undefined } from "./undef";

export type Block<IsAsync extends boolean> = IsAsync extends true
  ? (context: Context<IsAsync>) => AsyncGenerator<string> | Generator<string>
  : (context: Context<IsAsync>) => Generator<string>;

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
  environment: IEnvironment<IsAsync>;
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
  environment: IEnvironment<IsAsync>;
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
    environment: IEnvironment<IsAsync>;
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
  environment: IEnvironment<IsAsync>;
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
    environment: IEnvironment<IsAsync>;
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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { LRUCache } from "lru-cache";
import { EventEmitter } from "events";
import {
  Context,
  EvalContext,
  hasOwn,
  newContext,
  TemplateRuntimeError,
  Undefined,
  MISSING,
  UndefinedOpts,
} from "@nunjucks/runtime";
import { types } from "@nunjucks/ast";
import { parse } from "@nunjucks/parser";
import { CodeGenerator } from "@nunjucks/compiler";
import { Template, TemplateNotFound } from "./template";
// import { generate } from "astring";
import generate from "@babel/generator";
import { RenderFunc } from "./template";
import type { Loader, AsyncLoader, SyncLoader } from "./loaders";
import { asyncFind, chainMap, mapFind } from "./utils";
import DEFAULT_FILTERS from "./filters"

type ParserOptions = {
  blockStart: string;
  blockEnd: string;
  variableStart: string;
  variableEnd: string;
  commentStart: string;
  commentEnd: string;
  lineStatementPrefix: string | null;
  lineCommentPrefix: string | null;
  trimBlocks: boolean;
  lstripBlocks: boolean;
  newlineSequence: "\n" | "\r\n" | "\r";
  keepTrailingNewline: boolean;
};

type Filter = (...args: any[]) => any;
type Test = (...args: any[]) => boolean;

const DEFAULT_TESTS: Record<string, Test> = {
  defined(value: any) {
    return !(value instanceof Undefined) && value !== MISSING;
  },
};
const DEFAULT_NAMESPACE: Record<string, any> = {};

const PASS_ARG_EVAL_CONTEXT = Symbol.for("PASS_ARG_EVAL_CONTEXT");
const PASS_ARG_CONTEXT = Symbol.for("PASS_ARG_CONTEXT");
const PASS_ARG_ENVIRONMENT = Symbol.for("PASS_ARG_ENVIRONMENT");


// const nativeFunc = "[native code] }";
// const nativeFuncLength = nativeFunc.length;
//
// /** Check if the given function is a native function */
// function isNativeFunction(f: any): f is Function {
//   if (typeof f !== "function") {
//     return false;
//   }
//   return (
//     Function.prototype.toString.call(f).slice(-nativeFuncLength) === nativeFunc
//   );
// }
//
// // eslint-disable-next-line @typescript-eslint/ban-types
// function getNativePrototype(obj: unknown): {} | undefined {
//   let current: unknown = obj;
//   while ((current = Object.getPrototypeOf(obj))) {
//     if (isNativeFunction(current.constructor)) return current;
//   }
// }

function undef(opts?: UndefinedOpts): Undefined;
function undef(
  hint?: string | null,
  obj?: any,
  name?: string | null,
  exc?: new (message?: string) => Error
): Undefined;
function undef(
  arg1?: UndefinedOpts | string | null,
  ...args: any[]
): Undefined {
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
  return new Undefined(opts);
}

const _undef = undef;

// const cache = new LRUCache({ max: 200 });

// eslint-disable-next-line @typescript-eslint/ban-types
function createCache<V extends {}>({
  maxSize,
}: {
  maxSize: number;
}): null | Record<PropertyKey, V | undefined> {
  if (maxSize < 0) {
    return null;
  } else if (maxSize === 0) {
    return {};
  } else {
    return new Proxy(new LRUCache<PropertyKey, V>({ max: maxSize }), {
      get(target, prop): V | undefined {
        return target.get(prop);
      },
      set(target, prop, newValue) {
        target.set(prop, newValue);
        return true;
      },
    }) as unknown as Record<PropertyKey, V | undefined>;
  }
}

export class Environment<
  IsAsync extends boolean = boolean,
> extends EventEmitter {
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  async: IsAsync;
  parserOpts: ParserOptions;
  filters: Record<string, Filter>;
  tests: Record<string, Test>;
  globals: Record<string, any>;
  undef: typeof _undef;
  contextClass: typeof Context = Context;
  templateClass: typeof Template = Template;
  codeGeneratorClass: typeof CodeGenerator = CodeGenerator;

  /**
   * if this environment is sandboxed.  Modifying this variable won't make
    the environment sandboxed though.  For a real sandboxed environment
    have a look at jinja2.sandbox.  This flag alone controls the code
    generation by the compiler
   */
  sandboxed = false;
  /**
   * True if the environment is just an overlay
   */
  overlayed = false;
  /**
   * the environment this environment is linked to if it is an overlay
   */
  linkedTo: Environment<IsAsync> | null = null;

  shared = false;

  loaders: (IsAsync extends true ? AsyncLoader | SyncLoader : SyncLoader)[];

  cacheSize: number;

  cache: Record<PropertyKey, Template<IsAsync> | undefined> | null;

  constructor({
    autoescape = false,
    async,
    loaders = [],
    parserOpts = {},
    filters = DEFAULT_FILTERS,
    tests = DEFAULT_TESTS,
    globals = DEFAULT_NAMESPACE,
    undef = _undef,
    /**
     *
     * The size of the cache.  Per default this is `400` which means
     * that if more than 400 templates are loaded the loader will clean
     * out the least recently used template.  If the cache size is set to
     * `0` templates are recompiled all the time, if the cache size is
     * `-1` the cache will not be cleaned.
     */
    cacheSize = 400,
  }: {
    async?: IsAsync;
    loaders?: (IsAsync extends true ? AsyncLoader | SyncLoader : SyncLoader)[];
    parserOpts?: Partial<ParserOptions>;
    autoescape?: boolean | ((templateName?: string | null) => boolean);
    filters?: Record<string, Filter>;
    tests?: Record<string, Test>;
    globals?: Record<string, any>;
    undef?: typeof _undef;
    /** foo */
    cacheSize?: number;
  } = {}) {
    super();
    this.async = !!async as IsAsync;
    this.loaders = loaders;
    this.missing = MISSING;
    this.parserOpts = {
      blockStart: "{%",
      blockEnd: "%}",
      variableStart: "{{",
      variableEnd: "}}",
      commentStart: "{#",
      commentEnd: "#}",
      lineStatementPrefix: null,
      lineCommentPrefix: null,
      trimBlocks: false,
      lstripBlocks: false,
      newlineSequence: "\n",
      keepTrailingNewline: false,
      ...parserOpts,
    };
    this.autoescape = autoescape;
    this.filters = filters;
    this.tests = tests;
    this.globals = globals;
    this.undef = undef;
    this.cache = createCache<Template<IsAsync>>({ maxSize: cacheSize });
  }

  isAsync(): this is Environment<true> {
    return this.async;
  }
  isSync(): this is Environment<false> {
    return !this.async;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSafeAttribute(obj: any, attr: any, value: any): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSafeCallable(obj: any): boolean {
    return true;
  }

  _getitem(obj: any, argument: any): any {
    // Handle marksafe values
    if (
      typeof argument === "object" &&
      argument instanceof String &&
      "val" in argument
    ) {
      argument = (argument as any).val;
    }
    const arg = `${argument}`;
    const argInt = !isNaN(parseInt(arg)) ? parseInt(arg) : null;

    // Forbid access to native type prototype properties
    // if (obj) {
    //   const nativeProto = getNativePrototype(obj);
    //   if (nativeProto && arg in nativeProto && !hasOwn(obj, arg)) {
    //     return this.undef({ obj, name: argument });
    //   }
    // }

    if (
      Array.isArray(obj) &&
      typeof argInt === "number" &&
      obj.length > argInt
    ) {
      return obj[argInt];
    }
    if (
      typeof obj === "string" &&
      typeof argInt === "number" &&
      obj.length > argInt
    ) {
      return obj[argInt];
    }
    if (obj instanceof Map) {
      if (obj.has(argument)) return obj.get(argument);
      if (obj.has(arg)) return obj.get(arg);
    }
    if (
      typeof obj === "function" &&
      arg in obj &&
      !(arg in Function.prototype)
    ) {
      return obj[arg];
    }
    if (
      typeof obj === "object" &&
      obj &&
      Object.prototype.hasOwnProperty.call(obj, "__getitem__") &&
      typeof obj.__getitem__ === "function"
    ) {
      return obj.__getitem__(arg);
    }
    if (typeof obj === "object" && arg in obj && !(arg in Object.prototype)) {
      return obj[arg];
    }
    return this.undef({ obj, name: argument });
  }
  getitem(obj: any, argument: any): any {
    const ret = this._getitem(obj, argument);
    return typeof ret === "function" || ret instanceof Function
      ? ret.bind(obj)
      : ret;
  }
  getattr(obj: any, argument: string): any {
    const ret = this._getitem(obj, argument);
    return typeof ret === "function" || ret instanceof Function
      ? ret.bind(obj)
      : ret;
  }
  _filterTestCommon({
    name,
    value,
    args = [],
    kwargs = {},
    context,
    evalCtx,
    isFilter,
  }: {
    name: string | Undefined;
    value: any;
    args?: any[];
    kwargs?: Record<string, any>;
    context?: Context<IsAsync>;
    evalCtx?: EvalContext<IsAsync>;
    isFilter: boolean;
  }): any {
    const envMap = isFilter ? this.filters : this.tests;
    const typeName = isFilter ? "filter" : "test";
    const func = name instanceof Undefined ? undefined : envMap[name];
    if (func === undefined) {
      let msg = `No ${typeName} named ${name}`;
      if (name instanceof Undefined) {
        try {
          name._failWithUndefinedError();
        } catch (e) {
          msg = `${msg} (${e}; did you forget to quote the callable name?)`;
        }
      }
      throw new TemplateRuntimeError(msg);
    }
    args = [value, ...args];
    if (hasOwn(func, "___nunjucksPassArg")) {
      const passArg = func.___nunjucksPassArg;
      if (passArg === PASS_ARG_CONTEXT) {
        if (!context) {
          throw new TemplateRuntimeError(
            `Attempted to invoke a context ${typeName} without context`
          );
        }
        args.unshift(context);
      } else if (passArg === PASS_ARG_EVAL_CONTEXT) {
        if (!evalCtx) {
          if (context) {
            evalCtx = context.evalCtx;
          } else {
            evalCtx = new EvalContext({ environment: this });
          }
        }
        args.unshift(evalCtx);
      } else if (passArg === PASS_ARG_ENVIRONMENT) {
        args.unshift(this);
      }
    }
    if (kwargs) {
      return func(...args, kwargs);
    } else {
      return func(...args);
    }
  }
  parse(
    source: string,
    {
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null }
  ): types.Template {
    return this._parse(source, { name, filename });
    // try {
    //   return this._parse(source, { name, filename });
    // } catch (e) {
    //   if (e instanceof TemplateSyntaxError) {
    //   }
    // }
  }
  _parse(
    source: string,
    {
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null }
  ): types.Template {
    return parse(source, [], this.parserOpts);
  }

  compile(
    source: types.Template | string,
    opts?: { name?: string | null; filename?: string | null; raw?: false }
  ): {
    root: RenderFunc<IsAsync>;
    blocks: Record<string, RenderFunc<IsAsync>>;
  };

  compile(
    source: types.Template | string,
    opts: { name?: string | null; filename?: string | null; raw: true }
  ): string;
  compile(
    source: string | types.Template,
    {
      raw,
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null; raw?: boolean } = {}
  ) {
    let njAst: types.Template;
    if (typeof source === "string") {
      njAst = this._parse(source, { name, filename });
    } else {
      njAst = source;
    }
    const jsSource = this._generate(njAst, { name, filename });
    if (raw) {
      return jsSource;
    } else {
      return this._compile(jsSource, { name, filename });
    }
  }

  _compile(
    source: string,
    {
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null } = {}
  ): {
    root: RenderFunc<IsAsync>;
    blocks: Record<string, RenderFunc<IsAsync>>;
  } {
    return new Function(source)() as {
      root: RenderFunc<IsAsync>;
      blocks: Record<string, RenderFunc<IsAsync>>;
    };
  }

  _generate(
    source: types.Template,
    {
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null } = {}
  ): string {
    const codegen = new CodeGenerator({ environment: this, name, filename });
    const ast = codegen.compile(source);
    const jsSource = generate(ast as any).code;
    return jsSource;
  }

  fromString(source: string): Template<IsAsync> {
    const { root, blocks } = this.compile(source);
    return new Template<IsAsync>({ environment: this, root, blocks });
  }

  _loadTemplate(
    this: Environment<true>,
    name: string,
    opts: { globals?: Record<string, any> }
  ): Promise<Template<true>>;

  _loadTemplate(
    this: Environment<false>,
    name: string,
    opts: { globals?: Record<string, any> }
  ): Template<false>;

  _loadTemplate(
    this: Environment<true> | Environment<false>,
    name: string,
    { globals = {} }: { globals?: Record<string, any> } = {}
  ): Template<false> | Promise<Template<true>> {
    if (!this.loaders.length) {
      throw new Error("no loaders for this environment specified");
    }
    if (this.isAsync()) {
      return this._asyncLoadTemplate(name, { globals });
    } else {
      if (this.cache !== null) {
        const template = this.cache[name];
        if (template && template.isUpToDate()) {
          Object.assign(template.globals, globals);
          return template;
        }
      }
      let template: Template<false> | null = null;
      let err: TemplateNotFound | null = null;

      for (const loader of this.loaders) {
        try {
          template = loader.load(this, name, this.makeGlobals(globals));
        } catch (e) {
          if (e instanceof TemplateNotFound) {
            err = e;
            continue;
          } else {
            throw e;
          }
        }
        if (template !== null) break;
      }
      if (template === null) {
        throw err;
      } else {
        return template;
      }
    }
  }

  /**
   * Join a template with the parent.  By default all the lookups are
   * relative to the loader root so this method returns the `template`
   * parameter unchanged, but if the paths should be relative to the
   * parent template, this function can be used to calculate the real
   * template name.
   *
   * Subclasses may override this method and implement template path
   * joining here.
   */
  joinPath(template: string, parent: string): string {
    return template;
  }

  getTemplate(
    this: Environment<true>,
    name: string | Template<true>
  ): Promise<Template<true>>;
  getTemplate(
    this: Environment<false>,
    name: string | Template<false>
  ): Template<false>;

  getTemplate(
    this: Environment<true> | Environment<false>,
    name: string | Template<true> | Template<false>,
    {
      parent = null,
      globals = {},
    }: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    } = {}
  ): Promise<Template<true>> | Template<false> {
    if (this.isSync()) {
      if (name instanceof Template) {
        if (!name.isSync())
          throw new Error("template is async but environment is not");
        return name;
      }
      if (parent !== null) {
        name = this.joinPath(name, parent);
      }
      return this._loadTemplate(name, globals);
    } else {
      if (name instanceof Template && !name.isAsync()) {
        throw new Error("environment is async but template is not");
      }
      return this._asyncGetTemplate(name, parent, globals);
    }
  }

  async _asyncGetTemplate(
    this: Environment<true>,
    name: string | Template<true>,
    parent: string | null = null,
    globals: Record<string, unknown> = {}
  ): Promise<Template<true>> {
    if (name instanceof Template) return name;
    if (parent !== null) name = this.joinPath(name, parent);
    return this._loadTemplate(name, globals);
  }

  /**
   * Make the globals map for a template. Any given template
   * globals overlay the environment :attr:`globals`.
   * Returns a :class:`collections.ChainMap`. This allows any changes
   * to a template's globals to only affect that template, while
   * changes to the environment's globals are still reflected.
   * However, avoid modifying any globals after a template is loaded.
   *
   * o: Object of template-specific globals.
   * @param o
   */
  makeGlobals(o: Record<string, unknown> = {}): Record<string, unknown> {
    return chainMap(o, this.globals);
  }

  async _asyncLoadTemplate(
    this: Environment<true> | Environment<false>,
    name: string,
    { globals }: { globals: Record<string, any> }
  ): Promise<Template<true>> {
    if (!this.isAsync()) {
      throw new Error("_asyncLoadTemplate called on a non-async environment");
    }
    if (this.cache !== null) {
      const template = this.cache[name];
      if (template && (await template.isUpToDate())) {
        Object.assign(template.globals, globals);
        return template;
      }
    }
    const template = await this.loaders
      .map(
        async (loader): Promise<Template<true>> =>
          loader.load(this, name, this.makeGlobals(globals))
      )
      .reduce((p_, p) => p_.catch(() => p));

    if (this.cache) {
      this.cache[name] = template;
    }
    return template;
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from "events";
import {
  Context,
  EvalContext,
  hasOwn,
  TemplateRuntimeError,
  RenderFunc,
  Undefined,
  MISSING,
  UndefinedOpts,
  namespace,
  isUndefinedInstance,
  UndefinedError,
  arrayFromAsync,
  slice,
  asyncSlice,
  range,
  Template,
  TemplateNotFound,
  TemplatesNotFound,
} from "@nunjucks/runtime";
import type { IEnvironment } from "@nunjucks/runtime";
import type { types } from "@nunjucks/ast";

import type { AsyncLoader, SyncLoader } from "./loaders";
import { chainMap, dict, joiner, cycler, lipsum } from "./utils";
import DEFAULT_FILTERS from "./filters";
import DEFAULT_TESTS from "./tests";

type Filter = (...args: any[]) => any;
type Test = (...args: any[]) => boolean;

const DEFAULT_NAMESPACE: Record<string, any> = {
  namespace,
  range,
  dict,
  lipsum,
  cycler,
  joiner,
};

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
// // eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
  exc?: new (message?: string) => Error,
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

export interface TemplateInfo {
  name?: string | null;
  filename?: string | null;
}

export interface EnvironmentBaseOptions<IsAsync extends boolean = boolean> {
  async?: IsAsync;
  loaders?: (IsAsync extends true ? AsyncLoader | SyncLoader : SyncLoader)[];
  autoescape?: boolean | ((templateName?: string | null) => boolean);
  filters?: Record<string, Filter>;
  tests?: Record<string, Test>;
  globals?: Record<string, any>;
  undef?: typeof _undef;
}

/**
 * An Environment class that can execute templates, but is unable to
 * parse and compile them.
 *
 * Used for the nunjucks "slim" package.
 */
export class EnvironmentBase<IsAsync extends boolean = boolean>
  extends EventEmitter
  implements IEnvironment<IsAsync>
{
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  async: IsAsync;
  filters: Record<string, Filter>;
  tests: Record<string, Test>;
  globals: Record<string, any>;
  undef: typeof _undef;
  contextClass: typeof Context = Context;
  templateClass: typeof Template = Template;

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
  linkedTo: EnvironmentBase<IsAsync> | null = null;

  shared = false;

  loaders: (IsAsync extends true ? AsyncLoader | SyncLoader : SyncLoader)[];

  cacheSize: number;

  cache: Record<PropertyKey, Template<IsAsync> | undefined> | null;

  constructor({
    autoescape = false,
    async,
    loaders = [],
    filters = DEFAULT_FILTERS,
    tests = DEFAULT_TESTS,
    globals = {},
    undef = _undef,
  }: EnvironmentBaseOptions<IsAsync> = {}) {
    super();
    this.async = !!async as IsAsync;
    this.loaders = loaders;
    this.missing = MISSING;
    this.autoescape = autoescape;
    this.filters = filters;
    this.tests = tests;
    this.globals = Object.assign({}, DEFAULT_NAMESPACE, globals);
    this.undef = undef;
    this.cache = null;
  }

  isAsync(): this is EnvironmentBase<true> {
    return this.async;
  }
  isSync(): this is EnvironmentBase<false> {
    return !this.async;
  }

  isSafeAttribute(obj: any, attr: any, value: any): boolean {
    return true;
  }

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

    if (typeof argInt === "number" && argInt < 0) {
      if (this.isAsync()) {
        return arrayFromAsync(asyncSlice(obj, argInt)).then((val) => val[0]);
      } else {
        return Array.from(slice(obj, argInt))[0];
      }
    }

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
  _filterTestCommon(
    name: string | Undefined,
    value: any,
    {
      args = [],
      kwargs = {},
      context,
      evalCtx,
      isFilter,
    }: {
      args?: any[];
      kwargs?: Record<string, any>;
      context?: Context<IsAsync>;
      evalCtx?: EvalContext<IsAsync>;
      isFilter: boolean;
    },
  ): any {
    const envMap = isFilter ? this.filters : this.tests;
    const typeName = isFilter ? "filter" : "test";
    const func = name instanceof Undefined ? undefined : envMap[name];
    if (func === undefined) {
      let msg = `No ${typeName} named '${name}' found.`;
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
    if (hasOwn(func, "__nunjucksPassArg")) {
      const passArg = func.__nunjucksPassArg;
      if (passArg === "context") {
        if (!context) {
          throw new TemplateRuntimeError(
            `Attempted to invoke a context ${typeName} without context`,
          );
        }
        args.unshift(context);
      } else if (passArg === "evalContext") {
        if (!evalCtx) {
          if (context) {
            evalCtx = context.evalCtx;
          } else {
            evalCtx = new EvalContext({ environment: this });
          }
        }
        args.unshift(evalCtx);
      } else if (passArg === "environment") {
        args.unshift(this);
      }
    }
    if (kwargs) {
      return func(...args, kwargs);
    } else {
      return func(...args);
    }
  }

  /**
   * Invoke a filter on a value the same way the compiler does.
   */
  callFilter(
    name: string,
    value: unknown,
    {
      args = [],
      kwargs = {},
      context,
      evalCtx,
    }: {
      args?: any[];
      kwargs?: Record<string, any>;
      context?: Context<IsAsync>;
      evalCtx?: EvalContext<IsAsync>;
    } = {},
  ): any {
    return this._filterTestCommon(name, value, {
      args: Object.assign(args, { __isVarargs: true }),
      kwargs: { ...kwargs, __isKwargs: true },
      context,
      evalCtx,
      isFilter: true,
    });
  }

  /**
   * Invoke a test on a value the same way the compiler does.
   */
  callTest(
    name: string,
    value: unknown,
    {
      args = [],
      kwargs = {},
      context,
      evalCtx,
    }: {
      args?: any[];
      kwargs?: Record<string, any>;
      context?: Context<IsAsync>;
      evalCtx?: EvalContext<IsAsync>;
    } = {},
  ): any {
    return this._filterTestCommon(name, value, {
      args: Object.assign(args, { __isVarargs: true }),
      kwargs: { ...kwargs, __isKwargs: true },
      context,
      evalCtx,
      isFilter: false,
    });
  }
  _loadTemplate(
    this: EnvironmentBase<true>,
    name: string,
    opts: { globals?: Record<string, any> },
  ): Promise<Template<true>>;

  _loadTemplate(
    this: EnvironmentBase<false>,
    name: string,
    opts: { globals?: Record<string, any> },
  ): Template<false>;

  _loadTemplate(
    this: EnvironmentBase<true> | EnvironmentBase<false>,
    name: string,
    { globals = {} }: { globals?: Record<string, any> } = {},
  ): Template<false> | Promise<Template<true>> {
    if (!this.loaders.length) {
      throw new Error("no loaders for this environment specified");
    }
    if (this.isAsync()) {
      return this._asyncLoadTemplate(name, { globals });
    } else if (!this.isSync()) {
      throw new Error("unreachable"); // to satisfy typescript
    } else {
      if (this.cache !== null) {
        const template = this.cache[name];
        if (template?.isUpToDate()) {
          Object.assign(template.globals, globals);
          return template;
        }
      }
      let template: Template<false> | null = null;
      let err: TemplateNotFound | null = null;

      for (const loader of this.loaders) {
        try {
          template = loader.load(
            this,
            name,
            this.makeGlobals(globals),
          ) as unknown as Template<false>;
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
        throw err!;
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

  render(
    this: EnvironmentBase<true>,
    name: string,
    context?: Record<string, any>,
  ): Promise<string>;
  render(
    this: EnvironmentBase<false>,
    name: string,
    context?: Record<string, any>,
  ): string;
  render(
    this: EnvironmentBase<IsAsync>,
    name: string,
    context?: Record<string, any>,
  ): Promise<string> | string;
  render(
    name: string,
    context?: Record<string, any>,
    callback?: (err: any, res: string | undefined) => void,
  ): void;
  render(
    name: string,
    callback: (err: any, res: string | undefined) => void,
  ): void;
  render(
    name: string,
    context:
      | Record<string, any>
      | ((err: any, res: string | undefined) => void) = {},
    callback?: (err: any, res: string | undefined) => void,
  ): Promise<string> | string | void {
    if (this.isSync()) {
      const template = this.getTemplate(name);
      return template.render(context, callback);
    } else if (this.isAsync()) {
      let ctx: Record<string, any> = {};
      let cb: ((err: any, res: string | undefined) => void) | undefined =
        callback;
      if (typeof context === "object") {
        ctx = context;
      } else {
        cb = context;
      }
      const promise = (async () => {
        const template = await this.getTemplate(name);
        return template.render(ctx);
      })();
      if (typeof cb === "undefined") {
        return promise;
      } else {
        promise.then(
          (res) => cb(null, res),
          (err) => cb(err, undefined),
        );
      }
    }
  }

  getTemplate(
    this: EnvironmentBase<true>,
    name: string | Template<true> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<Template<true>>;
  getTemplate(
    this: EnvironmentBase<false>,
    name: string | Template<false> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Template<false>;

  getTemplate(
    this: EnvironmentBase<true> | EnvironmentBase<false>,
    name: string | Template<true> | Template<false> | Undefined,
    {
      parent = null,
      globals = {},
    }: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    } = {},
  ): Promise<Template<true>> | Template<false> {
    if (isUndefinedInstance(name)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw name._failWithUndefinedError();
    }
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

  async _asyncSelectTemplate(
    this: EnvironmentBase<true>,
    names:
      | Iterable<string | Template<true>>
      | AsyncIterable<string | Template<true>>,
    {
      parent = null,
      globals = {},
    }: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    } = {},
  ): Promise<Template<true>> {
    const templateNames: (string | Template<true>)[] = [];
    for await (const name of names) {
      templateNames.push(name);
    }
    if (!templateNames.length) {
      throw new TemplatesNotFound(
        [],
        "Tried to select from an empty list of templates.",
      );
    }

    for (let name of templateNames) {
      if (name instanceof Template) {
        return name;
      }
      if (parent !== null) {
        name = this.joinPath(name, parent);
      }
      try {
        return await this._asyncLoadTemplate(name, { globals });
      } catch (err) {
        if (err instanceof TemplateNotFound || err instanceof UndefinedError) {
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new TemplatesNotFound(templateNames as string[]);
  }

  selectTemplate(
    this: EnvironmentBase<true>,
    names:
      | Iterable<string | Template<true>>
      | AsyncIterable<string | Template<true>>
      | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<Template<true>>;
  selectTemplate(
    this: EnvironmentBase<false>,
    names: Iterable<string | Template<false>> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Template<false>;

  selectTemplate(
    names:
      | Iterable<string | Template<true> | Template<false>>
      | Undefined
      | Iterable<string | Template<true>>
      | AsyncIterable<string | Template<true>>,
    {
      parent = null,
      globals = {},
    }: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    } = {},
  ): Template<false> | Promise<Template<true>> {
    if (isUndefinedInstance(names)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw names._failWithUndefinedError();
    } else if (this.isAsync()) {
      return this._asyncSelectTemplate(
        names as
          | Iterable<string | Template<true>>
          | AsyncIterable<string | Template<true>>,
        { parent, globals },
      );
    } else if (!this.isSync()) {
      throw new Error("unreachable");
    }
    const templateNames = [...(names as Iterable<string | Template<false>>)];
    if (!templateNames.length) {
      throw new TemplatesNotFound(
        [],
        "Tried to select from an empty list of templates.",
      );
    }

    for (let name of templateNames) {
      if (name instanceof Template) {
        return name;
      }
      if (parent !== null) {
        name = this.joinPath(name, parent);
      }
      try {
        return this._loadTemplate(name, { globals });
      } catch (err) {
        if (err instanceof TemplateNotFound || err instanceof UndefinedError) {
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new TemplatesNotFound(templateNames as string[]);
  }

  getOrSelectTemplate(
    this: EnvironmentBase<false>,
    templateNameOrList:
      | Iterable<string | Template<false>>
      | Undefined
      | string
      | Template<false>,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Template<false> | Promise<Template<true>>;

  getOrSelectTemplate(
    this: EnvironmentBase<true>,
    templateNameOrList:
      | Iterable<string | Template<true>>
      | Undefined
      | AsyncIterable<string | Template<true>>
      | string
      | Template<true>,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<Template<true>>;

  getOrSelectTemplate(
    templateNameOrList:
      | Iterable<string | Template<true> | Template<false>>
      | Undefined
      | Iterable<string | Template<true>>
      | AsyncIterable<string | Template<true>>
      | string
      | Template<false>
      | Template<true>,
    {
      parent = null,
      globals = {},
    }: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    } = {},
  ): Template<false> | Promise<Template<true>> {
    if (
      typeof templateNameOrList === "string" ||
      isUndefinedInstance(templateNameOrList)
    ) {
      return (this as any).getTemplate(templateNameOrList, { parent, globals });
    }
    return (this as any).selectTemplate(templateNameOrList, {
      parent,
      globals,
    });
  }

  async _asyncGetTemplate(
    this: EnvironmentBase<true>,
    name: string | Template<true>,
    parent: string | null = null,
    globals: Record<string, unknown> = {},
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
    this: EnvironmentBase<true> | EnvironmentBase<false>,
    name: string,
    { globals }: { globals: Record<string, any> },
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
          loader.load(this, name, this.makeGlobals(globals)),
      )
      .reduce((p_, p) => p_.catch(() => p));

    if (this.cache) {
      this.cache[name] = template;
    }
    return template;
  }

  lex(
    _source: string,
    _opts: TemplateInfo,
  ): Iterable<[number, string, string, number, string]> {
    throw new Error("Not implemented in a slim-mode Environment");
  }
  preprocess(_source: string, _info: TemplateInfo): string {
    throw new Error("Not implemented in a slim-mode Environment");
  }
  parse(source: string, _info?: TemplateInfo): types.Template {
    throw new Error("Not implemented in a slim-mode Environment");
  }
  compile(
    source: types.Template | string,
    opts?: TemplateInfo & { raw?: false },
  ): {
    root: RenderFunc<IsAsync>;
    blocks: Record<string, RenderFunc<IsAsync>>;
  };

  compile(
    source: types.Template | string,
    opts: TemplateInfo & { raw: true },
  ): string;
  compile(
    source: string | types.Template,
    opts?: TemplateInfo & { raw?: boolean },
  ): any {
    throw new Error("Not implemented in a slim-mode Environment");
  }
  fromString(
    _source: string,
    _opts?: {
      globals?: Record<string, unknown>;
    },
  ): Template<IsAsync> {
    throw new Error("Not implemented in a slim-mode Environment");
  }
}

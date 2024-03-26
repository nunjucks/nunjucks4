/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from "events";
import { Context, EvalContext, hasOwn } from "@nunjucks/runtime";
import { types } from "@nunjucks/ast";
import { parse } from "@nunjucks/parser";
import { CodeGenerator } from "@nunjucks/compiler";
import { Template } from "./template";
// import { generate } from "astring";
import generate from "@babel/generator";
import { RootRenderFunc } from "./template";

export class Missing {}

export const MISSING = Object.freeze(new Missing());

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

const DEFAULT_FILTERS: Record<string, Filter> = {};
const DEFAULT_TESTS: Record<string, Test> = {
  defined(value: any) {
    return !(value instanceof Undefined) && value !== MISSING;
  },
};
const DEFAULT_NAMESPACE: Record<string, any> = {};

class UndefinedError extends Error {
  name = "UndefinedError";
}

class TemplateRuntimeError extends Error {
  name = "TemplateRuntimeError";
}

const PASS_ARG_EVAL_CONTEXT = Symbol.for("PASS_ARG_EVAL_CONTEXT");
const PASS_ARG_CONTEXT = Symbol.for("PASS_ARG_CONTEXT");
const PASS_ARG_ENVIRONMENT = Symbol.for("PASS_ARG_ENVIRONMENT");

type UndefinedOpts = {
  hint?: string | null;
  obj?: any;
  name?: string | null;
  exc?: new (message?: string) => Error;
};

function getObjectTypeName(obj: unknown) {
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
    exc?: new (message?: string) => Error
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
      set(target) {
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

export class Environment<IsAsync extends boolean> extends EventEmitter {
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  isAsync: IsAsync;
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

  constructor({
    autoescape = false,
    isAsync,
    parserOpts = {},
    filters = DEFAULT_FILTERS,
    tests = DEFAULT_TESTS,
    globals = DEFAULT_NAMESPACE,
    undef = _undef,
  }: {
    isAsync?: IsAsync;
    parserOpts?: Partial<ParserOptions>;
    autoescape?: boolean | ((templateName?: string | null) => boolean);
    filters?: Record<string, Filter>;
    tests?: Record<string, Test>;
    globals?: Record<string, any>;
    undef?: typeof _undef;
  } = {}) {
    super();
    this.isAsync = !!isAsync as IsAsync;
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
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSafeAttribute(obj: any, attr: any, value: any): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSafeCallable(obj: any): boolean {
    return true;
  }

  getitem(obj: any, argument: any): any {
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
    if (typeof obj === "object" && arg in obj && !(arg in Object.prototype)) {
      return obj[arg];
    }
    return this.undef({ obj, name: argument });
  }
  getattr(obj: any, argument: string): any {
    return this.getitem(obj, argument);
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
    if (hasOwn(func, "_nunjucksPassArg")) {
      const passArg = func._nunjucksPassArg;
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
  ): RootRenderFunc<IsAsync>;

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
  ): RootRenderFunc<IsAsync> {
    return new Function(`return ${source}`)() as RootRenderFunc<IsAsync>;
  }

  _generate(
    source: types.Template,
    {
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null } = {}
  ): string {
    const codegen = new CodeGenerator({ environment: this });
    const ast = codegen.compile(source);
    const jsSource = generate(ast as any).code;
    return jsSource;
  }

  fromString(source: string): Template<IsAsync> {
    const template = new Template<IsAsync>({ environment: this });
    template.rootRenderFunc = this.compile(source);
    return template;
  }
}

import { isUndefinedInstance, Undefined } from "./undef";
import { Markup } from "./markup";
import { Block, Context, newContext } from "./context";
import type { IEnvironment, RenderFunc, Callback } from "./types";
import runtime from "./runtime";

interface NewContextOpts {
  vars?: Record<string, any>;
  shared?: boolean;
  locals?: Record<string, any>;
}

const cachedTemplateModule = Symbol("cachedTemplateModule");

export class TemplateNotFound extends Error {
  type = "TemplateNotFound";
  name: string;
  templates: string[];
  constructor(
    name: string | Undefined | null,
    message: string | null = null,
    options?: ErrorOptions,
  ) {
    if (isUndefinedInstance(name)) {
      return name._failWithUndefinedError();
    }
    if (!message) {
      message = name;
    }
    super(message ?? "unknown", options);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TemplateNotFound);
    }
    this.name = name ?? "<unknown>";
    if (name) this.templates = [name];
  }
  get [Symbol.toStringTag]() {
    return "TemplateNotFound";
  }
}

export class TemplatesNotFound extends TemplateNotFound {
  type = "TemplatesNotFound";
  constructor(
    names: (string | Undefined)[] = [],
    message: string | null = null,
  ) {
    const templates = names.map((name) =>
      isUndefinedInstance(name) ? name._undefinedMessage : name,
    );
    if (message === null) {
      message =
        "none of the templates given were found: " + templates.join(", ");
    }
    super(templates?.length ? templates[templates.length - 1] : null, message);
    this.templates = templates;
  }
}

function setDifference<A = any, B = any>(a: Set<A>, b: Set<B>): Set<A> {
  let res: Set<A>;
  if (a.size <= b.size) {
    res = new Set();
    for (const elem of a) {
      if (!b.has(elem as any)) res.add(elem);
    }
  } else {
    res = new Set(a);
    for (const elem of b) {
      res.delete(elem as any);
    }
  }
  return res;
}

export type TemplateOptions<IsAsync extends boolean = boolean> = {
  environment: IEnvironment<IsAsync>;
  globals?: Record<string, any>;
  name?: string | null;
  filename?: string | null;
  blocks?: Record<string, RenderFunc<IsAsync>>;
  root?: RenderFunc<IsAsync>;
  uptodate?: IsAsync extends true
    ? () => Promise<boolean> | boolean
    : () => boolean;
};

export function isTemplate(o: unknown): o is Template<boolean> {
  return (
    !!o &&
    typeof o === "object" &&
    "__nj" in o &&
    Object.prototype.toString.call(o) === "[object Template]"
  );
}

export class Template<IsAsync extends true | false> {
  __nj = true;
  async: IsAsync;
  environment: IEnvironment<IsAsync>;
  // TODO environmentClass: typeof Environment = Environment;
  globals: Record<string, any>;
  name: string | null;
  filename: string | null;
  blocks: Record<string, Block<IsAsync>>;
  _rootRenderFunc: IsAsync extends true
    ? (context: Context<true>) => AsyncGenerator<string>
    : (context: Context<false>) => Generator<string>;
  [cachedTemplateModule]?: IsAsync extends true
    ? Promise<TemplateModule<true>>
    : TemplateModule<false>;
  uptodate?: IsAsync extends true
    ? () => Promise<boolean> | boolean
    : () => boolean;
  compiled = false;

  constructor({
    globals = {},
    name = null,
    filename = null,
    blocks = {},
    environment,
    root,
    uptodate,
  }: TemplateOptions<IsAsync>) {
    this.async = !!environment.isAsync() as IsAsync;
    this.globals = Object.assign({}, globals, environment.globals);
    this.name = name;
    this.filename = filename;
    this.environment = environment;
    this.blocks = Object.fromEntries(
      Object.entries(blocks).map(([name, func]) => [
        name,
        func.bind(null, runtime, environment),
      ]),
    );
    if (root) {
      this.rootRenderFunc = root;
    }
    this.uptodate = uptodate;
  }
  isUpToDate(this: Template<false>): boolean;
  isUpToDate(this: Template<true>): Promise<boolean>;
  isUpToDate(): Promise<boolean> | boolean {
    if (this.isAsync()) {
      return (async () => (this.uptodate ? await this.uptodate() : true))();
    }
    return !this.uptodate ? true : this.uptodate();
  }

  _renderAsync(
    this: Template<true>,
    context: Record<string, any>,
  ): Promise<string>;
  _renderAsync(this: Template<false>, context: Record<string, any>): never;
  _renderAsync(
    this: Template<IsAsync>,
    context: Record<string, any>,
  ): IsAsync extends true ? Promise<string> : never;

  async _renderAsync(context: Record<string, any>): Promise<string> {
    if (!this.isAsync()) {
      throw new Error("_renderAsync called on a non-async template");
    }
    const ctx = this.newContext({ vars: context });
    const gen = this.rootRenderFunc(ctx);
    // eslint-disable-next-line no-useless-catch
    try {
      const ret: string[] = [];
      for await (const s of gen) {
        ret.push(s);
      }
      return ret.join("");
    } catch (e) {
      // TODO this.environment.handleException(e);
      throw e;
    }
  }

  _renderSync(this: Template<false>, context: Record<string, any>): string;
  _renderSync(this: Template<true>, context: Record<string, any>): never;
  _renderSync(context: Record<string, any>): string {
    if (!this.isSync()) {
      throw new Error("_renderSync called on an async template");
    }
    const ctx = this.newContext({ vars: context });

    const gen = this.rootRenderFunc(ctx);

    const ret: string[] = [];
    for (const s of gen) ret.push(s);
    return ret.join("");
  }

  get rootRenderFunc(): IsAsync extends true
    ? (context: Context<true>) => AsyncGenerator<string>
    : (context: Context<false>) => Generator<string> {
    return this._rootRenderFunc;
  }

  set rootRenderFunc(func: RenderFunc<IsAsync>) {
    this._rootRenderFunc = func.bind(
      Object.create(null),
      runtime,
      this.environment,
    );
  }

  render(this: Template<true>, context?: Record<string, any>): Promise<string>;
  render(this: Template<false>, context?: Record<string, any>): string;
  render(
    this: Template<IsAsync>,
    context?: Record<string, any>,
  ): Promise<string> | string;
  render(context?: Record<string, any>, callback?: Callback<string>): void;
  render(callback: Callback<string>): void;
  render(
    context: Record<string, any> | Callback<string> = {},
    callback?: Callback<string>,
  ): Promise<string> | string | void {
    // backwards compat for old-style async callbacks
    if (typeof context === "function") {
      callback = context as Callback<string>;
      context = {};
    }
    if (typeof callback === "function") {
      if (this.isAsync()) {
        this._renderAsync(context).then(
          (res) => callback(undefined, res),
          (err) => callback(err, undefined),
        );
      } else if (this.isSync()) {
        try {
          callback(undefined, this._renderSync(context));
        } catch (err) {
          callback(err, undefined);
        }
      }
      return;
    }
    if (this.isAsync()) {
      return this._renderAsync(context);
    } else if (this.isSync()) {
      return this._renderSync(context);
    } else {
      throw new Error("unreachable");
    }
  }

  newContext(this: Template<true>, opts: NewContextOpts): Context<true>;
  newContext(this: Template<false>, opts: NewContextOpts): Context<false>;
  newContext(
    this: Template<IsAsync>,
    opts: NewContextOpts,
  ): IsAsync extends true ? Context<true> : Context<false>;
  newContext({
    vars = {},
    shared = false,
    locals = {},
  }: NewContextOpts = {}): Context<true | false> {
    return newContext<IsAsync>({
      async: this.async,
      environment: this.environment,
      name: this.name,
      blocks: this.blocks,
      shared,
      vars,
      locals,
      globals: this.globals,
    });
  }
  isSync(): this is Template<false> {
    return !this.environment.isAsync();
  }
  isAsync(): this is Template<true> {
    return !!this.environment.isAsync();
  }

  makeModule(
    this: Template<false>,
    opts?: NewContextOpts,
  ): TemplateModule<false>;
  makeModule(
    this: Template<true>,
    opts?: NewContextOpts,
  ): Promise<TemplateModule<true>>;
  makeModule(
    this: Template<IsAsync>,
    opts?: NewContextOpts,
  ): IsAsync extends true
    ? Promise<TemplateModule<true>>
    : TemplateModule<false>;
  makeModule({ vars = {}, shared = false, locals = {} }: NewContextOpts = {}):
    | TemplateModule<false>
    | Promise<TemplateModule<true>> {
    if (this.isAsync()) {
      const context = this.newContext({ vars, shared, locals });
      return (async () => {
        const bodyStream: string[] = [];
        for await (const s of this.rootRenderFunc(context)) {
          bodyStream.push(s);
        }
        return new TemplateModule<true>({
          template: this,
          context,
          bodyStream,
        });
      })();
    } else if (this.isSync()) {
      const context = this.newContext({ vars, shared, locals });
      return new TemplateModule({ template: this, context });
    } else throw new Error("unreachable");
  }

  _getDefaultModule(
    this: Template<true>,
    ctx?: Context<true>,
  ): Promise<TemplateModule<true>>;
  _getDefaultModule(
    this: Template<false>,
    ctx?: Context<false>,
  ): TemplateModule<false>;
  _getDefaultModule(
    this: Template<IsAsync>,
    ctx?: Context<IsAsync>,
  ): IsAsync extends true
    ? Promise<TemplateModule<true>>
    : TemplateModule<false>;
  _getDefaultModule<IsAsync extends boolean>(
    ctx?: Context<IsAsync>,
  ): Promise<TemplateModule<true>> | TemplateModule<false> {
    if (ctx) {
      const keys = [
        ...setDifference(ctx.globalKeys, new Set(Object.keys(this.globals))),
      ];
      if (keys.length) {
        return this.makeModule({
          vars: Object.fromEntries(keys.map((k) => [k, ctx.parent[k]])),
        });
      }
    }
    return (this[cachedTemplateModule] =
      this[cachedTemplateModule] ?? this.makeModule());
  }

  get module(): IsAsync extends true
    ? Promise<TemplateModule<true>>
    : TemplateModule<false> {
    return this._getDefaultModule();
  }

  static fromNamespace<IsAsync extends boolean>({
    environment,
    namespace: { name = null, filename = null, blocks = {}, root },
    globals,
  }: {
    environment: IEnvironment<IsAsync>;
    namespace: TemplateNamespace<IsAsync>;
    globals: Record<string, any>;
  }): Template<IsAsync> {
    const template = new Template({
      environment,
      globals,
      name,
      filename,
      blocks,
    });
    template.rootRenderFunc = root;
    return template;
  }

  get [Symbol.toStringTag]() {
    return "Template";
  }
}

interface TemplateNamespace<IsAsync extends boolean> {
  name?: string | null;
  filename?: string | null;
  blocks?: Record<string, RenderFunc<IsAsync>>;
  root: RenderFunc<IsAsync>;
}

/**
 * Represents an imported template.  All the exported names of the
 * template are available as attributes on this object.  Additionally
 * converting it into a string renders the contents.
 */
export class TemplateModule<IsAsync extends true | false> {
  __name__: string | null;
  __dict__: Record<string, any>;
  _bodyStream: Iterable<string>;

  constructor(opts: { template: Template<false>; context: Context<false> });

  constructor(opts: {
    template: Template<true>;
    context: Context<true>;
    bodyStream: Iterable<string>;
  });

  constructor({
    template,
    context,
    bodyStream = null,
  }: {
    template: Template<IsAsync>;
    context: Context<IsAsync>;
    bodyStream?: Iterable<string> | null;
  }) {
    if (bodyStream === null) {
      if (!template.isSync() || !context.isSync()) {
        throw new Error(
          [
            "Async mode requires a body stream to be passed to",
            " a template module. Use the async methods of the",
            " API you are using.",
          ].join(""),
        );
      }
      this._bodyStream = [...template.rootRenderFunc(context)];
    } else {
      this._bodyStream = bodyStream;
    }
    this.__dict__ = context.getExported();
    this.__name__ = template.name;

    return new Proxy(this, {
      get(target, propertyKey, receiver) {
        if (Reflect.has(target, propertyKey)) {
          return Reflect.get(target, propertyKey, receiver);
        }
        if (typeof propertyKey === "symbol") return undefined;
        return target.__dict__[propertyKey];
      },
      has(target, propertyKey) {
        return (
          Reflect.has(target, propertyKey) ||
          Object.prototype.hasOwnProperty.call(target.__dict__, propertyKey)
        );
      },
      ownKeys(target) {
        return [
          ...new Set([
            ...Reflect.ownKeys(target),
            ...Reflect.ownKeys(target.__dict__),
          ]),
        ];
      },
      getOwnPropertyDescriptor(target, name) {
        if (Object.prototype.hasOwnProperty.call(target.__dict__, name)) {
          return {
            value: this.get(target, name),
            writable: false,
            configurable: true,
            enumerable: true,
          };
        }
        const descriptor = Reflect.getOwnPropertyDescriptor(target, name);
        return descriptor ? { ...descriptor, writable: false } : descriptor;
      },
    });
  }

  toString(): string {
    return runtime.concat([...this._bodyStream]);
  }

  valueOf(): string {
    return this.toString();
  }

  __html__(): Markup {
    return runtime.markSafe(this.toString());
  }

  get [Symbol.toStringTag]() {
    return "TemplateModule";
  }
}

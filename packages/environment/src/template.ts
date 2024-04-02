import { Environment } from "./environment";
import runtime from "@nunjucks/runtime";
import type { Block } from "@nunjucks/runtime";
import { newContext, Context } from "@nunjucks/runtime";

export type Runtime = typeof runtime;

export type RootRenderFunc<IsAsync extends boolean> = IsAsync extends true
  ? (
      runtime: Runtime,
      environment: Environment<true>,
      context: Context<true>,
    ) => AsyncGenerator<string>
  : (
      runtime: Runtime,
      environment: Environment<false>,
      context: Context<false>,
    ) => Generator<string>;

type NewContextVars = {
  vars?: Record<string, any>;
  shared?: boolean;
  locals?: Record<string, any>;
};

export class Template<IsAsync extends true | false> {
  async: IsAsync;
  environment: Environment<IsAsync>;
  // TODO environmentClass: typeof Environment = Environment;
  globals: Record<string, any>;
  name: string | null;
  filename: string | null;
  blocks: Record<string, Block<IsAsync>>;
  _rootRenderFunc: IsAsync extends true
    ? (context: Context<true>) => AsyncGenerator<string>
    : (context: Context<false>) => Generator<string>;

  compiled = false;

  constructor({
    globals = {},
    name = null,
    filename = null,
    blocks = {},
    environment,
  }: {
    environment: Environment<IsAsync>;
    globals?: Record<string, any>;
    name?: string | null;
    filename?: string | null;
    blocks?: Record<string, Block<IsAsync>>;
  }) {
    this.async = environment.isAsync;
    this.globals = globals;
    this.name = name;
    this.filename = filename;
    this.blocks = blocks;
    this.environment = environment;
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
    try {
      const ret: string[] = [];
      for await (const s of gen) {
        ret.push(s);
      }
      return ret.join("");
    } catch (e) {
      console.log(e);
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

  set rootRenderFunc(func: RootRenderFunc<IsAsync>) {
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
  render(context: Record<string, any> = {}): Promise<string> | string {
    if (this.isAsync()) {
      return this._renderAsync(context);
    } else if (this.isSync()) {
      return this._renderSync(context);
    } else {
      throw new Error("unreachable");
    }
  }

  newContext(this: Template<true>, opts: NewContextVars): Context<true>;
  newContext(this: Template<false>, opts: NewContextVars): Context<false>;
  newContext(
    this: Template<IsAsync>,
    opts: NewContextVars,
  ): IsAsync extends true ? Context<true> : Context<false>;
  newContext({
    vars = {},
    shared = false,
    locals = {},
  }: NewContextVars): Context<true | false> {
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
    return !this.environment.isAsync;
  }
  isAsync(): this is Template<true> {
    return this.environment.isAsync;
  }

  makeModule(
    this: Template<false>,
    opts: NewContextVars,
  ): TemplateModule<false>;
  makeModule(
    this: Template<true>,
    opts: NewContextVars,
  ): Promise<TemplateModule<true>>;
  makeModule({
    vars = {},
    shared = false,
    locals = {},
  }: NewContextVars): TemplateModule<false> | Promise<TemplateModule<true>> {
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
  async: IsAsync;

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
    this.async = context.environment.isAsync;
    if (bodyStream === null) {
      if (!template.isSync() || !context.isSync()) {
        throw new Error(
          [
            "Async mode requires a body stream to be passed to",
            " a template module. Use the async methods of the",
            " API you are using.",
          ].join(""),
        );
      } else {
        this._bodyStream = [...template.rootRenderFunc(context)];
      }
    }
  }
  isSync(): this is TemplateModule<false> {
    return !this.async;
  }
  isAsync(): this is TemplateModule<true> {
    return this.async;
  }
}

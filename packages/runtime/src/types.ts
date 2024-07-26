import { Context, EvalContext, Undefined, UndefinedOpts } from ".";
import { types } from "@nunjucks/ast";
type Filter = (...args: any[]) => any;
type Test = (...args: any[]) => boolean;

export interface ITemplateInfo {
  name?: string | null;
  filename?: string | null;
  state?: string | null;
  raw?: boolean;
}

export type RenderFunc<IsAsync extends boolean> = IsAsync extends true
  ? (
      runtime: any,
      environment: IEnvironment<true>,
      context: Context<true>,
    ) => AsyncGenerator<string>
  : (
      runtime: any,
      environment: IEnvironment<false>,
      context: Context<false>,
    ) => Generator<string>;

export interface ITemplate<IsAsync extends true | false = boolean> {
  async: IsAsync;
  environment: IEnvironment<IsAsync>;
  globals: Record<string, any>;
  name: string | null;
  filename: string | null;
  render(context?: Record<string, any>): Promise<string> | string;
  render(
    context?: Record<string, any>,
    callback?: (err: any, res: string | undefined) => void,
  ): void;
  render(callback: (err: any, res: string | undefined) => void): void;
  isSync(): this is ITemplate<false>;
  isAsync(): this is ITemplate<true>;
}

export interface IEnvironment<IsAsync extends boolean = boolean> {
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  async: IsAsync;
  filters: Record<string, Filter>;
  tests: Record<string, Test>;
  globals: Record<string, any>;
  undef: {
    (opts?: UndefinedOpts): Undefined;
    (
      hint?: string | null,
      obj?: any,
      name?: string | null,
      exc?: new (message?: string) => Error,
    ): Undefined;
  };
  contextClass: typeof Context;
  sandboxed: boolean;
  overlayed: boolean;
  shared: boolean;
  isAsync(): this is IEnvironment<true>;
  isSync(): this is IEnvironment<false>;
  isSafeAttribute(obj: any, attr: any, value: any): boolean;
  isSafeCallable(obj: any): boolean;
  callFilter(
    name: string,
    value: unknown,
    opts?: {
      args?: any[];
      kwargs?: Record<string, any>;
      context?: Context<IsAsync>;
      evalCtx?: EvalContext<IsAsync>;
    },
  ): any;
  callTest(
    name: string,
    value: unknown,
    opts?: {
      args?: any[];
      kwargs?: Record<string, any>;
      context?: Context<IsAsync>;
      evalCtx?: EvalContext<IsAsync>;
    },
  ): any;

  getitem(obj: any, argument: any): any;
  getattr(obj: any, argument: string): any;
  lex(
    source: string,
    opts: ITemplateInfo,
  ): Iterable<[number, string, string, number, string]>;
  preprocess(source: string, info: ITemplateInfo): string;
  parse(source: string, { name, filename }?: ITemplateInfo): types.Template;
  compile(
    source: types.Template | string,
    opts?: ITemplateInfo,
  ): {
    root: RenderFunc<IsAsync>;
    blocks: Record<string, RenderFunc<IsAsync>>;
  };
  compile(source: types.Template | string, opts: ITemplateInfo): string;
  fromString(
    source: string,
    opts?: {
      globals?: Record<string, unknown>;
    },
  ): ITemplate<IsAsync>;
  joinPath(template: string, parent: string): string;
  getTemplate(
    this: IEnvironment<true>,
    name: string | ITemplate<true> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<ITemplate<true>>;
  getTemplate(
    this: IEnvironment<false>,
    name: string | ITemplate<false> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): ITemplate<false>;
  selectTemplate(
    this: IEnvironment<true>,
    names:
      | Iterable<string | ITemplate<true>>
      | AsyncIterable<string | ITemplate<true>>
      | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<ITemplate<true>>;
  selectTemplate(
    this: IEnvironment<false>,
    names: Iterable<string | ITemplate<false>> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): ITemplate<false>;
  getOrSelectTemplate(
    this: IEnvironment<false>,
    ITemplateNameOrList:
      | Iterable<string | ITemplate<false>>
      | Undefined
      | string
      | ITemplate<false>,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): ITemplate<false> | Promise<ITemplate<true>>;
  getOrSelectTemplate(
    this: IEnvironment<true>,
    ITemplateNameOrList:
      | Iterable<string | ITemplate<true>>
      | Undefined
      | AsyncIterable<string | ITemplate<true>>
      | string
      | ITemplate<true>,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<ITemplate<true>>;
  makeGlobals(o?: Record<string, unknown>): Record<string, unknown>;
}

export type UnwrapPromise<T> =
  T extends PromiseLike<infer U> ? UnwrapPromise<U> : T;

export type IfAsync<
  IsAsync extends boolean | undefined,
  A,
  B,
> = IsAsync extends true ? A : B;

export type ConditionalAsync<
  IsAsync extends boolean | undefined,
  T,
> = IsAsync extends true ? (T extends Promise<any> ? T : Promise<T>) : T;

export type PromiseIfAsync<IsAsync extends boolean | undefined> =
  IsAsync extends true ? Promise<any> : any;

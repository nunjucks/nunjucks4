import { Context, EvalContext } from "./context";
import { Undefined, UndefinedOpts } from "./undef";
import type { Template } from "./template";
import { types } from "@nunjucks/ast";
type Filter = (...args: any[]) => any;
type Test = (...args: any[]) => boolean;

export interface NunjuckArgsInfo {
  varNames: string[];
  varargs: boolean;
  kwargs: boolean;
}

declare global {
  interface Function {
    __nunjucksPassArg?: "context" | "evalContext" | "environment";
    __nunjucksArgs?: NunjuckArgsInfo;
  }
}

export type NunjucksFunctionProperties = {
  __nunjucksPassArg?: "context" | "evalContext" | "environment";
  __nunjucksArgs?: NunjuckArgsInfo;
};

export type NunjucksFunction<
  T extends (...args: any[]) => any = (...args: any[]) => any,
> = T & NunjucksFunctionProperties;

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

export interface EnvironmentPolicies {
  "compiler.ascii_str": boolean;
  "urlize.rel": string;
  "urlize.target": string | null;
  "urlize.extra_schemes": string[] | null;
  "truncate.leeway": number;
  "json.stringify_function": ((arg: any) => string) | null;
}

export interface IEnvironment<IsAsync extends boolean = boolean> {
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  async: IsAsync;
  filters: Record<string, Filter>;
  tests: Record<string, Test>;
  globals: Record<string, any>;
  finalize?: NunjucksFunction<(value: any) => any>;
  policies: EnvironmentPolicies;
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
  ): Iterable<[number, number, string, string, number, string]>;
  preprocess(source: string, info: ITemplateInfo): string;
  parse(source: string, opts?: ITemplateInfo): types.Template;
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
  ): Template<IsAsync>;
  joinPath(template: string, parent: string): string;
  getTemplate(
    this: IEnvironment<true>,
    name: string | Template<true> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Promise<Template<true>>;
  getTemplate(
    this: IEnvironment<false>,
    name: string | Template<false> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Template<false>;
  selectTemplate(
    this: IEnvironment<true>,
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
    this: IEnvironment<false>,
    names: Iterable<string | Template<false>> | Undefined,
    opts?: {
      parent?: string | null;
      globals?: Record<string, unknown>;
    },
  ): Template<false>;
  getOrSelectTemplate(
    this: IEnvironment<false>,
    ITemplateNameOrList:
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
    this: IEnvironment<true>,
    ITemplateNameOrList:
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

export type Callback<T = any> = {
  (err: null | undefined, res: T): void;
  (err: Error, res?: undefined | null): void;
};

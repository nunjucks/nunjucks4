import {
  Environment,
  Template,
  FileSystemLoader,
  AsyncFileSystemLoader,
  AsyncLoader,
  SyncLoader,
  WebLoader,
  SyncWebLoader,
  EnvironmentOptions,
} from "@nunjucks/environment";
import runtime from "@nunjucks/runtime";
import { types as nodes, builders } from "@nunjucks/ast";
import { lexer, parse, Parser } from "@nunjucks/parser";
import { TemplateInfo } from "@nunjucks/environment";

const parser: { parse: typeof parse; Parser: typeof Parser } = {
  parse,
  Parser,
};

export {
  Environment,
  runtime,
  nodes,
  builders,
  parser,
  lexer,
  Template,
  FileSystemLoader,
  AsyncFileSystemLoader,
  AsyncLoader,
  SyncLoader,
  SyncLoader as Loader,
};

let e: Environment | undefined = undefined;

export function configure(): Environment<false>;
export function configure<IsAsync extends boolean>(
  opts: EnvironmentOptions<IsAsync>,
): Environment<IsAsync>;
export function configure<IsAsync extends boolean>(
  templatesPath?: string | string[],
  opts?: EnvironmentOptions<IsAsync>,
): Environment<IsAsync>;

export function configure<IsAsync extends boolean>(
  templatesPath?: any,
  opts?: EnvironmentOptions<IsAsync>,
): Environment<IsAsync> {
  let options: EnvironmentOptions<IsAsync> = opts ?? {};
  let paths: string[] = [];
  if (typeof templatesPath === "string") {
    paths = [templatesPath];
  } else if (Array.isArray(templatesPath)) {
    paths = templatesPath;
  } else {
    if (typeof templatesPath === "object") {
      options = templatesPath;
    } else {
      paths = ["."];
    }
  }

  if (typeof options.async === "undefined") {
    options.async = false as IsAsync;
  }

  if (!options.loaders?.length) {
    if (options.async) {
      options.loaders = [new WebLoader(paths) as any];
    } else {
      options.loaders = [new SyncWebLoader(paths)];
    }
  }

  e = new Environment(options);
  return e as Environment<IsAsync>;
}

export function reset() {
  e = undefined;
}

export function render(
  name: string,
  context?: Record<string, any>,
): Promise<string> | string;
export function render(
  name: string,
  context?: Record<string, any>,
  callback?: (err: any, res: string | undefined) => void,
): void;
export function render(
  name: string,
  callback: (err: any, res: string | undefined) => void,
): void;
export function render(
  name: string,
  context:
    | Record<string, any>
    | ((err: any, res: string | undefined) => void) = {},
  callback?: (err: any, res: string | undefined) => void,
): Promise<string> | string | void {
  const env = e ?? configure();
  return env.render(name, context, callback);
}

export function renderString(
  src: string,
  context: Record<string, any>,
  opts?: Partial<TemplateInfo> & { globals?: Record<string, unknown> },
): Promise<string> | string;
export function renderString(
  src: string,
  context: Record<string, any>,
  opts: Partial<TemplateInfo> & { globals?: Record<string, unknown> },
  callback: (err: any, res: string | undefined) => void,
): void;
export function renderString(
  src: string,
  context: Record<string, any>,
  callback: (err: any, res: string | undefined) => void,
): void;
export function renderString(
  src: string,
  context:
    | Record<string, any>
    | ((err: any, res: string | undefined) => void) = {},
  callbackOrOpts: any = {},
  callback?: (err: any, res: string | undefined) => void,
): Promise<string> | string | void {
  const env = e ?? configure();
  return callback
    ? env.renderString(src, context, callbackOrOpts, callback)
    : env.renderString(src, context, callbackOrOpts);
}

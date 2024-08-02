import {
  Environment,
  EnvironmentOptions,
  Extension,
  ExprStmtExtension,
  LoopControlExtension,
} from "@nunjucks/environment";
import {
  FileSystemLoader,
  WebLoader,
  SyncWebLoader,
  SyncLoader,
  AsyncFileSystemLoader,
  NodeResolveLoader,
  ESMImportLoader,
  ObjectSourceLoader,
  SyncLegacyLoaderWrapper,
  AsyncLegacyLoaderWrapper,
} from "@nunjucks/loaders";
export * from "@nunjucks/loaders";
import runtime, {
  Template,
  ITemplateInfo,
  TemplateOptions,
  Callback,
} from "@nunjucks/runtime";
import { types as nodes, builders } from "@nunjucks/ast";
import { lexer, parse, Parser } from "@nunjucks/parser";

const parser: { parse: typeof parse; Parser: typeof Parser } = {
  parse,
  Parser,
};

export type LegacyTemplateSource = { type: "string"; obj: string };

function isLegacyTemplateSource(o: unknown): o is LegacyTemplateSource {
  return (
    !!o &&
    typeof o === "object" &&
    "type" in o &&
    (o.type === "string" || o.type === "code") &&
    "obj" in o
  );
}

class CompatTemplate<
  IsAsync extends boolean = boolean,
> extends Template<IsAsync> {
  constructor(opts: TemplateOptions<IsAsync>);
  constructor(src: string, env?: Environment<IsAsync>, path?: string);
  constructor(
    src: LegacyTemplateSource,
    env?: Environment<IsAsync>,
    path?: string,
  );
  constructor(
    srcOrOpts: TemplateOptions<IsAsync> | LegacyTemplateSource | string,
    legacyEnv?: Environment<IsAsync>,
    legacyPath?: string,
  ) {
    let opts: TemplateOptions<IsAsync>;
    if (isLegacyTemplateSource(srcOrOpts) || typeof srcOrOpts === "string") {
      const env = legacyEnv || new Environment();
      if (
        (typeof srcOrOpts === "object" && (srcOrOpts.type as string)) === "code"
      ) {
        throw new Error(
          "Calling the Template constructor with {type: 'code'} is no longer supported",
        );
      }
      const src = typeof srcOrOpts === "string" ? srcOrOpts : srcOrOpts.obj;
      const { root, blocks } = env.compile(src);
      opts = {
        environment: env,
        root,
        blocks,
        globals: {},
        name: legacyPath,
        filename: legacyPath,
      };
    } else {
      opts = srcOrOpts;
    }
    super(opts);
  }
}

export {
  Environment,
  EnvironmentOptions,
  Extension,
  ExprStmtExtension,
  LoopControlExtension,
  runtime,
  nodes,
  builders,
  parser,
  lexer,
  FileSystemLoader,
  SyncLoader as Loader,
  WebLoader,
  SyncWebLoader,
  AsyncFileSystemLoader,
  NodeResolveLoader,
  ESMImportLoader,
  ObjectSourceLoader,
  SyncLegacyLoaderWrapper,
  AsyncLegacyLoaderWrapper,
  CompatTemplate as Template,
};

let e: Environment<boolean> | undefined = undefined;

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
  callback?: Callback<string>,
): void;
export function render(name: string, callback: Callback<string>): void;
export function render(
  name: string,
  context: Record<string, any> | Callback<string> = {},
  callback?: Callback<string>,
): Promise<string> | string | void {
  const env = e ?? configure();
  return env.render(name, context, callback);
}

export function renderString(
  src: string,
  context: Record<string, any>,
  opts?: Partial<ITemplateInfo> & { globals?: Record<string, unknown> },
): Promise<string> | string;
export function renderString(
  src: string,
  context: Record<string, any>,
  opts: Partial<ITemplateInfo> & { globals?: Record<string, unknown> },
  callback: Callback<string>,
): void;
export function renderString(
  src: string,
  context: Record<string, any>,
  callback: Callback<string>,
): void;
export function renderString(
  src: string,
  context: Record<string, any> | Callback<string> = {},
  callbackOrOpts: any = {},
  callback?: Callback<string>,
): Promise<string> | string | void {
  const env = e ?? configure();
  return callback
    ? env.renderString(src, context, callbackOrOpts, callback)
    : env.renderString(src, context, callbackOrOpts);
}

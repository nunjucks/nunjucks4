/* eslint-disable @typescript-eslint/no-unused-vars */
import { LRUCache } from "lru-cache";
import { EnvironmentBase, EnvironmentBaseOptions, TemplateInfo } from "./base";
import type { IEnvironment, RenderFunc, Callback } from "@nunjucks/runtime";
import { types } from "@nunjucks/ast";
import {
  LexerOptions,
  getLexer,
  Lexer,
  TokenStream,
  Parser,
} from "@nunjucks/parser";
import { CodeGenerator } from "@nunjucks/compiler";
import { Template } from "@nunjucks/runtime";
import generate from "@pregenerator/generator";
import { Extension } from "./extensions";
import {
  AsyncLoader,
  LegacyLoader,
  Loader,
  SyncLoader,
} from "@nunjucks/loaders";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
function createCache<V extends {}>({
  max,
}: {
  max: number;
}): null | Record<PropertyKey, V | undefined> {
  if (max < 0) {
    return null;
  } else if (max === 0) {
    return {};
  } else {
    return new Proxy(new LRUCache<PropertyKey, V>({ max }), {
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
export interface EnvironmentOptions<IsAsync extends boolean = false>
  extends EnvironmentBaseOptions<IsAsync> {
  parserOpts?: Partial<LexerOptions>;
  cacheSize?: number;
  extensions?: (typeof Extension)[];
}

export class Environment<IsAsync extends boolean = false>
  extends EnvironmentBase<IsAsync>
  implements IEnvironment<IsAsync>
{
  parserOpts: Partial<LexerOptions>;
  codeGeneratorClass: typeof CodeGenerator = CodeGenerator;
  extensionsList: Extension[];
  extensions: Record<string, Extension>;

  constructor(
    loader: LegacyLoader<IsAsync> | Loader,
    opts?: EnvironmentOptions<IsAsync>,
  );

  constructor(
    loaders: (LegacyLoader<IsAsync> | Loader)[],
    opts?: EnvironmentOptions<IsAsync>,
  );

  constructor(opts?: EnvironmentOptions<IsAsync>);

  constructor(optsOrLoaders: any, options?: EnvironmentOptions<IsAsync>) {
    super(optsOrLoaders, options);
    const opts: EnvironmentOptions<IsAsync> = options ?? optsOrLoaders;
    this.parserOpts = opts?.parserOpts || {};
    this.extensionsList = (opts?.extensions || []).map((Ext) => new Ext(this));
    this.extensionsList.sort((a, b) => a.priority - b.priority);

    this.extensions = {};

    for (const ext of this.extensionsList) {
      if (ext.identifier) {
        this.extensions[ext.identifier] = ext;
      }
    }

    this.cache = createCache<Template<IsAsync>>({
      max: opts?.cacheSize ?? 400,
    });
  }

  isAsync(): this is Environment<true> {
    return this.async;
  }
  isSync(): this is Environment<false> {
    return !this.async;
  }

  get lexer(): Lexer {
    return getLexer(this.parserOpts);
  }

  lex(
    source: string,
    { name = null, filename = null }: TemplateInfo = {},
  ): Iterable<[number, number, string, string, number, string]> {
    // eslint-disable-next-line no-useless-catch
    try {
      return this.lexer.tokeniter(source, { name, filename });
    } catch (e) {
      // if (e.type === "TemplateSyntaxError") {
      //   this.handleException({ source });
      // }
      throw e;
    }
  }

  preprocess(source: string, info: TemplateInfo): string {
    return this.extensionsList.reduce((s, e) => e.preprocess(s, info), source);
  }

  /**
   * Called by the parser to do the preprocessing and filtering
   * for all the extensions.  Returns a TokenStream.
   */
  _tokenize(
    source: string,
    {
      name = null,
      filename = null,
      state = null,
    }: TemplateInfo & { state?: string | null },
  ): TokenStream {
    source = this.preprocess(source, { name, filename });
    const stream = this.lexer.tokenize(source, { name, filename, state });
    return Object.assign(
      this.extensionsList.reduce((prev, ext) => {
        const stream = ext.filterStream(prev);
        return stream instanceof TokenStream
          ? stream
          : new TokenStream(stream, { name, filename });
      }, stream),
      { str: source },
    );
  }

  parse(
    source: string,
    { name = null, filename = null }: TemplateInfo = {},
  ): types.Template {
    // eslint-disable-next-line no-useless-catch
    try {
      return this._parse(source, { name, filename });
    } catch (e) {
      // if (e.type === "TemplateSyntaxError") {
      //   this.handleException({ source });
      // }
      throw e;
    }
  }

  _parse(
    source: string,
    { name = null, filename = null }: TemplateInfo,
  ): types.Template {
    const parser = Parser.fromEnvironment(this, source, {
      name,
      filename,
    });
    return parser.parse();
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
    {
      raw,
      name = null,
      filename = null,
    }: TemplateInfo & { raw?: boolean } = {},
  ) {
    let njAst: types.Template;
    filename = filename ?? "<template>";
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
    { name = null, filename = null }: TemplateInfo = {},
  ): {
    root: RenderFunc<IsAsync>;
    blocks: Record<string, RenderFunc<IsAsync>>;
  } {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(source)() as {
      root: RenderFunc<IsAsync>;
      blocks: Record<string, RenderFunc<IsAsync>>;
    };
  }

  _generate(
    source: types.Template,
    { name = null, filename = null }: TemplateInfo = {},
  ): string {
    const codegen = new this.codeGeneratorClass({
      environment: this,
      name,
      filename,
    });
    const ast = codegen.compile(source);
    const jsSource = generate(ast as any);
    return jsSource;
  }

  fromString(
    source: string,
    {
      globals,
      name,
      filename,
    }: Partial<TemplateInfo> & { globals?: Record<string, unknown> } = {},
  ): Template<IsAsync> {
    const { root, blocks } = this.compile(source);
    return new Template<IsAsync>({
      environment: this,
      root,
      blocks,
      globals,
      name,
      filename,
    });
  }
  renderString(
    this: Environment<true>,
    src: string,
    context: Record<string, any>,
    opts?: Partial<TemplateInfo> & { globals?: Record<string, unknown> },
  ): Promise<string>;
  renderString(
    this: Environment<false>,
    src: string,
    context: Record<string, any>,
    opts?: Partial<TemplateInfo> & { globals?: Record<string, unknown> },
  ): string;
  renderString(
    this: Environment<IsAsync>,
    src: string,
    context: Record<string, any>,
    opts?: Partial<TemplateInfo> & { globals?: Record<string, unknown> },
  ): Promise<string> | string;
  renderString(
    src: string,
    context: Record<string, any>,
    opts: Partial<TemplateInfo> & { globals?: Record<string, unknown> },
    callback: Callback<string>,
  ): void;
  renderString(
    src: string,
    context: Record<string, any>,
    callback: Callback<string>,
  ): void;
  renderString(
    src: string,
    context: Record<string, any> | Callback<string> = {},
    callbackOrOpts:
      | Callback<string>
      | (Partial<TemplateInfo> & { globals?: Record<string, unknown> }) = {},
    callback?: Callback<string>,
  ): Promise<string> | string | void {
    let cb: Callback<string> | undefined = callback;
    let templateOpts: Partial<TemplateInfo> & {
      globals?: Record<string, unknown>;
    } = {};
    if (typeof callbackOrOpts !== "function") {
      templateOpts = callbackOrOpts;
    } else {
      cb = callbackOrOpts;
    }
    const template = this.fromString(src, templateOpts);

    if (template.isSync()) {
      return template.render(context, cb);
    } else if (template.isAsync()) {
      const promise = template.render(context);
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
}

export { TemplateInfo };

import { Environment } from "./environment";
import { RenderFunc, Template, TemplateNotFound } from "./template";
import * as path from "path";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import EventEmitter from "events";

function splitTemplatePath(template: string): string[] {
  const pieces: string[] = [];
  // on windows, normalize to / path separator
  if (path.sep != "/") {
    template = template.replaceAll(path.sep, "/");
  }
  template.split(/\//g).forEach((piece) => {
    if (piece === "..") throw new TemplateNotFound(template);
  });
  return pieces;
}

export type SyncLoaderSource = {
  source: string;
  filename: string;
  uptodate?: () => boolean;
};

export type AsyncLoaderSource = {
  source: string;
  filename: string;
  uptodate?: (() => boolean) | (() => Promise<boolean> | boolean);
};

export type LoaderSource = SyncLoaderSource | AsyncLoaderSource;

export class BaseLoader extends EventEmitter {
  async: boolean;
  hasSourceAccess = true;
}

export class SyncLoader extends BaseLoader {
  async = false;

  load(
    environment: Environment<true>,
    name: string,
    globals?: Record<string, any>,
  ): Template<true>;
  load(
    environment: Environment<false>,
    name: string,
    globals?: Record<string, any>,
  ): Template<false>;
  load<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
    globals: Record<string, any> = {},
  ): Template<EnvAsync> {
    const { source, filename, uptodate } = this.getSource(environment, name);
    // TODO add compiled code cache?

    const { root, blocks } = environment.compile(source, { name, filename });
    return new Template<EnvAsync>({
      environment,
      globals,
      root,
      name,
      filename,
      blocks,
      uptodate,
    });
  }

  getSource<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
  ): SyncLoaderSource {
    if (!this.hasSourceAccess) {
      throw new Error(
        `${this.constructor.name} cannot provide access to the source`,
      );
    }
    throw new TemplateNotFound(name);
  }
}

export class AsyncLoader extends BaseLoader {
  async = true;

  async load(
    environment: Environment<true>,
    name: string,
    globals: Record<string, any> = {},
  ): Promise<Template<true>> {
    const { source, filename, uptodate } = await this.getSource(
      environment,
      name,
    );
    // TODO add compiled code cache?

    const { root, blocks } = environment.compile(source, { name, filename });
    return new Template({
      environment,
      globals,
      root,
      name,
      filename,
      blocks,
      uptodate,
    });
  }

  async getSource(
    environment: Environment<true>,
    name: string,
  ): Promise<AsyncLoaderSource> {
    if (!this.hasSourceAccess) {
      throw new Error(
        `${this.constructor.name} cannot provide access to the source`,
      );
    }
    throw new TemplateNotFound(name);
  }
}

export type Loader = SyncLoader | AsyncLoader;

export type FileSystemLoaderOpts = {
  watch?: boolean;
  noCache?: boolean;
};

export class FileSystemLoader extends SyncLoader {
  pathsToNames: Record<string, string>;
  noCache: boolean;
  searchPaths: string[];

  constructor(searchPaths: string[], opts: FileSystemLoaderOpts = {}) {
    super();
    if (typeof opts === "boolean") {
      console.log(
        "[nunjucks] Warning: you passed a boolean as the second " +
          "argument to FileSystemLoader, but it now takes an options " +
          "object. See http://mozilla.github.io/nunjucks/api.html#filesystemloader",
      );
    }

    opts = opts || {};
    this.pathsToNames = {};
    this.noCache = !!opts.noCache;

    if (searchPaths) {
      searchPaths = Array.isArray(searchPaths) ? searchPaths : [searchPaths];
      // For windows, convert to forward slashes
      this.searchPaths = searchPaths.map(path.normalize);
    } else {
      this.searchPaths = ["."];
    }

    // TODO: watch
  }

  getSource<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
  ): SyncLoaderSource {
    const pieces = splitTemplatePath(name);

    const filename = this.searchPaths
      .map((p) => path.join(p, ...pieces))
      .find((f) => fs.existsSync(f));

    if (!filename) {
      throw new TemplateNotFound(name);
    }

    const source = fs.readFileSync(filename, { encoding: "utf-8" });

    const { mtime } = fs.statSync(filename);

    const uptodate = () => {
      try {
        return mtime === fs.statSync(filename).mtime;
      } catch (err) {
        return false;
      }
    };

    this.pathsToNames[filename] = name;

    return { source, filename, uptodate };
  }
}

export class AsyncFileSystemLoader extends AsyncLoader {
  pathsToNames: Record<string, string>;
  noCache: boolean;
  searchPaths: string[];

  constructor(searchPaths: string[], opts: FileSystemLoaderOpts = {}) {
    super();
    if (typeof opts === "boolean") {
      console.log(
        "[nunjucks] Warning: you passed a boolean as the second " +
          "argument to FileSystemLoader, but it now takes an options " +
          "object. See http://mozilla.github.io/nunjucks/api.html#filesystemloader",
      );
    }

    opts = opts || {};
    this.pathsToNames = {};
    this.noCache = !!opts.noCache;

    if (searchPaths) {
      searchPaths = Array.isArray(searchPaths) ? searchPaths : [searchPaths];
      // For windows, convert to forward slashes
      this.searchPaths = searchPaths.map(path.normalize);
    } else {
      this.searchPaths = ["."];
    }

    // TODO: watch
  }

  async getSource(
    environment: Environment<true>,
    name: string,
  ): Promise<AsyncLoaderSource> {
    const pieces = splitTemplatePath(name);

    const filenameStats = this.searchPaths.map(
      async (p): Promise<[string, fs.Stats | Record<string, never>]> => {
        const f = path.join(p, ...pieces);
        const stat = await fsPromises
          .stat(f)
          .catch((): Record<string, never> => ({}));
        return [f, stat];
      },
    );
    const [filename, { mtime }] = await filenameStats.reduce((p_, p) =>
      p_.catch(() => p),
    );

    if (!filename) {
      throw new TemplateNotFound(name);
    }

    const source = await fsPromises.readFile(filename, { encoding: "utf-8" });

    const uptodate = async () => {
      try {
        return mtime === (await fsPromises.stat(filename)).mtime;
      } catch (err) {
        return false;
      }
    };

    this.pathsToNames[filename] = name;

    return { source, filename, uptodate };
  }
}

export class ESMImportLoader extends AsyncLoader {
  hasSourceAccess = false;

  async load(
    environment: Environment<true>,
    name: string,
    globals: Record<string, any> = {},
  ): Promise<Template<true>> {
    const { root, blocks } = await import(name);
    return new Template({
      environment,
      globals,
      name,
      root,
      blocks,
    });
  }
}

export class NodeResolveLoader extends SyncLoader {
  hasSourceAccess = false;
  load<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
    globals: Record<string, any> = {},
  ): Template<EnvAsync> {
    let filename: string;
    try {
      filename = require.resolve(name);
    } catch (err) {
      throw new TemplateNotFound(name, undefined, { cause: err });
    }
    // TODO add compiled code cache?
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { root, blocks } = require(name);
    return new Template<EnvAsync>({
      environment,
      globals,
      root,
      name,
      filename,
      blocks,
    });
  }
}

export class NodeResolveSourceLoader extends SyncLoader {
  hasSourceAccess = false;
  getSource<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
  ): SyncLoaderSource {
    let filename: string;
    try {
      filename = require.resolve(name);
    } catch (err) {
      throw new TemplateNotFound(name, undefined, { cause: err });
    }
    const source = fs.readFileSync(filename, { encoding: "utf-8" });

    return { source, filename };
  }
}

type CompiledTemplate<IsAsync extends boolean> = {
  root: RenderFunc<IsAsync>;
  blocks: Record<string, RenderFunc<IsAsync>>;
};

// function compiledTemplateIsAsync(compiled: { root: RenderFunc<boolean>; blocks: Record<string, RenderFunc<boolean>> })

function isAsyncCompiledTemplate(
  obj: CompiledTemplate<true> | CompiledTemplate<false>,
): obj is CompiledTemplate<true> {
  return (
    obj &&
    typeof obj === "object" &&
    Object.prototype.toString.call(obj.root) === "AsyncGeneratorFunction"
  );
}

export class PrecompiledLoader extends SyncLoader {
  compiledTemplates:
    | Record<string, CompiledTemplate<true>>
    | Record<string, CompiledTemplate<false>>;
  constructor(
    compiledTemplates:
      | Record<string, CompiledTemplate<true>>
      | Record<string, CompiledTemplate<false>>,
  ) {
    super();
    this.compiledTemplates = compiledTemplates;
  }
  hasSourceAccess = false;

  load<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
    globals: Record<string, any> = {},
  ): Template<EnvAsync> {
    const compiled = this.compiledTemplates[name];
    if (!compiled) {
      throw new TemplateNotFound(name);
    }
    if (!environment.isAsync() && isAsyncCompiledTemplate(compiled)) {
      throw new Error(
        "Async templates can only be used with an async environment",
      );
    }
    const { root, blocks } = compiled as CompiledTemplate<EnvAsync>;
    return new Template({
      environment,
      globals,
      name,
      root,
      blocks,
    });
  }
}

export class ObjectSourceLoader extends SyncLoader {
  templateSources: Record<string, string>;
  constructor(templateSources: Record<string, string>) {
    super();
    this.templateSources = templateSources;
  }
  hasSourceAccess = true;

  getSource<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
  ): SyncLoaderSource {
    if (!Object.prototype.hasOwnProperty.call(this.templateSources, name)) {
      throw new TemplateNotFound(name);
    }
    const source = this.templateSources[name];

    return { source, filename: name };
  }
}

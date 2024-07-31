import type { IEnvironment } from "@nunjucks/runtime";
import { Template, TemplateNotFound } from "@nunjucks/runtime";
import * as path from "path";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import {
  AsyncLoader,
  AsyncLoaderSource,
  SyncLoader,
  SyncLoaderSource,
} from "./base";

function splitTemplatePath(template: string): string[] {
  const pieces: string[] = [];
  // on windows, normalize to / path separator
  if (path.sep != "/") {
    template = template.replaceAll(path.sep, "/");
  }
  template.split(/\//g).forEach((piece) => {
    if (piece === "..") throw new TemplateNotFound(template);
    pieces.push(piece);
  });
  return pieces;
}

export interface FileSystemLoaderOpts {
  watch?: boolean;
  noCache?: boolean;
}

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
      this.searchPaths = searchPaths.map((p) => path.normalize(p));
    } else {
      this.searchPaths = ["."];
    }

    // TODO: watch
  }

  getSource<EnvAsync extends boolean>(
    environment: IEnvironment<EnvAsync>,
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
      this.searchPaths = searchPaths.map((p) => path.normalize(p));
    } else {
      this.searchPaths = ["."];
    }

    // TODO: watch
  }

  async getSource(
    environment: IEnvironment<true>,
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
    environment: IEnvironment<true>,
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
    environment: IEnvironment<EnvAsync>,
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  hasSourceAccess = true;
  getSource<EnvAsync extends boolean>(
    environment: IEnvironment<EnvAsync>,
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

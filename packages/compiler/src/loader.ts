import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

interface LoaderOpts {
  noCache?: boolean;
}

interface Source {
  src: string;
  path: string;
  noCache: boolean;
}

export class Loader extends EventEmitter {
  resolve(from: string, to: string): string {
    return path.resolve(path.dirname(from), to);
  }

  isRelative(filename: string): boolean {
    return filename.startsWith("./") || filename.startsWith("../");
  }
}

export class FileSystemLoader extends Loader {
  pathsToNames: Record<string, string>;
  noCache: boolean;
  searchPaths: string[];

  constructor(searchPaths?: string | string[], opts?: LoaderOpts) {
    super();
    if (typeof opts === "boolean") {
      console.log(
        "[nunjucks] Warning: you passed a boolean as the second " +
          "argument to FileSystemLoader, but it now takes an options " +
          "object. See http://mozilla.github.io/nunjucks/api.html#filesystemloader",
      );
    }

    opts = opts ?? {};
    this.pathsToNames = {};
    this.noCache = !!opts.noCache;

    if (searchPaths) {
      searchPaths = Array.isArray(searchPaths) ? searchPaths : [searchPaths];
      // For windows, convert to forward slashes
      this.searchPaths = searchPaths.map((p) => path.normalize(p));
    } else {
      this.searchPaths = ["."];
    }
  }

  getSource(name: string): Source | null {
    let fullpath = null;
    const paths = this.searchPaths;

    for (const basePath of paths) {
      const p = path.resolve(basePath, name);

      // Only allow the current directory and anything
      // underneath it to be searched
      if (p.startsWith(basePath) && fs.existsSync(p)) {
        fullpath = p;
        break;
      }
    }

    if (!fullpath) {
      return null;
    }

    this.pathsToNames[fullpath] = name;

    const source = {
      src: fs.readFileSync(fullpath, "utf-8"),
      path: fullpath,
      noCache: this.noCache,
    };
    this.emit("load", name, source);
    return source;
  }
}

export class NodeResolveLoader extends Loader {
  pathsToNames: Record<string, string>;
  noCache: boolean;

  constructor(opts?: LoaderOpts) {
    super();
    opts = opts ?? {};
    this.pathsToNames = {};
    this.noCache = !!opts.noCache;
  }

  getSource(name: string): Source | null {
    // Don't allow file-system traversal
    if (/^\.?\.?(\/|\\)/.test(name)) {
      return null;
    }
    if (/^[A-Z]:/.test(name)) {
      return null;
    }

    let fullpath;

    try {
      fullpath = require.resolve(name);
    } catch (e) {
      return null;
    }

    this.pathsToNames[fullpath] = name;

    const source = {
      src: fs.readFileSync(fullpath, "utf-8"),
      path: fullpath,
      noCache: this.noCache,
    };

    this.emit("load", name, source);
    return source;
  }
}

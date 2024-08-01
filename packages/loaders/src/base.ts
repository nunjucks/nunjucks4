import type { IEnvironment as Environment } from "@nunjucks/runtime";
import { Template, TemplateNotFound } from "@nunjucks/runtime";
import EventEmitter from "events";

export interface SyncLoaderSource {
  source: string;
  filename: string;
  uptodate?: () => boolean;
}

export interface AsyncLoaderSource {
  source: string;
  filename: string;
  uptodate?: (() => boolean) | (() => Promise<boolean> | boolean);
}

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
    globals = Object.assign({}, environment.globals, globals);

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
    globals = Object.assign({}, environment.globals, globals);
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

  // eslint-disable-next-line @typescript-eslint/require-await
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

export type LegacyLoaderSource = {
  src: string;
  path: string;
};

export interface AsyncLegacyLoader {
  async: true;
  getSource(
    name: string,
    callback: (err: Error, res: LegacyLoaderSource | undefined) => void,
  ): void;
}

export interface SyncLegacyLoader {
  async?: false;
  getSource(name: string): LegacyLoaderSource;
}

export type LegacyLoader<IsAsync extends boolean = boolean> =
  IsAsync extends true
    ? AsyncLegacyLoader
    : IsAsync extends false
      ? SyncLegacyLoader
      : AsyncLegacyLoader | SyncLegacyLoader;

export function isAsyncLegacyLoader(o: unknown): o is AsyncLegacyLoader {
  return isLegacyLoader(o) && o.getSource.length === 2;
}

export function isLegacyLoader(o: unknown): o is LegacyLoader {
  return !!o && typeof o === "object" && "getSource" in o && !("load" in o);
}

export function isLoader(o: unknown): o is Loader {
  return !!o && typeof o === "object" && "load" in o && "hasSourceAccess" in o;
}

export class SyncLegacyLoaderWrapper extends SyncLoader {
  hasSourceAccess = true;
  legacyLoader: SyncLegacyLoader;

  constructor(loader: SyncLegacyLoader) {
    super();
    this.legacyLoader = loader;
  }

  getSource<EnvAsync extends boolean>(
    environment: Environment<EnvAsync>,
    name: string,
  ) {
    const { src: source, path: filename } = this.legacyLoader.getSource(name);
    return { source, filename };
  }
}

export class AsyncLegacyLoaderWrapper extends AsyncLoader {
  hasSourceAccess = true;
  legacyLoader: AsyncLegacyLoader;

  constructor(loader: AsyncLegacyLoader) {
    super();
    this.legacyLoader = loader;
  }

  getSource(
    environment: Environment<true>,
    name: string,
  ): Promise<AsyncLoaderSource> {
    return new Promise((resolve, reject) => {
      this.legacyLoader.getSource(name, (err, res) => {
        if (res) {
          const { src: source, path: filename } = res;
          resolve({ source, filename });
        } else {
          reject(err);
        }
      });
    });
  }
}

import fetch from "make-fetch-happen";
import syncFetch from "sync-fetch";
import type { IEnvironment } from "@nunjucks/runtime";
import { TemplateNotFound } from "@nunjucks/runtime";
import {
  AsyncLoader,
  AsyncLoaderSource,
  SyncLoader,
  SyncLoaderSource,
} from "./base";

type Response = typeof fetch extends (...args: any[]) => Promise<infer T>
  ? T
  : never;

type SyncRequestInit = typeof syncFetch extends (
  url: any,
  init?: infer T,
) => any
  ? T
  : never;

export class WebLoader extends AsyncLoader {
  baseUrl: string;
  hasSourceAccess = true;
  requestInit: fetch.FetchOptions;

  DEFAULT_TIMEOUT = 10;

  constructor(
    baseUrl: string | string[],
    opts: Partial<fetch.FetchOptions> = {},
  ) {
    super();

    this.requestInit = {
      cache: "no-cache",
      timeout: this.DEFAULT_TIMEOUT,
      method: "GET",
      ...opts,
    };

    if (
      Array.isArray(baseUrl) &&
      (baseUrl.length !== 1 || typeof baseUrl[0] !== "string")
    ) {
      throw new Error(
        "WebLoader baseUrl must be either a string or an array containing a single string",
      );
    }

    this.baseUrl = Array.isArray(baseUrl) ? baseUrl[0] : baseUrl;
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl = `${this.baseUrl}/`;
    }
  }

  async getSource(
    environment: IEnvironment<true>,
    name: string,
  ): Promise<AsyncLoaderSource> {
    let response: Response;
    const filename = `${this.baseUrl}${name}`;
    try {
      response = await fetch(`${this.baseUrl}${name}`, this.requestInit);
    } catch (err) {
      throw new TemplateNotFound(name, `${err}`, { cause: err });
    }
    if (!response.ok) {
      throw new TemplateNotFound(name, `HTTP error: ${response.status}`);
    }
    const source = await response.text();
    const cacheTime = response.headers.get("X-Local-Cache-Time");

    return {
      source,
      filename,
      uptodate: async () => {
        if (
          this.requestInit.method !== "GET" &&
          this.requestInit.method !== "HEAD"
        )
          return false;

        if (cacheTime === null) return false;

        const newResponse = await fetch(filename, {
          ...this.requestInit,
          method: "HEAD",
          cache: "no-cache",
        });
        const newCacheTime = newResponse.headers.get("X-Local-Cache-Time");
        return newCacheTime === cacheTime;
      },
    };
  }
}
type SyncResponse = ReturnType<typeof syncFetch>;

export class SyncWebLoader extends SyncLoader {
  baseUrl: string;
  hasSourceAccess = true;
  requestInit: SyncRequestInit;

  DEFAULT_TIMEOUT = 10;

  constructor(baseUrl: string | string[], opts: Partial<SyncRequestInit> = {}) {
    super();

    this.requestInit = {
      method: "GET",
      ...opts,
    };

    if (
      Array.isArray(baseUrl) &&
      (baseUrl.length !== 1 || typeof baseUrl[0] !== "string")
    ) {
      throw new Error(
        "WebLoader baseUrl must be either a string or an array containing a single string",
      );
    }

    this.baseUrl = Array.isArray(baseUrl) ? baseUrl[0] : baseUrl;
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl = `${this.baseUrl}/`;
    }
  }

  getSource(
    environment: IEnvironment<boolean>,
    name: string,
  ): SyncLoaderSource {
    let response: SyncResponse;
    const filename = `${this.baseUrl}${name}`;
    try {
      response = syncFetch(`${this.baseUrl}${name}`, this.requestInit);
    } catch (err) {
      throw new TemplateNotFound(name, `${err}`, { cause: err });
    }
    if (!response.ok) {
      throw new TemplateNotFound(name, `HTTP error: ${response.status}`);
    }
    const source = response.text();

    return {
      source,
      filename,
      uptodate: () => false,
    };
  }
}

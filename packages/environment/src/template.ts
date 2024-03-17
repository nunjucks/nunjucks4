import { Environment } from "./environment";
import runtime from "@nunjucks/runtime";
import type { IfAsync, Block } from "@nunjucks/runtime";
import { newContext, Context } from "@nunjucks/runtime";

export type RootRenderFunc<IsAsync extends boolean> = (
  environment: Environment<IsAsync>,
  context: Context<IsAsync>,
  rt: typeof runtime,
  cb?: (val: string | null, err: Error | null) => void
) => IfAsync<IsAsync, AsyncGenerator<string>, Generator<string>>;

export class Template<IsAsync extends boolean> {
  async: IsAsync;
  environment: Environment<IsAsync>;
  // environmentClass: typeof Environment = Environment;
  globals: Record<string, any>;
  name: string | null;
  filename: string | null;
  blocks: Record<string, Block<IsAsync>>;
  rootRenderFunc: RootRenderFunc<IsAsync>;

  compiled = false;

  constructor({
    globals = {},
    name = null,
    filename = null,
    blocks = {},
    environment,
  }: {
    async: IsAsync;
    environment: Environment<IsAsync>;
    globals: Record<string, any>;
    name: string | null;
    filename: string | null;
    blocks: Record<string, Block<IsAsync>>;
  }) {
    this.async = environment.isAsync;
    this.globals = globals;
    this.name = name;
    this.filename = filename;
    this.blocks = blocks;
    this.environment = environment;
  }

  async renderAsync(context: Record<string, any>): Promise<string> {
    const ctx = this.newContext({ vars: context }) as Context<true>;
    const func = this.rootRenderFunc as RootRenderFunc<true>;
    const env = this.environment as Environment<true>;
    const gen = func(env, ctx, runtime);
    try {
      const ret: string[] = [];
      for await (const s of gen) {
        ret.push(s);
      }
      return ret.join("");
    } catch (e) {
      console.log(e);
      // this.environment.handleException(e);
      throw e;
    }
  }

  renderSync(context: Record<string, any>): string {
    if (this.async) {
      throw new Error("renderSync called on async template");
    }
    const ctx = this.newContext({ vars: context }) as Context<false>;
    const func = this.rootRenderFunc as RootRenderFunc<false>;
    const env = this.environment as Environment<false>;
    const gen = func(env, ctx, runtime);

    const ret: string[] = [];
    for (const s of gen) {
      ret.push(s);
    }
    return ret.join("");

    // try {
    //   return Array.from(gen).join("");
    // } catch (e) {
    //   console.log(e);
    //   // this.environment.handleException(e);
    //   throw e;
    // }
  }

  render(
    context: Record<string, any>
  ): IfAsync<IsAsync, Promise<string>, string> {
    return (
      this.async ? this.renderAsync(context) : this.renderSync(context)
    ) as IfAsync<IsAsync, Promise<string>, string>;
  }

  newContext({
    vars = {},
    shared = false,
    locals = {},
  }: {
    vars?: Record<string, any>;
    shared?: boolean;
    locals?: Record<string, any>;
  }) {
    return newContext({
      async: this.async,
      environment: this.environment,
      name: this.name,
      blocks: this.blocks,
      shared,
      vars,
      locals,
      globals: this.globals,
    });
  }
}

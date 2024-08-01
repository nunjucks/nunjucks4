import type {
  RenderFunc,
  IEnvironment as Environment,
} from "@nunjucks/runtime";
import { Template, TemplateNotFound } from "@nunjucks/runtime";
import { SyncLoader } from "./base";

export {
  ObjectSourceLoader,
  SyncLegacyLoaderWrapper,
  AsyncLegacyLoaderWrapper,
} from "./base";

interface CompiledTemplate<IsAsync extends boolean> {
  root: RenderFunc<IsAsync>;
  blocks: Record<string, RenderFunc<IsAsync>>;
}

declare global {
  // eslint-disable-next-line no-var
  var _nunjucksPrecompiled:
    | Record<string, CompiledTemplate<true>>
    | Record<string, CompiledTemplate<false>>;
}

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
  constructor() {
    super();
    this.compiledTemplates = globalThis._nunjucksPrecompiled =
      typeof globalThis._nunjucksPrecompiled === "object"
        ? globalThis._nunjucksPrecompiled
        : {};
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

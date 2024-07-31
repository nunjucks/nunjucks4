import { Environment, EnvironmentOptions } from "@nunjucks/environment/slim";
import { PrecompiledLoader } from "@nunjucks/loaders/precompiled";
import runtime, { Template } from "@nunjucks/runtime";

export { Environment, runtime, Template, PrecompiledLoader };

let e: Environment | undefined = undefined;

export function configure(): Environment<false>;
export function configure<IsAsync extends boolean>(
  opts: EnvironmentOptions<IsAsync>,
): Environment<IsAsync>;
export function configure(opts?: EnvironmentOptions<boolean>): Environment {
  const options: EnvironmentOptions<boolean> = opts ?? {};

  if (typeof options.async === "undefined") {
    options.async = false;
  }

  if (!options.loaders?.length) {
    options.loaders = [new PrecompiledLoader()];
  }

  return new Environment(options);
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

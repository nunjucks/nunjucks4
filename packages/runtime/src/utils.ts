import { str } from ".";

// eslint-disable-next-line @typescript-eslint/ban-types
export function isPlainObject(obj: any): obj is object {
  if (typeof obj !== "object" || obj === null) return false;

  let proto = obj;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }

  return (
    Object.getPrototypeOf(obj) === proto || Object.getPrototypeOf(obj) === null
  );
}

export function hasOwn<K extends string>(
  o: unknown,
  key: K,
): o is Record<K, unknown> {
  return o && Object.prototype.hasOwnProperty.call(o, key);
}
export function identity<T>(val: T): T {
  return val;
}

export interface NunjuckArgsInfo {
  varNames: string[];
  varargs: boolean;
  kwargs: boolean;
}

declare global {
  interface Function {
    __nunjucksPassArg?: "context" | "evalContext" | "environment";
    __nunjucksArgs?: NunjuckArgsInfo;
  }
}

export type NunjucksFunction = ((...args: any[]) => any) & {
  __nunjucksPassArg?: "context" | "evalContext" | "environment";
  __nunjucksArgs?: NunjuckArgsInfo;
};

export function isVarargs(o: unknown): o is any[] & { __isVarargs: true } {
  return Array.isArray(o) && hasOwn(o, "__isVarargs") && !!o.__isVarargs;
}

export function isKwargs(
  o: unknown,
): o is Record<string, any> & { __isKwargs: true } {
  return isPlainObject(o) && hasOwn(o, "__isKwargs") && !!o.__isKwargs;
}

export type PassArg = "context" | "evalContext" | "environment";

export function nunjucksFunction(
  varNames: string[],
  options: {
    kwargs?: boolean;
    varargs?: boolean;
    passArg?: PassArg;
  } = {},
) {
  return function <T extends (...args: unknown[]) => unknown>(func: T): T {
    const wrapper = function wrapper(...posargs: any[]) {
      // shift off the first argument if it is an automatically passed argument
      // (e.g. Context, EvalContext, or Environment)
      const kwargs: Record<string, any> | null = options.kwargs ? {} : null;
      let kwargsArg: Record<string, any> | null = null;
      const kwargsIndex = posargs.findIndex((o) => isKwargs(o));
      if (kwargsIndex > -1) {
        [kwargsArg] = posargs.splice(kwargsIndex, 1);
      }
      let passedArg: any = undefined;
      if (options.passArg) {
        if (options.passArg === "environment" && kwargsArg?.__environment) {
          passedArg = kwargsArg.__environment;
        } else if (options.passArg === "evalContext" && kwargsArg?.__evalCtx) {
          passedArg = kwargsArg.__evalCtx;
        } else {
          passedArg = posargs.shift();
        }
      }
      delete kwargsArg?.__environment;
      delete kwargsArg?.__evalCtx;

      const args: any[] = posargs.slice(0, varNames.length);

      const rest = posargs.slice(varNames.length);

      Object.entries(kwargsArg ?? {}).forEach(([name, value]) => {
        if (name === "__isKwargs") return;
        const index = varNames.indexOf(name);
        if (index >= 0) {
          if (args[index] !== undefined) {
            throw new TypeError(`got multiple values for argument ${name}`);
          }
          args[index] = value;
        } else if (kwargs) {
          kwargs[name] = value;
        } else {
          throw new TypeError(`got an unexpected keyword argument ${name}`);
        }
      });
      if (options.kwargs) {
        args.push({ ...kwargs, __isKwargs: true });
      }
      if (options.varargs) {
        args.push(...rest);
      }

      if (options.passArg) args.unshift(passedArg);

      return func.apply(this, args);
    } as unknown as T;
    wrapper.__nunjucksArgs = {
      kwargs: true,
      varargs: !!options.varargs,
      // singleArgument: !!options.singleArgument,
      varNames,
    };
    if (options.passArg) wrapper.__nunjucksPassArg = options.passArg;
    return wrapper;
  };
}

export function toAscii(obj: string) {
  const res = str(obj);
  let res1 = "";
  for (let i = 0; i < res.length; i++) {
    const cp = res.charCodeAt(i);
    if (cp < 128) {
      res1 += res.charAt(i);
    } else if (cp < 256) {
      res1 += "\\x" + cp.toString(16);
    } else {
      let s = cp.toString(16);
      if (s.length % 2 == 1) {
        s = "0" + s;
      }
      res1 += "\\u" + s;
    }
  }
  return res1;
}

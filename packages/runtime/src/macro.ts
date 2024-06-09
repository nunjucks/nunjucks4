import { Environment } from "@nunjucks/environment";
import { EvalContext, markSafe, MISSING, isVarargs, isKwargs } from ".";
import type { IfAsync } from "./types";

/**
 * Wraps a macro function
 */
export class Macro<IsAsync extends boolean> extends Function {
  _environment: Environment<IsAsync>;
  _func: (...args: any[]) => IfAsync<IsAsync, Promise<string> | string, string>;
  _argCount: number;
  _name: string;
  args: string[];
  catchKwargs: boolean;
  catchVarargs: boolean;
  _caller: boolean;
  explicitCaller: boolean;
  _defaultAutoescape: boolean;

  constructor(
    environment: Environment<IsAsync>,
    func: (...args: any[]) => string,
    name: string,
    args: string[],
    catchKwargs: boolean,
    catchVarargs: boolean,
    caller: boolean,
    defaultAutoescape: boolean,
  ) {
    super();
    this._environment = environment;
    this._func = func;
    this._argCount = args.length + (caller ? 1 : 0);
    this._name = name;
    this.args = args;
    this.catchKwargs = catchKwargs;
    this.catchVarargs = catchVarargs;
    this._caller = caller;
    this.explicitCaller = args.includes("caller");
    this._defaultAutoescape = defaultAutoescape;

    return new Proxy(this, {
      apply(target, thisArg, argArray) {
        return target.__call__(...argArray);
      },
      get(target, prop, receiver) {
        return Reflect.get(target, prop === "name" ? "_name" : prop, receiver);
      },
    });
  }

  get [Symbol.toStringTag]() {
    return "Macro";
  }

  __call__(...args: any[]): IfAsync<IsAsync, Promise<string>, string> {
    let autoescape: boolean = this._defaultAutoescape;
    if (
      args.length &&
      (args[0] instanceof EvalContext ||
        Object.prototype.toString.call(args[0]) == "[object EvalContext]")
    ) {
      autoescape = args[0].autoescape;
      args.shift();
    }
    // const kwargs = args.pop();
    let kwargs = new Map<string, any>();
    let varargs: any[] = [];
    if (args.length) {
      const kwargsIndex = args.findIndex((o) => isKwargs(o));
      if (kwargsIndex > -1) {
        kwargs = new Map(Object.entries(args.splice(kwargsIndex, 1)[0]));
        kwargs.delete("__isKwargs");
      }

      const varargsIndex = args.findIndex((o) => isVarargs(o));
      if (varargsIndex > -1) {
        [varargs] = args.splice(varargsIndex, 1);
      }
    }

    // Try to consume the positional arguments
    const macroArgs = args.splice(0, this._argCount);

    let foundCaller = false;

    if (macroArgs.length === this.args.length) {
      foundCaller = this.args.includes("caller");
    } else {
      // if the number of arguments consumed is not the number of
      // arguments expected we start filling in keyword arguments
      // and defaults.
      const rest = this.args.slice(macroArgs.length);
      for (const name of rest) {
        if (name === "caller") foundCaller = true;
        macroArgs.push(kwargs.has(name) ? kwargs.get(name) : MISSING);
        kwargs.delete(name);
      }
    }

    // it's important that the order of these arguments does not change
    // if not also changed in the compiler's `function_scoping` method.
    // the order is caller, keyword arguments, positional arguments!
    if (this._caller && !foundCaller) {
      if (kwargs.has("caller")) {
        macroArgs.push(kwargs.get("caller"));
        kwargs.delete("caller");
      } else {
        macroArgs.push(
          this._environment.undef("No caller defined", { name: "caller" }),
        );
      }
    }

    if (this.catchKwargs) {
      macroArgs.push(kwargs);
    } else if (kwargs.size) {
      if (kwargs.has("caller")) {
        throw new Error(
          [
            `macro '${this._name}' was invoked with two values for the special caller argument. `,
            `This is most likely a bug.`,
          ].join(""),
        );
      } else {
        const nextKwarg = Array.from(kwargs.keys())[0];
        throw new Error(
          `macro '${this._name}' takes no keyword argument '${nextKwarg}'`,
        );
      }
    }

    if (this.catchVarargs) {
      macroArgs.push([...args.slice(this._argCount), ...varargs]);
    } else if (macroArgs.length > this._argCount) {
      const s = this._argCount == 1 ? "" : "s";
      throw new Error(
        `macro '${this._name}' takes no more than ${this._argCount} argument${s}`,
      );
    }

    return this._invoke(macroArgs, autoescape);
  }
  _invoke(
    args: any[],
    autoescape: boolean,
  ): IfAsync<IsAsync, Promise<string>, string> {
    return (
      this._environment.isAsync()
        ? this._asyncInvoke(args, autoescape)
        : this._syncInvoke(args, autoescape)
    ) as IfAsync<IsAsync, Promise<string>, string>;
  }
  async _asyncInvoke(args: any[], autoescape: boolean): Promise<string> {
    const ret = await this._func.apply(null, args);
    return autoescape ? markSafe(ret) : `${ret}`;
  }
  _syncInvoke(args: any[], autoescape: boolean): string {
    const ret = this._func.apply(null, args);
    return autoescape ? markSafe(ret) : `${ret}`;
  }
}

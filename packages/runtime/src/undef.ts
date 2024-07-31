import { UndefinedError } from "./exceptions";
import { getObjectTypeName } from "./utils";

export class Missing {}

export const MISSING = Object.freeze(new Missing());

export interface UndefinedOpts {
  hint?: string | null;
  obj?: any;
  name?: string | null;
  exc?: new (message?: string) => Error;
}

export class Undefined extends Function {
  undefinedHint: string | null;
  undefinedObj: any;
  undefinedName: string | null;
  undefinedException: new (message?: string) => Error;

  constructor(opts?: UndefinedOpts);
  constructor(
    hint?: string | null,
    obj?: any,
    name?: string | null,
    exc?: new (message?: string) => Error,
  );
  constructor(arg1?: UndefinedOpts | string | null, ...args: any[]) {
    super();
    let opts: UndefinedOpts = {};
    if (
      typeof arg1 === "string" ||
      arg1 === null ||
      typeof arg1 === "undefined"
    ) {
      opts.hint = arg1;
      [opts.obj, opts.name, opts.exc] = args || [];
    } else {
      opts = arg1;
    }
    const { hint, obj, name, exc } = opts;
    this.undefinedHint = hint ?? null;
    this.undefinedObj = obj ?? MISSING;
    this.undefinedName = name ?? null;
    this.undefinedException = exc ?? UndefinedError;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        // In async mode, Undefined values are often awaited. This causes an
        // Object.get for "then" which would prematurely trigger an undefined
        // error if we didn't have special handling here.
        if (prop === "then") return undefined;

        target._failWithUndefinedError();
      },
      has(target, prop) {
        if (Reflect.has(target, prop)) {
          return true;
        }
        return target._failWithUndefinedError();
      },
      set(target, prop, value) {
        if (prop === "__isVarargs" || prop === "__isKwargs") {
          return Reflect.set(target, prop, value);
        }
        return target._failWithUndefinedError();
      },
      apply(target) {
        return target._failWithUndefinedError();
      },
      construct(target) {
        return target._failWithUndefinedError();
      },
    });
  }
  [Symbol.iterator]() {
    return [][Symbol.iterator]();
  }
  [Symbol.toPrimitive]() {
    return "";
  }
  [Symbol.asyncIterator]() {
    return (async function* () {
      /* do nothing */
    })()[Symbol.asyncIterator]();
  }
  toString() {
    return this._failWithUndefinedError();
  }

  valueOf() {
    return this._failWithUndefinedError();
  }

  get [Symbol.toStringTag]() {
    return "Undefined";
  }
  /**
   * Build a message about the undefined value based on how it was accessed.
   */
  get _undefinedMessage(): string {
    if (this.undefinedHint) {
      return this.undefinedHint;
    }
    if (this.undefinedObj === MISSING) {
      return `"${this.undefinedName}" is undefined`;
    }
    if (typeof this.undefinedName !== "string") {
      return `${getObjectTypeName(this.undefinedObj)} has no element "${
        this.undefinedName
      }"`;
    }
    return `${getObjectTypeName(this.undefinedObj)} has no property "${
      this.undefinedName
    }"`;
  }

  _failWithUndefinedError(): never {
    throw new this.undefinedException(this._undefinedMessage);
  }
}

export function isUndefinedInstance(obj: unknown): obj is Undefined {
  if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
    return false;
  }
  if (Object.prototype.toString.call(obj) !== "[object Undefined]")
    return false;
  return "_failWithUndefinedError" in obj;
}

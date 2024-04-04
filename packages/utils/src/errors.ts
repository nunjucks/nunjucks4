export interface TemplateErrorType extends Error {
  cause?: Error;
  lineno?: number;
  colno?: number;
  firstUpdate: boolean;
  Update(path: string): this;
  // new (
  //   message: Error | string,
  //   lineno?: number,
  //   colno?: number
  // ): TemplateErrorType;
}

export interface TemplateErrorConstructor {
  new (
    message: Error | string,
    lineno?: number,
    colno?: number,
  ): TemplateErrorType;
}

type GetStack = () => string | undefined;

const TemplateError = function TemplateError(
  message: Error | string,
  lineno?: number,
  colno?: number,
): TemplateErrorType {
  let err: TemplateErrorType;
  let cause: Error | undefined;
  let msg: string;

  if (message instanceof Error) {
    cause = message;
    msg = `${cause.name}: ${cause.message}`;
  } else {
    msg = message;
  }

  if (Object.setPrototypeOf) {
    err = new Error(msg) as TemplateErrorType;
    Object.setPrototypeOf(err, TemplateError.prototype);
  } else {
    err = this;
    Object.defineProperty(err, "message", {
      enumerable: false,
      writable: true,
      value: msg,
    });
  }

  Object.defineProperty(err, "name", {
    value: "Template render error",
  });

  if (Error.captureStackTrace) {
    Error.captureStackTrace(err, this.constructor);
  }

  let getStack: GetStack;

  if (cause) {
    const stackDescriptor = Object.getOwnPropertyDescriptor(cause, "stack");
    getStack = (stackDescriptor &&
      (stackDescriptor.get || (() => stackDescriptor.value))) as GetStack;
    if (!getStack) {
      getStack = () => (cause ? cause.stack : undefined) as string | undefined;
    }
  } else {
    const stack = new Error(message as string).stack;
    getStack = () => stack;
  }

  Object.defineProperty(err, "stack", {
    get: () => getStack.call(err),
  });

  Object.defineProperty(err, "cause", {
    value: cause,
  });

  err.lineno = lineno;
  err.colno = colno;
  err.firstUpdate = true;

  err.Update = function Update(path: string): TemplateErrorType {
    let msg = "(" + (path || "unknown path") + ")";

    // only show lineno + colno next to path of template
    // where error occurred
    if (this.firstUpdate) {
      if (this.lineno && this.colno) {
        msg += ` [Line ${this.lineno}, Column ${this.colno}]`;
      } else if (this.lineno) {
        msg += ` [Line ${this.lineno}]`;
      }
    }

    msg += "\n ";
    if (this.firstUpdate) {
      msg += " ";
    }

    this.message = msg + (this.message || "");
    this.firstUpdate = false;
    return this;
  };

  return err;
} as any as TemplateErrorConstructor;

if (Object.setPrototypeOf) {
  Object.setPrototypeOf(TemplateError.prototype, Error.prototype);
} else {
  TemplateError.prototype = Object.create(Error.prototype, {
    constructor: {
      value: TemplateError,
    },
  });
}

export { TemplateError };

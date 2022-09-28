import { EventEmitter } from "events";

export const MISSING = Object.freeze(Object.create(null));

type ParserOptions = {
  blockStart: string;
  blockEnd: string;
  variableStart: string;
  variableEnd: string;
  commentStart: string;
  commentEnd: string;
  lineStatementPrefix: string | null;
  lineCommentPrefix: string | null;
  trimBlocks: boolean;
  lstripBlocks: boolean;
  newlineSequence: "\n" | "\r\n" | "\r";
  keepTrailingNewline: boolean;
};

type Filter = (...args: any[]) => any;
type Test = (...args: any[]) => boolean;

const DEFAULT_FILTERS: Record<string, Filter> = {};
const DEFAULT_TESTS: Record<string, Test> = {};
const DEFAULT_NAMESPACE: Record<string, any> = {};

class UndefinedError extends Error {
  name = "UndefinedError";
}

export class Undefined {
  undefinedHint: string | null;
  undefinedObj: any;
  undefinedName: string | null;
  undefinedException: new (message?: string) => Error;

  constructor({
    hint = null,
    exc = UndefinedError,
    obj = MISSING,
    name = null,
  }: {
    hint?: string | null;
    obj?: any;
    name?: string | null;
    exc?: new (message?: string) => Error;
  } = {}) {
    this.undefinedHint = hint;
    this.undefinedObj = obj;
    this.undefinedName = name;
    this.undefinedException = exc;
  }
}

export class Environment extends EventEmitter {
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  isAsync: boolean;
  parserOpts: ParserOptions;
  filters: Record<string, Filter>;
  tests: Record<string, Test>;
  globals: Record<string, any>;
  undef: typeof Undefined;

  constructor({
    autoescape = false,
    isAsync = false,
    parserOpts = {},
    filters = DEFAULT_FILTERS,
    tests = DEFAULT_TESTS,
    globals = DEFAULT_NAMESPACE,
    undef = Undefined,
  }: {
    isAsync?: boolean;
    parserOpts?: Partial<ParserOptions>;
    autoescape?: boolean | ((templateName?: string | null) => boolean);
    filters?: Record<string, Filter>;
    tests?: Record<string, Test>;
    globals?: Record<string, any>;
    undef?: typeof Undefined;
  } = {}) {
    super();
    this.isAsync = isAsync;
    this.missing = MISSING;
    this.parserOpts = {
      blockStart: "{%",
      blockEnd: "%}",
      variableStart: "{{",
      variableEnd: "}}",
      commentStart: "{#",
      commentEnd: "#}",
      lineStatementPrefix: null,
      lineCommentPrefix: null,
      trimBlocks: false,
      lstripBlocks: false,
      newlineSequence: "\n",
      keepTrailingNewline: false,
      ...parserOpts,
    };
    this.autoescape = autoescape;
    this.filters = filters;
    this.tests = tests;
    this.globals = globals;
    this.undef = undef;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSafeAttribute(obj: any, attr: any, value: any): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSafeCallable(obj: any): boolean {
    return true;
  }

  getitem(obj: any, argument: any): any {
    const arg = `${argument}`;
    const Undefined = this.undef;
    if (Array.isArray(obj) && typeof argument === "number") {
      return obj[argument];
    }
    if (obj instanceof Map) {
      return obj.get(argument);
    }
    if (typeof obj !== "object" || obj === null || !(arg in obj)) {
      return new Undefined({ obj, name: argument });
    }
    return obj[arg];
  }
  getattr(obj: any, argument: string): any {
    return this.getitem(obj, argument);
  }
}

import type { Omit } from "./types";
import {
  builtInTypes,
  getFieldNames,
  getFieldValue,
  computeSupertypeLookupTable,
} from "./types";
import { types } from "./index";
import { Path } from "./path";

const hasOwn = Object.prototype.hasOwnProperty;

export interface PathVisitor<S = Record<string, any>> {
  _reusableContextStack: any;
  state: S;
  _methodNameTable: any;
  _shouldVisitComments: any;
  Context: any;
  _visiting: any;
  _changeReported: boolean;
  _abortRequested: boolean;
  visit<T = S>(
    nodeOrPath: types.Node | Path,
    state?: T
  ): any;
  reset(path: Path, state?: S): void;
  visitWithoutReset(path: Path, state?: S): any;
  // AbortRequest: typeof AbortRequest;
  abort(): void;
  visitor: any;
  acquireContext(path: any): any;
  releaseContext(context: any): void;
  reportChanged(): void;
  wasChangeReported(): any;
}

export interface PathVisitorStatics {
  fromMethodsObject<S = Record<string, any>>(
    methods?: import("./gen/visitor").Visitor<S>
  ): Visitor<S>;
  visit<S = Record<string, any>>(
    node: types.Node | Path,
    methods?: import("./gen/visitor").Visitor<S>
  ): any;
}

export interface PathVisitorConstructor<S> extends PathVisitorStatics {
  new (): PathVisitor<S>;
}

export type Visitor<S> = PathVisitor<S>;

export interface VisitorConstructor<S> extends PathVisitorStatics {
  new (): Visitor<S>;
}

export interface VisitorMethods<S> {
  [visitorMethod: string]: (path: Path, state?: S) => any;
}

export interface SharedContextMethods<S> {
  currentPath: any;
  needToCallTraverse: boolean;
  Context: any;
  visitor: any;
  reset(path: any, state?: S): any;
  invokeVisitorMethod(methodName: string): any;
  traverse<T = S>(path: any, newVisitor?: VisitorMethods<T>, state?: T): any;
  visit<T = S>(path: any, newVisitor?: VisitorMethods<T>, state?: T): any;
  reportChanged(): void;
  abort(): void;
}

export interface Context<S>
  extends Omit<PathVisitor<S>, "visit" | "reset" | "reportChanged" | "abort">,
    SharedContextMethods<S> {}

const isArray = builtInTypes.array;
const isObject = builtInTypes.object;
const isFunction = builtInTypes.function;
const assertIsFunction: typeof isFunction["assert"] =
  isFunction.assert.bind(isFunction);

function computeMethodNameTable(visitor: any) {
  const typeNames = Object.create(null);

  for (const methodName in visitor) {
    if (/^visit[A-Z]/.test(methodName)) {
      typeNames[methodName.slice("visit".length)] = true;
    }
  }

  const supertypeTable = computeSupertypeLookupTable(typeNames);
  const methodNameTable = Object.create(null);

  const typeNameKeys = Object.keys(supertypeTable);
  const typeNameCount = typeNameKeys.length;
  for (let i = 0; i < typeNameCount; ++i) {
    const typeName = typeNameKeys[i];
    const methodName = "visit" + supertypeTable[typeName];
    if (isFunction.check(visitor[methodName])) {
      methodNameTable[typeName] = methodName;
    }
  }

  return methodNameTable;
}

interface ObjKeys {
  [key: string]: any;
}

function extend<T extends ObjKeys, U extends ObjKeys>(into: T, from: U): T & U {
  const ret = into as any;
  Object.keys(from).forEach(function (name) {
    ret[name] = from[name];
  });

  return ret as T & U;
}

class AbortRequest {
  cancel?: () => void;
}

export class PathVisitor<S = Record<string, any>> {
  constructor() {
    // Permanent state.
    this._reusableContextStack = [];

    this._methodNameTable = computeMethodNameTable(this);
    this._shouldVisitComments =
      hasOwn.call(this._methodNameTable, "Block") ||
      hasOwn.call(this._methodNameTable, "Line");

    this.Context = makeContextConstructor<S>(this);

    // State reset every time PathVisitor.prototype.visit is called.
    this._visiting = false;
    this._changeReported = false;
    this.state = {} as S;
  }

  get AbortRequest(): typeof AbortRequest {
    return AbortRequest;
  }

  static fromMethodsObject<M = Record<string, any>>(
    methods?: import("./gen/visitor").Visitor<M>
  ): Visitor<M> {
    if (methods instanceof PathVisitor) {
      return methods;
    }

    if (!isObject.check(methods)) {
      // An empty visitor?
      return new PathVisitor() as Visitor<M>;
    }

    const Visitor = function Visitor(this: any) {
      if (!(this instanceof Visitor)) {
        throw new Error("Visitor constructor cannot be invoked without 'new'");
      }
      PathVisitor.call(this);
    } as any as VisitorConstructor<M>;

    const Vp = (Visitor.prototype = Object.create(PathVisitor.prototype));
    Vp.constructor = Visitor;

    extend(Vp, methods);
    extend(Visitor, PathVisitor);

    assertIsFunction(Visitor.fromMethodsObject);
    assertIsFunction(Visitor.visit);

    return new Visitor();
  }

  static visit<M = Record<string, any>>(
    nodeOrPath: types.Node | Path,
    methods: import("./gen/visitor").Visitor<M>,
    state?: M
  ): any {
    return PathVisitor.fromMethodsObject<M>(methods).visit(nodeOrPath, state || {});
  }

  visit(
    nodeOrPath: types.Node | Path,
    state?: S
  ): any {
    if (this._visiting) {
      throw new Error(
        "Recursively calling visitor.visit(path) resets visitor state. " +
          "Try this.visit(path) or this.traverse(path) instead."
      );
    }

    if (typeof state !== "undefined") {
      this.state = state;
    }

    // Private state that needs to be reset before every traversal.
    this._visiting = true;
    this._changeReported = false;
    this._abortRequested = false;

    let path: Path;

    if (!(nodeOrPath instanceof Path)) {
      path = new Path({ root: nodeOrPath }, "root").get("root");
    } else {
      path = nodeOrPath;
    }

    // Called with the same arguments as .visit.
    this.reset(path, this.state);

    let root;
    try {
      root = this.visitWithoutReset(path);
    } catch (e) {
      if (e instanceof this.AbortRequest) {
        if (this._abortRequested) {
          root = path.value;
        }
      } else {
        throw e;
      }
    } finally {
      this._visiting = false;
    }

    return root;
  }

  abort(): void {
    this._abortRequested = true;
    const request = new this.AbortRequest();

    // If you decide to catch this exception and stop it from propagating,
    // make sure to call its cancel method to avoid silencing other
    // exceptions that might be thrown later in the traversal.
    request.cancel = () => {
      this._abortRequested = false;
    };

    throw request;
  }

  reset(path: Path, state: S) {
    // Empty stub; may be reassigned or overridden by subclasses.
  }

  visitWithoutReset(path: Path, state?: S) {
    if (this instanceof this.Context) {
      // Since this.Context.prototype === this, there's a chance we
      // might accidentally call context.visitWithoutReset. If that
      // happens, re-invoke the method against context.visitor.
      return this.visitor.visitWithoutReset(path, state || this.state);
    }

    if (!(path instanceof Path)) {
      throw new Error("");
    }

    const value = path.value;

    const methodName =
      value &&
      typeof value === "object" &&
      typeof value.type === "string" &&
      this._methodNameTable[value.type];

    if (methodName) {
      const context = this.acquireContext(path);
      try {
        return context.invokeVisitorMethod(methodName);
      } finally {
        this.releaseContext(context);
      }
    } else {
      // If there was no visitor method to call, visit the children of
      // this node generically.
      return visitChildren(path, this, state || this.state);
    }
  }

  acquireContext(path: Path): Context<S> {
    if (this._reusableContextStack.length === 0) {
      return new this.Context(path);
    }
    return this._reusableContextStack.pop().reset(path);
  }

  releaseContext(context: any): void {
    if (!(context instanceof this.Context)) {
      throw new Error("");
    }
    this._reusableContextStack.push(context);
    context.currentPath = null;
  }

  reportChanged(): void {
    this._changeReported = true;
  }

  wasChangeReported(): boolean {
    return this._changeReported;
  }
}

function visitChildren<S = Record<string, any>>(path: any, visitor: any, state?: S) {
  if (!(path instanceof Path)) {
    throw new Error("");
  }
  if (!(visitor instanceof PathVisitor)) {
    throw new Error("");
  }

  const value = path.value;

  if (isArray.check(value)) {
    path.each((p) => visitor.visitWithoutReset(p, state));
    // path.each(visitor.visitWithoutReset, visitor);
  } else if (!isObject.check(value)) {
    // No children to visit.
  } else {
    const childNames = getFieldNames(value);

    // The .comments field of the Node type is hidden, so we only
    // visit it if the visitor defines visitBlock or visitLine, and
    // value.comments is defined.
    if (
      visitor._shouldVisitComments &&
      value.comments &&
      childNames.indexOf("comments") < 0
    ) {
      childNames.push("comments");
    }

    const childCount = childNames.length;
    const childPaths = [];

    for (let i = 0; i < childCount; ++i) {
      const childName = childNames[i];
      if (!hasOwn.call(value, childName)) {
        value[childName] = getFieldValue(value, childName);
      }
      childPaths.push(path.get(childName));
    }

    for (let i = 0; i < childCount; ++i) {
      visitor.visitWithoutReset(childPaths[i], state);
    }
  }

  return path.value;
}

function makeContextConstructor<S>(visitor: PathVisitor<S>): typeof Context {
  function Context(this: Context<S>, path: Path) {
    if (!(this instanceof Context)) {
      throw new Error("");
    }
    if (!(this instanceof PathVisitor)) {
      throw new Error("");
    }
    if (!(path instanceof Path)) {
      throw new Error("");
    }

    Object.defineProperty(this, "visitor", {
      value: visitor,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    this.currentPath = path;
    this.needToCallTraverse = true;

    Object.seal(this);
  }

  if (!(visitor instanceof PathVisitor)) {
    throw new Error("");
  }

  // Note that the visitor object is the prototype of Context.prototype,
  // so all visitor methods are inherited by context objects.
  const Cp = (Context.prototype = Object.create(visitor));

  Cp.constructor = Context;
  extend(Cp, sharedContextProtoMethods as SharedContextMethods<S>);

  return Context;
}

// Every PathVisitor has a different this.Context constructor and
// this.Context.prototype object, but those prototypes can all use the
// same reset, invokeVisitorMethod, and traverse function objects.
const sharedContextProtoMethods: SharedContextMethods<any> = Object.create(null);

sharedContextProtoMethods.reset = function reset(path, state?: any) {
  if (!(this instanceof this.Context)) {
    throw new Error("");
  }
  if (!(path instanceof Path)) {
    throw new Error("");
  }

  this.currentPath = path;
  this.needToCallTraverse = true;
  this.state = state;

  return this;
};

sharedContextProtoMethods.invokeVisitorMethod = function invokeVisitorMethod(
  methodName
) {
  if (!(this instanceof this.Context)) {
    throw new Error("");
  }
  if (!(this.currentPath instanceof Path)) {
    throw new Error("");
  }

  const result = this.visitor[methodName].call(this, this.currentPath, this.state);

  if (result === false) {
    // Visitor methods return false to indicate that they have handled
    // their own traversal needs, and we should not complain if
    // this.needToCallTraverse is still true.
    this.needToCallTraverse = false;
  } else if (result !== undefined) {
    // Any other non-undefined value returned from the visitor method
    // is interpreted as a replacement value.
    this.currentPath = this.currentPath.replace(result)[0];

    if (this.needToCallTraverse) {
      // If this.traverse still hasn't been called, visit the
      // children of the replacement node.
      this.traverse(this.currentPath);
    }
  }

  if (this.needToCallTraverse !== false) {
    throw new Error(
      "Must either call this.traverse or return false in " + methodName
    );
  }

  const path = this.currentPath;
  return path && path.value;
};

sharedContextProtoMethods.traverse = function traverse(path, newVisitor, state) {
  if (!(this instanceof this.Context)) {
    throw new Error("");
  }
  if (!(path instanceof Path)) {
    throw new Error("");
  }
  if (!(this.currentPath instanceof Path)) {
    throw new Error("");
  }

  this.needToCallTraverse = false;

  return visitChildren(
    path,
    PathVisitor.fromMethodsObject(newVisitor || this.visitor),
    state || this.state
  );
};

sharedContextProtoMethods.visit = function visit(path, newVisitor, state) {
  if (!(this instanceof this.Context)) {
    throw new Error("");
  }
  if (!(path instanceof Path)) {
    throw new Error("");
  }
  if (!(this.currentPath instanceof Path)) {
    throw new Error("");
  }

  this.needToCallTraverse = false;

  return PathVisitor.fromMethodsObject(
    newVisitor || this.visitor
  ).visitWithoutReset(path, state || this.state);
};

sharedContextProtoMethods.reportChanged = function reportChanged(): void {
  this.visitor.reportChanged();
};

sharedContextProtoMethods.abort = function abort(): void {
  this.needToCallTraverse = false;
  this.visitor.abort();
};

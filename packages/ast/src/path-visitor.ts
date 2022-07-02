import { computeSupertypeLookupTable, Omit } from "./types";
import * as n from "./gen/types";
import { Path } from "./path";

export interface PathVisitor<S = Record<string, any>> {
  _reusableContextStack: any;
  state: S;
  _methodNameTable: any;
  Context: any;
  _visiting: any;
  _changeReported: any;
  _abortRequested: boolean;
  visit<T = S>(nodeOrPath: n.Node | Path, state?: T): any;
  reset(path: Path, state?: S): void;
  visitWithoutReset(path: Path, state?: S): any;
  abort(): void;
  visitor: any;
  acquireContext(path: any): any;
  releaseContext(context: any): void;
  reportChanged(): void;
  wasChangeReported(): any;
}

export type Visitor<S = Record<string, any>> = PathVisitor<S>;

export interface VisitorMethods<S> {
  [visitorMethod: string]: (path: Path, state?: S) => any;
}

export interface Context<S = Record<string, any>>
  extends Omit<PathVisitor<S>, "visit" | "reset" | "reportChanged" | "abort"> {
  needToCallTraverse: boolean;
  Context: any;
  visitor: any;
  reset(path: any, state?: S): any;
  invokeVisitorMethod(methodName: string): any;
  traverse<T = S>(path: any, state?: T, newVisitor?: VisitorMethods<T>): any;
  visit<T = S>(path: any, state?: T, newVisitor?: VisitorMethods<T>): any;
  reportChanged(): void;
  abort(): void;
}

function computeMethodNameTable(visitor: any) {
  const typeNames = Object.create(null);

  let methodName;

  for (methodName in visitor) {
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
    methodName = "visit" + supertypeTable[typeName];
    if (typeof visitor[methodName] === "function") {
      methodNameTable[typeName] = methodName;
    }
  }

  return methodNameTable;
}

class AbortRequest {
  cancel?: () => void;
}

export class PathVisitor<S = Record<string, any>> {
  constructor() {
    // Permanent state.
    this._reusableContextStack = [];

    this._methodNameTable = computeMethodNameTable(this);

    this.Context = makeContextConstructor(this);

    // State reset every time PathVisitor.prototype.visit is called.
    this._visiting = false;
    this._changeReported = false;
    this.state = {} as S;
  }

  get AbortRequest(): typeof AbortRequest {
    return AbortRequest;
  }

  static fromMethodsObject<M = Record<string, any>>(
    methods: import("./gen/visitor").Visitor<M>
  ): Visitor<M> {
    if (methods instanceof PathVisitor) {
      return methods;
    }

    if (!methods || typeof methods !== "object") {
      // An empty visitor?
      return new PathVisitor() as Visitor<M>;
    }

    const Visitor = class extends PathVisitor<M> {
      constructor() {
        super();
        Object.assign(this, methods);
        this._methodNameTable = computeMethodNameTable(this);
        this.Context = makeContextConstructor(this);
      }
    };

    return new Visitor();
  }

  static visit<M = Record<string, any>>(
    nodeOrPath: n.Node | Path,
    methods: import("./gen/visitor").Visitor<M>,
    state?: M
  ): any {
    return PathVisitor.fromMethodsObject<M>(methods).visit(
      nodeOrPath,
      state || {}
    );
  }

  visit(nodeOrPath: n.Node | Path, state?: S): any {
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
      path = new Path({ root: nodeOrPath }).get("root");
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
          // If this.visitWithoutReset threw an exception and
          // this._abortRequested was set to true, return the root of
          // the AST instead of letting the exception propagate, so that
          // client code does not have to provide a try-catch block to
          // intercept the AbortRequest exception.  Other kinds of
          // exceptions will propagate without being intercepted and
          // rethrown by a catch block, so their stacks will accurately
          // reflect the original throwing context.
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reset(path: Path, state: S): void {
    // Empty stub; may be reassigned or overridden by subclasses.
  }

  visitWithoutReset(path: Path, state?: S): any {
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
      context.state = this.state;
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
    return this._reusableContextStack.pop().reset(path, this.state);
  }

  releaseContext(context: unknown): void {
    if (!(context instanceof this.Context)) {
      throw new Error("");
    }
    this._reusableContextStack.push(context);
    (context as any).currentPath = null;
  }

  reportChanged(): void {
    this._changeReported = true;
  }

  wasChangeReported(): boolean {
    return this._changeReported;
  }
}

function visitChildren<S>(path: Path, visitor: PathVisitor<S>, state?: S): any {
  for (const child of path.iterChildren()) {
    visitor.visitWithoutReset(child, state);
  }
  return path.value;
}

function makeContextConstructor<S>(visitor: PathVisitor<S>): typeof Context {
  const Context = class {
    currentPath?: Path;
    needToCallTraverse: boolean;
    state: Record<string, any>;
    reset: (this: Context, path: Path, state?: Record<string, any>) => this;

    constructor(path: Path) {
      Object.assign(this, visitor);
      this.currentPath = path;
      this.needToCallTraverse = true;
      this.state = {} as S;
      this.reset = (path: Path, state?: S): this => {
        this.currentPath = path;
        this.needToCallTraverse = true;
        if (state) this.state = state;
        this.visitor.reset.call(this, path, state || this.state);
        return this;
      };
      Object.seal(this);
    }

    get visitor(): PathVisitor<S> {
      return visitor;
    }

    invokeVisitorMethod(methodName: keyof PathVisitor<S>): any {
      if (!(this.currentPath instanceof Path)) throw new Error("");

      const result = this.visitor[methodName].call(
        this,
        this.currentPath,
        this.state
      );

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
    }

    traverse(path: Path, state?: S, newVisitor?: Visitor<S>): any {
      if (!(path instanceof Path)) throw new Error("");

      this.needToCallTraverse = false;

      return visitChildren(
        path,
        PathVisitor.fromMethodsObject(newVisitor || this.visitor),
        state || this.state
      );
    }

    visit(path: Path, state?: S, newVisitor?: Visitor<S>): any {
      this.needToCallTraverse = false;

      return PathVisitor.fromMethodsObject(
        newVisitor || this.visitor
      ).visitWithoutReset(path, (state || this.state) as S);
    }

    reportChanged() {
      this.visitor.reportChanged();
    }

    abort() {
      this.needToCallTraverse = false;
      this.visitor.abort();
    }
  };

  return Context;
}

import "./def";
import { builtInTypes, getFieldValue } from "./types";
import { types } from "./index";

// const Node = types.Node;

const Op = Object.prototype;
const hasOwn = Op.hasOwnProperty;
const isArray = builtInTypes.array;
const isNumber = builtInTypes.number;
const isString = builtInTypes.string;

const assertIsArray: typeof isArray["assert"] = isArray.assert.bind(isArray);
const assertIsNumber: typeof isNumber["assert"] =
  isNumber.assert.bind(isNumber);
const assertIsString: typeof isString["assert"] =
  isString.assert.bind(isString);

export interface PathConstructor {
  new <N extends types.Node = any, V = any>(
    value: V,
    parentPath?: any,
    name?: any
  ): Path<N, V>;
}

type PathName = string | number;
type ChildCache = Record<PathName, Path>;

export class Path<N extends types.Node = any, V = any> {
  value: V;
  parentPath: Path | null;
  name: PathName;
  __childCache: null | ChildCache;

  constructor(value: V, parentPath?: any, name?: any) {
    if (parentPath) {
      if (!(parentPath instanceof Path)) {
        throw new Error("");
      }
    } else {
      parentPath = null;
      name = null;
    }

    // The value encapsulated by this Path, generally equal to
    // parentPath.value[name] if we have a parentPath.
    this.value = value;

    // The immediate parent Path of this Path.
    this.parentPath = parentPath;

    // The name of the property of parentPath.value through which this
    // Path's value was reached.
    this.name = name;

    // Calling path.get("child") multiple times always returns the same
    // child Path object, for both performance and consistency reasons.
    this.__childCache = null;
  }
  // var Pp: Path = Path.prototype;

  // The value of the first ancestor Path whose value is a Node.
  get node(): N {
    const value = this.value;
    if (types.Node.check(value)) {
      return value as unknown as N;
    }
    const pp = this.parentPath;
    if (pp === null) {
      throw new Error("");
    }
    return pp.node as N;
  }

  get parent(): Path | null {
    const value = this.value;
    let pp = this.parentPath;

    if (!types.Node.check(value)) {
      while (pp && !types.Node.check(pp.value)) {
        pp = pp.parentPath;
      }

      if (pp) {
        pp = pp.parentPath;
      }
    }

    while (pp && !types.Node.check(pp.value)) {
      pp = pp.parentPath;
    }

    return pp || null;
  }

  _getChildCache(): ChildCache {
    return (
      this.__childCache ||
      (this.__childCache = Object.create(null) as ChildCache)
    );
  }

  _getChildPath(name: PathName): Path {
    const cache = this._getChildCache();
    const actualChildValue = this.getValueProperty(name);
    let childPath = cache[name];
    if (
      !hasOwn.call(cache, name) ||
      // Ensure consistency between cache and reality.
      childPath.value !== actualChildValue
    ) {
      const constructor = this.constructor as PathConstructor;
      childPath = cache[name] = new constructor(actualChildValue, this, name);
    }
    return childPath;
  }

  // This method is designed to be overridden by subclasses that need to
  // handle missing properties, etc.
  getValueProperty(name: PathName): any {
    if (types.Node.check(this.value)) {
      assertIsString(name);
      return getFieldValue(this.value, name);
    } else {
      if (hasOwn.call(this.value, name)) {
        return (this.value as any)[name];
      }
    }
  }

  get(...names: PathName[]): Path {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let path: Path = this;

    for (let i = 0; i < names.length; ++i) {
      path = path._getChildPath(names[i]);
    }

    return path;
  }

  each<M>(
    callback: (this: M, value: Path, index: number) => void,
    context: M
  ): void;

  each(callback: (this: Path, value: Path, index: number) => void): void;

  each(
    callback: (this: Path, value: Path, index: number) => void,
    context?: any
  ): void {
    const childPaths = [];
    assertIsArray(this.value);
    const len = this.value.length;
    let i;

    // Collect all the original child paths before invoking the callback.
    for (i = 0; i < len; ++i) {
      if (hasOwn.call(this.value, i)) {
        childPaths[i] = this.get(i);
      }
    }

    // Invoke the callback on just the original child paths, regardless of
    // any modifications made to the array by the callback. I chose these
    // semantics over cleverly invoking the callback on new elements because
    // this way is much easier to reason about.
    for (i = 0; i < len; ++i) {
      if (hasOwn.call(childPaths, i)) {
        callback.call(context || this, childPaths[i], i);
      }
    }
  }

  map<U>(
    callback: (this: Path, value: Path, index: number) => U,
    context?: Path
  ): U[] {
    const result: U[] = [];

    this.each(function mapCallback(this: Path, childPath: Path, index: number) {
      result.push(callback.call(this, childPath, index));
    }, context);

    return result;
  }

  filter(
    callback: (this: Path, value: Path, index: number) => boolean,
    context?: Path
  ) {
    const result: Path[] = [];

    this.each(function (this: Path, childPath: Path, index: number) {
      if (callback.call(this, childPath, index)) {
        result.push(childPath);
      }
    }, context);

    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  _emptyMoves(): void {}

  _getMoves(offset: number, start?: number, end?: number): () => void {
    const value = this.value;
    assertIsArray(value);

    if (offset === 0) {
      return this._emptyMoves;
    }

    const length = value.length;
    if (length < 1) {
      return this._emptyMoves;
    }

    if (typeof start === "undefined") {
      start = 0;
      end = length;
    } else if (typeof end === "undefined") {
      start = Math.max(start, 0);
      end = length;
    } else {
      start = Math.max(start, 0);
      end = Math.min(end, length);
    }

    assertIsNumber(start);
    assertIsNumber(end);

    const moves: Record<number, Path> = Object.create(null);
    const cache = this._getChildCache();

    for (let i = start; i < end; ++i) {
      if (hasOwn.call(value, i)) {
        const childPath = this.get(i);
        if (childPath.name !== i) {
          throw new Error("");
        }
        const newIndex = i + offset;
        childPath.name = newIndex;
        moves[newIndex] = childPath;
        delete cache[i];
      }
    }

    delete cache.length;

    return () => {
      for (const newIndex in moves) {
        const childPath = moves[newIndex];
        if (childPath.name !== +newIndex) {
          throw new Error("");
        }
        cache[newIndex] = childPath;
        value[newIndex] = childPath.value;
      }
    };
  }

  shift(): any {
    const move = this._getMoves(-1);
    const value = this.value;
    assertIsArray(value);
    const result = value.shift();
    move();
    return result;
  }

  unshift(...args: any[]): number {
    const move = this._getMoves(args.length);
    const value = this.value;
    assertIsArray(value);
    const result = value.unshift(...args);
    move();
    return result;
  }

  push(...args: any[]): number {
    const value = this.value;
    assertIsArray(value);
    const childCache = this._getChildCache();
    delete childCache.length;
    return value.push(...args);
  }

  pop(): any {
    const value = this.value;
    assertIsArray(value);
    const cache = this._getChildCache();
    delete cache[value.length - 1];
    delete cache.length;
    return value.pop();
  }

  insertAt(index: number, ...args: any[]): this {
    const argc = args.length + 1;
    const move = this._getMoves(argc - 1, index);
    if (move === this._emptyMoves && argc <= 1) {
      return this;
    }

    index = Math.max(index, 0);

    const value = this.value;
    assertIsArray(value);

    for (let i = 0; i < args.length; ++i) {
      value[index + i] = args[i];
    }

    move();

    return this;
  }

  insertBefore(...args: any[]): Path {
    const { name, parentPath: pp } = this;
    assertIsNumber(name);
    if (!pp) {
      throw new Error("Cannot use insertBefore in top-level node");
    } else {
      return pp.insertAt(name, ...args);
    }
  }

  insertAfter(...args: any[]): Path {
    const { name, parentPath: pp } = this;
    assertIsNumber(name);
    if (!pp) {
      throw new Error("Cannot use insertBefore in top-level node");
    } else {
      return pp.insertAt(name + 1, ...args);
    }
  }

  _repairRelationshipWithParent(): this {
    const pp = this.parentPath;
    if (!pp) {
      // Orphan paths have no relationship to repair.
      return this;
    }

    const parentValue = pp.value;
    const parentCache = pp._getChildCache();

    // Make sure parentCache[path.name] is populated.
    if (parentValue[this.name] === this.value) {
      parentCache[this.name] = this;
    } else if (isArray.check(parentValue)) {
      // Something caused this.name to become out of date, so attempt to
      // recover by searching for this.value in parentValue.
      const i = parentValue.indexOf(this.value);
      if (i >= 0) {
        parentCache[(this.name = i)] = this;
      }
    } else {
      // If this.value disagrees with parentValue[this.name], and
      // this.name is not an array index, let this.value become the new
      // parentValue[this.name] and update parentCache accordingly.
      parentValue[this.name] = this.value;
      parentCache[this.name] = this;
    }

    if (parentValue[this.name] !== this.value) {
      throw new Error("");
    }
    if (pp.get(this.name) !== this) {
      throw new Error("");
    }

    return this;
  }

  replace(...args: any[]): Path[] {
    const results: Path[] = [];
    const { name, parentPath: pp } = this;
    if (pp === null) {
      throw new Error("Cannot replace on orphaned Paths");
    }
    const parentValue = pp.value;
    const parentCache = pp._getChildCache();

    this._repairRelationshipWithParent();

    if (isArray.check(parentValue)) {
      const originalLength = parentValue.length;
      assertIsNumber(name);
      const move = pp._getMoves(args.length - 1, name + 1);

      const spliceArgs: [number, number, ...any[]] = [name, 1];
      for (let i = 0; i < args.length; ++i) {
        spliceArgs.push(args[i]);
      }

      const splicedOut = parentValue.splice(...spliceArgs);

      if (splicedOut[0] !== this.value) {
        throw new Error("");
      }
      if (parentValue.length !== originalLength - 1 + args.length) {
        throw new Error("");
      }

      move();

      if (args.length === 0) {
        this.value = undefined as unknown as V;
        delete parentCache[this.name];
        this.__childCache = null;
      } else {
        if (parentValue[name] !== args[0]) {
          throw new Error("");
        }

        if (this.value !== args[0]) {
          this.value = args[0];
          this.__childCache = null;
        }

        for (let i = 0; i < args.length; ++i) {
          results.push(pp.get(name + i));
        }

        if (results[0] !== this) {
          throw new Error("");
        }
      }
    } else if (args.length === 1) {
      if (this.value !== args[0]) {
        this.__childCache = null;
      }
      this.value = parentValue[name] = args[0];
      results.push(this);
    } else if (args.length === 0) {
      delete parentValue[this.name];
      this.value = undefined as unknown as V;
      this.__childCache = null;

      // Leave this path cached as parentCache[this.name], even though
      // it no longer has a value defined.
    } else {
      throw new Error("Could not replace path");
    }

    return results;
  }
}

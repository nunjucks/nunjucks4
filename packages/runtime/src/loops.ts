import type {
  PromiseIfAsync,
  IfAsync,
  UnwrapPromise,
  ConditionalAsync,
} from "./types";

import { MISSING, Undefined } from "./undef";

type LoopRenderFunc<V> = (
  reciter: Iterable<V>,
  loopRenderFunc: LoopRenderFunc<V>,
  depth?: number,
) => string;

/**
 * A wrapper iterable for dynamic for loops, with information about the loop and iteration.
 */
export class LoopContext<
  IsAsync extends boolean | undefined,
  V extends PromiseIfAsync<IsAsync> = any,
> {
  index0: number;
  _length: number | null;
  _after: V | typeof MISSING;
  _current: V | typeof MISSING;
  _before: V | typeof MISSING;
  _lastChangedValue: V | typeof MISSING;

  _isAsync: IsAsync;

  _iterable: IfAsync<
    IsAsync,
    AsyncIterable<UnwrapPromise<V>> | Iterable<UnwrapPromise<V>>,
    Iterable<V>
  >;
  _iterator: IfAsync<
    IsAsync,
    AsyncIterator<UnwrapPromise<V>> | Iterator<UnwrapPromise<V>>,
    Iterator<V>
  >;
  _undefined: typeof Undefined;
  _recurse: LoopRenderFunc<V> | null;
  _iteritems: V[];
  /**
   * How many levels deep a recursive loop currently is, starting at 0.
   */
  depth0: number;
  /**
   * @param iterable: Iterable to wrap.
   * @param undef: `Undefined` class to use for next and
   *     previous items.
   * @param recurse: The function to render the loop body when the
   *     loop is marked recursive.
   * @param depth0: Incremented when looping recursively.
   */
  constructor(
    iterable: IfAsync<
      IsAsync,
      AsyncIterable<UnwrapPromise<V>> | Iterable<UnwrapPromise<V>>,
      Iterable<V>
    >,
    undef: typeof Undefined,
    recurse: LoopRenderFunc<V> | null = null,
    depth0 = 0,
    async: IsAsync,
  ) {
    this.index0 = -1;
    this._length = null;
    this._after = MISSING;
    this._current = MISSING;
    this._before = MISSING;
    this._lastChangedValue = MISSING;

    this._iterable = iterable;
    this._iteritems = [];
    this._undefined = undef;
    this._recurse = recurse;
    this.depth0 = depth0;
    this._isAsync = async;
    this._iterator = this._toIterator(iterable);
  }

  /**
   * When iterating over nested data, render the body of the loop
   * recursively with the given inner iterable data.
   *
   * The loop must have the recursive marker for this to work.
   */
  __call__(iterable: Iterable<V>): string {
    if (this._recurse === null) {
      throw new TypeError(
        "The loop must have the 'recursive' marker to be called recursively.",
      );
    }
    return this._recurse(iterable, this._recurse, this.depth);
  }

  _toIterator(
    iterable: IfAsync<
      IsAsync,
      AsyncIterable<UnwrapPromise<V>> | Iterable<UnwrapPromise<V>>,
      Iterable<V>
    >,
  ): IfAsync<
    IsAsync,
    AsyncIterator<UnwrapPromise<V>> | Iterator<UnwrapPromise<V>>,
    Iterator<V>
  > {
    return this._isAsync
      ? async function* iterwrap() {
          for await (const item of iterable as AsyncIterable<
            UnwrapPromise<V>
          >) {
            yield item;
          }
        }
          .call(this)
          [Symbol.asyncIterator]()
      : function* iterwrap() {
          for (const item of iterable as Iterable<V>) {
            yield item;
          }
        }
          .call(this)
          [Symbol.iterator]();
  }

  [Symbol.iterator]() {
    return this;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async _getLengthAsync(): Promise<number> {
    if (this._length !== null) return this._length;
    if (Object.prototype.hasOwnProperty.call(this._iterable, "length")) {
      const len = (this._iterable as unknown as unknown[]).length;
      if (typeof len === "number") {
        this._length = len;
        return this._length;
      }
    }

    const iterable: UnwrapPromise<V>[] = [];
    const iterator = this._iterator as
      | Iterator<UnwrapPromise<V>>
      | AsyncIterator<UnwrapPromise<V>>;
    let result = await iterator.next();
    while (!result.done) {
      iterable.push(result.value);
      result = await iterator.next();
    }
    this._iterator = this._toIterator(iterable);
    this._length =
      iterable.length + this.index + (this._after !== MISSING ? 1 : 0);
    return this._length;
  }

  _getLengthSync(): number {
    if (this._length !== null) return this._length;
    if (Object.prototype.hasOwnProperty.call(this._iterable, "length")) {
      const len = (this._iterable as unknown as unknown[]).length;
      if (typeof len === "number") {
        this._length = len;
        return this._length;
      }
    }

    const iterable: IfAsync<IsAsync, UnwrapPromise<V>[], V[]> = [];
    const iterator = this._iterator as Iterator<V>;
    let result = iterator.next();
    while (!result.done) {
      iterable.push(result.value);
      result = iterator.next();
    }
    this._iterator = this._toIterator(iterable);
    this._length =
      iterable.length + this.index + (this._after !== MISSING ? 1 : 0);
    return this._length;
  }

  /**
   * Length of the iterable.
   *
   * If the iterable is a generator or otherwise does not have a
   * size, it is eagerly evaluated to get a size.
   */
  get length(): ConditionalAsync<IsAsync, number> {
    return (
      this._isAsync ? this._getLengthAsync() : this._getLengthSync()
    ) as ConditionalAsync<IsAsync, number>;
  }

  get depth(): number {
    return this.depth0 + 1;
  }

  /**
   * Current iteration of the loop, starting at 1.
   */
  get index() {
    return this.index0 + 1;
  }
  /**
   * Number of iterations from the end of the loop, ending at 0.
   *
   * Requires calculating this.length
   */
  get revindex0(): ConditionalAsync<IsAsync, number> {
    return (
      typeof this.length === "number"
        ? this.length - this.index
        : this.length.then((len) => len - this.index)
    ) as ConditionalAsync<IsAsync, number>;
  }

  /**
   * Number of iterations from the end of the loop, ending at 1.
   *
   * Requires calculating this.length
   */
  get revindex(): ConditionalAsync<IsAsync, number> {
    return (
      typeof this.length === "number"
        ? this.length - this.index0
        : this.length.then((len) => len - this.index0)
    ) as ConditionalAsync<IsAsync, number>;
  }

  /**
   * Whether this is the first iteration of the loop.
   */
  get first(): boolean {
    return this.index0 === 0;
  }

  _peekNextSync(): V | typeof MISSING {
    if (this._after !== MISSING) {
      return this._after as V;
    }
    const iterator = this._iterator as Iterator<V>;
    const nextResult = iterator.next();
    this._after = nextResult.done ? MISSING : nextResult.value;
    return this._after;
  }

  async _peekNextAsync(): Promise<V | typeof MISSING> {
    if (this._after !== MISSING) {
      return this._after as V;
    }
    const nextResult = await this._iterator.next();
    this._after = nextResult.done ? MISSING : nextResult.value;
    return this._after;
  }

  /**
   * Return the next element in the iterable, or MISSING
   * if the iterable is exhausted. Only peeks one item ahead, caching
   * the result in `_last` for use in subsequent checks. The
   * cache is reset when `next()` is called.
   */
  _peekNext(): ConditionalAsync<IsAsync, V | typeof MISSING> {
    return (
      this._isAsync ? this._peekNextAsync() : this._peekNextSync()
    ) as ConditionalAsync<IsAsync, V | typeof MISSING>;
  }

  /**
   * Whether this is the last iteration of the loop.
   *
   * Causes the iterable to advance early.
   */
  get last(): boolean {
    return this._peekNext() === MISSING;
  }

  /**
   * The item in the previous iteration. Undefined during the first iteration.
   */
  get previtem(): ConditionalAsync<IsAsync, V | typeof MISSING | Undefined> {
    let ret: V | typeof MISSING | Undefined;
    if (this.first) {
      ret = new this._undefined({ hint: "there is no previous item" });
    } else {
      ret = this._before;
    }
    return (this._isAsync ? Promise.resolve(ret) : ret) as ConditionalAsync<
      IsAsync,
      V | typeof MISSING | Undefined
    >;
  }

  async _getNextitemAsync(): Promise<
    V | UnwrapPromise<V> | typeof MISSING | Undefined
  > {
    const rv = await this._peekNextAsync();
    return rv === MISSING ? new this._undefined("there is no next item") : rv;
  }

  _getNextitemSync(): V | typeof MISSING | Undefined {
    const rv = this._peekNext();
    return rv === MISSING ? new this._undefined("there is no next item") : rv;
  }

  get nextitem(): ConditionalAsync<IsAsync, V | typeof MISSING | Undefined> {
    return (
      this._isAsync ? this._getNextitemAsync() : this._getNextitemSync()
    ) as ConditionalAsync<IsAsync, V | typeof MISSING | Undefined>;
  }

  /**
   * Return a value from the given args, cycling through based on
   * the current `index0`.
   *
   * @param args One or more values to cycle through.
   */
  cycle(...args: V[]): V {
    if (!args.length) {
      throw new TypeError("no items for cycling given");
    }
    return args[this.index0 % args.length];
  }

  /**
   * Return true if previously called with a different value
   * (including when called for the first time).
   *
   * @param value Value to compare to the last call.
   */
  changed(value: any): boolean {
    if (this._lastChangedValue !== value) {
      this._lastChangedValue = value;
      return true;
    }
    return false;
  }

  _nextSync(): IteratorResult<[V, this]> {
    const iterator = this._iterator as Iterator<V>;
    let rv: IteratorResult<V>;

    if (this._after !== MISSING) {
      rv = { value: this._after as V, done: false };
      this._after = MISSING;
    } else {
      rv = iterator.next();
    }

    this.index0++;
    this._before = this._current;
    this._current = rv.value ?? MISSING;
    return { value: [rv.value, this], done: rv.done };
  }

  async _nextAsync(): Promise<IteratorResult<[UnwrapPromise<V>, this]>> {
    const after = this._after;
    const iterator = this._iterator as
      | Iterator<UnwrapPromise<V>>
      | AsyncIterator<UnwrapPromise<V>>;

    let rv: IteratorResult<UnwrapPromise<V>>;

    if (after !== MISSING) {
      rv = { value: this._after as UnwrapPromise<V>, done: false };
      this._after = MISSING;
    } else {
      rv = await iterator.next();
    }

    this.index0++;
    this._before = this._current;
    this._current = rv.value ?? MISSING;
    return Promise.resolve({ value: [rv.value, this], done: rv.done });
  }

  next(): IfAsync<
    IsAsync,
    Promise<IteratorResult<[UnwrapPromise<V>, this]>>,
    IteratorResult<[V, this]>
  > {
    return (this._isAsync ? this._nextAsync() : this._nextSync()) as IfAsync<
      IsAsync,
      Promise<IteratorResult<[UnwrapPromise<V>, this]>>,
      IteratorResult<[V, this]>
    >;
  }
  __repr__(): string {
    const len = this._isAsync ? this._length ?? "?" : this._getLengthSync();
    return `${this.constructor.name} ${this.index}/${len}`;
  }
}

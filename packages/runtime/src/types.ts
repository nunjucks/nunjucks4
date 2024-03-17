export type UnwrapPromise<T> = T extends PromiseLike<infer U>
  ? UnwrapPromise<U>
  : T;

export type IfAsync<
  IsAsync extends boolean | undefined,
  A,
  B
> = IsAsync extends true ? A : B;

export type ConditionalAsync<
  IsAsync extends boolean | undefined,
  T
> = IsAsync extends true ? (T extends Promise<any> ? T : Promise<T>) : T;

export type PromiseIfAsync<IsAsync extends boolean | undefined> =
  IsAsync extends true ? Promise<any> : any;

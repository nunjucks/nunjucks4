declare module "set.prototype.difference" {
  type Polyfill<A = any, B = any> = (a: Set<A>, b: Set<B>) => Set<A>;
  type Implementation<A = any, B = any> = (this: Set<A>, b: Set<B>) => Set<A>;
  namespace difference {
    const implementation: Implementation;
    const getPolyfill: () => Polyfill;
    const shim: () => Polyfill;
  }

  function difference<A = any, B = any>(a: Set<A>, b: Set<B>): Set<A>;

  export = difference;
}

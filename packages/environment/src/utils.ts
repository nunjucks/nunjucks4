export function asyncFind<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean>,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let i = 0;
    array.forEach(async (item) => {
      if (await predicate(await item)) {
        resolve(item);
        return;
      }
      i++;
      if (array.length == i) {
        resolve(undefined);
      }
    });
  });
}

function* map<T, U>(a: T[], fn: (x: T) => U) {
  for (const x of a) yield fn(x);
}

function find<T>(a: Generator<T, void, unknown>, fn: (x: T) => boolean) {
  for (const x of a) if (fn(x)) return x;
}

export function mapFind<T, U>(
  collection: T[],
  mapper: (item: T) => U,
  finder: (item: U) => boolean,
): U | undefined {
  const mapperGenerator = map(collection, mapper);

  return find(mapperGenerator, finder);
}
//
// async function* asyncMap<T, U>(a: T[], fn: (x: T) => U) {
//   for (const x of a) yield await fn(x);
// }
//
// function asyncFind<T>(a: Generator<T, void, unknown>, fn: (x: T) => boolean) {
//   for (const x of a) if (fn(x)) return x;
// }
//
// export function mapFind<T, U>(
//   collection: T[],
//   mapper: (item: T) => U,
//   finder: (item: U) => boolean,
// ): U | undefined {
//   const mapperGenerator = map(collection, mapper);
//
//   return find(mapperGenerator, finder);
// }

export function chainMap(
  ...maps: Record<string | symbol, any>[]
): Record<string, unknown> {
  if (!maps.length) {
    maps = [{}];
  }
  const target = maps.shift()!;
  return new Proxy(target, {
    get(target, key) {
      for (const map of [target, ...maps]) {
        if (key in map) {
          return Reflect.get(map, key);
        }
      }
      return undefined;
    },
    has(target, key) {
      return [target, ...maps].some((map) => Reflect.has(map, key));
    },
    ownKeys(target) {
      const keys = new Set<string | symbol>();
      for (const map of [target, ...maps]) {
        Reflect.ownKeys(map).forEach((k) => keys.add(k));
      }
      return Array.from(keys);
    },
    set(target, key, value) {
      return Reflect.set(target, key, value);
    },
    getOwnPropertyDescriptor(target, name) {
      for (const map of [target, ...maps]) {
        const descriptor = Reflect.getOwnPropertyDescriptor(map, name);
        if (descriptor) return descriptor;
      }
      return undefined;
      // if (this.has(target, name)) {
      //   return {
      //     value: this.get(target, name),
      //     writable: true,
      //     configurable: true,
      //     enumerable: true,
      //   };
      // }
      // if (Object.prototype.hasOwnProperty.call(target.__dict__, name)) {
      //   return {
      //     value: this.get(target, name),
      //     writable: false,
      //     configurable: true,
      //     enumerable: true,
      //   };
      // }
      // const descriptor = Reflect.getOwnPropertyDescriptor(target, name);
      // return descriptor ? { ...descriptor, writable: false } : descriptor;
    },
  });
}

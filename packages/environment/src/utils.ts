import {
  nunjucksFunction,
  isKwargs,
  isVarargs,
  markSafe,
  escape,
  isIterable,
  isString,
  isObject,
} from "@nunjucks/runtime";
import { TemplateError } from "@nunjucks/utils";

export function asyncFind<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean>,
): Promise<T | undefined> {
  const promises = array.map(
    (item) =>
      new Promise<T>((resolve, reject) => {
        predicate(item).then((v) => {
          if (v) resolve(item);
        }, reject);
      }),
  );
  return Promise.race([
    ...promises,
    Promise.all(promises).then(() => undefined),
  ]);
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
    },
  });
}

export function list(value: unknown): unknown[] {
  if (isString(value)) {
    return value.split("");
  } else if (Array.isArray(value)) {
    return value;
  } else if (isIterable(value)) {
    const ret: unknown[] = [];
    for (const item of value) {
      ret.push(item);
    }
    return ret;
  } else if (isObject(value)) {
    return [...Object.keys(value)];
  } else {
    throw new TemplateError("list filter: type not iterable");
  }
}

function _seqToDictKeyVal(obj: unknown[]): [string, unknown][] {
  return obj.map((o, i) => {
    let l: unknown[] | null = null;
    try {
      l = list(o);
    } catch (e) {
      if (e instanceof TemplateError) {
        throw new Error(
          `cannot convert dictionary update sequence element #${i} to a sequence`,
        );
      } else throw e;
    }
    const len = l.length;
    if (len !== 2) {
      throw new Error(
        `dictionary update sequence element #${i} has length ${len}; 2 is required`,
      );
    }
    return [`${l[0]}`, l[1]];
  });
}

export const dict = nunjucksFunction([], { kwargs: true, varargs: true })(
  function dict(...args) {
    const dictObj: Record<string, unknown> = {};

    let kwargs: Record<string, any> | null = null;
    let varargs: any[] = [];
    if (args.length) {
      const kwargsIndex = args.findIndex((o) => isKwargs(o));
      if (kwargsIndex > -1) {
        const kwargs_ = args.splice(kwargsIndex, 1)[0];
        if (isKwargs(kwargs_)) kwargs = kwargs_;
      }

      const varargsIndex = args.findIndex((o) => isVarargs(o));
      if (varargsIndex > -1) {
        const varargs_ = args.splice(varargsIndex, 1)[0];
        if (isVarargs(varargs_)) varargs = [...varargs_];
      }
    }

    if (args.length === 1) {
      let obj: unknown[] | null = null;
      try {
        obj = list(args[0]);
      } catch (e) {
        // pass
      }
      if (obj !== null) {
        Object.assign(dictObj, Object.fromEntries(_seqToDictKeyVal(obj)));
      }
    }

    if (varargs.length) {
      Object.assign(dictObj, Object.fromEntries(_seqToDictKeyVal(varargs)));
    }

    if (kwargs !== null) {
      delete kwargs.__isKwargs;
      Object.assign(dictObj, Object.fromEntries(Object.entries(kwargs)));
    }

    return dictObj;
  },
);

export function joiner(sep = ", "): () => string {
  let used = false;

  return () => {
    if (!used) {
      used = true;
      return "";
    }
    return sep;
  };
}

class Cycler<T = unknown> {
  items: T[];
  pos: number;

  constructor(items: T[]) {
    if (!Array.isArray(items) || !items.length) {
      throw new Error("at least one item has to be provided");
    }
    this.items = items;
    this.pos = 0;
  }

  reset() {
    this.pos = 0;
  }

  get current(): T {
    return this.items[this.pos];
  }

  get next(): T {
    const rv = this.current;
    this.pos = (this.pos + 1) % this.items.length;
    return rv;
  }
}

export function cycler<T = unknown>(items: T[]): Cycler<T> {
  return new Cycler(items);
}

const LOREM_IPSUM_WORDS = `
a ac accumsan ad adipiscing aenean aliquam aliquet amet ante aptent arcu at
auctor augue bibendum blandit class commodo condimentum congue consectetuer
consequat conubia convallis cras cubilia cum curabitur curae cursus dapibus
diam dictum dictumst dignissim dis dolor donec dui duis egestas eget eleifend
elementum elit enim erat eros est et etiam eu euismod facilisi facilisis fames
faucibus felis fermentum feugiat fringilla fusce gravida habitant habitasse hac
hendrerit hymenaeos iaculis id imperdiet in inceptos integer interdum ipsum
justo lacinia lacus laoreet lectus leo libero ligula litora lobortis lorem
luctus maecenas magna magnis malesuada massa mattis mauris metus mi molestie
mollis montes morbi mus nam nascetur natoque nec neque netus nibh nisi nisl non
nonummy nostra nulla nullam nunc odio orci ornare parturient pede pellentesque
penatibus per pharetra phasellus placerat platea porta porttitor posuere
potenti praesent pretium primis proin pulvinar purus quam quis quisque rhoncus
ridiculus risus rutrum sagittis sapien scelerisque sed sem semper senectus sit
sociis sociosqu sodales sollicitudin suscipit suspendisse taciti tellus tempor
tempus tincidunt torquent tortor tristique turpis ullamcorper ultrices
ultricies urna ut varius vehicula vel velit venenatis vestibulum vitae vivamus
viverra volutpat vulputate`
  .replace(/\n/g, " ")
  .split(" ");

function choice<T = unknown>(choices: T[]): T {
  return choices[Math.floor(Math.random() * choices.length)];
}

function randrange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

export const lipsum = nunjucksFunction(["n", "html", "min", "max"])(
  function generateLoremIpsum(
    n: number = 5,
    html: boolean = true,
    min: number = 20,
    max: number = 100,
  ): string {
    const words = [...LOREM_IPSUM_WORDS];
    const result: string[] = [];
    for (let i = 0; i < n; i++) {
      let nextCapitalized = true;
      let lastFullstop = 0;
      let lastComma = 0;
      let word: string | null = null;
      let last: string | null = null;
      const p: string[] = [];

      // each paragraph contains between 20 and 100 words
      const numWords = randrange(min, max);
      for (let j = 0; j < numWords; j++) {
        while (true) {
          word = choice(words);
          if (word !== last) {
            last = word;
            break;
          }
        }
        if (nextCapitalized) {
          word = word[0].toUpperCase() + word.substring(1);
          nextCapitalized = false;
        }
        // add commas
        if (j - randrange(3, 8) > lastComma) {
          lastComma = j;
          lastFullstop += 2;
          word += ",";
        }
        // add end of sentences
        if (j - randrange(10, 20) > lastFullstop) {
          lastComma = lastFullstop = j;
          word += ".";
          nextCapitalized = true;
        }
        p.push(word);
      }

      let pStr = p.join(" ");
      // ensure that the paragraph ends with a dot.
      if (pStr.endsWith(",")) {
        pStr = pStr.substring(0, pStr.length - 1) + ".";
      } else if (!pStr.endsWith(".")) {
        pStr += ".";
      }
      result.push(pStr);
    }

    if (!html) {
      return result.join("\n\n");
    }
    return markSafe(result.map((p) => `<p>${escape(p)}</p>`).join("\n"));
  },
);

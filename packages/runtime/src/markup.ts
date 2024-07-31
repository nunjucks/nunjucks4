import { hasOwn, isPlainObject } from "./utils";

export type MarkupType = Markup & string;

export function copySafeness<T>(src: unknown, dest: T): T | MarkupType {
  return isMarkup(src) ? markSafe(dest) : dest;
}

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  '"': "&#34;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};

const escapeRegex = new RegExp(
  `[${[...Object.keys(escapeMap)].join("")}]`,
  "g",
);

export function isMarkup(obj: unknown): obj is MarkupType {
  return (
    Object.prototype.toString.call(obj) === "[object String]" &&
    !!(obj as any).__isMarkup
  );
}

export function escape(obj: unknown): MarkupType {
  if (isMarkup(obj)) return obj;
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const s = obj === null || obj === undefined ? "" : `${obj}`;
  return markSafe(
    s.replace(escapeRegex, (c) => (c in escapeMap ? escapeMap[c] : c)),
  );
}

export function markSafe(s: unknown) {
  return new Markup(s) as MarkupType;
}

export class Markup extends String {
  val: string;
  __isMarkup: true;

  constructor(value: unknown) {
    if (
      value &&
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      hasOwn(value, "__html__") &&
      typeof value.__html__ === "function"
    ) {
      value = value.__html__();
    }
    const val = `${value}`;
    super(val);
    this.val = val;
    this.__isMarkup = true;
  }

  concat(...strings: (string | Markup)[]): MarkupType {
    const args: string[] = [];
    for (const s of strings) {
      if (isMarkup(s)) {
        args.push(`${s}`);
      } else {
        args.push(`${escape(s)}`);
      }
    }
    return markSafe(super.concat(...args));
  }
  split(
    separator:
      | string
      | RegExp
      | {
          [Symbol.split](string: string, limit?: number | undefined): string[];
        },
    limit?: number | undefined,
  ): MarkupType[] {
    const ret =
      typeof separator === "string"
        ? super.split(separator, limit)
        : separator instanceof RegExp
          ? super.split(separator, limit)
          : typeof separator === "object" && Symbol.split in separator
            ? super.split(separator, limit)
            : super.split(`${separator}`, limit);

    return ret.map((s) => markSafe(s));
  }
  slice(start?: number | undefined, end?: number | undefined): MarkupType {
    return markSafe(super.slice(start, end));
  }
  substring(start: number, end?: number | undefined): MarkupType {
    return markSafe(super.substring(start, end));
  }
  toUpperCase(): MarkupType {
    return markSafe(super.toUpperCase());
  }
  toLowerCase(): MarkupType {
    return markSafe(super.toLowerCase());
  }
  trim(): MarkupType {
    return markSafe(super.trim());
  }
  trimStart(): MarkupType {
    return markSafe(super.trimStart());
  }
  trimEnd(): MarkupType {
    return markSafe(super.trimEnd());
  }
  repeat(count: number): MarkupType {
    return markSafe(super.repeat(count));
  }
  charAt(pos: number): MarkupType {
    return markSafe(super.charAt(pos));
  }
  padStart(maxLength: number, padString?: string | undefined): MarkupType {
    return markSafe(super.padStart(maxLength, padString));
  }
  padEnd(maxLength: number, padString?: string | undefined): MarkupType {
    return markSafe(super.padEnd(maxLength, padString));
  }

  replace(...args: unknown[]): MarkupType {
    return markSafe(
      super.replace.apply(
        this,
        args.map((arg) => escape(arg)),
      ),
    );
  }

  /**
   * unescape the markup, remove tags, and normalize whitespace to single
   * spaces.
   */
  striptags(): string {
    let value = `${this}`;

    // Look for comments then tags separately. Otherwise, a comment that
    // contains a tag would end early, leaving some of the comment behind.
    while (true) {
      // keep finding comment start marks
      const start = value.indexOf("<!--");
      if (start === -1) break;

      // ind a comment end mark beyond the start, otherwise stop
      const end = value.indexOf("-->", start);

      if (end === -1) break;

      value = value.substring(0, start) + value.substring(end + 3);
    }
    // remove tags using the same method
    while (true) {
      // keep finding comment start marks
      const start = value.indexOf("<");
      if (start === -1) break;

      // ind a comment end mark beyond the start, otherwise stop
      const end = value.indexOf(">", start);

      if (end === -1) break;

      value = value.substring(0, start) + value.substring(end + 1);
    }
    // collapse spaces
    value = value
      .trim()
      .split(/[\s\n]+/g)
      .join(" ");
    return new Markup(value).unescape();
  }

  unescape(): string {
    return unescape(`${this}`);
  }
}

export function str(o: unknown): string {
  if (Array.isArray(o) || isPlainObject(o)) {
    // Roughly resembles python repr
    try {
      return JSON.stringify(o, null, 1)
        .replace(/^ +/gm, " ")
        .replace(/\n/g, "")
        .replace(/{ /g, "{")
        .replace(/ }/g, "}")
        .replace(/\[ /g, "[")
        .replace(/ \]/g, "]")
        .replace(/\\([\s\S])|(')/g, "\\$1$2")
        .replace(/\\([\s\S])|(")/g, (match, p1, p2) =>
          p2 ? "'" : match === '\\"' ? '"' : match,
        );
    } catch (e) {
      // do nothing
    }
  }
  return copySafeness(o, `${o}`);
}

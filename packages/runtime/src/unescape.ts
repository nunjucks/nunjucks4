import characterEntities_ from "character-entities";
import { hasOwn } from "./utils";

const characterEntities: Record<string, string> = characterEntities_;
// see https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state
const invalidCharrefs = new Map<number, string>([
  [0x00, "\ufffd"],
  [0x0d, "\r"],
  [0x80, "\u20ac"],
  [0x81, "\x81"],
  [0x82, "\u201a"],
  [0x83, "\u0192"],
  [0x84, "\u201e"],
  [0x85, "\u2026"],
  [0x86, "\u2020"],
  [0x87, "\u2021"],
  [0x88, "\u02c6"],
  [0x89, "\u2030"],
  [0x8a, "\u0160"],
  [0x8b, "\u2039"],
  [0x8c, "\u0152"],
  [0x8d, "\x8d"],
  [0x8e, "\u017d"],
  [0x8f, "\x8f"],
  [0x90, "\x90"],
  [0x91, "\u2018"],
  [0x92, "\u2019"],
  [0x93, "\u201c"],
  [0x94, "\u201d"],
  [0x95, "\u2022"],
  [0x96, "\u2013"],
  [0x97, "\u2014"],
  [0x98, "\u02dc"],
  [0x99, "\u2122"],
  [0x9a, "\u0161"],
  [0x9b, "\u203a"],
  [0x9c, "\u0153"],
  [0x9d, "\x9d"],
  [0x9e, "\u017e"],
  [0x9f, "\u0178"],
]);

const invalidCodepoints = new Set([
  // 0x0001 to 0x0008
  0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8,
  // 0x000E to 0x001F
  0xe, 0xf, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a,
  0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
  // 0x007F to 0x009F
  0x7f, 0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b,
  0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f,
  // 0xFDD0 to 0xFDEF
  0xfdd0, 0xfdd1, 0xfdd2, 0xfdd3, 0xfdd4, 0xfdd5, 0xfdd6, 0xfdd7, 0xfdd8,
  0xfdd9, 0xfdda, 0xfddb, 0xfddc, 0xfddd, 0xfdde, 0xfddf, 0xfde0, 0xfde1,
  0xfde2, 0xfde3, 0xfde4, 0xfde5, 0xfde6, 0xfde7, 0xfde8, 0xfde9, 0xfdea,
  0xfdeb, 0xfdec, 0xfded, 0xfdee, 0xfdef,
  // others
  0xb, 0xfffe, 0xffff, 0x1fffe, 0x1ffff, 0x2fffe, 0x2ffff, 0x3fffe, 0x3ffff,
  0x4fffe, 0x4ffff, 0x5fffe, 0x5ffff, 0x6fffe, 0x6ffff, 0x7fffe, 0x7ffff,
  0x8fffe, 0x8ffff, 0x9fffe, 0x9ffff, 0xafffe, 0xaffff, 0xbfffe, 0xbffff,
  0xcfffe, 0xcffff, 0xdfffe, 0xdffff, 0xefffe, 0xeffff, 0xffffe, 0xfffff,
  0x10fffe, 0x10ffff,
]);

const charrefRe = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/g;

/**
 * Convert all named and numeric character references (e.g. &gt;, &#62;,
 * &x3e;) in the string s to the corresponding unicode characters.
 * This function uses the rules defined by the HTML 5 standard
 * for both valid and invalid character references, and the list of
 * HTML 5 named character references defined in html.entities.html5.
 */
export default function unescape(str: string): string {
  if (!str.includes("&")) {
    return str;
  }
  return str.replace(charrefRe, (_, s) => {
    if (!s) return "";
    if (s.startsWith("#")) {
      // numeric charref
      const num =
        s[1] === "x" || s[1] === "X"
          ? parseInt(s.substring(2, s.length - 1), 16)
          : parseInt(s.substring(1, s.length - 1));

      const match = invalidCharrefs.get(num);
      if (match) {
        return match;
      }

      if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) {
        return "\uFFFD";
      }
      if (invalidCodepoints.has(num)) {
        return "";
      }
      return String.fromCodePoint(num);
    } else {
      // named charref
      // find the longest matching name (as defined by the standard)
      for (let x = s.length; x > 1; x--) {
        const lookup = s.substring(0, x);
        if (hasOwn(characterEntities, lookup)) {
          return characterEntities[lookup] + s.substring(x);
        }
      }
      return "&" + s;
    }
  });
}

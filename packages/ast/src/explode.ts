/**
 * Based on code from https://github.com/pugjs/babel-walk
 *
 * babel-walk license:
 *
 * Copyright (c) 2016 Tiancheng "Timothy" Gu
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
 * USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { Type } from "../src/types";
import { types as t } from "./index";

function getSupertypeToSubtypes() {
  const supertypeToSubtypes: Record<string, string[]> = {};
  Object.keys(t).map((typeName) => {
    Type.def(typeName).aliasNames.forEach((supertypeName) => {
      supertypeToSubtypes[supertypeName] =
        supertypeToSubtypes[supertypeName] || [];
      supertypeToSubtypes[supertypeName].push(typeName);
    });
  });

  return supertypeToSubtypes;
}

const FLIPPED_ALIAS_KEYS: Record<string, string[]> = getSupertypeToSubtypes();
const TYPES = new Set<string>(...Object.keys(t).map((t) => `visit${t}`));

/**
 * This serves thre functions:
 *
 * 1. Take any "aliases" and explode them to refecence the concrete types
 * 2. Normalize all handlers to have an `{enter, exit}` pair, rather than raw functions
 * 3. make the enter and exit handlers arrays, so that multiple handlers can be merged
 */
export default function explode(input: any): any {
  const results: any = {};
  for (const key in input) {
    const aliases = FLIPPED_ALIAS_KEYS[key];
    if (aliases) {
      for (const concreteKey of aliases) {
        if (concreteKey in results) {
          if (typeof input[key] === "function") {
            results[concreteKey].enter.push(input[key]);
          } else {
            if (input[key].enter)
              results[concreteKey].enter.push(input[key].enter);
            if (input[key].exit)
              results[concreteKey].exit.push(input[key].exit);
          }
        } else {
          if (typeof input[key] === "function") {
            results[concreteKey] = {
              enter: [input[key]],
              exit: [],
            };
          } else {
            results[concreteKey] = {
              enter: input[key].enter ? [input[key].enter] : [],
              exit: input[key].exit ? [input[key].exit] : [],
            };
          }
        }
      }
    } else if (TYPES.has(key)) {
      if (key in results) {
        if (typeof input[key] === "function") {
          results[key].enter.push(input[key]);
        } else {
          if (input[key].enter) results[key].enter.push(input[key].enter);
          if (input[key].exit) results[key].exit.push(input[key].exit);
        }
      } else {
        if (typeof input[key] === "function") {
          results[key] = {
            enter: [input[key]],
            exit: [],
          };
        } else {
          results[key] = {
            enter: input[key].enter ? [input[key].enter] : [],
            exit: input[key].exit ? [input[key].exit] : [],
          };
        }
      }
    }
  }
  return results;
}

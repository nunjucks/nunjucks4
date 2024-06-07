// From https://github.com/es-shims/array-from-async/blob/4a5ff83947b861f35b380d5d4f20da2f07698638/index.mjs
// Tried to have dnt depend on the package instead, but it distributes as an
// ES module, so doesn't work with CommonJS.
//
// Code below:
//
// Copyright 2021 J. S. Choi
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
//
// 1. Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived from
//    this software without specific prior written permission.
//
// **This software is provided by the copyright holders and contributors
// "as is" and any express or implied warranties, including, but not
// limited to, the implied warranties of merchantability and fitness for a
// particular purpose are disclaimed. In no event shall the copyright
// holder or contributors be liable for any direct, indirect, incidental,
// special, exemplary, or consequential damages (including, but not limited
// to, procurement of substitute goods or services; loss of use, data, or
// profits; or business interruption) however caused and on any theory of
// liability, whether in contract, strict liability, or tort (including
// negligence or otherwise) arising in any way out of the use of this
// software, even if advised of the possibility of such damage.**

const { MAX_SAFE_INTEGER } = Number;
const iteratorSymbol = Symbol.iterator;
const asyncIteratorSymbol = Symbol.asyncIterator;
const IntrinsicArray = Array;
const tooLongErrorMessage =
  "Input is too long and exceeded Number.MAX_SAFE_INTEGER times.";

function isConstructor(obj: any) {
  if (obj != null) {
    const prox: any = new Proxy(obj, {
      construct() {
        return prox;
      },
    });
    try {
      new prox();
      return true;
    } catch (err) {
      return false;
    }
  } else {
    return false;
  }
}

export async function arrayFromAsync<T>(
  iterableOrArrayLike:
    | AsyncIterable<T>
    | Iterable<T | Promise<T>>
    | ArrayLike<T | Promise<T>>
): Promise<T[]>;

export async function arrayFromAsync<T, U>(
  iterableOrArrayLike: AsyncIterable<T> | Iterable<T> | ArrayLike<T>,
  mapFn: (value: Awaited<T>) => U,
  thisArg?: any
): Promise<Awaited<U>[]>;

export default async function arrayFromAsync(
  items: any,
  mapfn?: any,
  thisArg?: any
) {
  const itemsAreIterable =
    asyncIteratorSymbol in items || iteratorSymbol in items;

  if (itemsAreIterable) {
    const result = new Array();

    let i = 0;

    for await (const v of items) {
      if (i > MAX_SAFE_INTEGER) {
        throw TypeError(tooLongErrorMessage);
      } else if (mapfn) {
        result[i] = await mapfn.call(thisArg, v, i);
      } else {
        result[i] = v;
      }

      i++;
    }

    result.length = i;
    return result;
  } else {
    // In this case, the items are assumed to be an arraylike object with
    // a length property and integer properties for each element.
    const { length } = items;
    const result = new Array(length);

    let i = 0;

    while (i < length) {
      if (i > MAX_SAFE_INTEGER) {
        throw TypeError(tooLongErrorMessage);
      }

      const v = await items[i];

      if (mapfn) {
        result[i] = await mapfn.call(thisArg, v, i);
      } else {
        result[i] = v;
      }

      i++;
    }

    result.length = i;
    return result;
  }
}

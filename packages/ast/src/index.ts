import * as types from "./gen/types";
import {
  njkTypes,
  Type,
  Field,
  ASTNode,
  Builder,
  shallowStringify,
  BuiltInTypes,
  builtInTypes,
  AnyType,
  defFromValue,
  getSupertypeNames,
  computeSupertypeLookupTable,
  builders,
  defineMethod,
  getBuilderName,
  getFieldNames,
  getFieldValue,
  eachField,
  someField,
  finalize,
  PredicateType,
  ArrayType,
  OrType,
  IdentityType,
} from "./types";

import { Path } from "./path";
import { PathVisitor } from "./path-visitor";
import { Visitor } from "./gen/visitor";
import type { builders as Builders } from "./gen/builders";
import type { NunjucksTypes } from "./gen/types";

Object.assign(types, njkTypes);

export type { Builders, NunjucksTypes };

export {
  types,
  Path,
  PathVisitor,
  Type,
  Field,
  ASTNode,
  Builder,
  shallowStringify,
  BuiltInTypes,
  builtInTypes,
  AnyType,
  defFromValue,
  getSupertypeNames,
  computeSupertypeLookupTable,
  builders,
  defineMethod,
  getBuilderName,
  getFieldNames,
  getFieldValue,
  eachField,
  someField,
  finalize,
  PredicateType,
  ArrayType,
  OrType,
  IdentityType,
};

export { Visitor };

export const visit = PathVisitor.visit;

export function canAssign(node: types.Node): boolean {
  const typeDef = Type.def(node.type);
  return typeDef.isAssignable(node);
}

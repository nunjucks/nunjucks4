import { Type } from "../types";
import type * as K from "./kinds";

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;

export namespace namedTypes {
  export interface Printable {
    loc?: K.SourceLocationKind | null;
  }

  export interface SourceLocation {
    start: K.PositionKind;
    end: K.PositionKind;
    source?: string | null;
  }

  export interface Node extends Printable {
    type: string;
  }

  export interface Position {
    line: number;
    column: number;
  }

  export interface Expression extends Node {}
  export interface LVal extends Node {}
  export interface Pattern extends Node {}
  export interface PatternLike extends Pattern {}

  export interface Identifier extends Omit<Expression, "type">, Omit<PatternLike, "type">, Omit<LVal, "type"> {
    type: "Identifier";
    name: string;
    optional?: boolean;
  }

  export type ASTNode = Identifier;
  export const Printable: Type<K.PrintableKind>;
  export const SourceLocation: Type<K.SourceLocationKind>;
  export const Node: Type<K.NodeKind>;
  export const Position: Type<K.PositionKind>;
  export const Expression: Type<K.ExpressionKind>;
  export const LVal: Type<K.LValKind>;
  export const PatternLike: Type<K.PatternLikeKind>;
  export const Pattern: Type<K.PatternKind>;
  export const Identifier: Type<K.IdentifierKind>;
}

export interface NamedTypes {
  Printable: Type<K.PrintableKind>;
  SourceLocation: Type<K.SourceLocationKind>;
  Node: Type<K.NodeKind>;
  Position: Type<K.PositionKind>;
  Expression: Type<K.ExpressionKind>;
  LVal: Type<K.LValKind>;
  Pattern: Type<K.PatternKind>;
  PatternLike: Type<K.PatternLikeKind>;
  Identifier: Type<K.IdentifierKind>;
}
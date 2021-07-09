import { Omit } from "../types";
import { Type } from "../lib/types";
import * as K from "./kinds";
export namespace namedTypes {
  export interface Printable {
    loc?: K.SourceLocationKind | null;
  }
  export interface SourceLocation {
    start: K.PositionKind;
    end: K.PositionKind;
    source?: string | null;
  }
  export interface Node {}
  export interface BaseNode extends Node {
    type: string;
  }
  export interface Position {
    line: number;
    column: number;
  }
  export interface Stmt extends BaseNode {}
  export interface Helper extends BaseNode {}
  export interface Expr extends BaseNode {}
  export interface Template extends BaseNode {
    body: K.NodeKind[];
  }
  export interface Output extends Stmt {
    nodes: K.ExprKind[];
  }
  export interface Extends extends Stmt {
    template: K.ExprKind;
  }
  export interface For extends Stmt {
    target: K.NodeKind;
    iter: K.NodeKind;
    body: K.NodeKind[];
    else: K.NodeKind[];
    test?: K.NodeKind | null;
    recursive?: boolean;
  }
  export interface If extends Stmt {
    test: K.NodeKind;
    body: K.NodeKind[];
    elif: K.IfKind[];
    else: K.NodeKind[];
  }
  export interface Macro extends Stmt {
    name: string;
    args: K.NameKind[];
    defaults: K.ExprKind[];
    body: K.NodeKind[];
  }
  export interface Name extends BaseNode {
    name: string;
    ctx: string;
  }
  export interface CallBlock extends Stmt {
    call: K.CallKind;
    args: K.NameKind[];
    defaults: K.ExprKind[];
    body: K.NodeKind[];
  }
  export interface Call extends BaseNode {
    node: K.ExprKind;
    args: K.ExprKind[];
    kwargs: K.KeywordKind[];
    dyn_args?: K.ExprKind | null;
    dyn_kwargs?: K.ExprKind | null;
  }
  export interface FilterBlock extends Stmt {
    body: K.NodeKind[];
    filter: K.FilterKind;
  }
  export interface FilterTestBase extends BaseNode {
    node: K.ExprKind;
    name: string;
    args: K.ExprKind[];
    kwargs: K.PairKind[];
    dyn_args?: K.ExprKind | null;
    dyn_kwargs?: K.ExprKind | null;
  }
  export interface Filter extends Omit<FilterTestBase, "node"> {
    node: K.ExprKind | null;
  }
  export interface With extends Stmt {
    targets: K.ExprKind[];
    values: K.ExprKind[];
    body: K.NodeKind[];
  }
  export interface Block extends Stmt {
    name: string;
    body: K.NodeKind[];
    scoped: boolean;
    required: boolean;
  }
  export interface Include extends Stmt {
    template: K.ExprKind;
    with_context: boolean;
    ignore_missing: boolean;
  }
  export interface FromImport extends Stmt {
    template: K.ExprKind;
    names: (string | string[])[];
    with_context: boolean;
  }
  export interface ExprStmt extends Stmt {
    node: K.NodeKind;
  }
  export interface Assign extends Stmt {
    target: K.ExprKind;
    node: K.NodeKind;
  }
  export interface AssignBlock extends Stmt {
    target: K.ExprKind;
    filter?: K.FilterKind | null;
    body: K.NodeKind[];
  }
  export interface BinExpr extends BaseNode {
    left: K.ExprKind;
    right: K.ExprKind;
    operator: string;
  }
  export interface UnaryExpr extends BaseNode {
    operator: string;
  }
  export interface NSRef extends BaseNode {
    name: string;
    attr: string;
  }
  export interface Literal extends BaseNode {}
  export interface Const extends Literal {
    value: any;
  }
  export interface TemplateData extends Literal {
    data: string;
  }
  export interface Tuple extends Literal {
    items: K.ExprKind[];
    ctx: string;
  }
  export interface List extends Literal {
    items: K.ExprKind[];
  }
  export interface Dict extends Literal {
    items: K.PairKind[];
  }
  export interface Pair extends Helper {
    key: K.ExprKind;
    value: K.ExprKind;
  }
  export interface Keyword extends Helper {
    key: string;
    value: K.ExprKind;
  }
  export interface CondExpr extends BaseNode {
    test: K.ExprKind;
    expr1: K.ExprKind;
    expr2?: K.ExprKind | null;
  }
  export interface Test extends FilterTestBase {}
  export interface Getitem extends BaseNode {
    node: K.ExprKind;
    arg: K.ExprKind;
    ctx: string;
  }
  export interface Getattr extends BaseNode {
    node: K.ExprKind;
    attr: string;
    ctx: string;
  }
  export interface Slice extends BaseNode {
    start?: K.ExprKind | null;
    stop?: K.ExprKind | null;
    step?: K.ExprKind | null;
  }
  export interface Concat extends BaseNode {
    nodes: K.ExprKind[];
  }
  export interface Compare extends BaseNode {
    expr: K.ExprKind;
    ops: K.OperandKind[];
  }
  export interface Operand extends Helper {
    op: string;
    expr: K.ExprKind;
  }
  export interface Mul extends Omit<BinExpr, "operator"> {
    operator: "*";
  }
  export interface Div extends Omit<BinExpr, "operator"> {
    operator: "/";
  }
  export interface FloorDiv extends Omit<BinExpr, "operator"> {
    operator: "//";
  }
  export interface Add extends Omit<BinExpr, "operator"> {
    operator: "+";
  }
  export interface Sub extends Omit<BinExpr, "operator"> {
    operator: "-";
  }
  export interface Mod extends Omit<BinExpr, "operator"> {
    operator: "%";
  }
  export interface Pow extends Omit<BinExpr, "operator"> {
    operator: "**";
  }
  export interface And extends Omit<BinExpr, "operator"> {
    operator: "and";
  }
  export interface Or extends Omit<BinExpr, "operator"> {
    operator: "or";
  }
  export interface Not extends Omit<UnaryExpr, "operator"> {
    operator: "not";
  }
  export interface Neg extends Omit<UnaryExpr, "operator"> {
    operator: "-";
  }
  export interface Pos extends Omit<UnaryExpr, "operator"> {
    operator: "+";
  }
  export interface EnvironmentAttribute extends BaseNode {
    name: string;
  }
  export interface ExtensionAttribute extends BaseNode {
    identifier: string;
    name: string;
  }
  export interface ImportedName extends BaseNode {
    importname: string;
  }
  export interface InternalName extends BaseNode {
    name: string;
  }
  export interface MarkSafe extends BaseNode {
    expr: K.ExprKind;
  }
  export interface MarkSafeIfAutoescape extends BaseNode {
    expr: K.ExprKind;
  }
  export interface ContextReference extends BaseNode {}
  export interface DerivedContextReference extends BaseNode {}
  export interface Continue extends Stmt {}
  export interface Break extends Stmt {}
  export interface Scope extends Stmt {
    body: K.NodeKind[];
  }
  export interface OverlayScope extends Stmt {
    context: K.ExprKind;
    body: K.NodeKind[];
  }
  export interface EvalContextModifier extends Stmt {
    options: K.KeywordKind[];
  }
  export interface ScopedEvalContextModifier extends EvalContextModifier {
    body: K.NodeKind[];
  }
  export type ASTNode = ;
  export let Printable: Type<Printable>;
  export let SourceLocation: Type<SourceLocation>;
  export let Node: Type<Node>;
  export let BaseNode: Type<BaseNode>;
  export let Position: Type<Position>;
  export let Stmt: Type<Stmt>;
  export let Helper: Type<Helper>;
  export let Expr: Type<Expr>;
  export let Template: Type<Template>;
  export let Output: Type<Output>;
  export let Extends: Type<Extends>;
  export let For: Type<For>;
  export let If: Type<If>;
  export let Macro: Type<Macro>;
  export let Name: Type<Name>;
  export let CallBlock: Type<CallBlock>;
  export let Call: Type<Call>;
  export let FilterBlock: Type<FilterBlock>;
  export let FilterTestBase: Type<FilterTestBase>;
  export let Filter: Type<Filter>;
  export let With: Type<With>;
  export let Block: Type<Block>;
  export let Include: Type<Include>;
  export let FromImport: Type<FromImport>;
  export let ExprStmt: Type<ExprStmt>;
  export let Assign: Type<Assign>;
  export let AssignBlock: Type<AssignBlock>;
  export let BinExpr: Type<BinExpr>;
  export let UnaryExpr: Type<UnaryExpr>;
  export let NSRef: Type<NSRef>;
  export let Literal: Type<Literal>;
  export let Const: Type<Const>;
  export let TemplateData: Type<TemplateData>;
  export let Tuple: Type<Tuple>;
  export let List: Type<List>;
  export let Dict: Type<Dict>;
  export let Pair: Type<Pair>;
  export let Keyword: Type<Keyword>;
  export let CondExpr: Type<CondExpr>;
  export let Test: Type<Test>;
  export let Getitem: Type<Getitem>;
  export let Getattr: Type<Getattr>;
  export let Slice: Type<Slice>;
  export let Concat: Type<Concat>;
  export let Compare: Type<Compare>;
  export let Operand: Type<Operand>;
  export let Mul: Type<Mul>;
  export let Div: Type<Div>;
  export let FloorDiv: Type<FloorDiv>;
  export let Add: Type<Add>;
  export let Sub: Type<Sub>;
  export let Mod: Type<Mod>;
  export let Pow: Type<Pow>;
  export let And: Type<And>;
  export let Or: Type<Or>;
  export let Not: Type<Not>;
  export let Neg: Type<Neg>;
  export let Pos: Type<Pos>;
  export let EnvironmentAttribute: Type<EnvironmentAttribute>;
  export let ExtensionAttribute: Type<ExtensionAttribute>;
  export let ImportedName: Type<ImportedName>;
  export let InternalName: Type<InternalName>;
  export let MarkSafe: Type<MarkSafe>;
  export let MarkSafeIfAutoescape: Type<MarkSafeIfAutoescape>;
  export let ContextReference: Type<ContextReference>;
  export let DerivedContextReference: Type<DerivedContextReference>;
  export let Continue: Type<Continue>;
  export let Break: Type<Break>;
  export let Scope: Type<Scope>;
  export let OverlayScope: Type<OverlayScope>;
  export let EvalContextModifier: Type<EvalContextModifier>;
  export let ScopedEvalContextModifier: Type<ScopedEvalContextModifier>;
}
export interface NamedTypes {
  Printable: Type<namedTypes.Printable>;
  SourceLocation: Type<namedTypes.SourceLocation>;
  Node: Type<namedTypes.Node>;
  BaseNode: Type<namedTypes.BaseNode>;
  Position: Type<namedTypes.Position>;
  Stmt: Type<namedTypes.Stmt>;
  Helper: Type<namedTypes.Helper>;
  Expr: Type<namedTypes.Expr>;
  Template: Type<namedTypes.Template>;
  Output: Type<namedTypes.Output>;
  Extends: Type<namedTypes.Extends>;
  For: Type<namedTypes.For>;
  If: Type<namedTypes.If>;
  Macro: Type<namedTypes.Macro>;
  Name: Type<namedTypes.Name>;
  CallBlock: Type<namedTypes.CallBlock>;
  Call: Type<namedTypes.Call>;
  FilterBlock: Type<namedTypes.FilterBlock>;
  FilterTestBase: Type<namedTypes.FilterTestBase>;
  Filter: Type<namedTypes.Filter>;
  With: Type<namedTypes.With>;
  Block: Type<namedTypes.Block>;
  Include: Type<namedTypes.Include>;
  FromImport: Type<namedTypes.FromImport>;
  ExprStmt: Type<namedTypes.ExprStmt>;
  Assign: Type<namedTypes.Assign>;
  AssignBlock: Type<namedTypes.AssignBlock>;
  BinExpr: Type<namedTypes.BinExpr>;
  UnaryExpr: Type<namedTypes.UnaryExpr>;
  NSRef: Type<namedTypes.NSRef>;
  Literal: Type<namedTypes.Literal>;
  Const: Type<namedTypes.Const>;
  TemplateData: Type<namedTypes.TemplateData>;
  Tuple: Type<namedTypes.Tuple>;
  List: Type<namedTypes.List>;
  Dict: Type<namedTypes.Dict>;
  Pair: Type<namedTypes.Pair>;
  Keyword: Type<namedTypes.Keyword>;
  CondExpr: Type<namedTypes.CondExpr>;
  Test: Type<namedTypes.Test>;
  Getitem: Type<namedTypes.Getitem>;
  Getattr: Type<namedTypes.Getattr>;
  Slice: Type<namedTypes.Slice>;
  Concat: Type<namedTypes.Concat>;
  Compare: Type<namedTypes.Compare>;
  Operand: Type<namedTypes.Operand>;
  Mul: Type<namedTypes.Mul>;
  Div: Type<namedTypes.Div>;
  FloorDiv: Type<namedTypes.FloorDiv>;
  Add: Type<namedTypes.Add>;
  Sub: Type<namedTypes.Sub>;
  Mod: Type<namedTypes.Mod>;
  Pow: Type<namedTypes.Pow>;
  And: Type<namedTypes.And>;
  Or: Type<namedTypes.Or>;
  Not: Type<namedTypes.Not>;
  Neg: Type<namedTypes.Neg>;
  Pos: Type<namedTypes.Pos>;
  EnvironmentAttribute: Type<namedTypes.EnvironmentAttribute>;
  ExtensionAttribute: Type<namedTypes.ExtensionAttribute>;
  ImportedName: Type<namedTypes.ImportedName>;
  InternalName: Type<namedTypes.InternalName>;
  MarkSafe: Type<namedTypes.MarkSafe>;
  MarkSafeIfAutoescape: Type<namedTypes.MarkSafeIfAutoescape>;
  ContextReference: Type<namedTypes.ContextReference>;
  DerivedContextReference: Type<namedTypes.DerivedContextReference>;
  Continue: Type<namedTypes.Continue>;
  Break: Type<namedTypes.Break>;
  Scope: Type<namedTypes.Scope>;
  OverlayScope: Type<namedTypes.OverlayScope>;
  EvalContextModifier: Type<namedTypes.EvalContextModifier>;
  ScopedEvalContextModifier: Type<namedTypes.ScopedEvalContextModifier>;
}

import { NodePath } from "../lib/node-path";
import { Context } from "../lib/path-visitor";
import { namedTypes } from "./namedTypes";
export interface Visitor<M = {}> {
  visitPrintable?(this: Context & M, path: NodePath<namedTypes.Printable>): any;
  visitSourceLocation?(
    this: Context & M,
    path: NodePath<namedTypes.SourceLocation>
  ): any;
  visitNode?(this: Context & M, path: NodePath<namedTypes.Node>): any;
  visitBaseNode?(this: Context & M, path: NodePath<namedTypes.BaseNode>): any;
  visitPosition?(this: Context & M, path: NodePath<namedTypes.Position>): any;
  visitStmt?(this: Context & M, path: NodePath<namedTypes.Stmt>): any;
  visitHelper?(this: Context & M, path: NodePath<namedTypes.Helper>): any;
  visitExpr?(this: Context & M, path: NodePath<namedTypes.Expr>): any;
  visitTemplate?(this: Context & M, path: NodePath<namedTypes.Template>): any;
  visitOutput?(this: Context & M, path: NodePath<namedTypes.Output>): any;
  visitExtends?(this: Context & M, path: NodePath<namedTypes.Extends>): any;
  visitFor?(this: Context & M, path: NodePath<namedTypes.For>): any;
  visitIf?(this: Context & M, path: NodePath<namedTypes.If>): any;
  visitMacro?(this: Context & M, path: NodePath<namedTypes.Macro>): any;
  visitName?(this: Context & M, path: NodePath<namedTypes.Name>): any;
  visitCallBlock?(this: Context & M, path: NodePath<namedTypes.CallBlock>): any;
  visitCall?(this: Context & M, path: NodePath<namedTypes.Call>): any;
  visitFilterBlock?(
    this: Context & M,
    path: NodePath<namedTypes.FilterBlock>
  ): any;
  visitFilterTestBase?(
    this: Context & M,
    path: NodePath<namedTypes.FilterTestBase>
  ): any;
  visitFilter?(this: Context & M, path: NodePath<namedTypes.Filter>): any;
  visitWith?(this: Context & M, path: NodePath<namedTypes.With>): any;
  visitBlock?(this: Context & M, path: NodePath<namedTypes.Block>): any;
  visitInclude?(this: Context & M, path: NodePath<namedTypes.Include>): any;
  visitFromImport?(
    this: Context & M,
    path: NodePath<namedTypes.FromImport>
  ): any;
  visitExprStmt?(this: Context & M, path: NodePath<namedTypes.ExprStmt>): any;
  visitAssign?(this: Context & M, path: NodePath<namedTypes.Assign>): any;
  visitAssignBlock?(
    this: Context & M,
    path: NodePath<namedTypes.AssignBlock>
  ): any;
  visitBinExpr?(this: Context & M, path: NodePath<namedTypes.BinExpr>): any;
  visitUnaryExpr?(this: Context & M, path: NodePath<namedTypes.UnaryExpr>): any;
  visitNSRef?(this: Context & M, path: NodePath<namedTypes.NSRef>): any;
  visitLiteral?(this: Context & M, path: NodePath<namedTypes.Literal>): any;
  visitConst?(this: Context & M, path: NodePath<namedTypes.Const>): any;
  visitTemplateData?(
    this: Context & M,
    path: NodePath<namedTypes.TemplateData>
  ): any;
  visitTuple?(this: Context & M, path: NodePath<namedTypes.Tuple>): any;
  visitList?(this: Context & M, path: NodePath<namedTypes.List>): any;
  visitDict?(this: Context & M, path: NodePath<namedTypes.Dict>): any;
  visitPair?(this: Context & M, path: NodePath<namedTypes.Pair>): any;
  visitKeyword?(this: Context & M, path: NodePath<namedTypes.Keyword>): any;
  visitCondExpr?(this: Context & M, path: NodePath<namedTypes.CondExpr>): any;
  visitTest?(this: Context & M, path: NodePath<namedTypes.Test>): any;
  visitGetitem?(this: Context & M, path: NodePath<namedTypes.Getitem>): any;
  visitGetattr?(this: Context & M, path: NodePath<namedTypes.Getattr>): any;
  visitSlice?(this: Context & M, path: NodePath<namedTypes.Slice>): any;
  visitConcat?(this: Context & M, path: NodePath<namedTypes.Concat>): any;
  visitCompare?(this: Context & M, path: NodePath<namedTypes.Compare>): any;
  visitOperand?(this: Context & M, path: NodePath<namedTypes.Operand>): any;
  visitMul?(this: Context & M, path: NodePath<namedTypes.Mul>): any;
  visitDiv?(this: Context & M, path: NodePath<namedTypes.Div>): any;
  visitFloorDiv?(this: Context & M, path: NodePath<namedTypes.FloorDiv>): any;
  visitAdd?(this: Context & M, path: NodePath<namedTypes.Add>): any;
  visitSub?(this: Context & M, path: NodePath<namedTypes.Sub>): any;
  visitMod?(this: Context & M, path: NodePath<namedTypes.Mod>): any;
  visitPow?(this: Context & M, path: NodePath<namedTypes.Pow>): any;
  visitAnd?(this: Context & M, path: NodePath<namedTypes.And>): any;
  visitOr?(this: Context & M, path: NodePath<namedTypes.Or>): any;
  visitNot?(this: Context & M, path: NodePath<namedTypes.Not>): any;
  visitNeg?(this: Context & M, path: NodePath<namedTypes.Neg>): any;
  visitPos?(this: Context & M, path: NodePath<namedTypes.Pos>): any;
  visitEnvironmentAttribute?(
    this: Context & M,
    path: NodePath<namedTypes.EnvironmentAttribute>
  ): any;
  visitExtensionAttribute?(
    this: Context & M,
    path: NodePath<namedTypes.ExtensionAttribute>
  ): any;
  visitImportedName?(
    this: Context & M,
    path: NodePath<namedTypes.ImportedName>
  ): any;
  visitInternalName?(
    this: Context & M,
    path: NodePath<namedTypes.InternalName>
  ): any;
  visitMarkSafe?(this: Context & M, path: NodePath<namedTypes.MarkSafe>): any;
  visitMarkSafeIfAutoescape?(
    this: Context & M,
    path: NodePath<namedTypes.MarkSafeIfAutoescape>
  ): any;
  visitContextReference?(
    this: Context & M,
    path: NodePath<namedTypes.ContextReference>
  ): any;
  visitDerivedContextReference?(
    this: Context & M,
    path: NodePath<namedTypes.DerivedContextReference>
  ): any;
  visitContinue?(this: Context & M, path: NodePath<namedTypes.Continue>): any;
  visitBreak?(this: Context & M, path: NodePath<namedTypes.Break>): any;
  visitScope?(this: Context & M, path: NodePath<namedTypes.Scope>): any;
  visitOverlayScope?(
    this: Context & M,
    path: NodePath<namedTypes.OverlayScope>
  ): any;
  visitEvalContextModifier?(
    this: Context & M,
    path: NodePath<namedTypes.EvalContextModifier>
  ): any;
  visitScopedEvalContextModifier?(
    this: Context & M,
    path: NodePath<namedTypes.ScopedEvalContextModifier>
  ): any;
}

import { Type, AnyType, finalize } from "./types";
import { defaults, geq } from "./shared";

const { def, or } = Type;

def("Position").field("line", geq(1)).field("column", geq(0));

def("SourceLocation")
  .field("start", def("Position"))
  .field("end", def("Position"))
  .field("source", or(String, null), defaults["null"]);

def("Printable").field(
  "loc",
  or(def("SourceLocation"), null),
  defaults["null"],
  true
);

def("Node").abstract();

def("BaseNode").field("type", String);

def("Stmt").abstract().bases("BaseNode");

def("Helper").abstract().bases("BaseNode");

def("Expr").abstract().bases("BaseNode");

def("Template")
  .bases("BaseNode")
  .aliases("Node")
  .build("body")
  .field("body", [def("Node")]);

def("Output")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("nodes")
  .field("nodes", [def("Expr")]);

def("Extends")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("template")
  .field("template", def("Expr"));

def("For")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("target", "iter", "body", "else_", "test", "recursive")
  .field("target", def("Node"))
  .field("iter", def("Node"))
  .field("body", [def("Node")])
  .field("else_", [def("Node")])
  .field("test", or(def("Node"), null), defaults["null"])
  .field("recursive", Boolean, defaults["false"]);

def("If")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("test", "body", "elif", "else_")
  .field("test", def("Node"))
  .field("body", [def("Node")])
  .field("elif", [def("If")])
  .field("else_", [def("Node")]);

def("Name")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("name", "ctx")
  .field("name", String)
  .field("ctx", String)
  .canAssign(
    (obj: any) =>
      ["true", "false", "none", "True", "False", "None"].indexOf(obj.name) ===
      -1
  );

def("Macro")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("name", "args", "defaults", "body")
  .field("name", String)
  .field("args", [def("Name")])
  .field("defaults", [def("Expr")])
  .field("body", [def("Node")]);

def("Keyword")
  .bases("BaseNode")
  .aliases("Node", "Helper")
  .build("key", "value")
  .field("key", String)
  .field("value", def("Expr"));

def("Call")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("node", "args", "kwargs", "dynArgs", "dynKwargs")
  .field("node", def("Expr"))
  .field("args", [def("Expr")])
  .field("kwargs", [def("Keyword")])
  .field("dynArgs", or(def("Expr"), null), defaults["null"])
  .field("dynKwargs", or(def("Expr"), null), defaults["null"]);

def("CallBlock")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("call", "args", "defaults", "body")
  .field("call", def("Call"))
  .field("args", [def("Name")])
  .field("defaults", [def("Expr")])
  .field("body", [def("Node")]);

def("Pair")
  .bases("BaseNode")
  .aliases("Node", "Helper")
  .build("key", "value")
  .field("key", def("Expr"))
  .field("value", def("Expr"));

def("FilterTestBase")
  .bases("BaseNode")
  .field("node", def("Expr"))
  .field("name", String)
  .field("args", [def("Expr")])
  .field("kwargs", [def("Pair")])
  .field("dynArgs", or(def("Expr"), null), defaults["null"])
  .field("dynKwargs", or(def("Expr"), null), defaults["null"]);

def("Filter")
  .bases("FilterTestBase")
  .aliases("Node", "Expr")
  .build("node", "name", "args", "kwargs", "dynArgs", "dynKwargs")
  .field("node", or(def("Expr"), null));

def("Test")
  .bases("FilterTestBase")
  .aliases("Node", "Expr")
  .build("node", "name", "args", "kwargs", "dynArgs", "dynKwargs");

def("FilterBlock")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("body", "filter")
  .field("body", [def("Node")])
  .field("filter", def("Filter"));

def("With")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("targets", "values", "body")
  .field("targets", [def("Expr")])
  .field("values", [def("Expr")])
  .field("body", [def("Node")]);

def("Block")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("name", "body", "scoped", "required")
  .field("name", String)
  .field("body", [def("Node")])
  .field("scoped", Boolean)
  .field("required", Boolean);

def("Include")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("template", "withContext", "ignoreMissing")
  .field("template", def("Expr"))
  .field("withContext", Boolean)
  .field("ignoreMissing", Boolean);

def("FromImport")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("template", "names", "withContext")
  .field("template", def("Expr"))
  .field("names", [or(String, [String])])
  .field("withContext", Boolean);

def("ExprStmt")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("node")
  .field("node", def("Node"));

def("Assign")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("target", "node")
  .field("target", def("Expr"))
  .field("node", def("Node"));

def("AssignBlock")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("target", "filter", "body")
  .field("target", def("Expr"))
  .field("filter", or(def("Filter"), null), defaults["null"])
  .field("body", [def("Node")]);

def("BinExpr").abstract().bases("BaseNode");

def("BinExprBase")
  .bases("BaseNode")
  .field("left", def("Expr"))
  .field("right", def("Expr"))
  .field("operator", String);

def("UnaryExpr").abstract().bases("BaseNode"); // TODO

def("UnaryExprBase").bases("BaseNode").field("operator", String); // TODO

def("NSRef")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("name", "attr")
  .field("name", String)
  .field("attr", String)
  .canAssign(() => true);

def("Literal").abstract().bases("BaseNode");

// TODO: from_untrusted
def("Const")
  .bases("BaseNode")
  .aliases("Node", "Literal", "Expr")
  .build("value")
  .field("value", AnyType);

def("TemplateData")
  .bases("BaseNode")
  .aliases("Node", "Literal", "Expr")
  .build("data")
  .field("data", String);

def("Tuple")
  .bases("BaseNode")
  .aliases("Node", "Literal", "Expr")
  .build("items", "ctx")
  .field("items", [def("Expr")])
  .field("ctx", String)
  .canAssign((obj: any) =>
    obj.items.every((o: any) => def(o.type).isAssignable(o))
  );

def("List")
  .bases("BaseNode")
  .aliases("Node", "Literal", "Expr")
  .build("items")
  .field("items", [def("Expr")]);

def("Dict")
  .bases("BaseNode")
  .aliases("Node", "Literal", "Expr")
  .build("items")
  .field("items", [def("Pair")]);

def("CondExpr")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("test", "expr1", "expr2")
  .field("test", def("Expr"))
  .field("expr1", def("Expr"))
  .field("expr2", or(def("Expr"), null), defaults["null"]);

def("Getitem")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("node", "arg", "ctx")
  .field("node", def("Expr"))
  .field("arg", def("Expr"))
  .field("ctx", String);

def("Getattr")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("node", "attr", "ctx")
  .field("node", def("Expr"))
  .field("attr", String)
  .field("ctx", String);

def("Slice")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("start", "stop", "step")
  .field("start", or(def("Expr"), null), defaults["null"])
  .field("stop", or(def("Expr"), null), defaults["null"])
  .field("step", or(def("Expr"), null), defaults["null"]);

def("Concat")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("nodes")
  .field("nodes", [def("Expr")]);

def("Compare")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("expr", "ops")
  .field("expr", def("Expr"))
  .field("ops", [def("Operand")]);

def("Operand")
  .bases("BaseNode")
  .aliases("Node", "Helper")
  .build("op", "expr")
  .field("op", String)
  .field("expr", def("Expr"));

def("Mul")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "*");

def("Div")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "/");

def("FloorDiv")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "//");

def("Add")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "+");

def("Sub")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "-");

def("Mod")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "%");

def("Pow")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "**");

def("And")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "and");

def("Or")
  .bases("BinExprBase")
  .aliases("Node", "BinExpr", "Expr")
  .build("left", "right", "operator")
  .field("operator", "or");

def("Not")
  .bases("UnaryExprBase")
  .aliases("Node", "UnaryExpr", "Expr")
  .build("operator")
  .field("operator", "not");

def("Neg")
  .bases("UnaryExprBase")
  .aliases("Node", "UnaryExpr", "Expr")
  .build("operator")
  .field("operator", "-");

def("Pos")
  .bases("UnaryExprBase")
  .aliases("Node", "UnaryExpr", "Expr")
  .build("operator")
  .field("operator", "+");

def("EnvironmentAttribute")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("name")
  .field("name", String);

def("ExtensionAttribute")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("identifier", "name")
  .field("identifier", String)
  .field("name", String);

def("ImportedName")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("importname")
  .field("importname", String);

def("InternalName").bases("BaseNode").aliases("Node", "Expr").build("name").field("name", String);

def("MarkSafe").bases("BaseNode").aliases("Node", "Expr").build("expr").field("expr", def("Expr"));

def("MarkSafeIfAutoescape")
  .bases("BaseNode")
  .aliases("Node", "Expr")
  .build("expr")
  .field("expr", def("Expr"));

def("ContextReference").bases("BaseNode").aliases("Node", "Expr").build();

def("DerivedContextReference").bases("BaseNode").aliases("Node", "Expr").build();

def("Continue").bases("BaseNode").aliases("Node", "Stmt").build();

def("Break").bases("BaseNode").aliases("Node", "Stmt").build();

def("Scope")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("body")
  .field("body", [def("Node")]);

def("OverlayScope")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("context", "body")
  .field("context", def("Expr"))
  .field("body", [def("Node")]);

def("EvalContextModifier")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("options")
  .field("options", [def("Keyword")]);

def("ScopedEvalContextModifier")
  .bases("BaseNode")
  .aliases("Node", "Stmt")
  .build("options", "body")
  .field("options", [def("Keyword")])
  .field("body", [def("Node")]);

finalize();

import { Type, AnyType, finalize } from "./types";
import { defaults, geq } from "./shared";

const { def, or } = Type;

def("Printable")
  .abstract()
  .field("loc", or(def("SourceLocation"), null), defaults["null"], true);

def("Node").abstract();

def("BaseNode").bases("Node").field("type", String);

def("SourceLocation")
  .abstract()
  .field("start", def("Position"))
  .field("end", def("Position"))
  .field("source", or(String, null), defaults["null"]);

def("Position").abstract().field("line", geq(1)).field("column", geq(0));

def("Stmt").abstract().bases("BaseNode");

def("Helper").abstract().bases("BaseNode");

def("Expr").abstract().bases("BaseNode");

def("Template")
  .bases("BaseNode")
  .field("body", [def("Node")]);

def("Output")
  .bases("Stmt")
  .field("nodes", [def("Expr")]);

def("Extends").bases("Stmt").field("template", def("Expr"));

def("For")
  .bases("Stmt")
  .field("target", def("Node"))
  .field("iter", def("Node"))
  .field("body", [def("Node")])
  .field("else", [def("Node")])
  .field("test", or(def("Node"), null), defaults["null"])
  .field("recursive", Boolean, defaults["false"]);

def("If")
  .bases("Stmt")
  .field("test", def("Node"))
  .field("body", [def("Node")])
  .field("elif", [def("If")])
  .field("else", [def("Node")]);

def("Macro")
  .bases("Stmt")
  .field("name", String)
  .field("args", [def("Name")])
  .field("defaults", [def("Expr")])
  .field("body", [def("Node")]);

def("CallBlock")
  .bases("Stmt")
  .field("call", def("Call"))
  .field("args", [def("Name")])
  .field("defaults", [def("Expr")])
  .field("body", [def("Node")]);

def("FilterBlock")
  .bases("Stmt")
  .field("body", [def("Node")])
  .field("filter", def("Filter"));

def("With")
  .bases("Stmt")
  .field("targets", [def("Expr")])
  .field("values", [def("Expr")])
  .field("body", [def("Node")]);

def("Block")
  .bases("Stmt")
  .field("name", String)
  .field("body", [def("Node")])
  .field("scoped", Boolean)
  .field("required", Boolean);

def("Include")
  .bases("Stmt")
  .field("template", def("Expr"))
  .field("with_context", Boolean)
  .field("ignore_missing", Boolean);

def("FromImport")
  .bases("Stmt")
  .field("template", def("Expr"))
  .field("names", [or(String, [String])])
  .field("with_context", Boolean);

def("ExprStmt").bases("Stmt").field("node", def("Node"));

def("Assign")
  .bases("Stmt")
  .field("target", def("Expr"))
  .field("node", def("Node"));

def("AssignBlock")
  .bases("Stmt")
  .field("target", def("Expr"))
  .field("filter", or(def("Filter"), null), defaults["null"])
  .field("body", [def("Node")]);

def("BinExpr")
  .abstract()
  .bases("BaseNode")
  .field("left", def("Expr"))
  .field("right", def("Expr"))
  .field("operator", String);

def("UnaryExpr").abstract().bases("BaseNode").field("operator", String); // TODO

// TODO: can_assign
def("Name")
  .bases("BaseNode")
  .field("name", String)
  .field("ctx", String)
  .canAssign(
    (obj: any) =>
      ["true", "false", "none", "True", "False", "None"].indexOf(obj.name) ===
      -1
  );

// TODO: can_assign
def("NSRef")
  .bases("BaseNode")
  .field("name", String)
  .field("attr", String)
  .canAssign(() => true);

def("Literal").abstract().bases("BaseNode");

// TODO: from_untrusted
def("Const").bases("Literal").field("value", new AnyType());

def("TemplateData").bases("Literal").field("data", String);

def("Tuple")
  .bases("Literal")
  .field("items", [def("Expr")])
  .field("ctx", String)
  .canAssign((obj: any) =>
    obj.items.every((o: any) => def(o.type).isAssignable(o))
  );

def("List")
  .bases("Literal")
  .field("items", [def("Expr")]);

def("Dict")
  .bases("Literal")
  .field("items", [def("Pair")]);

def("Pair")
  .bases("Helper")
  .field("key", def("Expr"))
  .field("value", def("Expr"));

def("Keyword").bases("Helper").field("key", String).field("value", def("Expr"));

def("CondExpr")
  .bases("BaseNode")
  .field("test", def("Expr"))
  .field("expr1", def("Expr"))
  .field("expr2", or(def("Expr"), null), defaults["null"]);

def("FilterTestBase")
  .abstract()
  .bases("BaseNode")
  .field("node", def("Expr"))
  .field("name", String)
  .field("args", [def("Expr")])
  .field("kwargs", [def("Pair")])
  .field("dyn_args", or(def("Expr"), null), defaults["null"])
  .field("dyn_kwargs", or(def("Expr"), null), defaults["null"]);

def("Filter")
  .bases("FilterTestBase")
  .field("node", or(def("Expr"), null));

def("Test").bases("FilterTestBase");

def("Call")
  .bases("BaseNode")
  .field("node", def("Expr"))
  .field("args", [def("Expr")])
  .field("kwargs", [def("Keyword")])
  .field("dyn_args", or(def("Expr"), null), defaults["null"])
  .field("dyn_kwargs", or(def("Expr"), null), defaults["null"]);

def("Getitem")
  .bases("BaseNode")
  .field("node", def("Expr"))
  .field("arg", def("Expr"))
  .field("ctx", String);

def("Getattr")
  .bases("BaseNode")
  .field("node", def("Expr"))
  .field("attr", String)
  .field("ctx", String);

def("Slice")
  .bases("BaseNode")
  .field("start", or(def("Expr"), null), defaults["null"])
  .field("stop", or(def("Expr"), null), defaults["null"])
  .field("step", or(def("Expr"), null), defaults["null"]);

def("Concat")
  .bases("BaseNode")
  .field("nodes", [def("Expr")]);

def("Compare")
  .bases("BaseNode")
  .field("expr", def("Expr"))
  .field("ops", [def("Operand")]);

def("Operand").bases("Helper").field("op", String).field("expr", def("Expr"));

def("Mul").bases("BinExpr").field("operator", "*");

def("Div").bases("BinExpr").field("operator", "/");

def("FloorDiv").bases("BinExpr").field("operator", "//");

def("Add").bases("BinExpr").field("operator", "+");

def("Sub").bases("BinExpr").field("operator", "-");

def("Mod").bases("BinExpr").field("operator", "%");

def("Pow").bases("BinExpr").field("operator", "**");

def("And").bases("BinExpr").field("operator", "and");

def("Or").bases("BinExpr").field("operator", "or");

def("Not").bases("UnaryExpr").field("operator", "not");

def("Neg").bases("UnaryExpr").field("operator", "-");

def("Pos").bases("UnaryExpr").field("operator", "+");

def("EnvironmentAttribute").bases("BaseNode").field("name", String);

def("ExtensionAttribute")
  .bases("BaseNode")
  .field("identifier", String)
  .field("name", String);

def("ImportedName").bases("BaseNode").field("importname", String);

def("InternalName").bases("BaseNode").field("name", String);

def("MarkSafe").bases("BaseNode").field("expr", def("Expr"));

def("MarkSafeIfAutoescape").bases("BaseNode").field("expr", def("Expr"));

def("ContextReference").bases("BaseNode");

def("DerivedContextReference").bases("BaseNode");

def("Continue").bases("Stmt");

def("Break").bases("Stmt");

def("Scope")
  .bases("Stmt")
  .field("body", [def("Node")]);

def("OverlayScope")
  .bases("Stmt")
  .field("context", def("Expr"))
  .field("body", [def("Node")]);

def("EvalContextModifier")
  .bases("Stmt")
  .field("options", [def("Keyword")]);

def("ScopedEvalContextModifier")
  .bases("EvalContextModifier")
  .field("body", [def("Node")]);

finalize();

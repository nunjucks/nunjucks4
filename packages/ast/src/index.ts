// Node = t.TypeVar(Node, bound=Node)
// import deepcopy from "lodash.deepcopy";
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
} from "./types";

import { Path } from "./path";
import { PathVisitor } from "./path-visitor";
import type { Visitor } from "./gen/visitor";

Object.assign(types, njkTypes);

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
};

export type { Visitor };

export const visit = PathVisitor.visit;

export function canAssign(node: types.Node): boolean {
  const typeDef = Type.def(node.type);
  return typeDef.isAssignable(node);
}

// type Node = any;
//
// type BinOp = (a: any, b: any) => any;
// type UnaryOpt = (a: any) => any;
// type CmpOp = (a: any, b: any) => boolean;
//
// function isFunction(obj: unknown): obj is Function {
//   return Object.prototype.toString.call(obj) === "[object Function]";
// }
//
// function isArray(obj: unknown): obj is any[] {
//   return Object.prototype.toString.call(obj) === "[object Array]";
// }
//
// function isString(obj: unknown): obj is string {
//   return Object.prototype.toString.call(obj) === "[object String]";
// }
//
// function isObject(obj: unknown): obj is Object {
//   return Object.prototype.toString.call(obj) === "[object Object]";
// }
//
// function in_(a: any, b: any): boolean {
//   if (isArray(a) || isString(a)) {
//     return a.indexOf(b) !== -1;
//   } else if (isObject(a)) {
//     return b in a;
//   }
//   throw new Error(
//     'Cannot use "in" operator to search for "' + key + '" in unexpected types.'
//   );
// }
//
// const operator = {
//   mul(a: any, b: any): number {
//     return a * b;
//   },
//   truediv(a: any, b: any): number {
//     return a / b;
//   },
//   floordiv(a: any, b: any): number {
//     return Math.floor(a / b);
//   },
//   pow(a: any, b: any): number {
//     return Math.pow(a, b);
//   },
//   mod(a: any, b: any): number {
//     return a % b;
//   },
//   add(a: any, b: any): any {
//     return a + b;
//   },
//   sub(a: any, b: any): number {
//     return a - b;
//   },
//   not(a: any): boolean {
//     return !a;
//   },
//   pos(a: any): number {
//     return +a;
//   },
//   neg(a: any): number {
//     return -a;
//   },
//   eq(a: any, b: any): boolean {
//     return a == b;
//   },
//   ne(a: any, b: any): boolean {
//     return a != b;
//   },
//   gt(a: any, b: any): boolean {
//     return a > b;
//   },
//   ge(a: any, b: any): boolean {
//     return a >= b;
//   },
//   lt(a: any, b: any): boolean {
//     return a < b;
//   },
//   le(a: any, b: any): boolean {
//     return a <= b;
//   },
//   in_(a: any, b: any): boolean {
//     return in_(a, b);
//   },
//   notin(a: any, b: any): boolean {
//     return !in_(a, b);
//   },
// };
//
// const _binop_to_func: Record<string, BinOp> = {
//   "*": operator.mul,
//   "/": operator.truediv,
//   "//": operator.floordiv,
//   "**": operator.pow,
//   "%": operator.mod,
//   "+": operator.add,
//   "-": operator.sub,
// };
//
// const _uaop_to_func: Record<string, UnaryOp> = {
//   not: operator.not,
//   "+": operator.pos,
//   "-": operator.neg,
// };
//
// const _cmpop_to_func: Record<string, CmpOp> = {
//   eq: operator.eq,
//   ne: operator.ne,
//   gt: operator.gt,
//   gteq: operator.ge,
//   lt: operator.lt,
//   lteq: operator.le,
//   in: operator.in_,
//   notin: operator.notin,
// };
//
// // Raised if the node could not perform a requested action.
// class Impossible extends Error {}
//
// // class NodeType(type):
// //     """A metaclass for nodes that handles the field and attribute
// //     inheritance.  fields and attributes from the parent class are
// //     automatically forwarded to the child."""
// //
// //     def __new__(mcs, name, bases, d):  # type: ignore
// //         for attr in "fields", "attributes":
// //             storage = []
// //             storage.extend(getattr(bases[0] if bases else object, attr, ()))
// //             storage.extend(d.get(attr, ()))
// //             assert len(bases) <= 1, "multiple inheritance not allowed"
// //             assert len(storage) == len(set(storage)), "layout conflict"
// //             d[attr] = tuple(storage)
// //         d.setdefault("abstract", False)
// //         return type.__new__(mcs, name, bases, d)
//
// class EvalContext {
//   // """Holds evaluation time information.  Custom attributes can be attached
//   // to it in extensions.
//   // """
//
//   environment: Environment;
//   autoescape: (...args: any) => any;
//   volatile: boolean;
//   data: Record<string, any>;
//
//   constructor(environment: Environment, template_name?: str): void {
//     this.environment = environment;
//     if (typeof environment.autoescape === "function") {
//       this.autoescape = environment.autoescape(template_name);
//     } else {
//       self.autoescape = environment.autoescape;
//     }
//     this.volatile = false;
//     this.data = {};
//   }
//
//   save(): Record<string, any> {
//     return deepcopy(this.data);
//   }
//
//   revert(old: Record<string, any>): void {
//     this.data = { ...old };
//   }
// }
//
// function get_eval_context(node: Node, ctx?: EvalContext): EvalContext {
//   if (ctx === undefined) {
//     if (node.environment === undefined) {
//       throw new Error(
//         "if no eval context is passed, the node must have an attached environment."
//       );
//     }
//     return new EvalContext(node.environment);
//   } else {
//     return ctx;
//   }
// }
//
// // class Node {
// //   /*Baseclass for all Jinja nodes.  There are a number of nodes available
// //   of different types.  There are four major types:
// //
// //   -   :class:`Stmt`: statements
// //   -   :class:`Expr`: expressions
// //   -   :class:`Helper`: helper nodes
// //   -   :class:`Template`: the outermost wrapper node
// //
// //   All nodes have fields and attributes.  Fields may be other nodes, lists,
// //   or arbitrary values.  Fields are passed to the constructor as regular
// //   positional arguments, attributes as keyword arguments.  Each node has
// //   two attributes: `lineno` (the line number of the node) and `environment`.
// //   The `environment` attribute is set at the end of the parsing process for
// //   all nodes automatically.
// //   */
// //
// //   fields: string[];
// //   attributes: string[];
// //
// //   get abstract() {
// //     return true;
// //   }
// //
// //   lineno: number;
// //   environment?: Environment;
// //
// //   constructor() {
// //     this.attributes = ["lineno", "environment"];
// //   }
// //
// //   // constructor(self, *fields: t.Any, **attributes: t.Any) -> None {
// //   //   if self.abstract:
// //   //     raise TypeError("abstract nodes are not instantiable")
// //   //   if fields:
// //   //     if len(fields) != len(self.fields):
// //   //       if not self.fields:
// //   //         raise TypeError(f"{type(self).__name__!r} takes 0 arguments")
// //   //       raise TypeError(
// //   //         f"{type(self).__name__!r} takes 0 or {len(self.fields)}"
// //   //         f" argument{'s' if len(self.fields) != 1 else ''}"
// //   //       )
// //   //     for name, arg in zip(self.fields, fields):
// //   //       setattr(self, name, arg)
// //   //   for attr in self.attributes:
// //   //     setattr(self, attr, attributes.pop(attr, None))
// //   //   if attributes:
// //   //     raise TypeError(f"unknown attribute {next(iter(attributes))!r}")
// //   // }
// //
// //   *iter_fields(
// //     exclude?: string[],
// //     only?: string[],
// //   ): Iterator<[string, any]> {
// //     /*This method iterates over all fields that are defined and yields
// //     ``(key, value)`` tuples.  Per default all fields are returned, but
// //     it's possible to limit that to some fields by providing the `only`
// //     parameter or to exclude some using the `exclude` parameter.  Both
// //     should be sets or tuples of field names.
// //     */
// //     for (name of this.fields) {
// //       if (
// //         (exclude === undefined && only === undefined)
// //         || (exclude !== undefined && exclude.indexOf(name) === -1)
// //         || (only !== undefined && only.indexOf(name) !== -1)
// //       ) {
// //         if (Object.prototype.hasOwnProperty.call(this.data, name)) {
// //           yield [name, this.data[name]];
// //         }
// //       }
// //     }
// //   }
// //
// //   def iter_child_nodes(
// //     self,
// //     exclude: t.Optional[t.Container[str]] = None,
// //     only: t.Optional[t.Container[str]] = None,
// //   ) -> t.Iterator[Node]:
// //     """Iterates over all direct child nodes of the node.  This iterates
// //     over all fields and yields the values of they are nodes.  If the value
// //     of a field is a list all the nodes in that list are returned.
// //     """
// //     for _, item in self.iter_fields(exclude, only):
// //       if isinstance(item, list):
// //         for n in item:
// //           if isinstance(n, Node):
// //             yield n
// //       elif isinstance(item, Node):
// //         yield item
// //
// //   def find(self, node_type: t.Type[Node]) -> t.Optional[Node]:
// //     """Find the first node of a given type.  If no such node exists the
// //     return value is `None`.
// //     """
// //     for result in self.find_all(node_type):
// //       return result
// //
// //     return None
// //
// //   def find_all(
// //     self, node_type: t.Union[t.Type[Node], t.Tuple[t.Type[Node], ...]]
// //   ) -> t.Iterator[Node]:
// //     """Find all the nodes of a given type.  If the type is a tuple,
// //     the check is performed for any of the tuple items.
// //     """
// //     for child in self.iter_child_nodes():
// //       if isinstance(child, node_type):
// //         yield child  # type: ignore
// //       yield from child.find_all(node_type)
// //
// //   def set_ctx(self, ctx: str) -> Node:
// //     """Reset the context of a node and all child nodes.  Per default the
// //     parser will all generate nodes that have a 'load' context as it's the
// //     most common one.  This method is used in the parser to set assignment
// //     targets and other nodes to a store context.
// //     """
// //     todo = deque([self])
// //     while todo:
// //       node = todo.popleft()
// //       if "ctx" in node.fields:
// //         node.ctx = ctx  # type: ignore
// //       todo.extend(node.iter_child_nodes())
// //     return self
// //
// //   def set_lineno(self, lineno: int, override: bool = False) -> Node:
// //     """Set the line numbers of the node and children."""
// //     todo = deque([self])
// //     while todo:
// //       node = todo.popleft()
// //       if "lineno" in node.attributes:
// //         if node.lineno is None or override:
// //           node.lineno = lineno
// //       todo.extend(node.iter_child_nodes())
// //     return self
// //
// //   def set_environment(self, environment: "Environment") -> Node:
// //     """Set the environment for all nodes."""
// //     todo = deque([self])
// //     while todo:
// //       node = todo.popleft()
// //       node.environment = environment
// //       todo.extend(node.iter_child_nodes())
// //     return self
// //
// //   def __eq__(self, other: t.Any) -> bool:
// //     if type(self) is not type(other):
// //       return NotImplemented
// //
// //     return tuple(self.iter_fields()) == tuple(other.iter_fields())
// //
// //   def __hash__(self) -> int:
// //     return hash(tuple(self.iter_fields()))
// //
// //   def __repr__(self) -> str:
// //     args_str = ", ".join(f"{a}={getattr(self, a, None)!r}" for a in self.fields)
// //     return f"{type(self).__name__}({args_str})"
// //
// //   def dump(self) -> str:
// //     def _dump(node: t.Union[Node, t.Any]) -> None:
// //       if not isinstance(node, Node):
// //         buf.append(repr(node))
// //         return
// //
// //       buf.append(f"nodes.{type(node).__name__}(")
// //       if not node.fields:
// //         buf.append(")")
// //         return
// //       for idx, field in enumerate(node.fields):
// //         if idx:
// //           buf.append(", ")
// //         value = getattr(node, field)
// //         if isinstance(value, list):
// //           buf.append("[")
// //           for idx, item in enumerate(value):
// //             if idx:
// //               buf.append(", ")
// //             _dump(item)
// //           buf.append("]")
// //         else:
// //           _dump(value)
// //       buf.append(")")
// //
// //     buf: t.List[str] = []
// //     _dump(self)
// //     return "".join(buf)
// // }
// //
// //
// // class Stmt(Node):
// //   """Base node for all statements."""
// //
// //   abstract = True
// //
// //
// // class Helper(Node):
// //   """Nodes that exist in a specific context only."""
// //
// //   abstract = True
// //
// //
// // class Template(Node):
// //   """Node that represents a template.  This must be the outermost node that
// //   is passed to the compiler.
// //   """
// //
// //   fields = ("body",)
// //   body: t.List[Node]
// //
// //
// // class Output(Stmt):
// //   """A node that holds multiple expressions which are then printed out.
// //   This is used both for the `print` statement and the regular template data.
// //   """
// //
// //   fields = ("nodes",)
// //   nodes: t.List["Expr"]
// //
// //
// // class Extends(Stmt):
// //   """Represents an extends statement."""
// //
// //   fields = ("template",)
// //   template: "Expr"
// //
// //
// // class For(Stmt):
// //   """The for loop.  `target` is the target for the iteration (usually a
// //   :class:`Name` or :class:`Tuple`), `iter` the iterable.  `body` is a list
// //   of nodes that are used as loop-body, and `else_` a list of nodes for the
// //   `else` block.  If no else node exists it has to be an empty list.
// //
// //   For filtered nodes an expression can be stored as `test`, otherwise `None`.
// //   """
// //
// //   fields = ("target", "iter", "body", "else_", "test", "recursive")
// //   target: Node
// //   iter: Node
// //   body: t.List[Node]
// //   else_: t.List[Node]
// //   test: t.Optional[Node]
// //   recursive: bool
// //
// //
// // class If(Stmt):
// //   """If `test` is true, `body` is rendered, else `else_`."""
// //
// //   fields = ("test", "body", "elif_", "else_")
// //   test: Node
// //   body: t.List[Node]
// //   elif_: t.List["If"]
// //   else_: t.List[Node]
// //
// //
// // class Macro(Stmt):
// //   """A macro definition.  `name` is the name of the macro, `args` a list of
// //   arguments and `defaults` a list of defaults if there are any.  `body` is
// //   a list of nodes for the macro body.
// //   """
// //
// //   fields = ("name", "args", "defaults", "body")
// //   name: str
// //   args: t.List["Name"]
// //   defaults: t.List["Expr"]
// //   body: t.List[Node]
// //
// //
// // class CallBlock(Stmt):
// //   """Like a macro without a name but a call instead.  `call` is called with
// //   the unnamed macro as `caller` argument this node holds.
// //   """
// //
// //   fields = ("call", "args", "defaults", "body")
// //   call: "Call"
// //   args: t.List["Name"]
// //   defaults: t.List["Expr"]
// //   body: t.List[Node]
// //
// //
// // class FilterBlock(Stmt):
// //   """Node for filter sections."""
// //
// //   fields = ("body", "filter")
// //   body: t.List[Node]
// //   filter: "Filter"
// //
// //
// // class With(Stmt):
// //   """Specific node for with statements.  In older versions of Jinja the
// //   with statement was implemented on the base of the `Scope` node instead.
// //
// //   .. versionadded:: 2.9.3
// //   """
// //
// //   fields = ("targets", "values", "body")
// //   targets: t.List["Expr"]
// //   values: t.List["Expr"]
// //   body: t.List[Node]
// //
// //
// // class Block(Stmt):
// //   """A node that represents a block.
// //
// //   .. versionchanged:: 3.0.0
// //     the `required` field was added.
// //   """
// //
// //   fields = ("name", "body", "scoped", "required")
// //   name: str
// //   body: t.List[Node]
// //   scoped: bool
// //   required: bool
// //
// //
// // class Include(Stmt):
// //   """A node that represents the include tag."""
// //
// //   fields = ("template", "with_context", "ignore_missing")
// //   template: "Expr"
// //   with_context: bool
// //   ignore_missing: bool
// //
// //
// // class Import(Stmt):
// //   """A node that represents the import tag."""
// //
// //   fields = ("template", "target", "with_context")
// //   template: "Expr"
// //   target: str
// //   with_context: bool
// //
// //
// // class FromImport(Stmt):
// //   """A node that represents the from import tag.  It's important to not
// //   pass unsafe names to the name attribute.  The compiler translates the
// //   attribute lookups directly into getattr calls and does *not* use the
// //   subscript callback of the interface.  As exported variables may not
// //   start with double underscores (which the parser asserts) this is not a
// //   problem for regular Jinja code, but if this node is used in an extension
// //   extra care must be taken.
// //
// //   The list of names may contain tuples if aliases are wanted.
// //   """
// //
// //   fields = ("template", "names", "with_context")
// //   template: "Expr"
// //   names: t.List[t.Union[str, t.Tuple[str, str]]]
// //   with_context: bool
// //
// //
// // class ExprStmt(Stmt):
// //   """A statement that evaluates an expression and discards the result."""
// //
// //   fields = ("node",)
// //   node: Node
// //
// //
// // class Assign(Stmt):
// //   """Assigns an expression to a target."""
// //
// //   fields = ("target", "node")
// //   target: "Expr"
// //   node: Node
// //
// //
// // class AssignBlock(Stmt):
// //   """Assigns a block to a target."""
// //
// //   fields = ("target", "filter", "body")
// //   target: "Expr"
// //   filter: t.Optional["Filter"]
// //   body: t.List[Node]
// //
// //
// // class Expr(Node):
// //   """Baseclass for all expressions."""
// //
// //   abstract = True
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     """Return the value of the expression as constant or raise
// //     :exc:`Impossible` if this was not possible.
// //
// //     An :class:`EvalContext` can be provided, if none is given
// //     a default context is created which requires the nodes to have
// //     an attached environment.
// //
// //     .. versionchanged:: 2.4
// //        the `eval_ctx` parameter was added.
// //     """
// //     raise Impossible()
// //
// //   def can_assign(self) -> bool:
// //     """Check if it's possible to assign something to this node."""
// //     return False
// //
// //
// // class BinExpr(Expr):
// //   """Baseclass for all binary expressions."""
// //
// //   fields = ("left", "right")
// //   left: Expr
// //   right: Expr
// //   operator: str
// //   abstract = True
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //
// //     # intercepted operators cannot be folded at compile time
// //     if (
// //       eval_ctx.environment.sandboxed
// //       and self.operator in eval_ctx.environment.intercepted_binops  # type: ignore
// //     ):
// //       raise Impossible()
// //     f = _binop_to_func[self.operator]
// //     try:
// //       return f(self.left.as_const(eval_ctx), self.right.as_const(eval_ctx))
// //     except Exception:
// //       raise Impossible()
// //
// //
// // class UnaryExpr(Expr):
// //   """Baseclass for all unary expressions."""
// //
// //   fields = ("node",)
// //   node: Expr
// //   operator: str
// //   abstract = True
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //
// //     # intercepted operators cannot be folded at compile time
// //     if (
// //       eval_ctx.environment.sandboxed
// //       and self.operator in eval_ctx.environment.intercepted_unops  # type: ignore
// //     ):
// //       raise Impossible()
// //     f = _uaop_to_func[self.operator]
// //     try:
// //       return f(self.node.as_const(eval_ctx))
// //     except Exception:
// //       raise Impossible()
// //
// //
// // class Name(Expr):
// //   """Looks up a name or stores a value in a name.
// //   The `ctx` of the node can be one of the following values:
// //
// //   -   `store`: store a value in the name
// //   -   `load`: load that name
// //   -   `param`: like `store` but if the name was defined as function parameter.
// //   """
// //
// //   fields = ("name", "ctx")
// //   name: str
// //   ctx: str
// //
// //   def can_assign(self) -> bool:
// //     return self.name not in {"true", "false", "none", "True", "False", "None"}
// //
// //
// // class NSRef(Expr):
// //   """Reference to a namespace value assignment"""
// //
// //   fields = ("name", "attr")
// //   name: str
// //   attr: str
// //
// //   def can_assign(self) -> bool:
// //     # We don't need any special checks here; NSRef assignments have a
// //     # runtime check to ensure the target is a namespace object which will
// //     # have been checked already as it is created using a normal assignment
// //     # which goes through a `Name` node.
// //     return True
// //
// //
// // class Literal(Expr):
// //   """Baseclass for literals."""
// //
// //   abstract = True
// //
// //
// // class Const(Literal):
// //   """All constant values.  The parser will return this node for simple
// //   constants such as ``42`` or ``"foo"`` but it can be used to store more
// //   complex values such as lists too.  Only constants with a safe
// //   representation (objects where ``eval(repr(x)) == x`` is true).
// //   """
// //
// //   fields = ("value",)
// //   value: t.Any
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     return self.value
// //
// //   @classmethod
// //   def from_untrusted(
// //     cls,
// //     value: t.Any,
// //     lineno: t.Optional[int] = None,
// //     environment: "t.Optional[Environment]" = None,
// //   ) -> "Const":
// //     """Return a const object if the value is representable as
// //     constant value in the generated code, otherwise it will raise
// //     an `Impossible` exception.
// //     """
// //     from .compiler import has_safe_repr
// //
// //     if not has_safe_repr(value):
// //       raise Impossible()
// //     return cls(value, lineno=lineno, environment=environment)
// //
// //
// // class TemplateData(Literal):
// //   """A constant template string."""
// //
// //   fields = ("data",)
// //   data: str
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> str:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     if eval_ctx.volatile:
// //       raise Impossible()
// //     if eval_ctx.autoescape:
// //       return Markup(self.data)
// //     return self.data
// //
// //
// // class Tuple(Literal):
// //   """For loop unpacking and some other things like multiple arguments
// //   for subscripts.  Like for :class:`Name` `ctx` specifies if the tuple
// //   is used for loading the names or storing.
// //   """
// //
// //   fields = ("items", "ctx")
// //   items: t.List[Expr]
// //   ctx: str
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Tuple[t.Any, ...]:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return tuple(x.as_const(eval_ctx) for x in self.items)
// //
// //   def can_assign(self) -> bool:
// //     for item in self.items:
// //       if not item.can_assign():
// //         return False
// //     return True
// //
// //
// // class List(Literal):
// //   """Any list literal such as ``[1, 2, 3]``"""
// //
// //   fields = ("items",)
// //   items: t.List[Expr]
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.List[t.Any]:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return [x.as_const(eval_ctx) for x in self.items]
// //
// //
// // class Dict(Literal):
// //   """Any dict literal such as ``{1: 2, 3: 4}``.  The items must be a list of
// //   :class:`Pair` nodes.
// //   """
// //
// //   fields = ("items",)
// //   items: t.List["Pair"]
// //
// //   def as_const(
// //     self, eval_ctx: t.Optional[EvalContext] = None
// //   ) -> t.Dict[t.Any, t.Any]:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return dict(x.as_const(eval_ctx) for x in self.items)
// //
// //
// // class Pair(Helper):
// //   """A key, value pair for dicts."""
// //
// //   fields = ("key", "value")
// //   key: Expr
// //   value: Expr
// //
// //   def as_const(
// //     self, eval_ctx: t.Optional[EvalContext] = None
// //   ) -> t.Tuple[t.Any, t.Any]:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return self.key.as_const(eval_ctx), self.value.as_const(eval_ctx)
// //
// //
// // class Keyword(Helper):
// //   """A key, value pair for keyword arguments where key is a string."""
// //
// //   fields = ("key", "value")
// //   key: str
// //   value: Expr
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Tuple[str, t.Any]:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return self.key, self.value.as_const(eval_ctx)
// //
// //
// // class CondExpr(Expr):
// //   """A conditional expression (inline if expression).  (``{{
// //   foo if bar else baz }}``)
// //   """
// //
// //   fields = ("test", "expr1", "expr2")
// //   test: Expr
// //   expr1: Expr
// //   expr2: t.Optional[Expr]
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     if self.test.as_const(eval_ctx):
// //       return self.expr1.as_const(eval_ctx)
// //
// //     # if we evaluate to an undefined object, we better do that at runtime
// //     if self.expr2 is None:
// //       raise Impossible()
// //
// //     return self.expr2.as_const(eval_ctx)
// //
// //
// // def args_as_const(
// //   node: t.Union["_FilterTestCommon", "Call"], eval_ctx: t.Optional[EvalContext]
// // ) -> t.Tuple[t.List[t.Any], t.Dict[t.Any, t.Any]]:
// //   args = [x.as_const(eval_ctx) for x in node.args]
// //   kwargs = dict(x.as_const(eval_ctx) for x in node.kwargs)
// //
// //   if node.dyn_args is not None:
// //     try:
// //       args.extend(node.dyn_args.as_const(eval_ctx))
// //     except Exception:
// //       raise Impossible()
// //
// //   if node.dyn_kwargs is not None:
// //     try:
// //       kwargs.update(node.dyn_kwargs.as_const(eval_ctx))
// //     except Exception:
// //       raise Impossible()
// //
// //   return args, kwargs
// //
// //
// // class _FilterTestCommon(Expr):
// //   fields = ("node", "name", "args", "kwargs", "dyn_args", "dyn_kwargs")
// //   node: Expr
// //   name: str
// //   args: t.List[Expr]
// //   kwargs: t.List[Pair]
// //   dyn_args: t.Optional[Expr]
// //   dyn_kwargs: t.Optional[Expr]
// //   abstract = True
// //   _is_filter = True
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //
// //     if eval_ctx.volatile:
// //       raise Impossible()
// //
// //     if self._is_filter:
// //       env_map = eval_ctx.environment.filters
// //     else:
// //       env_map = eval_ctx.environment.tests
// //
// //     func = env_map.get(self.name)
// //     pass_arg = _PassArg.from_obj(func)  # type: ignore
// //
// //     if func is None or pass_arg is _PassArg.context:
// //       raise Impossible()
// //
// //     if eval_ctx.environment.is_async and (
// //       getattr(func, "jinja_async_variant", False) is True
// //       or inspect.iscoroutinefunction(func)
// //     ):
// //       raise Impossible()
// //
// //     args, kwargs = args_as_const(self, eval_ctx)
// //     args.insert(0, self.node.as_const(eval_ctx))
// //
// //     if pass_arg is _PassArg.eval_context:
// //       args.insert(0, eval_ctx)
// //     elif pass_arg is _PassArg.environment:
// //       args.insert(0, eval_ctx.environment)
// //
// //     try:
// //       return func(*args, **kwargs)
// //     except Exception:
// //       raise Impossible()
// //
// //
// // class Filter(_FilterTestCommon):
// //   """Apply a filter to an expression. ``name`` is the name of the
// //   filter, the other fields are the same as :class:`Call`.
// //
// //   If ``node`` is ``None``, the filter is being used in a filter block
// //   and is applied to the content of the block.
// //   """
// //
// //   node: t.Optional[Expr]  # type: ignore
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     if self.node is None:
// //       raise Impossible()
// //
// //     return super().as_const(eval_ctx=eval_ctx)
// //
// //
// // class Test(_FilterTestCommon):
// //   """Apply a test to an expression. ``name`` is the name of the test,
// //   the other field are the same as :class:`Call`.
// //
// //   .. versionchanged:: 3.0
// //     ``as_const`` shares the same logic for filters and tests. Tests
// //     check for volatile, async, and ``@pass_context`` etc.
// //     decorators.
// //   """
// //
// //   _is_filter = False
// //
// //
// // class Call(Expr):
// //   """Calls an expression.  `args` is a list of arguments, `kwargs` a list
// //   of keyword arguments (list of :class:`Keyword` nodes), and `dyn_args`
// //   and `dyn_kwargs` has to be either `None` or a node that is used as
// //   node for dynamic positional (``*args``) or keyword (``**kwargs``)
// //   arguments.
// //   """
// //
// //   fields = ("node", "args", "kwargs", "dyn_args", "dyn_kwargs")
// //   node: Expr
// //   args: t.List[Expr]
// //   kwargs: t.List[Keyword]
// //   dyn_args: t.Optional[Expr]
// //   dyn_kwargs: t.Optional[Expr]
// //
// //
// // class Getitem(Expr):
// //   """Get an attribute or item from an expression and prefer the item."""
// //
// //   fields = ("node", "arg", "ctx")
// //   node: Expr
// //   arg: Expr
// //   ctx: str
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     if self.ctx != "load":
// //       raise Impossible()
// //
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //
// //     try:
// //       return eval_ctx.environment.getitem(
// //         self.node.as_const(eval_ctx), self.arg.as_const(eval_ctx)
// //       )
// //     except Exception:
// //       raise Impossible()
// //
// //
// // class Getattr(Expr):
// //   """Get an attribute or item from an expression that is a ascii-only
// //   bytestring and prefer the attribute.
// //   """
// //
// //   fields = ("node", "attr", "ctx")
// //   node: Expr
// //   attr: str
// //   ctx: str
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     if self.ctx != "load":
// //       raise Impossible()
// //
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //
// //     try:
// //       return eval_ctx.environment.getattr(self.node.as_const(eval_ctx), self.attr)
// //     except Exception:
// //       raise Impossible()
// //
// //
// // class Slice(Expr):
// //   """Represents a slice object.  This must only be used as argument for
// //   :class:`Subscript`.
// //   """
// //
// //   fields = ("start", "stop", "step")
// //   start: t.Optional[Expr]
// //   stop: t.Optional[Expr]
// //   step: t.Optional[Expr]
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> slice:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //
// //     def const(obj: t.Optional[Expr]) -> t.Optional[t.Any]:
// //       if obj is None:
// //         return None
// //       return obj.as_const(eval_ctx)
// //
// //     return slice(const(self.start), const(self.stop), const(self.step))
// //
// //
// // class Concat(Expr):
// //   """Concatenates the list of expressions provided after converting
// //   them to strings.
// //   """
// //
// //   fields = ("nodes",)
// //   nodes: t.List[Expr]
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> str:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return "".join(str(x.as_const(eval_ctx)) for x in self.nodes)
// //
// //
// // class Compare(Expr):
// //   """Compares an expression with some other expressions.  `ops` must be a
// //   list of :class:`Operand`\\s.
// //   """
// //
// //   fields = ("expr", "ops")
// //   expr: Expr
// //   ops: t.List["Operand"]
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     result = value = self.expr.as_const(eval_ctx)
// //
// //     try:
// //       for op in self.ops:
// //         new_value = op.expr.as_const(eval_ctx)
// //         result = _cmpop_to_func[op.op](value, new_value)
// //
// //         if not result:
// //           return False
// //
// //         value = new_value
// //     except Exception:
// //       raise Impossible()
// //
// //     return result
// //
// //
// // class Operand(Helper):
// //   """Holds an operator and an expression."""
// //
// //   fields = ("op", "expr")
// //   op: str
// //   expr: Expr
// //
// //
// // class Mul(BinExpr):
// //   """Multiplies the left with the right node."""
// //
// //   operator = "*"
// //
// //
// // class Div(BinExpr):
// //   """Divides the left by the right node."""
// //
// //   operator = "/"
// //
// //
// // class FloorDiv(BinExpr):
// //   """Divides the left by the right node and truncates conver the
// //   result into an integer by truncating.
// //   """
// //
// //   operator = "//"
// //
// //
// // class Add(BinExpr):
// //   """Add the left to the right node."""
// //
// //   operator = "+"
// //
// //
// // class Sub(BinExpr):
// //   """Subtract the right from the left node."""
// //
// //   operator = "-"
// //
// //
// // class Mod(BinExpr):
// //   """Left modulo right."""
// //
// //   operator = "%"
// //
// //
// // class Pow(BinExpr):
// //   """Left to the power of right."""
// //
// //   operator = "**"
// //
// //
// // class And(BinExpr):
// //   """Short circuited AND."""
// //
// //   operator = "and"
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return self.left.as_const(eval_ctx) and self.right.as_const(eval_ctx)
// //
// //
// // class Or(BinExpr):
// //   """Short circuited OR."""
// //
// //   operator = "or"
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> t.Any:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return self.left.as_const(eval_ctx) or self.right.as_const(eval_ctx)
// //
// //
// // class Not(UnaryExpr):
// //   """Negate the expression."""
// //
// //   operator = "not"
// //
// //
// // class Neg(UnaryExpr):
// //   """Make the expression negative."""
// //
// //   operator = "-"
// //
// //
// // class Pos(UnaryExpr):
// //   """Make the expression positive (noop for most expressions)"""
// //
// //   operator = "+"
// //
// //
// // # Helpers for extensions
// //
// //
// // class EnvironmentAttribute(Expr):
// //   """Loads an attribute from the environment object.  This is useful for
// //   extensions that want to call a callback stored on the environment.
// //   """
// //
// //   fields = ("name",)
// //   name: str
// //
// //
// // class ExtensionAttribute(Expr):
// //   """Returns the attribute of an extension bound to the environment.
// //   The identifier is the identifier of the :class:`Extension`.
// //
// //   This node is usually constructed by calling the
// //   :meth:`~jinja2.ext.Extension.attr` method on an extension.
// //   """
// //
// //   fields = ("identifier", "name")
// //   identifier: str
// //   name: str
// //
// //
// // class ImportedName(Expr):
// //   """If created with an import name the import name is returned on node
// //   access.  For example ``ImportedName('cgi.escape')`` returns the `escape`
// //   function from the cgi module on evaluation.  Imports are optimized by the
// //   compiler so there is no need to assign them to local variables.
// //   """
// //
// //   fields = ("importname",)
// //   importname: str
// //
// //
// // class InternalName(Expr):
// //   """An internal name in the compiler.  You cannot create these nodes
// //   yourself but the parser provides a
// //   :meth:`~jinja2.parser.Parser.free_identifier` method that creates
// //   a new identifier for you.  This identifier is not available from the
// //   template and is not treated specially by the compiler.
// //   """
// //
// //   fields = ("name",)
// //   name: str
// //
// //   def __init__(self) -> None:
// //     raise TypeError(
// //       "Can't create internal names.  Use the "
// //       "`free_identifier` method on a parser."
// //     )
// //
// //
// // class MarkSafe(Expr):
// //   """Mark the wrapped expression as safe (wrap it as `Markup`)."""
// //
// //   fields = ("expr",)
// //   expr: Expr
// //
// //   def as_const(self, eval_ctx: t.Optional[EvalContext] = None) -> Markup:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     return Markup(self.expr.as_const(eval_ctx))
// //
// //
// // class MarkSafeIfAutoescape(Expr):
// //   """Mark the wrapped expression as safe (wrap it as `Markup`) but
// //   only if autoescaping is active.
// //
// //   .. versionadded:: 2.5
// //   """
// //
// //   fields = ("expr",)
// //   expr: Expr
// //
// //   def as_const(
// //     self, eval_ctx: t.Optional[EvalContext] = None
// //   ) -> t.Union[Markup, t.Any]:
// //     eval_ctx = get_eval_context(self, eval_ctx)
// //     if eval_ctx.volatile:
// //       raise Impossible()
// //     expr = self.expr.as_const(eval_ctx)
// //     if eval_ctx.autoescape:
// //       return Markup(expr)
// //     return expr
// //
// //
// // class ContextReference(Expr):
// //   """Returns the current template context.  It can be used like a
// //   :class:`Name` node, with a ``'load'`` ctx and will return the
// //   current :class:`~jinja2.runtime.Context` object.
// //
// //   Here an example that assigns the current template name to a
// //   variable named `foo`::
// //
// //     Assign(Name('foo', ctx='store'),
// //          Getattr(ContextReference(), 'name'))
// //
// //   This is basically equivalent to using the
// //   :func:`~jinja2.pass_context` decorator when using the high-level
// //   API, which causes a reference to the context to be passed as the
// //   first argument to a function.
// //   """
// //
// //
// // class DerivedContextReference(Expr):
// //   """Return the current template context including locals. Behaves
// //   exactly like :class:`ContextReference`, but includes local
// //   variables, such as from a ``for`` loop.
// //
// //   .. versionadded:: 2.11
// //   """
// //
// //
// // class Continue(Stmt):
// //   """Continue a loop."""
// //
// //
// // class Break(Stmt):
// //   """Break a loop."""
// //
// //
// // class Scope(Stmt):
// //   """An artificial scope."""
// //
// //   fields = ("body",)
// //   body: t.List[Node]
// //
// //
// // class OverlayScope(Stmt):
// //   """An overlay scope for extensions.  This is a largely unoptimized scope
// //   that however can be used to introduce completely arbitrary variables into
// //   a sub scope from a dictionary or dictionary like object.  The `context`
// //   field has to evaluate to a dictionary object.
// //
// //   Example usage::
// //
// //     OverlayScope(context=self.call_method('get_context'),
// //            body=[...])
// //
// //   .. versionadded:: 2.10
// //   """
// //
// //   fields = ("context", "body")
// //   context: Expr
// //   body: t.List[Node]
// //
// //
// // class EvalContextModifier(Stmt):
// //   """Modifies the eval context.  For each option that should be modified,
// //   a :class:`Keyword` has to be added to the :attr:`options` list.
// //
// //   Example to change the `autoescape` setting::
// //
// //     EvalContextModifier(options=[Keyword('autoescape', Const(True))])
// //   """
// //
// //   fields = ("options",)
// //   options: t.List[Keyword]
// //
// //
// // class ScopedEvalContextModifier(EvalContextModifier):
// //   """Modifies the eval context and reverts it later.  Works exactly like
// //   :class:`EvalContextModifier` but will only modify the
// //   :class:`~jinja2.nodes.EvalContext` for nodes in the :attr:`body`.
// //   """
// //
// //   fields = ("body",)
// //   body: t.List[Node]
// //
// //
// // # make sure nobody creates custom nodes
// // def _failing_new(*args: t.Any, **kwargs: t.Any) -> "te.NoReturn":
// //   raise TypeError("can't create custom node types")
// //
// //
// // NodeType.__new__ = staticmethod(_failing_new)  # type: ignore
// // del _failing_new

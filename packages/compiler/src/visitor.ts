/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-debugger */
import { Path, PathVisitor, visit, types as t, Type } from "@nunjucks/ast";
import { Visitor } from "@nunjucks/ast";
import {
  NodePath as JSNodePath,
  namedTypes,
  PredicateType,
  builders as b,
  Type as JsType,
  cloneNode,
} from "@pregenerator/ast-types";
import generate from "@babel/generator";
import ast from "@pregenerator/template";
import { EvalContext } from "@nunjucks/runtime";
import { Environment } from "@nunjucks/environment";
import { Frame } from "./frame";
// import { EvalContext, Frame } from "./frame";
import {
  VAR_LOAD_ALIAS,
  VAR_LOAD_PARAMETER,
  VAR_LOAD_RESOLVE,
  VAR_LOAD_UNDEFINED,
} from "./idtracking";
import n = namedTypes;
import toConst from "./const";

type Bookmark = n.EmptyStatement & {
  _isBookmark: true;
};

// TODO: implement
const escape = (s: unknown): string => `${s}`;

const OPERATORS = {
  eq: "==",
  ne: "!=",
  gt: ">",
  gteq: ">=",
  lt: "<",
  lteq: "<=",
} as const;

// Convenience aliases
const id = b.identifier;
const runtimeExpr = (expr: n.Expression | string) =>
  typeof expr === "string"
    ? b.memberExpression(id("runtime"), id(expr))
    : b.memberExpression(id("runtime"), expr);
const memberExpr = (s: string) => {
  const parts = s.split(".");
  // TODO: assert length
  const first = parts.shift()!;
  const second = parts.shift()!;
  let memberExpr: n.MemberExpression = b.memberExpression(
    id(first),
    id(second)
  );
  while (parts.length) {
    memberExpr = b.memberExpression(memberExpr, id(parts.shift()!));
  }
  return memberExpr;
};

function differenceUpdate<T>(a: Set<T>, b: Set<T>): void {
  b.forEach((val) => a.delete(val));
}

function forceExpression(
  node: n.Node | n.Node[],
  decls?: n.VariableDeclaration[]
): n.Expression {
  if (Array.isArray(node)) {
    if (Array.isArray(decls)) {
      while (n.VariableDeclaration.check(node[0])) {
        decls.unshift(node[0]);
        node.shift();
      }
    }
    if (node.length != 1) {
      throw new Error("Expected only one node");
    }
    node = node[0];
  }
  if (n.ExpressionStatement.check(node)) {
    return node.expression;
  }
  n.Expression.assert(node);
  return node;
}

function createBookmark(): Bookmark {
  return {
    type: "EmptyStatement",
    _isBookmark: true,
  };
}

const BookmarkType = new PredicateType(
  "Bookmark",
  (value) => n.BlockStatement.check(value) && !!(value as any)._isBookmark
);

function getBookmark(astPath: JSNodePath): JSNodePath | null {
  const newPath = astPath.find(BookmarkType);
  if (!newPath) return null;
  delete (newPath.value as any)._isBookmark;
  return newPath;
}

function forceStatements(nodes: n.Node[]): n.Statement[] {
  return nodes.map((node) => {
    if (n.Expression.check(node)) {
      return b.expressionStatement(node);
    } else {
      n.Statement.assert(node);
      return node;
    }
  });
}

const findDependencies = (nodes: t.Node[]) => {
  const filtersSet: Set<string> = new Set();
  const testsSet: Set<string> = new Set();

  const visitor: Visitor = {
    visitFilter(path) {
      this.traverse(path);
      filtersSet.add(path.node.name);
    },
    visitTest(path) {
      this.traverse(path);
      testsSet.add(path.node.name);
    },
    visitBlock() {
      // Stop visiting at blocks
      return false;
    },
  };

  nodes.forEach((node) => visit(node, visitor));

  const filters = Array.from(filtersSet);
  filters.sort();
  const tests = Array.from(testsSet);
  tests.sort();

  return { filters, tests };
};

class VisitorExit extends Error {}

const setsAreEqual = <T>(a: Set<T>, b: Set<T>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value));

const findUndeclared = (nodes: t.Node[], names: string[]) => {
  const namesSet = new Set(names);
  const undeclared: Set<string> = new Set();
  try {
    for (const node of nodes) {
      visit(node, {
        visitName({ node }) {
          if (node.ctx === "load" && namesSet.has(node.name)) {
            undeclared.add(node.name);
            if (setsAreEqual(undeclared, namesSet)) {
              throw new VisitorExit();
            }
          } else {
            namesSet.delete(node.name);
          }
          return false;
        },
        visitBlock() {
          // Stop visiting a block
          return false;
        },
      });
    }
  } catch (e) {
    if (!(e instanceof VisitorExit)) {
      throw e;
    }
  }
  return undeclared;
};

class CompilerExit extends Error {}

type FinalizeInfo = {
  const?: (...args: unknown[]) => string;
  src?: string | null;
};

type State<IsAsync extends boolean> = {
  self: CodeGenerator<IsAsync>;
  frame: Frame<IsAsync>;
  astPath: JSNodePath;
};

function runtimeTest(expr: n.Expression): n.CallExpression {
  return b.callExpression(runtimeExpr("test"), [expr]);
}

export class CodeGenerator<IsAsync extends boolean> {
  state: State<IsAsync>;
  astPath: JSNodePath;
  environment: Environment<IsAsync>;
  name?: string;
  filename?: string;
  deferInit: boolean;
  importAliases: Record<string, string>;
  /* self.blocks: t.Dict[str, nodes.Block] = {} */
  blocks: Record<string, t.Block>;
  /** the number of extends statements so far */
  extendsSoFar: number;
  /**
   * some templates have a rootlevel extends.  In this case we
   * can safely assume that we're a child template and do some
   * more optimizations.
   */
  hasKnownExtends: boolean;
  /** the current line number (1-indexed) */
  codeLineno: number;
  /** registry of all tests (global, not block local) */
  tests: Record<string, string>;
  /** registry of all filters (global, not block local) */
  filters: Record<string, string>;
  debugInfo: Array<[number, number]> | null;
  /** true if nothing was written so far */
  firstWrite: boolean;
  /** used by the `tempIdent` method to get new, unique temporary identifier */
  lastIdentifier: number;
  /** tracks toplevel assignments */
  assignStack: Array<Set<string>>;
  /** Tracks parameter definition blocks */
  paramDefBlock: Array<Set<string>>;
  /**  Tracks the current context.*/
  contextReferenceStack: string[];
  visitor: PathVisitor<State<IsAsync>>;
  constructor({
    environment,
    name,
    filename,
    deferInit = false,
  }: // optimized = true,
  {
    environment: Environment<IsAsync>;
    name?: string;
    filename?: string;
    deferInit?: boolean;
    optimized?: boolean;
  }) {
    this.environment = environment;
    this.name = name;
    this.filename = filename;
    this.deferInit = deferInit;
    this.importAliases = {};
    this.blocks = {};
    this.extendsSoFar = 0;
    this.hasKnownExtends = false;
    this.codeLineno = 1;
    this.tests = {};
    this.filters = {};
    this.debugInfo = null;
    this.firstWrite = true;
    this.lastIdentifier = 0;
    this.assignStack = [];
    this.paramDefBlock = [];
    this.contextReferenceStack = ["context"];
  }
  get visitorMethods(): Visitor<State<IsAsync>, CodeGenerator<IsAsync>> {
    return {
      visitTemplate(path, state) {
        const { node } = path;
        const { self, astPath } = state;
        const evalCtx = new EvalContext({
          environment: this.environment,
          name: this.name,
        });
        const frame = new Frame(evalCtx);
        const haveExtends = !!path.find(t.Extends);
        const inner: n.Statement[] = [];
        for (const { node: block } of path.findAll(t.Block)) {
          if (block.name in this.blocks) {
            this.fail(`block ${block.name} defined twice`, block.loc);
          }
          this.blocks[block.name] = block;
        }
        if (findUndeclared(node.body, ["self"]).has("self")) {
          const ref = frame.symbols.declareParameter("self");
          inner.push(
            ast`const %%ref%% = runtime.TemplateReference(context)`({ ref })
          );
        }
        frame.symbols.analyzeNode(node);
        frame.toplevel = frame.rootlevel = true;
        frame.requireOutputCheck = haveExtends && !this.hasKnownExtends;
        if (haveExtends) {
          inner.push(ast`let parentTemplate = null`());
        }
        inner.push(...self.enterFrame(frame));
        inner.push(...self.pullDependencies(node.body));
        inner.push(
          ...forceStatements(self.traverse(path, { ...state, frame }))
        );
        if (haveExtends) {
          let parentCall: n.Expression = ast.ast`parentTemplate.rootRenderFunc(context)`;
          if (self.isAsync) {
            parentCall = b.awaitExpression(parentCall);
          }
          let extendsYield: n.Statement = b.expressionStatement(
            b.yieldExpression(parentCall, true)
          );
          if (!self.hasKnownExtends) {
            extendsYield = ast`if (parentTemplate !== null) %%inner%%`({
              inner: b.blockStatement([extendsYield]),
            });
          }
          inner.push(extendsYield);
        }
        const rootStatements: n.Statement[] = [];
        const funcDecl: n.FunctionDeclaration = ast`
        function* root(env, context, rt, cb) {
          const lineno = %%lineno%%;
          const colno = %%colno%%;
          const { missing, undef } = env;
          const runtime = rt;
          const resolve = (key) => context.resolveOrMissing(key);
          %%inner%%;
        }`({
          lineno: 1,
          colno: 1,
          inner: b.blockStatement(inner),
        });
        if (this.isAsync) {
          funcDecl.async = true;
        }
        rootStatements.push(funcDecl);

        Object.entries(self.blocks).forEach(([name, block]) => {
          const blockStatements: n.Statement[] = [];
          rootStatements.push(
            b.functionDeclaration(
              id(`block_${name}`),
              [id("context"), id("runtime"), id("environment")],
              b.blockStatement(blockStatements)
            )
          );
          const blockFrame = new Frame(evalCtx);
          blockFrame.blockFrame = true;
          const undeclared = findUndeclared(block.body, ["self", "super"]);
          if (undeclared.has("self")) {
            const ref = blockFrame.symbols.declareParameter("self");
            blockStatements.push(
              ast`%%ref%% = new runtime.TemplateReference(context)`({
                ref: id(ref),
              })
            );
          }
          if (undeclared.has("super")) {
            const ref = blockFrame.symbols.declareParameter("super");
            blockStatements.push(
              ast`%%ref%% = context.super(%%name%%, %%blockFnName%%)`({
                ref: id(ref),
                name,
                blockFnName: id(`block_${name}`),
              })
            );
          }
          blockFrame.symbols.analyzeNode(block);
          blockFrame.block = name;
          blockStatements.push(ast.ast`_blockVars = {}`);
          blockStatements.push(...self.enterFrame(blockFrame));
          blockStatements.push(
            ...forceStatements([
              ...self.pullDependencies(block.body),
              ...self.visit(block.body, { ...state, frame: blockFrame }),
            ])
          );
        });
        return rootStatements;
      },
      visitBlock(path, state) {
        throw new Error("not implemented");
      },
      visitExtends(path, state) {
        throw new Error("not implemented");
      },
      visitInclude(path, state) {
        throw new Error("not implemented");
      },
      visitImport(path, state) {
        throw new Error("not implemented");
      },
      visitFromImport(path, state) {
        throw new Error("not implemented");
      },
      visitBreak() {
        return b.breakStatement();
      },
      visitFilter({ node }, state) {
        const { self, frame } = state;
        return self._filterTestCommon(node, state, () => {
          if (node.node) {
            return self.visit(node.node, state);
          } else if (frame.evalCtx.volatile) {
            // TODO autoescape ternary
            return ast`
              context.evalCtx.autoescape ? runtime.Markup(concat(%%buf%%)) : concat(%%buf%%)
            `({ buf: id(frame.buffer!) });
          } else if (frame.evalCtx.autoescape) {
            return ast`
              runtime.Markup(concat(%%buf%%))
            `({ buf: id(frame.buffer!) });
          } else {
            return ast`concat(%%buf%%)`({ buf: id(frame.buffer!) });
          }
        });
      },
      visitTest({ node }, state) {
        const { self } = state;
        return self._filterTestCommon(node, state, () =>
          self.visit(node.node, state)
        );
      },
      visitOutput(path, state) {
        // todo: implement finalize
        const { node } = path;
        const { self, frame } = state;
        if (frame.requireOutputCheck) {
          if (this.hasKnownExtends) return;
        }
        const body: (string[] | t.Node)[] = [];
        for (const child of node.nodes) {
          let val: any;
          try {
            val = self.outputChildToConst(child, frame);
          } catch (e) {
            body.push(child);
            continue;
          }
          if (body.length) {
            const last = body[body.length - 1];
            if (Array.isArray(last)) {
              last.push(val);
              continue;
            }
          }
          body.push([val]);
        }
        const innerNodes: n.Statement[] = [];

        if (frame.buffer !== null) {
          const args: n.Expression[] = [];
          for (const item of body) {
            if (Array.isArray(item)) {
              const val = item.map((i) => `${i}`).join("");
              args.push(b.stringLiteral(val));
            } else {
              args.push(
                self.wrapChildPre(self.visit(item, { ...state }), frame)
              );
            }
          }
          const callee = memberExpr(`${frame.buffer}.push`);
          innerNodes.push(
            b.expressionStatement(b.callExpression(callee, args))
          );
          // innerNodes.push(
          //   b.expressionStatement(
          //     b.callExpression(callee, [
          //       args.length === 1
          //         ? args[0]
          //         : b.spreadElement(b.arrayExpression(args)),
          //     ])
          //   )
          // );
        } else {
          for (const item of body) {
            if (Array.isArray(item)) {
              const val = item.map((i) => `${i}`).join("");
              innerNodes.push(
                b.expressionStatement(b.yieldExpression(b.stringLiteral(val)))
              );
            } else {
              innerNodes.push(
                b.expressionStatement(
                  b.yieldExpression(
                    self.wrapChildPre(self.visit(item, { ...state }), frame)
                  )
                )
              );
            }
          }
        }
        return innerNodes;
      },
      visitConst({ node }) {
        if (typeof node.value === "number") {
          return b.numericLiteral(node.value);
        } else if (typeof node.value === "string") {
          return b.stringLiteral(node.value);
        } else if (typeof node.value === "boolean") {
          return b.booleanLiteral(node.value);
        } else if (node.value === null) {
          return b.nullLiteral();
        } else {
          throw new Error("TK");
        }
      },
      visitTemplateData({ node }, { self, frame }) {
        return self.write(self.outputChildToConst(node, frame), node, frame);
      },
      visitGetattr({ node }, state) {
        const { self } = state;
        const target = forceExpression(self.visit(node.node, state));
        const ret = forceExpression(
          ast`env.getattr(%%target%%, %%attr%%)`({
            target,
            attr: b.stringLiteral(node.attr),
          })
        );
        return this.isAsync ? b.awaitExpression(ret) : ret;
      },
      visitGetitem({ node }, state) {
        const { self } = state;
        const target = forceExpression(self.visit(node.node, state));
        const attr = forceExpression(self.visit(node.arg, state));
        const ret = forceExpression(
          ast`env.getattr(%%target%%, %%attr%%)`({
            target,
            attr,
          })
        );
        return this.isAsync ? b.awaitExpression(ret) : ret;
      },
      visitSlice(path, state) {
        throw new Error("not implemented");
      },
      visitTuple({ node }, state) {
        const { self } = state;
        const elements: n.Expression[] = [];
        for (const item of node.items) {
          elements.push(forceExpression(self.visit(item, state)));
        }
        return b.arrayExpression(elements);
      },
      visitList({ node }, state) {
        const { self } = state;
        const elements: n.Expression[] = [];
        for (const item of node.items) {
          elements.push(forceExpression(self.visit(item, state)));
        }
        return b.arrayExpression(elements);
      },
      visitDict(path, state) {
        throw new Error("not implemented");
      },
      visitBinExpr({ node }, state) {
        const { self } = state;
        // TODO: sandboxed binop?
        const left = forceExpression(self.visit(node.left, state));
        const right = forceExpression(self.visit(node.right, state));

        const operator =
          node.operator === "and"
            ? "&&"
            : node.operator === "or"
            ? "||"
            : node.operator;

        if (operator === "//") {
          return ast`Math.floor(%%left%% / %%right%%)`({ left, right });
        } else if (operator == "**") {
          return ast`Math.pow(%%left%%, %%right%%)`({ left, right });
        } else if (operator === "||" || operator === "&&") {
          return b.logicalExpression(operator, left, right);
        } else {
          return b.binaryExpression(operator, left, right);
        }
      },
      visitConcat(path, state) {
        throw new Error("not implemented");
      },
      visitOperand(path, state) {
        throw new Error("not implemented");
      },
      visitUnaryExpr({ node }, state) {
        // TODO: sandbox intercept unary ops?
        const { self } = state;
        const expr = forceExpression(self.visit(node.node, state));
        const operator = node.operator === "not" ? "!" : node.operator;
        return b.unaryExpression(operator, expr);
      },
      visitCall(path, state, { forwardCaller = false } = {}) {
        const { node } = path;
        const { self } = state;
        // TODO: figure out what to do with kwargs and dynargs
        const func = forceExpression(self.visit(node.node, state));
        const args: n.Expression[] = [];
        for (const arg of node.args) {
          args.push(forceExpression(self.visit(arg, state)));
        }
        const funcCall = forceExpression(
          ast`runtime.call(%%func%%, %%args%%)`({
            func,
            args: b.arrayExpression(args),
          })
        );
        return self.environment.isAsync
          ? b.awaitExpression(funcCall)
          : funcCall;
        /// const ret
      },
      visitCondExpr(path, state) {
        const { node } = path;
        const { self } = state;
        // test consequent alternate
        const consequent = forceExpression(self.visit(node.expr1, state));
        const test = runtimeTest(forceExpression(self.visit(node.test, state)));
        let alternate: n.Expression;
        if (node.expr2) {
          alternate = forceExpression(self.visit(node.expr2, state));
        } else {
          const pos = self.position(node);
          alternate = forceExpression(
            ast`undef("the inline if-expression on ${pos} evaluated to false and no else section was defined.")`()
          );
        }
        return b.conditionalExpression(test, consequent, alternate);
      },
      visitCompare(path, state) {
        const { node } = path;
        const { self } = state;
        const comparisons: [n.Expression, t.Operand["op"], n.Expression][] = [];

        let lhs = forceExpression(self.visit(node.expr, state));
        for (const op of node.ops) {
          const rhs = forceExpression(self.visit(op.expr, state));
          comparisons.push([lhs, op.op, rhs]);
          lhs = rhs;
        }

        const stmts: n.Statement[] = [];
        const tmp = self.temporaryIdentifier();
        stmts.push(b.variableDeclaration("let", [id(tmp)]));
        // Matching python semantics, intermediary expressions in the comparison
        // should only be evaluated once. So the expression
        //    w() < x() < y() < z()
        // should become
        //    let t;
        //    w() < (t = x()) && t < (t = y()) && t < z()
        const andExprs = comparisons.map(([lhs, op, rhs], i) => {
          if (i > 0) lhs = id(tmp);
          if (i < comparisons.length - 1)
            rhs = b.assignmentExpression("=", id(tmp), rhs);
          return self.makeComparison(lhs, op, rhs);
        });
        stmts.push(
          b.expressionStatement(
            andExprs.reduceRight((acc: n.Expression | undefined, curr) =>
              acc ? b.logicalExpression("&&", curr, acc) : curr
            )
          )
        );
        return stmts;
      },
      visitAssign(path, state) {
        const { frame, self } = state;
        this.pushAssignTracking();
        const [left] = this.visit(path.get("target"), state);
        const [right] = this.visit(path.get("node"), state);
        n.assertLVal(left);
        n.assertExpression(right);
        const assign = b.expressionStatement(
          b.assignmentExpression("=", left, right)
        );
        return [assign, ...self.popAssignTracking(frame)];
      },
      visitAssignBlock({ node }, state) {
        const { self, frame } = state;
        self.pushAssignTracking();
        const blockFrame = frame.inner();
        // This is a special case.  Since a set block always captures we
        // will disable output checks.  This way one can use set blocks
        // toplevel even in extended templates.
        blockFrame.requireOutputCheck = false;
        blockFrame.symbols.analyzeNode(node);
        const stmts: n.Statement[] = [];
        stmts.push(self.buffer(blockFrame));
        stmts.push(
          ...forceStatements(
            self.visit(node.body, { ...state, frame: blockFrame })
          )
        );
        const target = forceExpression(self.visit(node.target, state));
        const callee: n.ConditionalExpression = ast.ast`
          (context.evalCtx.autoescape ? runtime.Markup : runtime.identity)
        `;
        const args: n.Expression[] = [];
        if (node.filter) {
          args.push(
            forceExpression(
              self.visit(node.filter, { ...state, frame: blockFrame })
            )
          );
        } else {
          args.push(
            ast`runtime.concat(%%buf%%)`({ buf: id(blockFrame.buffer!) })
          );
        }
        stmts.push(
          ast`%%target%% = (%%callee%%)(%%args%%)`({
            target,
            callee,
            args,
          })
        );
        stmts.push(...self.popAssignTracking(frame));

        return self.wrapFrame(blockFrame, stmts);
      },
      visitName(path, state) {
        const { self, frame } = state;
        const { node } = path;
        if (node.ctx === "store" && (frame?.loopFrame || frame?.blockFrame)) {
          if (self.assignStack.length) {
            self.assignStack[self.assignStack.length - 1].add(node.name);
          }
        }
        const ref = frame.symbols.ref(node.name);

        // If we are looking up a variable we might have to deal with the
        // case where it's undefined.  We can skip that case if the load
        // instruction indicates a parameter which are always defined.
        if (node.ctx === "load") {
          const load = frame.symbols.findLoad(ref);
          if (
            !(
              load !== null &&
              load[0] === VAR_LOAD_PARAMETER &&
              !self.parameterIsUndeclared(ref)
            )
          ) {
            // TODO runtime.undef
            // return id(ref);
            return ast`(%%ref%% === missing) ? undef({name: %%name%%}) : %%ref%%`(
              {
                name: b.stringLiteral(node.name),
                ref,
              }
            );
          }
        }
        return id(ref);
      },
      visitIf(path, state) {
        const { node } = path;
        const { self } = state;
        const frame = state.frame.soft();
        const decls: n.VariableDeclaration[] = [];
        const test = runtimeTest(
          forceExpression(self.visit(node.test, { ...state, frame }), decls)
        );
        const consequent = b.blockStatement(
          self.visitStatements(node.body, { ...state, frame })
        );
        const alternates: { test: n.Expression; consequent: n.Statement }[] =
          node.elif.map((elif) => ({
            test: runtimeTest(
              forceExpression(self.visit(elif.test, { ...state, frame }), decls)
            ),
            consequent: b.blockStatement(
              self.visitStatements(elif.body, { ...state, frame })
            ),
          }));
        const else_ = node.else_?.length
          ? b.blockStatement(
              self.visitStatements(node.else_, { ...state, frame })
            )
          : undefined;
        const alternate =
          alternates.reduceRight(
            (alt: n.Statement | undefined, { test, consequent }) =>
              b.ifStatement(test, consequent, alt),
            else_
          ) || null;
        return [...decls, b.ifStatement(test, consequent, alternate)];
      },
      visitFor(path, state) {
        const { frame, self } = state;
        const { node } = path;
        const loopFrame = frame.inner();
        loopFrame.loopFrame = true;
        const testFrame = frame.inner();
        const elseFrame = frame.inner();
        const rootStatements: n.Statement[] = [];
        // let currPath = astPath;
        let currStatements = rootStatements;

        // const bodyChildNodes = [...path.get("body").iterChildren()];
        const undecl = findUndeclared(node.body, ["loop"]);
        // try to figure out if we have an extended loop.  An extended loop
        // is necessary if the loop is in recursive mode if the special loop
        // variable is accessed in the body if the body is a scoped block.
        const extendedLoop =
          !!node.recursive ||
          undecl.has("loop") ||
          path.findAll(t.Block).some((p) => p.node.scoped);

        let loopRef = null;
        if (extendedLoop) {
          loopRef = loopFrame.symbols.declareParameter("loop");
        }
        loopFrame.symbols.analyzeNode(node, { forBranch: "body" });
        if (node.else_?.length) {
          elseFrame.symbols.analyzeNode(node, { forBranch: "else" });
        }
        let loopFilterFunc: string | null = null;
        if (node.test) {
          loopFilterFunc = self.temporaryIdentifier();
          testFrame.symbols.analyzeNode(node, { forBranch: "test" });
          // TODO: sourcemap to node.test
          // astPath.push(
          //   ast`function %%loopFilterFunc%%(fiter) {
          //   %%bookmark%%
          // }`({ loopFilterFunc, bookmark: createBookmark() })
          // );
          // const bookmark = getBookmark(astPath)!;
          // const stmts = [];
          const target = this.traverse(path.get("target"), {
            ...state,
            frame: loopFrame,
          });
          n.assertIdentifier(target);
          const test = this.traverse(path.get("test"), {
            ...state,
            frame: testFrame,
          });
          const stmt = ast`for (%%target%% of fiter) {
            if (%%test%%) {
              yield %%yieldTarget%%;
            }
          }`({
            target,
            test,
            yieldTarget: cloneNode(target),
          });
          const blockStmt = self.wrapFrame(testFrame, stmt);
          rootStatements.push(
            ast`function %%loopFilterFunc%%(fiter) {
            %%blockStmt%%
          }`({ loopFilterFunc, blockStmt })
          );
        }
        if (node.recursive) {
          const funcDecl: n.FunctionDeclaration =
            ast`function loop(reciter, loopRenderFunc, { depth = 0 } = {}) {}`();
          if (self.isAsync) {
            funcDecl.async = true;
          }
          currStatements.push(funcDecl);
          currStatements = funcDecl.body.body;
          currStatements.push(self.buffer(loopFrame));
          // Use the same buffer for the else frame
          elseFrame.buffer = loopFrame.buffer;
        }
        // currStatements.push(b.debuggerStatement());
        if (extendedLoop) {
          currStatements.push(ast`let ${loopRef} = missing`());
        }
        for (const { node: name } of path.findAll(t.Name)) {
          if (name.ctx === "store" && name.name === "loop") {
            return self.fail(
              "Cannot assign to special loop variable in for-loop",
              node.loc
            );
          }
        }
        let iterationIndicator: string | null = null;
        if (node.else_?.length) {
          iterationIndicator = self.temporaryIdentifier();
          currStatements.push(ast`let ${iterationIndicator} = 1`());
        }
        let [target, ...rest] = self.visit(node.target, {
          ...state,
          frame: loopFrame,
        });
        if (rest.length) {
          rest = [];
          return self.fail(
            "Unexpected return of multiple nodes for for-loop target",
            node.loc
          );
        }
        const assertTarget: (
          t: n.Node
        ) => asserts t is n.Identifier | n.ArrayPattern = (t) =>
          JsType.or(n.Identifier, n.ArrayPattern).assert(t);

        assertTarget(target);
        if (extendedLoop) {
          if (n.Identifier.check(target)) {
            target = b.arrayPattern([target, id(loopRef!)]);
          } else {
            target.elements.push(id(loopRef!));
          }
        }
        target = b.variableDeclaration("let", [b.variableDeclarator(target)]);

        let iter = node.recursive
          ? id("reciter")
          : forceExpression(self.visit(node.iter, { ...state, frame }));

        if (extendedLoop) {
          const args = [iter, id("undef")];
          if (node.recursive) {
            args.push(id("loopRenderFunc"), id("depth"));
          } else {
            args.push(b.nullLiteral(), b.numericLiteral(0));
          }
          args.push(b.booleanLiteral(this.isAsync));
          iter = b.newExpression(runtimeExpr("LoopContext"), args);
        }
        if (loopFilterFunc !== null) {
          iter = b.callExpression(id(loopFilterFunc), [iter]);
        }
        const loopBody: n.Statement[] = [
          ...self.enterFrame(loopFrame),
          b.variableDeclaration("let", [
            b.variableDeclarator(id("_loopVars"), b.objectExpression([])),
          ]),
        ];
        currStatements.push(
          b.forOfStatement.from({
            left: target,
            right: iter,
            body: b.blockStatement(loopBody),
            await: self.environment.isAsync,
          })
        );
        for (const bodyNode of node.body) {
          loopBody.push(
            ...forceStatements(
              self.visit(bodyNode, { ...state, frame: loopFrame })
            )
          );
        }
        if (node.else_?.length) {
          loopBody.push(ast`${iterationIndicator} = 0`());

          const elseNodes = forceStatements(
            self.visit(path.get("else_"), {
              ...state,
              frame: elseFrame,
            })
          );
          loopBody.push(
            b.ifStatement(
              id(iterationIndicator!),
              self.wrapFrame(elseFrame, elseNodes)
            )
          );
        }
        if (node.recursive) {
          currStatements.push(self.returnBufferContents(loopFrame));
          const loopArgs = self
            .visit(path.get("iter"), state)
            .map((x) => forceExpression(x));

          loopArgs.push(id("loop"));
          let callExpr: n.Expression = b.callExpression(id("loop"), loopArgs);
          if (self.isAsync) {
            callExpr = b.awaitExpression(callExpr);
          }
          rootStatements.push(self.write(callExpr, node, frame));
        }

        if (self.assignStack.length) {
          differenceUpdate(
            self.assignStack[self.assignStack.length - 1],
            loopFrame.symbols.stores
          );
        }
        return rootStatements;
      },
      visitMacro(path, state) {
        throw new Error("not implemented");
      },
      visitCallBlock(path, state) {
        throw new Error("not implemented");
      },
      visitFilterBlock({ node }, state) {
        throw new Error("not implemented");
      },
      visitWith(path, state) {
        throw new Error("not implemented");
      },
      visitExprStmt(path, state) {
        throw new Error("not implemented");
      },
    };
  }

  visitStatements<T extends t.Node>(
    nodeOrPath: T | Path<T, any, PropertyKey> | T[],
    state: State<IsAsync>
  ): n.Statement[] {
    const result = this.visit(nodeOrPath, state);
    return forceStatements(result);
  }
  visit<T extends t.Node>(
    nodeOrPath: T | Path<T, any, PropertyKey> | T[],
    state: State<IsAsync>
  ): n.Node[] {
    let path: Path;

    if (Array.isArray(nodeOrPath)) {
      const result: n.Node[] = [];
      nodeOrPath.forEach((node) => {
        result.push(...this.visit(node, state));
      });
      return result;
    }

    if (!(nodeOrPath instanceof Path)) {
      path = new Path({ root: nodeOrPath }).get("root");
    } else {
      path = nodeOrPath as unknown as Path;
    }
    const { type } = path.node;
    const supertypes = Type.def(type).supertypeList;
    const fn = supertypes
      .map((t) => (this.visitorMethods as any)[`visit${t}`])
      .find((t) => !!t);

    const ret: n.Node[] = [];
    if (fn) {
      const v = fn.call(this, path, state);
      if (Array.isArray(v)) {
        for (const i of v) {
          if (n.Node.check(i)) {
            ret.push(i);
          }
        }
      } else if (n.Node.check(v)) {
        ret.push(v);
      }
      return ret;
    } else {
      return this.traverse(path, state);
    }
  }
  position(node: t.Node): string {
    let rv = `line ${node.loc?.start.line}`;
    if (this.name) {
      rv = `${rv} in "${this.name}"`;
    }
    return rv;
  }
  traverse<T extends t.Node>(
    path: Path<T, T>,
    state: State<IsAsync>
  ): n.Node[] {
    const ret: n.Node[] = [];
    for (const child of path.iterChildNodes()) {
      ret.push(...this.visit(child, state));
    }
    return ret;
  }
  compile(node: t.Template): n.Program {
    const astNode: n.Program = { type: "Program", body: [], directives: [] };
    const evalCtx = new EvalContext({
      environment: this.environment,
      name: this.name,
    });
    const frame = new Frame(evalCtx);
    const astPath = new JSNodePath(astNode).get("body") as JSNodePath;
    const res = this.visit(node, {
      self: this,
      frame,
      astPath: astPath,
    });
    astPath.push(...res);
    return astNode;
  }
  parameterIsUndeclared(target: string): boolean {
    if (!this.paramDefBlock.length) return false;
    return this.paramDefBlock[this.paramDefBlock.length - 1].has(target);
  }
  fail(msg: string, loc?: t.SourceLocation | null): void {
    console.log(msg);
  }
  pushAssignTracking() {
    this.assignStack.push(new Set());
  }
  temporaryIdentifier() {
    this.lastIdentifier += 1;
    return `t_${this.lastIdentifier}`;
  }
  chooseAsync({
    asyncValue = "async ",
    syncValue = "",
  }: { asyncValue?: string; syncValue?: string } = {}) {
    return this.environment.isAsync ? syncValue : asyncValue;
  }
  get isAsync() {
    return this.environment.isAsync;
  }
  buffer(frame: Frame<IsAsync>): n.VariableDeclaration {
    frame.buffer = this.temporaryIdentifier();
    return b.variableDeclaration("let", [
      b.variableDeclarator(id(frame.buffer), b.arrayExpression([])),
    ]);
  }
  returnBufferContents(
    frame: Frame<IsAsync>,
    { forceUnescaped = false } = {}
  ): n.ReturnStatement {
    const concat = b.callExpression(runtimeExpr("concat"), [id(frame.buffer!)]);
    const markup = b.callExpression(runtimeExpr("Markup"), [concat]);
    let returnExpr: n.Expression = concat;
    if (!forceUnescaped) {
      if (frame.evalCtx.volatile) {
        returnExpr = b.conditionalExpression(
          memberExpr("context.evalCtx.autoescape"),
          markup,
          concat
        );
      } else if (frame.evalCtx.autoescape) {
        returnExpr = markup;
      }
    }
    return b.returnStatement(returnExpr);
  }
  enterFrame(frame: Frame<IsAsync>): n.Statement[] {
    const undefs: string[] = [];
    const nodes: n.Statement[] = [];
    Object.entries(frame.symbols.loads).forEach(([target, load]) => {
      const [action, param] = load;
      if (action === VAR_LOAD_PARAMETER) return;
      if (action === VAR_LOAD_RESOLVE) {
        nodes.push(
          b.variableDeclaration("let", [
            b.variableDeclarator(
              id(target),
              b.callExpression(this.getResolveFunc(), [
                param === null ? b.nullLiteral() : b.stringLiteral(param),
              ])
            ),
          ])
        );
      } else if (action === VAR_LOAD_ALIAS) {
        nodes.push(
          b.variableDeclaration("let", [
            b.variableDeclarator(id(target), id(param!)),
          ])
        );
      } else if (action === VAR_LOAD_UNDEFINED) {
        undefs.push(target);
      }
    });

    if (undefs.length) {
      nodes.push(
        b.variableDeclaration(
          "let",
          undefs.map((target) =>
            b.variableDeclarator(id(target), id("missing"))
          )
        )
      );
    }
    return nodes;
  }
  wrapFrame(frame: Frame<IsAsync>, inner: n.Statement[]): n.BlockStatement {
    const nodes = this.enterFrame(frame);
    return b.blockStatement([...nodes, ...inner]);
  }
  getResolveFunc(): n.Identifier | n.MemberExpression {
    const target =
      this.contextReferenceStack[this.contextReferenceStack.length - 1];
    if (target === "context") {
      return id("resolve");
    } else {
      return memberExpr(`${target}.resolve`);
      // return b.memberExpression(b.identifier(target), b.identifier("resolve"));
    }
  }
  popAssignTracking(frame: Frame<IsAsync>): n.Statement[] {
    const stackVars = [...(this.assignStack.pop() || [])];
    if (
      (!frame.blockFrame && !frame.loopFrame && !frame.toplevel) ||
      !stackVars.length
    ) {
      return [];
    }
    const publicNames = stackVars.filter((v) => v[0] !== "_");
    const nodes: n.Statement[] = stackVars.map((name) => {
      const ref = frame.symbols.ref(name);
      let obj: n.Expression;
      if (frame.loopFrame) {
        obj = id("_loopVars");
      } else if (frame.blockFrame) {
        obj = id("_blockVars");
      } else {
        obj = memberExpr("context.vars");
      }
      const prop = b.stringLiteral(name);
      const refId = id(ref);
      return b.expressionStatement(
        b.assignmentExpression("=", b.memberExpression(obj, prop), refId)
      );
    });

    if (!frame.blockFrame && frame.loopFrame && publicNames.length) {
      nodes.push(
        b.expressionStatement(
          b.callExpression(
            memberExpr("context.exportedVars.push"),
            publicNames.map((name) => b.stringLiteral(name))
          )
        )
      );
      // nodes.push(
      //   b.callExpression(
      //     b.memberExpression(
      //       b.memberExpression(
      //         b.identifier("context"),
      //         b.identifier("exportedVars")
      //       ),
      //       b.identifier("push")
      //     ),
      //     publicNames.map((name) => b.stringLiteral(name))
      //   )
      // );
    }

    return nodes;
  }

  outputChildToConst(node: t.Expr, frame: Frame<IsAsync>) {
    let val = toConst(frame.evalCtx, node);
    if (frame.evalCtx.autoescape) {
      val = escape(val);
    }
    if (t.TemplateData.check(node)) {
      return `${val}`;
    }
    // TODO: implement finalize
    return `${val}`;
  }

  wrapChildPre(argument: n.Node[], frame: Frame<IsAsync>) {
    const callee: n.Expression = frame.evalCtx.volatile
      ? ast`(context.evalCtx.autoescape ? runtime.escape : runtime.str)`()
      : frame.evalCtx.autoescape
      ? runtimeExpr("escape")
      : runtimeExpr("str");
    return b.callExpression(
      callee,
      argument.map((arg) => forceExpression(arg))
    );
  }

  makeComparison(
    lhs: n.Expression,
    op: t.Operand["op"],
    rhs: n.Expression
  ): n.Expression {
    if (op === "in" || op === "notin") {
      const callExpr = ast`runtime.includes(%%lhs%%, %%rhs%%)`({
        lhs,
        rhs,
      });
      return op === "notin" ? b.unaryExpression("!", callExpr) : callExpr;
    } else {
      return b.binaryExpression(OPERATORS[op], lhs, rhs);
    }
  }

  _filterTestCommon(
    node: t.Filter | t.Test,
    state: State<IsAsync>,
    inner: () => n.Node | n.Node[]
  ) {
    let funcVar: string;
    let func: any;
    if (node.type === "Filter") {
      funcVar = this.filters[node.name];
      func = this.environment.filters[node.name];
    } else {
      funcVar = this.tests[node.name];
      func = this.environment.tests[node.name];
    }
    const { frame } = state;
    // When inside an If or CondExpr frame, allow the filter to be
    // undefined at compile time and only raise an error if it's
    // actually called at runtime. See pull_dependencies.
    if (!func && !frame.softFrame) {
      this.fail(`No ${node.type.toLowerCase()} named ${node.name}.`);
    }
    // TODO: PassArg functionality?
    // TODO kwargs, dynargs and dynkwargs?
    const args: n.Expression[] = [];
    args.push(forceExpression(inner()));
    for (const arg of node.args) {
      args.push(forceExpression(this.visit(arg, state)));
    }
    const funcCall = forceExpression(
      ast`runtime.call(%%func%%, %%args%%)`({
        func: funcVar,
        args: b.arrayExpression(args),
      })
    );
    return this.environment.isAsync ? b.awaitExpression(funcCall) : funcCall;
  }

  write(
    expr: n.Expression | string,
    node: t.Node,
    frame: Frame<IsAsync>
  ): n.ExpressionStatement {
    if (typeof expr === "string") {
      expr = b.stringLiteral(expr);
    }
    return b.expressionStatement(
      frame.buffer
        ? b.callExpression(memberExpr(`${frame.buffer}.push`), [expr])
        : b.yieldExpression(expr)
    );
  }

  pullDependencies(nodes: t.Node[]): n.Statement[] {
    const { filters, tests } = findDependencies(nodes);
    const statements: n.Statement[] = [];

    const depIter: [Record<string, string>, string[], string][] = [
      [this.filters, filters, "filter"],
      [this.tests, tests, "test"],
    ];

    for (const [idMap, names, dependency] of depIter) {
      for (const name of names) {
        if (!(name in idMap)) {
          idMap[name] = this.temporaryIdentifier();
        }
        statements.push(
          ast`
            let %%id%% = %%envdep%%[%%name%%] || (() => {throw new %%exc%%(%%msg%%)})`(
            {
              id: id(idMap[name]),
              envdep: memberExpr(`env.${dependency}s`),
              // dep: id(`${dependency}s`),
              name: b.stringLiteral(name),
              exc: runtimeExpr("TemplateRuntimeError"),
              msg: b.stringLiteral(`No ${dependency} named "${name}" found.`),
            }
          )
        );
      }
    }
    return statements;
    // for (const [idMap, names, dependency] of [[this.filters, filters, "filters"]])
  }
}

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
import { EvalContext } from "@nunjucks/environment";
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
import { env } from "process";

type Bookmark = n.EmptyStatement & {
  _isBookmark: true;
};

// TODO: implement
const escape = (s: unknown): string => `${s}`;

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

function forceExpression(node: n.Node | n.Node[]): n.Expression {
  if (Array.isArray(node)) {
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

type State = {
  self: CodeGenerator;
  frame: Frame;
  astPath: JSNodePath;
};

export class CodeGenerator {
  state: State;
  astPath: JSNodePath;
  environment: any;
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
  visitor: PathVisitor<State>;
  constructor({
    environment,
    name,
    filename,
    stream = "",
    deferInit = false,
  }: // optimized = true,
  {
    environment: any;
    name?: string;
    filename?: string;
    stream: string;
    deferInit: boolean;
    optimized: boolean;
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
  get visitorMethods(): Visitor<State, CodeGenerator> {
    return {
      visitTemplate(path, state) {
        debugger;
        const { node } = path;
        const { self, astPath } = state;
        const evalCtx = new EvalContext(this.environment, this.name);
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

        const rootStatements: n.Statement[] = [
          ast`
        function* root(env, context, frame, runtime, cb) {
          const lineno = %%lineno%%;
          const colno = %%colno%%;
          const { missing } = env;
          %%inner%%;
        }`({
            lineno: 1,
            colno: 1,
            inner: b.tryStatement(
              b.blockStatement(inner),
              b.catchClause(
                id("e"),
                null,
                b.blockStatement([
                  ast.ast`cb(rt.handleError(e, lineno, colno))`,
                ])
              )
            ),
          }),
        ];
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
        return ast`environment.getattr(%%target%%, %%attr%%)`({
          target,
          attr: b.stringLiteral(node.attr),
        });
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
          )
            return ast`(%%ref%% === missing) ? runtime.undef({name: %%name%%}) : %%ref%%`(
              {
                name: b.stringLiteral(node.name),
                ref,
              }
            );
        }
        return id(ref);
      },
      visitIf(path, state) {
        const { node } = path;
        const { self } = state;
        const frame = state.frame.soft();
        const test = forceExpression(
          self.visit(node.test, { ...state, frame })
        );
        const consequent = b.blockStatement(
          self.visitStatements(node.body, { ...state, frame })
        );
        const alternates: { test: n.Expression; consequent: n.Statement }[] =
          node.elif.map((elif) => ({
            test: forceExpression(self.visit(elif.test, { ...state, frame })),
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
        return b.ifStatement(test, consequent, alternate);
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
            ast`function loop(reciter, loopRenderFunc, { depth = 0 }) {}`();
          if (self.isAsync) {
            funcDecl.async = true;
          }
          currStatements.push(funcDecl);
          currStatements = funcDecl.body.body;
          currStatements.push(self.buffer(loopFrame));
          // Use the same buffer for the else frame
          elseFrame.buffer = loopFrame.buffer;
        }
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

        // let [iter] = node.recursive
        //   ? [id("reciter")]
        //   : self
        //       .visit(node.iter, { ...state, frame })
        //       .map((node) => forceExpression(node));
        let iter = node.recursive
          ? id("reciter")
          : forceExpression(self.visit(node.iter, { ...state, frame }));

        if (!node.recursive && self.environment.isAsync && !extendedLoop) {
          iter = b.callExpression(runtimeExpr("auto_aiter"), [iter]);
        }
        if (extendedLoop) {
          const args = [iter, runtimeExpr("undef")];
          if (node.recursive) {
            args.push(id("loopRenderFunc"), id("depth"));
          }
          iter = b.callExpression(runtimeExpr("LoopContext"), args);
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
          let loopArgs = self
            .visit(path.get("iter"), state)
            .map((x) => forceExpression(x));
          if (self.isAsync) {
            loopArgs = [b.callExpression(runtimeExpr("auto_aiter"), loopArgs)];
          }
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
    };
  }

  visitStatements<T extends t.Node>(
    nodeOrPath: T | Path<T, any, PropertyKey> | T[],
    state: State
  ): n.Statement[] {
    const result = this.visit(nodeOrPath, state);
    return forceStatements(result);
  }
  visit<T extends t.Node>(
    nodeOrPath: T | Path<T, any, PropertyKey> | T[],
    state: State
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
    // const method = `visit${type}`;
    // const fn = (this.visitorMethods as any)[method];
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
  traverse<T extends t.Node>(path: Path<T, T>, state: State): n.Node[] {
    const ret: n.Node[] = [];
    for (const child of path.iterChildNodes()) {
      ret.push(...this.visit(child, state));
    }
    return ret;
  }
  compile(node: t.Template): n.Program {
    const astNode: n.Program = { type: "Program", body: [], directives: [] };
    const evalCtx = new EvalContext(this.environment, this.name);
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
  buffer(frame: Frame): n.VariableDeclaration {
    frame.buffer = this.temporaryIdentifier();
    return b.variableDeclaration("let", [
      b.variableDeclarator(id(frame.buffer), b.arrayExpression([])),
    ]);
  }
  returnBufferContents(
    frame: Frame,
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
  enterFrame(frame: Frame): n.Statement[] {
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
  wrapFrame(frame: Frame, inner: n.Statement[]): n.BlockStatement {
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
  popAssignTracking(frame: Frame): n.Statement[] {
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
        // obj = b.memberExpression(id("context"), id("vars"));
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

  outputChildToConst(node: t.Expr, frame: Frame) {
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

  wrapChildPre(argument: n.Node[], frame: Frame) {
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

  write(
    expr: n.Expression | string,
    node: t.Node,
    frame: Frame
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
            let %%id%% = environment.%%dep%%[%%name%%]
            || () => throw new %%exc%%(%%msg%%)`({
            id: id(idMap[name]),
            dep: id(`${dependency}s`),
            name: b.stringLiteral(name),
            exc: runtimeExpr("TemplateRuntimeError"),
            msg: b.stringLiteral(`No ${dependency} named "${name}" found.`),
          })
        );
      }
    }
    return statements;
    // for (const [idMap, names, dependency] of [[this.filters, filters, "filters"]])
  }
}

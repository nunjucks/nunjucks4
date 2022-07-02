/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-debugger */
import { Path, PathVisitor, visit, types as t } from "@nunjucks/ast";
import { Visitor } from "@nunjucks/ast";
import {
  NodePath as JSNodePath,
  namedTypes,
  PredicateType,
  builders as b,
  cloneNode,
} from "@pregenerator/ast-types";
import ast from "@pregenerator/template";
import { EvalContext, Frame } from "./frame";
import {
  VAR_LOAD_ALIAS,
  VAR_LOAD_PARAMETER,
  VAR_LOAD_RESOLVE,
  VAR_LOAD_UNDEFINED,
} from "./idtracking";
import n = namedTypes;
type Bookmark = n.EmptyStatement & {
  _isBookmark: true;
};

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

const findDependencies = (node: t.Node) => {
  const filters: Set<string> = new Set();
  const tests: Set<string> = new Set();

  visit(node, {
    visitFilter(path) {
      this.traverse(path);
      filters.add(path.node.name);
    },
    visitTest(path) {
      this.traverse(path);
      tests.add(path.node.name);
    },
    visitBlock() {
      // Stop visiting at blocks
      return false;
    },
  });

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
        const inner: n.Node[] = [];
        for (const { node: block } of path.findAll(t.Block)) {
          if (block.name in this.blocks) {
            this.fail(`block ${block.name} defined twice`, block.loc);
          }
          this.blocks[block.name] = block;
        }
        if (findUndeclared(node.body, ["self"])) {
          const ref = frame.symbols.declareParameter("self");
          inner.push(ast`const %%ref%% = 42`({ ref }));
        }
        frame.symbols.analyzeNode(node);
        frame.toplevel = frame.rootlevel = true;
        frame.requireOutputCheck = haveExtends && !this.hasKnownExtends;
        if (haveExtends) {
          inner.push(ast`let parentTemplate = null`());
        }
        const frameNodes: n.Node[] = self.traverse(path, { ...state, frame });
        console.log("frameNodes=", frameNodes);
        const frameStatements: n.Statement[] = [];
        for (const node of frameNodes) {
          n.assertStatement(node);
          frameStatements.push(node);
        }
        inner.push(self.wrapFrame(frame, frameStatements));
        const nodes: n.Node[] = [];

        const innerStmts: n.Statement[] = [];
        for (const node of inner) {
          n.assertStatement(node);
          innerStmts.push(node);
        }

        nodes.push(
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
              b.blockStatement(innerStmts),
              b.catchClause(
                b.identifier("e"),
                null,
                b.blockStatement([
                  ast.ast`cb(rt.handleError(e, lineno, colno))`,
                ])
              )
            ),
          })
        );
        return nodes;
        // debugger;
        // astPath.push(newAst);
        // astPath.scope?.scan(true);
        // console.log(astPath.value);
        // this.traverse(path, { ...state, astPath: getBookmark(astPath)! });
      },
      visitOutput(path, state) {
        // todo: implement finalize
        const { node } = path;
        const { frame } = state;
        if (frame.requireOutputCheck) {
          if (this.hasKnownExtends) return;
        }
      },
      visitConst({ node }, state) {
        console.log(node);
        if (typeof node.value === "number") {
          return b.numericLiteral(node.value);
        }
      },
      visitAssign(path, state) {
        const { node } = path;
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
      visitName(path, state) {
        const { self, astPath, frame } = state;
        const { node } = path;
        if (node.ctx === "store" && (frame?.loopFrame || frame?.blockFrame)) {
          if (self.assignStack.length) {
            self.assignStack[self.assignStack.length - 1].add(node.name);
          }
        }
        const ref = frame.symbols.ref(node.name);
        /*                self.write(
                    f"(undefined(name={node.name!r}) if {ref} is missing else {ref})"
                )
                return

        self.write(ref)*/
        // If we are looking up a variable we might have to deal with the
        // case where it's undefined.  We can skip that case if the load
        // instruction indicates a parameter which are always defined.
        if (node.ctx === "load") {
          const load = frame.symbols.findLoad(ref);
          if (
            load !== null &&
            load[0] === VAR_LOAD_PARAMETER &&
            !self.parameterIsUndeclared(ref)
          )
            return ast`(%%ref%% === missing) ? undef({name: %%name%%}) : %%name%%`(
              {
                name: node.name,
                ref,
              }
            );
        }
        return b.identifier(ref);
      },
      visitFor(path, state) {
        console.log("visitFor!");
        const { astPath, frame, self } = state;
        const { node } = path;
        const loopFrame = frame.inner();
        loopFrame.loopFrame = true;
        const testFrame = frame.inner();
        const elseFrame = frame.inner();

        // find_undeclared(node.iter_child_nodes(only=("body",)), ("loop",))

        const bodyChildNodes = [...path.get("body").iterChildren()];
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
        if (node.else_) {
          elseFrame.symbols.analyzeNode(node, { forBranch: "else" });
        }
        if (node.test) {
          const loopFilterFunc = self.temporaryIdentifier();
          testFrame.symbols.analyzeNode(node, { forBranch: "test" });
          // sourcemap to node.test
          astPath.push(
            ast`function %%loopFilterFunc%%(fiter) {
            %%bookmark%%
          }`({ loopFilterFunc, bookmark: createBookmark() })
          );
          const bookmark = getBookmark(astPath)!;
          const stmts = [];
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
          console.log("STMT");
          console.log(stmt);
          const blockStmt = self.wrapFrame(testFrame, stmt);
          bookmark.replace(blockStmt);
          // self.wrapFrame(testFrame)
          // self.enterFrame
        }
      },
    };
  }

  visit<T extends t.Node>(
    nodeOrPath: T | Path<T, any, PropertyKey>,
    state: State
  ): n.Node[] {
    let path: Path;

    if (!(nodeOrPath instanceof Path)) {
      path = new Path({ root: nodeOrPath }).get("root");
    } else {
      path = nodeOrPath as unknown as Path;
    }
    const { type } = path.node;
    const method = `visit${type}`;
    const fn = (this.visitorMethods as any)[method];
    const ret: n.Node[] = [];
    if (method === "visitAssign") debugger;
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
    console.log(res);
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
  wrapFrame(frame: Frame, inner: n.Statement[]): n.BlockStatement {
    const undefs: string[] = [];
    const nodes: n.Statement[] = [];
    Object.entries(frame.symbols.loads).forEach(([target, load]) => {
      const [action, param] = load;
      if (action === VAR_LOAD_PARAMETER) return;
      if (action === VAR_LOAD_RESOLVE) {
        nodes.push(
          b.variableDeclaration("let", [
            b.variableDeclarator(
              b.identifier(target),
              b.callExpression(this.getResolveFunc(), [
                param === null ? b.nullLiteral() : b.stringLiteral(param),
              ])
            ),
          ])
        );
      } else if (load[0] === VAR_LOAD_ALIAS) {
        nodes.push(
          b.variableDeclaration("let", [
            b.variableDeclarator(b.identifier(target), b.identifier(load[1])),
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
            b.variableDeclarator(b.identifier(target), b.identifier("missing"))
          )
        )
      );
    }
    return b.blockStatement([...nodes, ...inner]);
  }
  getResolveFunc(): n.Identifier | n.MemberExpression {
    const target =
      this.contextReferenceStack[this.contextReferenceStack.length - 1];
    if (target === "context") {
      return b.identifier("resolve");
    } else {
      return b.memberExpression(b.identifier(target), b.identifier("resolve"));
    }
  }
  popAssignTracking(frame: Frame): n.Expression[] {
    const stackVars = [...(this.assignStack.pop() || [])];
    if (
      (!frame.blockFrame && !frame.loopFrame && !frame.toplevel) ||
      !stackVars.length
    ) {
      return [];
    }
    const publicNames = stackVars.filter((v) => v[0] !== "_");
    const nodes: n.Expression[] = stackVars.map((name) => {
      const ref = frame.symbols.ref(name);
      let obj: n.Expression;
      if (frame.loopFrame) {
        obj = b.identifier("_loopVars");
      } else if (frame.blockFrame) {
        obj = b.identifier("_blockVars");
      } else {
        obj = b.memberExpression(b.identifier("context"), b.identifier("vars"));
      }
      const prop = b.stringLiteral(name);
      const refId = b.identifier(ref);
      return b.assignmentExpression("=", b.memberExpression(obj, prop), refId);
    });

    if (!frame.blockFrame && frame.loopFrame && publicNames.length) {
      nodes.push(
        b.callExpression(
          b.memberExpression(
            b.memberExpression(
              b.identifier("context"),
              b.identifier("exportedVars")
            ),
            b.identifier("push")
          ),
          publicNames.map((name) => b.stringLiteral(name))
        )
      );
    }

    return nodes;
  }
}

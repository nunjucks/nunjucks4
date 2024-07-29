import {
  Path,
  PathVisitor,
  visit,
  types as t,
  Type,
  Visitor,
} from "@nunjucks/ast";
import {
  NodePath as JSNodePath,
  namedTypes,
  builders as b,
  Type as JsType,
  cloneNode,
} from "@pregenerator/ast-types";
import ast from "@pregenerator/template";
import { EvalContext, escape, str as runtimeStr } from "@nunjucks/runtime";
import type { IEnvironment as Environment } from "@nunjucks/runtime";
import { Frame } from "./frame";
import {
  VAR_LOAD_ALIAS,
  VAR_LOAD_PARAMETER,
  VAR_LOAD_RESOLVE,
  VAR_LOAD_UNDEFINED,
} from "./idtracking";
import n = namedTypes;
import toConst from "./const";

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
    id(second),
  );
  while (parts.length) {
    memberExpr = b.memberExpression(memberExpr, id(parts.shift()!));
  }
  return memberExpr;
};
const str = (s: string) => b.stringLiteral(s);
function tmplEl(value: string, { tail = false } = {}): n.TemplateElement {
  return b.templateElement({ cooked: value, raw: value }, tail);
}

function differenceUpdate<T>(a: Set<T>, b: Set<T>): void {
  b.forEach((val) => a.delete(val));
}

function forceExpression(
  node: n.Node | n.Node[],
  decls?: n.VariableDeclaration[],
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

function forceStatements(nodeOrNodes: n.Node | n.Node[]): n.Statement[] {
  const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes];
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
  const filtersSet = new Set<string>();
  const testsSet = new Set<string>();

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

class MacroRef {
  node: t.Macro | t.CallBlock;
  accessesCaller = false;
  accessesKwargs = false;
  accessesVarargs = false;

  constructor(node: t.Macro | t.CallBlock) {
    this.node = node;
  }
}

const setsAreEqual = <T>(a: Set<T>, b: Set<T>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value));

const findUndeclared = (nodes: t.Node[], names: string[]) => {
  const namesSet = new Set(names);
  const undeclared = new Set<string>();
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

interface State<IsAsync extends boolean> {
  self: CodeGenerator<IsAsync>;
  frame: Frame<IsAsync>;
  astPath: JSNodePath;
  forwardCaller?: boolean;
  decls: n.VariableDeclaration[];
}

function runtimeTest(expr: n.Expression): n.CallExpression {
  return b.callExpression(runtimeExpr("test"), [expr]);
}

export class CodeGenerator<IsAsync extends boolean> {
  state: State<IsAsync>;
  astPath: JSNodePath;
  environment: Environment<IsAsync>;
  name: string | null;
  filename: string | null;
  deferInit: boolean;
  importAliases: Record<string, string>;
  blocks: Record<string, Path<t.Block, t.Block>>;
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
  debugInfo: [number, number][] | null;
  /** true if nothing was written so far */
  firstWrite: boolean;
  /** used by the `tempIdent` method to get new, unique temporary identifier */
  lastIdentifier: number;
  /** tracks toplevel assignments */
  assignStack: Set<string>[];
  /** Tracks parameter definition blocks */
  paramDefBlock: Set<string>[];
  /**  Tracks the current context.*/
  contextReferenceStack: string[];
  visitor: PathVisitor<State<IsAsync>>;
  constructor({
    environment,
    name,
    filename,
    deferInit = false,
  }: {
    environment: Environment<IsAsync>;
    name?: string | null;
    filename?: string | null;
    deferInit?: boolean;
    optimized?: boolean;
  }) {
    this.environment = environment;
    this.name = name ?? null;
    this.filename = filename ?? null;
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
        const { self } = state;
        const evalCtx = new EvalContext({
          environment: this.environment,
          name: this.name,
        });
        const frame = new Frame(evalCtx);
        const haveExtends = !!path.find(t.Extends);
        const inner: n.Statement[] = [];
        for (const block of path.findAll(t.Block)) {
          if (block.node.name in this.blocks) {
            this.fail(`block ${block.name} defined twice`, block.node.loc);
          }
          this.blocks[block.node.name] = block;
        }

        if (findUndeclared(node.body, ["self"]).has("self")) {
          const ref = frame.symbols.declareParameter("self");
          inner.push(
            ast`const %%ref%% = new runtime.TemplateReference(context)`({
              ref,
            }),
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
          ...forceStatements(self.traverse(path, { ...state, frame })),
        );
        if (haveExtends) {
          const parentCall: n.Expression = self.awaitIfAsync(
            ast.expression`parentTemplate.rootRenderFunc(context)`(),
          );
          let extendsYield: n.Statement = b.expressionStatement(
            b.yieldExpression(parentCall, true),
          );
          if (!self.hasKnownExtends) {
            extendsYield = ast`if (parentTemplate !== null) %%inner%%`({
              inner: b.blockStatement([extendsYield]),
            });
          }
          inner.push(extendsYield);
        }
        inner.unshift(...state.decls.splice(0));
        const rootStatements: n.Statement[] = [
          b.expressionStatement(b.stringLiteral("use strict")),
        ];
        const funcDecl: n.FunctionDeclaration = ast`
        function* root(runtime, env, context) {
          const lineno = %%lineno%%;
          const colno = %%colno%%;
          const { missing, undef } = env;
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
            b.functionDeclaration.from({
              id: id(`block_${name}`),
              params: [id("runtime"), id("env"), id("context")],
              body: b.blockStatement(blockStatements),
              async: self.isAsync,
              generator: true,
            }),
          );
          const blockFrame = new Frame(evalCtx);
          blockFrame.blockFrame = true;
          const undeclared = findUndeclared(block.node.body, ["self", "super"]);
          if (undeclared.has("self")) {
            const ref = blockFrame.symbols.declareParameter("self");
            blockStatements.push(
              ast`%%ref%% = new runtime.TemplateReference(context)`({
                ref: id(ref),
              }),
            );
          }
          if (undeclared.has("super")) {
            const ref = blockFrame.symbols.declareParameter("super");
            blockStatements.push(
              ast`%%ref%% = context.super({name: %%name%%, current: %%blockFnName%%})`(
                {
                  ref: id(ref),
                  name: b.stringLiteral(name),
                  blockFnName: id(`block_${name}`),
                },
              ),
            );
          }
          blockFrame.symbols.analyzeNode(block.node);
          blockFrame.block = name;
          blockStatements.push(
            ast.statement`const _blockVars = {}`(),
            ast.statement`const { missing, undef } = env`(),
            ast.statement`const resolve = (key) => context.resolveOrMissing(key)`(),
          );
          blockStatements.push(...self.enterFrame(blockFrame));
          blockStatements.push(
            ...forceStatements([
              ...self.pullDependencies(block.node.body),
              ...self.visit(block.get("body"), { ...state, frame: blockFrame }),
            ]),
          );
          blockStatements.unshift(...state.decls.splice(0));
        });
        // TODO allow commonjs and ESM support
        rootStatements.push(
          b.returnStatement(
            b.objectExpression([
              b.objectProperty.from({
                key: id("root"),
                value: id("root"),
                shorthand: true,
              }),
              b.objectProperty(
                id("blocks"),
                b.objectExpression(
                  [...Object.keys(self.blocks)].map((block) =>
                    b.objectProperty(id(block), id(`block_${block}`)),
                  ),
                ),
              ),
            ]),
          ),
        );
        return rootStatements;
      },
      visitBlock({ node }, state) {
        const { frame, self } = state;
        const statements: n.Statement[] = [];
        let ifWrap: n.IfStatement | null = null;
        if (frame.toplevel) {
          // if we know that we are a child template, there is no need to
          // check if we are one
          if (self.hasKnownExtends) {
            return;
          }
          if (self.extendsSoFar > 0) {
            ifWrap = ast`if (parentTemplate === null) {}`();
          }
        }

        const context = node.scoped
          ? self.deriveContext(frame)
          : id(self.getContextRef());

        if (node.required) {
          statements.push(
            ...forceStatements(
              ast`
          if (context.blocks[%%name%%].length <= 1) {
            throw new runtime.TemplateRuntimeError(%%msg%%)
          }
          `({
                name: b.stringLiteral(node.name),
                msg: b.stringLiteral(`Required block '${node.name}' not found`),
              }),
            ),
          );
        }

        const block = self.awaitIfAsync(
          ast.expression`
          context.blocks[%%name%%][0](%%context%%)
        `({
            name: b.stringLiteral(node.name),
            context,
          }),
        );

        if (frame.buffer === null) {
          statements.push(
            b.expressionStatement(b.yieldExpression(block, true)),
          );
        } else {
          const stmt: n.ForOfStatement = ast.statement`
            for (const event of context.blocks[%%name%%][0](%%context%%)) {
              %%write%%
            }
          `({
            name: b.stringLiteral(node.name),
            context,
            write: self.write(id("event"), frame),
          });
          if (self.environment.isAsync()) {
            stmt.await = true;
          }
          statements.push(stmt);
        }

        if (ifWrap !== null) {
          ifWrap.consequent = b.blockStatement(statements);
          return ifWrap;
        } else {
          return statements;
        }
      },
      visitExtends(path, state) {
        const { node } = path;
        const { frame, self } = state;
        const decls: n.VariableDeclaration[] = [];
        if (!frame.toplevel) {
          return self.fail(
            "Cannot use extend from a non top-level scope",
            node.loc,
          );
        }
        const statements: n.Statement[] = [];
        // if the number of extends statements in general is zero so
        // far, we don't have to add a check if something extended
        // the template before this one.
        if (self.extendsSoFar > 0) {
          if (!self.hasKnownExtends) {
            statements.push(
              ast.statement`
              if (parentTemplate !== null) {
                throw new runtime.TemplateRuntimeError("extended multiple times");
              }
            `(),
            );
          } else {
            statements.push(
              ast.statement`
                throw new runtime.TemplateRuntimeError("extended multiple times");
              `(),
            );
          }
          // if we have a known extends already we don't need that code here
          // as we know that the template execution will end here.
          if (self.hasKnownExtends) {
            return statements;
          }
        }

        const template = self.visitExpression(
          path.get("template"),
          state,
          decls,
        );

        const parentTemplate = self.awaitIfAsync(
          ast.expression`env.getTemplate(%%template%%, { parent: %%name%% })`({
            template,
            name: self.name ? b.stringLiteral(self.name) : b.nullLiteral(),
          }),
        );
        statements.push(
          ...decls,
          ...forceStatements(
            ast`parentTemplate = %%parentTemplate%%`({ parentTemplate }),
          ),
        );
        statements.push(
          ast`
            for (const [name, parentBlock] of Object.entries(
              parentTemplate.blocks,
            )) {
              (context.blocks[name] = context.blocks[name] || []).push(
                parentBlock,
              );
            }
        `(),
        );

        // if this extends statement was in the root level we can take
        // advantage of that information and simplify the generated code
        // in the top level from this point onwards
        if (frame.rootlevel) {
          self.hasKnownExtends = true;
        }
        self.extendsSoFar++;

        return statements;
      },
      visitInclude(path, state) {
        const { node } = path;
        const { frame, self } = state;
        const statements: n.Statement[] = [];
        const decls: n.VariableDeclaration[] = [];

        let funcName = "getOrSelectTemplate";
        if (node.template.type === "Const") {
          if (typeof node.template.value === "string") {
            funcName = "getTemplate";
          } else if (Array.isArray(node.template.value)) {
            funcName = "selectTemplate";
          }
        } else if (
          node.template.type === "Tuple" ||
          node.template.type === "List"
        ) {
          funcName = "selectTemplate";
        }

        const templateExpr = self.visitExpression(
          path.get("template"),
          state,
          decls,
        );
        statements.push(...decls);
        const template = self.awaitIfAsync(
          ast.expression`env.%%funcName%%(%%template%%)`({
            funcName,
            template: templateExpr,
          }),
        );

        if (node.ignoreMissing) {
          statements.push(
            ...forceStatements(
              ast`
                const template = %%iife%%;
              `({
                iife: self.iife(
                  ast`
                    try {
                      return %%template%%;
                    } catch (e) {
                      if (e.type !== "TemplateNotFound" && e.type !== "TemplatesNotFound") throw e;
                    }
                  `({ template }),
                ),
              }),
            ),
          );
        } else {
          statements.push(ast`const template = %%template%%;`({ template }));
        }

        const context = node.withContext
          ? ast.expression`
        template.newContext({ vars: context.getAll(), shared: true, locals: %%locals%% })
        `({ locals: self.dumpLocalContext(frame) })
          : ast.expression`template.newContext()`();

        const renderCall: n.Expression = self.awaitIfAsync(
          ast.expression`template.rootRenderFunc(%%context%%)`({
            context,
          }),
        );

        const doRender: n.Statement = self.delegateGenerator(renderCall, frame);

        if (node.ignoreMissing) {
          statements.push(
            ast.statement`if (template) %%consequent%%`({
              consequent: b.blockStatement([doRender]),
            }),
          );
        } else {
          statements.push(doRender);
        }

        return statements;
      },
      visitImport(path, state) {
        const { node } = path;
        const { frame, self } = state;
        const statements: n.Statement[] = [];

        const templateModule = self._importCommon(path, state);

        let assignment: n.AssignmentExpression = b.assignmentExpression(
          "=",
          id(frame.symbols.ref(node.target)),
          templateModule,
        );
        if (frame.toplevel) {
          assignment = b.assignmentExpression(
            "=",
            ast.expression`context.vars["${node.target}"]`() as n.MemberExpression,
            assignment,
          );
        }
        statements.push(b.expressionStatement(assignment));
        if (frame.toplevel && !node.target.startsWith("_")) {
          statements.push(
            ast.statement`
              context.exportedVars.delete(%%target%%)
            `({ target: str(node.target) }),
          );
        }
        return statements;
      },
      visitFromImport(path, state) {
        const { node } = path;
        const { frame, self } = state;
        const statements: n.Statement[] = [];

        const templateModule = self._importCommon(path, state);
        statements.push(
          ast.statement`const includedTemplate = %%templateModule%%`({
            templateModule,
          }),
        );
        const varNames: string[] = [];
        const discardedNames: string[] = [];
        for (const importName of node.names) {
          let name: string;
          let alias: string;
          if (Array.isArray(importName)) {
            [name, alias] = importName;
          } else {
            alias = name = importName;
          }
          statements.push(
            ast.statement`
              %%alias%% = runtime.hasOwn(includedTemplate, %%name%%)
                ? includedTemplate[%%name%%]
                : missing;
            `({
              alias: id(frame.symbols.ref(alias)),
              name: b.stringLiteral(name),
            }),
          );
          const message = b.templateLiteral(
            [
              tmplEl("the template '"),
              tmplEl(
                [
                  `' (imported on ${self.position(node)})`,
                  ` does not export the requested name '${name}'`,
                ].join(""),
                { tail: true },
              ),
            ],
            [memberExpr("includedTemplate.__name__")],
          );
          statements.push(
            ...ast.statements`
              if (%%alias%% === missing) {
                %%alias%% = undef(%%message%%)
              }
            `({ alias: id(frame.symbols.ref(alias)), message }),
          );
          if (frame.toplevel) {
            varNames.push(alias);
            if (!alias.startsWith("_")) {
              discardedNames.push(alias);
            }
          }
        }
        if (varNames.length) {
          if (varNames.length === 1) {
            statements.push(
              ast.statement`
                context.vars[%%name%%] = %%ref%%
              `({
                name: b.stringLiteral(varNames[0]),
                ref: id(frame.symbols.ref(varNames[0])),
              }),
            );
          } else {
            statements.push(
              ast.statement`Object.assign(context.vars, %%obj%%)`({
                obj: b.objectExpression(
                  varNames.map((name) =>
                    b.objectProperty(str(name), id(frame.symbols.ref(name))),
                  ),
                ),
              }),
            );
          }
        }
        statements.push(
          ast.statement`
          runtime.setDelete(context.exportedVars, %%names%%)
        `({ names: discardedNames.map((name) => str(name)) }),
        );
        return statements;
      },
      visitContinue() {
        return b.continueStatement();
      },
      visitBreak() {
        return b.breakStatement();
      },
      visitFilter(path, state) {
        const { node } = path;
        const { self, frame } = state;
        const decls: n.VariableDeclaration[] = [];
        return self._filterTestCommon(path, state, () => {
          if (node.node) {
            return self.visitExpression(path.get("node"), state, decls);
          } else if (frame.evalCtx.volatile) {
            return ast.expression`
              context.evalCtx.autoescape ? runtime.markSafe(runtime.concat(%%buf%%))) : runtime.concat(%%buf%%)
            `({ buf: id(frame.buffer!) });
          } else if (frame.evalCtx.autoescape) {
            return ast.expression`runtime.markSafe(runtime.concat(%%buf%%))`({
              buf: id(frame.buffer!),
            });
          } else {
            return ast.expression`runtime.concat(%%buf%%)`({
              buf: id(frame.buffer!),
            });
          }
        });
      },
      visitTest(path, state) {
        const { self } = state;
        return self._filterTestCommon(path, state, () =>
          self.visitExpression(path.get("node"), state),
        );
      },
      visitOutput(path, state) {
        // todo: implement finalize
        const { node } = path;
        const { self, frame } = state;
        if (frame.requireOutputCheck) {
          if (this.hasKnownExtends) return;
        }
        const body: (string[] | Path<t.Node>)[] = [];
        for (const [i, child] of node.nodes.entries()) {
          let val: any;
          try {
            val = self.outputChildToConst(child, frame);
          } catch (e) {
            body.push(path.get("nodes", i));
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

        const decls: n.VariableDeclaration[] = [];

        if (frame.buffer !== null) {
          const args: n.Expression[] = [];
          for (const item of body) {
            if (Array.isArray(item)) {
              const val = item.map((i) => runtimeStr(i)).join("");
              args.push(b.stringLiteral(val));
            } else {
              const itemNodes = self.visit(item, state).filter((node) => {
                if (node.type === "VariableDeclaration") {
                  decls.push(node);
                  return false;
                } else {
                  return true;
                }
              });
              args.push(self.wrapChildPre(itemNodes, decls, frame));
            }
          }
          const callee = memberExpr(`${frame.buffer}.push`);
          innerNodes.push(
            b.expressionStatement(b.callExpression(callee, args)),
          );
        } else {
          for (const item of body) {
            if (Array.isArray(item)) {
              const val = item.map((i) => runtimeStr(i)).join("");
              innerNodes.push(
                b.expressionStatement(b.yieldExpression(b.stringLiteral(val))),
              );
            } else {
              const itemNodes = self.visit(item, state).filter((node) => {
                if (node.type === "VariableDeclaration") {
                  decls.push(node);
                  return false;
                } else {
                  return true;
                }
              });
              innerNodes.push(
                b.expressionStatement(
                  b.yieldExpression(self.wrapChildPre(itemNodes, decls, frame)),
                ),
              );
            }
          }
        }
        return [...decls, ...innerNodes];
      },
      visitConst(path) {
        const { node } = path;
        if (typeof node.value === "number" || node.value instanceof Number) {
          return b.numericLiteral(node.value as number);
        } else if (typeof node.value === "string") {
          return b.stringLiteral(node.value);
        } else if (typeof node.value === "boolean") {
          return b.booleanLiteral(node.value);
        } else if (node.value === null) {
          return b.nullLiteral();
        } else {
          throw new Error("Unexpected Const node value type");
        }
      },
      visitTemplateData({ node }, { self, frame }) {
        try {
          return str(self.outputChildToConst(node, frame));
        } catch (e) {
          if (e.name !== "Impossible") throw e;
          return ast.expression`
            (context.evalCtx.autoescape ? runtime.markSafe : runtime.identity)(%%data%%)
          `({ data: str(node.data) });
        }
      },
      visitGetattr(path, state) {
        const { self } = state;
        const target = self.visitExpression(path.get("node"), state);
        return self.awaitIfAsync(
          ast.expression`env.getattr(%%target%%, %%attr%%)`({
            target,
            attr: b.stringLiteral(path.node.attr),
          }),
        );
      },
      visitGetitem(path, state) {
        const { node } = path;
        const { self } = state;
        const target = self.visitExpression(path.get("node"), state);
        if (t.Slice.check(node.arg)) {
          const slice = path.get("arg");
          const start = node.arg.start
            ? self.visitExpression(slice.get("start") as Path, state)
            : node.arg.stop ?? node.arg.step
              ? id("undefined")
              : undefined;
          const stop = node.arg.stop
            ? self.visitExpression(slice.get("stop") as Path, state)
            : node.arg.step
              ? id("undefined")
              : undefined;
          const step = node.arg.step
            ? self.visitExpression(slice.get("step") as Path, state)
            : undefined;
          const args: n.Expression[] = [target];
          if (typeof start !== "undefined") args.push(start);
          if (typeof stop !== "undefined") args.push(stop);
          if (typeof step !== "undefined") args.push(step);

          const callSlice = self.awaitIfAsync(
            b.callExpression(
              runtimeExpr(this.isAsync ? "asyncSlice" : "slice"),
              args,
            ),
          );

          return self.toArrayExpression(callSlice);
        }
        const attr = self.visitExpression(path.get("arg"), state);
        return self.awaitIfAsync(
          ast.expression`env.getattr(%%target%%, %%attr%%)`({
            target,
            attr,
          }),
        );
      },
      visitSlice() {
        throw new Error(
          "this should not be reached (Slice is visited as a child of Getitem)",
        );
      },
      visitTuple(path, state) {
        const { self } = state;
        const elements = path
          .get("items")
          .map((item) => self.visitExpression(item, state));
        return b.arrayExpression(elements);
      },
      visitList(path, state) {
        const { self } = state;
        const elements = path
          .get("items")
          .map((item) => self.visitExpression(item, state));
        return b.arrayExpression(elements);
      },
      visitDict(path, state) {
        const { self } = state;
        const properties = path
          .get("items")
          .map((item) =>
            b.objectProperty(
              self.visitExpression(item.get("key"), state),
              self.visitExpression(item.get("value"), state),
            ),
          );
        return b.objectExpression(properties);
      },
      visitBinExpr(path, state) {
        const { node } = path;
        const { self } = state;
        // TODO: sandboxed binop?
        const left = self.visitExpression(path.get("left"), state);
        const right = self.visitExpression(path.get("right"), state);

        const operator =
          node.operator === "and"
            ? "&&"
            : node.operator === "or"
              ? "||"
              : node.operator;

        if (operator === "//") {
          return ast.expression`Math.floor(%%left%% / %%right%%)`({
            left,
            right,
          });
        } else if (operator == "**") {
          return ast.expression`Math.pow(%%left%%, %%right%%)`({ left, right });
        } else if (operator === "||" || operator === "&&") {
          return b.logicalExpression(operator, left, right);
        } else {
          return b.binaryExpression(operator, left, right);
        }
      },
      visitConcat(path, state) {
        const { frame, self } = state;
        let funcName: n.Expression;
        if (frame.evalCtx.volatile) {
          funcName = ast.expression`
            context.evalCtx.volatile ? runtime.markupJoin : runtime.strJoin
          `();
        } else if (frame.evalCtx.autoescape) {
          funcName = ast.expression`runtime.markupJoin`();
        } else {
          funcName = ast.expression`runtime.strJoin`();
        }
        return ast.expression`%%funcName%%(%%args%%)`({
          funcName,
          args: [
            b.arrayExpression(
              path
                .get("nodes")
                .map((child) => self.visitExpression(child, state)),
            ),
          ],
        });
      },
      visitUnaryExpr(path, state) {
        // TODO: sandbox intercept unary ops?
        const { node } = path;
        const { self } = state;
        const expr = self.visitExpression(path.get("node"), state);
        const operator = node.operator === "not" ? "!" : node.operator;
        return b.unaryExpression(operator, expr);
      },
      visitCall(path, state) {
        const { node } = path;
        const { self, frame } = state;
        const { forwardCaller = false, ...childState } = state;
        const func = self.visitExpression(path.get("node"), childState);
        const args = path
          .get("args")
          .map((arg) => self.visitExpression(arg, childState));

        args.push(
          ast.expression`Object.assign(%%dynargs%%, { __isVarargs: true })`({
            dynargs: node.dynArgs
              ? self.visitExpression(path.get("dynArgs") as Path, childState)
              : b.arrayExpression([]),
          }),
        );

        const kwargs: n.ObjectProperty[] = [];
        path.get("kwargs").each((kwarg) => {
          kwargs.push(
            b.objectProperty(
              id(kwarg.node.key),
              self.visitExpression(kwarg.get("value"), childState),
            ),
          );
        });

        const extraKwargs: string[] = [];
        if (forwardCaller) extraKwargs.push("caller");
        if (frame.loopFrame) extraKwargs.push("_loopVars");
        if (frame.blockFrame) extraKwargs.push("_blockVars");
        args.push(
          b.objectExpression([
            b.objectProperty(id("__isKwargs"), b.booleanLiteral(true)),
            ...kwargs,
            ...(node.dynKwargs
              ? [
                  b.spreadElement(
                    self.visitExpression(
                      path.get("dynKwargs") as Path,
                      childState,
                    ),
                  ),
                ]
              : []),
            ...extraKwargs.map((key) =>
              b.objectProperty.from({
                key: id(key),
                value: id(key),
                shorthand: true,
              }),
            ),
          ]),
        );
        return self.awaitIfAsync(
          ast.expression`context.call(%%func%%, %%args%%)`({
            func,
            args: b.arrayExpression(args),
          }),
        );
      },
      visitMarkSafe(path, state) {
        const { self } = state;
        return ast.expression`runtime.markSafe(%%expr%%)`({
          expr: self.visit(path.get("expr"), state),
        });
      },
      visitMarkSafeIfAutoescape(path, state) {
        const { self } = state;
        return ast.expression`
          (context.evalCtx.autoescape ? runtime.markSafe : runtime.identity)(%%expr%%)
        `({ expr: self.visit(path.get("expr"), state) });
      },
      visitEnvironmentAttribute({ node }) {
        return memberExpr(`env.${node.name}`);
      },
      visitExtensionAttribute({ node }) {
        return ast.expression`env.extensions[%%id%%].%%name%%`({
          id: str(node.identifier),
          name: id(node.name),
        });
      },
      visitImportedName({ node }, { self }) {
        const alias = self.importAliases[node.importname];
        if (!alias) {
          throw new Error(`import alias '${node.importname}' not found`);
        }
        return id(alias);
      },
      visitInternalName({ node }) {
        return id(node.name);
      },
      visitContextReference() {
        return id("context");
      },
      visitDerivedContextReference(path, { self, frame }) {
        return self.deriveContext(frame);
      },
      visitScope(path, state) {
        const { self } = state;
        const { node } = path;
        const frame = state.frame.inner();
        frame.symbols.analyzeNode(node);
        const statements: n.Statement[] = [
          ...self.enterFrame(frame),
          ...self.blockvisit(path.get("body"), { ...state, frame }),
          ...self.leaveFrame(frame),
        ];
        return b.blockStatement(statements);
      },
      visitOverlayScope(path, state) {
        const { self, frame } = state;
        const { node } = path;
        const ctx = self.temporaryIdentifier();
        const statements: n.Statement[] = [];
        const decls: n.VariableDeclaration[] = [];
        statements.push(
          ast.statement`let %%ctx%% = %%derived%%`({
            ctx: id(ctx),
            derived: self.deriveContext(frame),
          }),
          ast.statement`%%ctx%%.vars = %%rhs%%`({
            ctx: id(ctx),
            rhs: self.visitExpression(path.get("context"), state, decls),
          }),
        );
        self.pushContextReference(ctx);

        const scopeFrame = frame.inner({ isolated: true });
        scopeFrame.symbols.analyzeNode(node);
        statements.push(
          ...self.enterFrame(scopeFrame),
          ...self.blockvisit(path.get("body"), { ...state, frame: scopeFrame }),
          ...self.leaveFrame(scopeFrame),
        );
        self.popContextReference();
        return b.blockStatement([...decls, ...statements]);
      },
      visitEvalContextModifier(path, state) {
        return this._evalContextModifierCommon(path, state);
      },
      visitScopedEvalContextModifier(path, state) {
        const { frame } = state;
        const oldCtxName = id(this.temporaryIdentifier());
        const savedCtx = frame.evalCtx.save();
        const statements: n.Statement[] = [
          ast.statement`let %%oldCtxName%% = context.evalCtx.save()`({
            oldCtxName,
          }),
          ...this._evalContextModifierCommon(path, state),
        ];
        path.get("body").each((child) => {
          statements.push(...this.visitStatements(child, state));
        });
        frame.evalCtx.revert(savedCtx);
        statements.push(
          ast.statement`context.evalCtx.revert(%%oldCtxName%%)`({ oldCtxName }),
        );
        return statements;
      },
      visitCondExpr(path, state) {
        const { node } = path;
        const { self } = state;
        const frame = state.frame.soft();
        // test consequent alternate
        const consequent = self.visitExpression(path.get("expr1"), {
          ...state,
          frame,
        });
        const test = runtimeTest(
          self.visitExpression(path.get("test"), { ...state, frame }),
        );
        let alternate: n.Expression;
        if (node.expr2) {
          alternate = self.visitExpression(path.get("expr2"), {
            ...state,
            frame,
          });
        } else {
          const pos = self.position(node);
          alternate = ast.expression`undef(%%err%%)`({
            err: str(
              `the inline if-expression on ${pos} evaluated to false and no else section was defined.`,
            ),
          });
        }
        return b.conditionalExpression(test, consequent, alternate);
      },
      visitCompare(path, state) {
        const { self } = state;
        const comparisons: [n.Expression, t.Operand["op"], n.Expression][] = [];

        let lhs = self.visitExpression(path.get("expr"), state);
        path.get("ops").each((op) => {
          const rhs = self.visitExpression(op.get("expr"), state);
          comparisons.push([lhs, op.node.op, rhs]);
          lhs = rhs;
        });

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
              acc ? b.logicalExpression("&&", curr, acc) : curr,
            ),
          ),
        );
        return stmts;
      },
      visitAssign(path, state) {
        const { frame, self } = state;
        this.pushAssignTracking();

        const statements: n.Statement[] = [];

        const targetNode = path.node.target;
        if (targetNode.type === "NSRef") {
          const ref = frame.symbols.ref(targetNode.name);
          statements.push(
            ast.statement`runtime.assertNamespace(%%ref%%)`({ ref: id(ref) }),
          );
        }
        const [left] = this.visit(path.get("target"), state);
        const [right] = this.visit(path.get("node"), state);
        n.assertLVal(left);
        n.assertExpression(right);
        statements.push(
          b.expressionStatement(b.assignmentExpression("=", left, right)),
        );
        return [...statements, ...self.popAssignTracking(frame)];
      },
      visitAssignBlock(path, state) {
        const { node } = path;
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
            self.visit(path.get("body"), { ...state, frame: blockFrame }),
          ),
        );
        const target = self.visitExpression(path.get("target"), state);
        const callee: n.ConditionalExpression = ast.expression`
          (context.evalCtx.autoescape ? runtime.markSafe : runtime.identity)
        `();
        const args: n.Expression[] = [];
        if (node.filter) {
          args.push(
            self.visitExpression(path.get("filter"), {
              ...state,
              frame: blockFrame,
            }),
          );
        } else {
          args.push(
            ast.expression`runtime.concat(%%buf%%)`({
              buf: id(blockFrame.buffer!),
            }),
          );
        }
        stmts.push(
          ast.statement`%%target%% = (%%callee%%)(%%args%%)`({
            target,
            callee,
            args,
          }),
        );
        stmts.push(...self.popAssignTracking(frame));

        return self.wrapFrame(blockFrame, stmts);
      },
      visitName(path, state) {
        const { self, frame } = state;
        const { node } = path;
        if (
          node.ctx === "store" &&
          (frame?.toplevel || frame?.loopFrame || frame?.blockFrame)
        ) {
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
            return ast.expression`(%%ref%% === missing) ? undef({name: %%name%%}) : %%ref%%`(
              {
                name: b.stringLiteral(node.name),
                ref,
              },
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
          self.visitExpression(path.get("test"), { ...state, frame }, decls),
        );
        const consequent = b.blockStatement(
          self.visitStatements(path.get("body"), { ...state, frame }),
        );
        const alternates: { test: n.Expression; consequent: n.Statement }[] =
          path.get("elif").map((elif) => ({
            test: runtimeTest(
              forceExpression(
                self.visit(elif.get("test"), { ...state, frame }),
                decls,
              ),
            ),
            consequent: b.blockStatement(
              self.visitStatements(elif.get("body"), { ...state, frame }),
            ),
          }));
        const else_ = node.else_?.length
          ? b.blockStatement(
              self.visitStatements(path.get("else_"), { ...state, frame }),
            )
          : undefined;
        const alternate =
          alternates.reduceRight(
            (alt: n.Statement | undefined, { test, consequent }) =>
              b.ifStatement(test, consequent, alt),
            else_,
          ) ?? null;
        return [...decls, b.ifStatement(test, consequent, alternate)];
      },
      visitFor(path, state) {
        const { frame, self } = state;
        const { node } = path;
        const loopFrame = frame.inner();
        const decls: n.VariableDeclaration[] = [];
        loopFrame.loopFrame = true;
        const testFrame = frame.inner();
        const elseFrame = frame.inner();
        const rootStatements: n.Statement[] = [];
        let currStatements = rootStatements;

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
          const target = forceExpression(
            self.visit(path.get("target"), {
              ...state,
              frame: loopFrame,
            }),
            decls,
          );
          n.assertIdentifier(target);
          const test = forceExpression(
            self.visit(path.get("test") as Path<t.Node, t.Node>, {
              ...state,
              frame: testFrame,
            }),
            decls,
          );
          const stmt: n.ForOfStatement =
            ast.statement`for (%%target%% of fiter) {
            if (%%test%%) {
              %%consequent%%;
            }
          }`({
              target: b.variableDeclaration("const", [
                b.variableDeclarator(target),
              ]),
              test,
              consequent: b.expressionStatement(
                b.yieldExpression(cloneNode(target)),
              ),
            });
          stmt.await = this.isAsync;
          const blockStmt = self.wrapFrame(testFrame, [stmt]);
          rootStatements.push(
            b.functionDeclaration.from({
              id: id(loopFilterFunc),
              params: [id("fiter")],
              body: blockStmt,
              async: self.isAsync,
              generator: true,
            }),
          );
        }
        if (node.recursive) {
          const funcDecl: n.FunctionDeclaration =
            ast`function loop(reciter, loopRenderFunc, depth = 0) {}`();
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
              node.loc,
            );
          }
        }
        let iterationIndicator: string | null = null;
        if (node.else_?.length) {
          iterationIndicator = self.temporaryIdentifier();
          currStatements.push(ast`let ${iterationIndicator} = 1`());
        }
        let [target, ...rest] = self.visit(path.get("target"), {
          ...state,
          frame: loopFrame,
        });
        if (rest.length) {
          rest = [];
          return self.fail(
            "Unexpected return of multiple nodes for for-loop target",
            node.loc,
          );
        }
        // Convert array expressions to array patterns for lhs
        if (n.ArrayExpression.check(target)) {
          const elements: (n.PatternLike | null)[] = [];
          for (const el of target.elements) {
            if (el === null) {
              elements.push(el);
              continue;
            }
            n.PatternLike.assert(el);
            elements.push(el);
          }
          target = b.arrayPattern(elements);
        }

        const assertTarget: (
          t: n.Node,
        ) => asserts t is n.Identifier | n.ArrayPattern = (t) =>
          JsType.or(n.Identifier, n.ArrayPattern).assert(t);

        assertTarget(target);
        if (loopRef) {
          if (n.Identifier.check(target)) {
            target = b.arrayPattern([target, id(loopRef)]);
          } else {
            target.elements.push(id(loopRef));
          }
        }
        target = b.variableDeclaration("let", [b.variableDeclarator(target)]);

        let iter = node.recursive
          ? id("reciter")
          : self.visitExpression(path.get("iter"), { ...state, frame }, decls);

        if (loopFilterFunc !== null) {
          iter = b.callExpression(id(loopFilterFunc), [iter]);
        }

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
            await: self.environment.isAsync(),
          }),
        );
        path.get("body").each((child) => {
          loopBody.push(
            ...forceStatements(
              self.visit(child, { ...state, frame: loopFrame }),
            ),
          );
        });

        if (node.else_?.length) {
          loopBody.push(ast`${iterationIndicator} = 0`());

          const elseNodes = self.visitStatements(path.get("else_"), {
            ...state,
            frame: elseFrame,
          });
          currStatements.push(
            b.ifStatement(
              id(iterationIndicator!),
              self.wrapFrame(elseFrame, elseNodes),
            ),
          );
        }
        if (node.recursive) {
          currStatements.push(self.returnBufferContents(loopFrame));
          const loopArgs = self
            .visit(path.get("iter"), state)
            .map((x) => forceExpression(x));

          loopArgs.push(id("loop"));
          const callExpr = self.awaitIfAsync(
            b.callExpression(id("loop"), loopArgs),
          );
          rootStatements.push(self.write(callExpr, frame));
        }

        if (self.assignStack.length) {
          differenceUpdate(
            self.assignStack[self.assignStack.length - 1],
            loopFrame.symbols.stores,
          );
        }
        return b.blockStatement([...decls, ...rootStatements]);
      },

      visitMacro(path, state) {
        const { node } = path;
        const { self, frame } = state;
        const statements: n.Statement[] = [];
        const macro = self.macroDef(path, state);
        if (frame.toplevel && !node.name.startsWith("_")) {
          statements.push(ast`context.exportedVars.add("${node.name}")`());
        }

        let assignment: n.AssignmentExpression = b.assignmentExpression(
          "=",
          id(frame.symbols.ref(node.name)),
          macro,
        );
        if (frame.toplevel) {
          assignment = b.assignmentExpression(
            "=",
            ast.expression`context.vars["${node.name}"]`() as n.MemberExpression,
            assignment,
          );
        }
        statements.push(b.expressionStatement(assignment));
        return statements;
      },
      visitCallBlock(path, state) {
        const { self, frame } = state;
        const decls: n.VariableDeclaration[] = [];
        const expr = self.visitExpression(
          path.get("call"),
          { ...state, forwardCaller: true },
          decls,
        );
        return [
          ...decls,
          ast.statement`const caller = %%macro%%`({
            macro: self.macroDef(path, state),
          }),

          self.write(expr, frame),
        ];
      },
      visitFilterBlock(path, state) {
        const { node } = path;
        const { frame, self } = state;
        const filterFrame = frame.inner();
        filterFrame.symbols.analyzeNode(node);
        const decls: n.VariableDeclaration[] = [];
        const statements: n.Statement[] = [];

        statements.push(...self.enterFrame(filterFrame));
        statements.push(self.buffer(filterFrame));

        const expr = self.visitExpression(
          path.get("filter"),
          { ...state, frame: filterFrame },
          decls,
        );
        return [
          ...statements,
          ...decls,
          ...self.blockvisit(path.get("body"), {
            ...state,
            frame: filterFrame,
          }),
          self.write(expr, frame),
          ...self.leaveFrame(filterFrame),
        ];
      },
      visitWith(path, state) {
        const { node } = path;
        const { self, frame } = state;
        const withFrame = state.frame.inner();
        withFrame.symbols.analyzeNode(node);
        const statements: n.Statement[] = [];
        statements.push(...self.enterFrame(withFrame));
        const len = node.targets.length;
        if (node.values.length !== len) {
          throw new Error(
            "parsing error: mismatched number of with targets and expressions",
          );
        }
        let decls: n.VariableDeclaration[] = [];
        for (let i = 0; i < len; i++) {
          const target = path.get("targets", i);
          const expr = path.get("values", i);
          const lhs = self.visitExpression(
            target,
            { ...state, frame: withFrame },
            decls,
          );
          const rhs = self.visitExpression(expr, { ...state, frame }, decls);
          n.LVal.assert(lhs);
          statements.push(
            ...decls,
            b.variableDeclaration("let", [b.variableDeclarator(lhs, rhs)]),
          );
          decls = [];
        }
        statements.push(
          ...self.blockvisit(path.get("body"), { ...state, frame: withFrame }),
        );
        statements.push(...self.leaveFrame(withFrame));
        return statements;
      },
      visitExprStmt(path, state) {
        return state.self.visit(path.get("node"), state);
      },
      visitNSRef(path, state) {
        // NSRefs can only be used to store values; since they use the normal
        // `foo.bar` notation they will be parsed as a normal attribute access
        // when used anywhere but in a `set` context
        const { node } = path;
        const ref = state.frame.symbols.ref(node.name);
        return b.memberExpression(id(ref), b.stringLiteral(node.attr), true);
      },
    };
  }

  visitStatements<T extends t.Node>(
    nodeOrPath: T | Path<T, any> | T[],
    state: State<IsAsync>,
  ): n.Statement[] {
    const result = this.visit(nodeOrPath, state);
    return forceStatements(result);
  }
  visitStatement<T extends t.Node>(
    nodeOrPath: T | Path<T, any> | T[],
    state: State<IsAsync>,
  ): n.Statement {
    const statements = this.visitStatements(nodeOrPath, state);
    const len = statements.length;
    if (len !== 1) {
      throw new Error(`Expected a single Statement node, found ${len}`);
    }
    return statements[0];
  }
  visitExpression<T extends t.Node>(
    nodeOrPath: T | Path<T> | T[],
    state: State<IsAsync>,
    decls?: n.VariableDeclaration[],
  ): n.Expression {
    if (typeof decls === "undefined") {
      decls = state.decls;
    }
    return forceExpression(this.visit(nodeOrPath, state), decls);
  }
  visit<T extends t.Node>(
    nodeOrPath: T | Path<T, T> | T[] | Path<T, T>[] | Path<T, T[]>,
    state: State<IsAsync>,
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
      path = (new Path({ root: nodeOrPath }) as any).get(
        "root",
      ) as unknown as Path;
    } else {
      path = nodeOrPath as unknown as Path;
      if (Array.isArray(path.value)) {
        const result: n.Node[] = [];
        path.value.forEach((_, i) => {
          result.push(...this.visit(path.get(i), state));
        });
        return result;
      }
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
    state: State<IsAsync>,
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
      decls: [],
    });
    astPath.push(...res);
    return astNode;
  }
  parameterIsUndeclared(target: string): boolean {
    if (!this.paramDefBlock.length) return false;
    return this.paramDefBlock[this.paramDefBlock.length - 1].has(target);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fail(msg: string, loc?: t.SourceLocation | null): never {
    throw new Error(msg);
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
    return this.environment.isAsync() ? syncValue : asyncValue;
  }
  get isAsync() {
    return this.environment.isAsync();
  }
  buffer(frame: Frame<IsAsync>): n.VariableDeclaration {
    frame.buffer = this.temporaryIdentifier();
    return b.variableDeclaration("let", [
      b.variableDeclarator(id(frame.buffer), b.arrayExpression([])),
    ]);
  }
  returnBufferContents(
    frame: Frame<IsAsync>,
    { forceUnescaped = false } = {},
  ): n.ReturnStatement {
    if (!frame.buffer) {
      throw new Error("unexpected error: buffer not defined");
    }
    const buffer = id(frame.buffer);
    const concat = b.callExpression(runtimeExpr("concat"), [buffer]);
    const markup = ast.expression`markSafe("").concat(%%buffer%%)`({ buffer });
    let returnExpr: n.Expression = concat;
    if (!forceUnescaped) {
      if (frame.evalCtx.volatile) {
        returnExpr = b.conditionalExpression(
          memberExpr("context.evalCtx.autoescape"),
          markup,
          concat,
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
              this.awaitIfAsync(
                b.callExpression(this.getResolveFunc(), [
                  param === null ? b.nullLiteral() : b.stringLiteral(param),
                ]),
              ),
            ),
          ]),
        );
      } else if (action === VAR_LOAD_ALIAS) {
        nodes.push(
          b.variableDeclaration("let", [
            b.variableDeclarator(id(target), id(param)),
          ]),
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
            b.variableDeclarator(id(target), id("missing")),
          ),
        ),
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
    }
  }
  popAssignTracking(frame: Frame<IsAsync>): n.Statement[] {
    const stackVars = [...(this.assignStack.pop() ?? [])];
    if (
      (!frame.blockFrame && !frame.loopFrame && !frame.toplevel) ||
      !stackVars.length
    ) {
      return [];
    }
    const publicNames = stackVars.filter((v) => !v.startsWith("_"));
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
        b.assignmentExpression("=", b.memberExpression(obj, prop), refId),
      );
    });

    if (!frame.blockFrame && !frame.loopFrame && publicNames.length) {
      nodes.push(
        b.expressionStatement(
          b.callExpression(memberExpr("runtime.setAdd"), [
            memberExpr("context.exportedVars"),
            ...publicNames.map((name) => b.stringLiteral(name)),
          ]),
        ),
      );
    }

    return nodes;
  }

  outputChildToConst(node: t.Expr, frame: Frame<IsAsync>) {
    let val = toConst(frame.evalCtx, node);
    if (frame.evalCtx.autoescape) {
      val = escape(runtimeStr(val));
    }
    if (t.TemplateData.check(node)) {
      return `${val}`;
    }
    // TODO: implement finalize
    return runtimeStr(val);
  }

  wrapChildPre(
    argument: n.Node[],
    decls: n.VariableDeclaration[],
    frame: Frame<IsAsync>,
  ) {
    const callee: n.Expression = frame.evalCtx.volatile
      ? ast.expression`(context.evalCtx.autoescape ? runtime.escape : runtime.str)`()
      : frame.evalCtx.autoescape
        ? runtimeExpr("escape")
        : runtimeExpr("str");
    return b.callExpression(
      callee,
      argument.map((arg) => forceExpression(arg, decls)),
    );
  }

  makeComparison(
    lhs: n.Expression,
    op: t.Operand["op"],
    rhs: n.Expression,
  ): n.Expression {
    if (op === "in" || op === "notin") {
      const callExpr = ast.expression`%%func%%(%%rhs%%, %%lhs%%)`({
        func: runtimeExpr(this.isAsync ? "asyncIncludes" : "includes"),
        lhs,
        rhs,
      });
      return op === "notin" ? b.unaryExpression("!", callExpr) : callExpr;
    } else {
      return b.binaryExpression(OPERATORS[op], lhs, rhs);
    }
  }

  _filterTestCommon(
    path: Path<t.Filter | t.Test>,
    state: State<IsAsync>,
    inner: () => n.Expression,
  ) {
    const { node } = path;
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
      this.fail(`No ${node.type.toLowerCase()} named '${node.name}' found.`);
    }

    const args: n.Expression[] = [];
    args.push(inner());
    const argsPath: Path<t.Expr, t.Expr[]> = path.get("args");
    for (let i = 0; i < node.args.length; i++) {
      args.push(this.visitExpression(argsPath.get(i), state));
    }

    const kwargsPath: Path<t.Keyword, t.Keyword[]> = path.get("kwargs");

    if (node.kwargs.length) {
      const kwargProps: n.ObjectProperty[] = [
        b.objectProperty(str("__isKwargs"), b.booleanLiteral(true)),
      ];
      for (let i = 0; i < node.kwargs.length; i++) {
        const kwarg = kwargsPath.get(i);
        kwargProps.push(
          b.objectProperty(
            str(kwarg.node.key),
            this.visitExpression(kwarg.get("value"), { ...state, frame }),
          ),
        );
      }
      args.push(b.objectExpression(kwargProps));
    }
    return this.awaitIfAsync(
      ast.expression`context.call(%%func%%, %%args%%)`({
        func: funcVar,
        args: b.arrayExpression(args),
      }),
    );
  }

  write(
    expr: n.Expression | string,
    frame: Frame<IsAsync>,
  ): n.ExpressionStatement {
    if (typeof expr === "string") {
      expr = b.stringLiteral(expr);
    }
    return b.expressionStatement(
      frame.buffer
        ? b.callExpression(memberExpr(`${frame.buffer}.push`), [expr])
        : b.yieldExpression(expr),
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
              name: b.stringLiteral(name),
              exc: runtimeExpr("TemplateRuntimeError"),
              msg: b.stringLiteral(`No ${dependency} named '${name}' found.`),
            },
          ),
        );
      }
    }
    return statements;
  }

  macroDef(
    path: Path<t.Macro | t.CallBlock>,
    state: State<IsAsync>,
  ): n.NewExpression {
    const { node } = path;
    const frame = state.frame.inner();
    frame.symbols.analyzeNode(node);
    const macroRef = new MacroRef(node);

    let explicitCaller: number | null = null;
    const skipSpecialParams = new Set<string>();
    const args: string[] = [];
    node.args.forEach((arg, idx) => {
      if (arg.name === "caller") {
        explicitCaller = idx;
      }
      if (arg.name === "kwargs" || arg.name === "varargs") {
        skipSpecialParams.add(arg.name);
      }
      args.push(frame.symbols.ref(arg.name));
    });

    const undeclared = findUndeclared(node.body, [
      "caller",
      "kwargs",
      "varargs",
    ]);

    if (undeclared.has("caller")) {
      if (explicitCaller !== null) {
        if (explicitCaller - node.args.length >= node.defaults.length)
          return this.fail(
            [
              "When defining macros or call blocks the ",
              'special "caller" argument must be omitted ',
              "or be given a default.",
            ].join(""),
            node.loc,
          );
      } else {
        args.push(frame.symbols.declareParameter("caller"));
      }
      macroRef.accessesCaller = true;
    }
    if (undeclared.has("kwargs") && !skipSpecialParams.has("kwargs")) {
      args.push(frame.symbols.declareParameter("kwargs"));
      macroRef.accessesKwargs = true;
    }
    if (undeclared.has("varargs") && !skipSpecialParams.has("varargs")) {
      args.push(frame.symbols.declareParameter("varargs"));
      macroRef.accessesVarargs = true;
    }
    // macros are delayed, they never require output checks
    frame.requireOutputCheck = false;
    frame.symbols.analyzeNode(node);
    const stmts: n.Statement[] = [
      this.buffer(frame),
      ...this.enterFrame(frame),
    ];
    const decls: n.VariableDeclaration[] = [];
    this.pushParameterDefinitions(frame);
    node.args.forEach((arg, idx) => {
      const ref = frame.symbols.ref(arg.name);
      const defaultIdx = node.defaults.length - (node.args.length - idx);
      let rhs: n.Expression;
      if (node.defaults.length <= defaultIdx || defaultIdx < 0) {
        rhs = ast.expression`undef(%%msg%%, {name: %%name%%})`({
          msg: b.stringLiteral(`parameter '${arg.name}' was not provided`),
          name: b.stringLiteral(arg.name),
        });
      } else {
        const default_ = path.get("defaults", defaultIdx);
        rhs = this.visitExpression(default_, { ...state, frame }, decls);
      }
      stmts.unshift(...decls);
      stmts.push(
        ast.statement`if (%%ref%% === missing) { %%ref%% = %%rhs%%; }`({
          ref: id(ref),
          rhs,
        }),
      );
      this.markParameterStored(ref);
    });
    this.popParameterDefinitions();

    stmts.push(...this.blockvisit(path.get("body"), { ...state, frame }));
    stmts.push(this.returnBufferContents(frame, { forceUnescaped: true }));
    stmts.push(...this.leaveFrame(frame, { withPythonScope: true }));
    const funcDecl: n.FunctionDeclaration = ast`
    function macro(%%params%%) %%body%%
    `({
      params: args.map((arg) => id(arg)),
      body: b.blockStatement(stmts),
    });

    const funcExpr: n.FunctionExpression = {
      ...funcDecl,
      type: "FunctionExpression",
      async: !!this.isAsync,
    };

    const argArray = b.arrayExpression(
      macroRef.node.args.map((x) => b.stringLiteral(x.name)),
    );
    const name: n.Literal =
      "name" in macroRef.node
        ? b.stringLiteral(macroRef.node.name)
        : b.nullLiteral();
    return ast.expression`new runtime.Macro(%%args%%)`({
      args: [
        id("env"),
        funcExpr,
        name,
        argArray,
        b.booleanLiteral(macroRef.accessesKwargs),
        b.booleanLiteral(macroRef.accessesVarargs),
        b.booleanLiteral(macroRef.accessesCaller),
        memberExpr("context.evalCtx.autoescape"),
      ],
    }) as n.NewExpression;
  }

  blockvisit(
    nodes: t.Node[] | Path<t.Node, t.Node[]>,
    state: State<IsAsync>,
  ): n.Statement[] {
    const stmts: n.Statement[] = [];
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        stmts.push(...forceStatements(this.visit(node, state)));
      }
    } else {
      nodes.each((path) => {
        stmts.push(...forceStatements(this.visit(path, state)));
      });
    }
    return stmts;
  }

  leaveFrame(
    frame: Frame<IsAsync>,
    { withPythonScope = false } = {},
  ): n.Statement[] {
    if (withPythonScope) return [];
    const undefs = Array.from(Object.keys(frame.symbols.loads)).map((s) =>
      id(s),
    );
    if (!undefs.length) return [];
    return [
      b.expressionStatement(
        undefs.reduceRight<n.Expression>(
          (prev, curr) => b.assignmentExpression("=", curr, prev),
          id("missing"),
        ),
      ),
    ];
  }

  markParameterStored(target: string): void {
    if (this.paramDefBlock?.length) {
      this.paramDefBlock[this.paramDefBlock.length - 1].delete(target);
    }
  }

  pushParameterDefinitions(frame: Frame<IsAsync>): void {
    this.paramDefBlock.push(frame.symbols.dumpParamTargets());
  }
  popParameterDefinitions(): void {
    this.paramDefBlock.pop();
  }

  dumpLocalContext(frame: Frame<IsAsync>): n.ObjectExpression {
    const itemsKeyvals = Object.entries(frame.symbols.dumpStores()).map(
      ([name, target]) => b.objectProperty(id(name), id(target)),
    );
    return b.objectExpression(itemsKeyvals);
  }
  pushContextReference(target: string): void {
    this.contextReferenceStack.push(target);
  }
  popContextReference(): void {
    this.contextReferenceStack.pop();
  }
  getContextRef(): string {
    return this.contextReferenceStack[this.contextReferenceStack.length - 1];
  }
  deriveContext(frame: Frame<IsAsync>): n.Expression {
    return ast.expression`%%ref%%.derived(%%context%%)`({
      ref: this.getContextRef(),
      context: this.dumpLocalContext(frame),
    });
  }
  awaitIfAsync<T extends n.Expression>(node: T): n.AwaitExpression | T {
    return this.isAsync ? b.awaitExpression(node) : node;
  }
  iife(nodeOrNodes: n.Node | n.Node[]): n.Expression {
    const statements = forceStatements(nodeOrNodes);
    const body = b.blockStatement(statements);
    return this.isAsync
      ? ast.expression`await (async () => %%body%%)()`({ body })
      : ast.expression`(() => %%body%%)()`({ body });
  }
  delegateGenerator(expr: n.Expression, frame: Frame<IsAsync>): n.Statement {
    if (frame.buffer === null) {
      return b.expressionStatement(b.yieldExpression(expr, true));
    } else {
      return b.forOfStatement.from({
        left: b.variableDeclaration("const", [
          b.variableDeclarator(id("item")),
        ]),
        right: expr,
        body: this.write(id("item"), frame),
        await: this.isAsync,
      });
    }
  }
  toArrayExpression(node: n.Expression): n.Expression {
    if (this.isAsync) {
      return b.awaitExpression(
        b.callExpression(runtimeExpr("arrayFromAsync"), [node]),
      );
    } else {
      return b.arrayExpression([b.spreadElement(node)]);
    }
  }
  _importCommon(
    path: Path<t.Import | t.FromImport>,
    state: State<IsAsync>,
  ): n.Expression {
    const { node } = path;
    const { frame } = state;
    const templatePath: Path<t.Expr> = path.get("template");
    const template = this.visitExpression(templatePath, state);
    const getTemplate: n.CallExpression | n.AwaitExpression = this.awaitIfAsync(
      ast.expression`env.getTemplate(%%template%%, { parent: %%name%% })`({
        template,
        name: this.name ? b.stringLiteral(this.name) : b.nullLiteral(),
      }),
    );

    if (node.withContext) {
      return this.awaitIfAsync(
        ast.expression`%%getTemplate%%.makeModule({vars: context.getAll()}, true, %%locals%%)`(
          {
            getTemplate,
            locals: this.dumpLocalContext(frame),
          },
        ),
      );
    } else {
      return this.awaitIfAsync(
        ast.expression`%%getTemplate%%._getDefaultModule(context)`({
          getTemplate,
        }),
      );
    }
  }
  _evalContextModifierCommon(
    path: Path<t.EvalContextModifier | t.ScopedEvalContextModifier>,
    state: State<IsAsync>,
  ): n.Statement[] {
    const { frame } = state;
    const statements: n.Statement[] = [];
    path.get("options").each((keyword) => {
      const rhs = this.visitExpression(keyword.get("value"), state);
      try {
        (frame.evalCtx as any)[keyword.node.key] = toConst(
          frame.evalCtx,
          keyword.node.value,
        );
      } catch (e) {
        if (e.name !== "Impossible") throw e;
        frame.evalCtx.volatile = true;
      }

      statements.push(
        ast.statement`%%lhs%% = %%rhs%%`({
          lhs: b.memberExpression(
            b.memberExpression(id("context"), id("evalCtx")),
            id(keyword.node.key),
          ),
          rhs,
        }),
      );
    });

    return statements;
  }
}

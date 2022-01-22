import { Path, PathVisitor, visit, types as t } from "@nunjucks/ast";

const VAR_LOAD_PARAMETER = "param";
const VAR_LOAD_RESOLVE = "resolve";
const VAR_LOAD_ALIAS = "alias";
const VAR_LOAD_UNDEFINED = "undefined";

type LoadType =
  | typeof VAR_LOAD_PARAMETER
  | typeof VAR_LOAD_RESOLVE
  | typeof VAR_LOAD_ALIAS
  | typeof VAR_LOAD_UNDEFINED;

type RootVisitorState = {
  forBranch?: "body" | "else" | "test";
};

export class Symbols {
  level: number;
  parent: Symbols | null;
  refs: Record<string, string>;
  loads: Record<string, [LoadType, string | null]>;
  stores: Set<string>;
  constructor(parent?: Symbols | null, level?: number) {
    if (level === undefined) {
      if (parent === null || parent === undefined) {
        this.level = 0;
      } else {
        this.level = parent.level + 1;
      }
    } else {
      this.level = level;
    }
    this.parent = parent || null;
    this.refs = {};
    this.loads = {};
    this.stores = new Set();
  }

  copy(): Symbols {
    const copy = new Symbols(this.parent, this.level);
    copy.refs = { ...this.refs };
    copy.loads = { ...this.loads };
    copy.stores = new Set(...this.stores);
    return copy;
  }

  analyzeNode(node: t.Node, state?: RootVisitorState): void {
    rootVisitor(node, this, state);
  }

  _defineRef(name: string, load?: [LoadType, string | null]): string {
    const ident = `l_${this.level}_${name}`;
    this.refs[name] = ident;
    if (load !== undefined) {
      this.loads[ident] = load;
    }
    return ident;
  }

  findLoad(target: string): unknown {
    if (target in this.loads) {
      return this.loads[target];
    }
    return this.parent?.findLoad(target) || null;
  }

  findRef(target: string): string | null {
    if (target in this.refs) {
      return this.refs[target];
    }
    return this.parent?.findRef(target) || null;
  }

  ref(name: string): string {
    const rv = this.findRef(name);
    if (rv === null) {
      throw new Error(
        `Tried to resolve a name to a reference that was unknown to the frame (${name})`
      );
    }
    return rv;
  }

  store(name: string): void {
    this.stores.add(name);
    // If we have not seen the name referenced yet, we need to figure out what
    // to set it to
    if (!(name in this.refs)) {
      // If there is a parent scope we check if the name as a reference there.
      // If it does it means we might have to alias to a variable there
      if (this.parent) {
        const outerRef = this.parent.findRef(name);
        if (outerRef !== null) {
          this._defineRef(name, [VAR_LOAD_ALIAS, outerRef]);
          return;
        }
      }
      // Otherwise we can just set it to null
      this._defineRef(name, [VAR_LOAD_UNDEFINED, null]);
    }
  }

  declareParameter(name: string): string {
    this.stores.add(name);
    return this._defineRef(name, [VAR_LOAD_PARAMETER, null]);
  }

  load(name: string): void {
    if (this.findRef(name) === null) {
      this._defineRef(name, [VAR_LOAD_RESOLVE, name]);
    }
  }

  branchUpdate(branchSymbols: Symbols[]): void {
    const stores: Map<string, number> = new Map();
    branchSymbols.forEach((branch) => {
      branch.stores.forEach((target) => {
        if (target in this.stores) {
          return;
        }
        stores.set(target, (stores.get(target) || 0) + 1);
      });
    });
    branchSymbols.forEach((sym) => {
      Object.assign(this.refs, sym.refs);
      Object.assign(this.loads, sym.loads);
      sym.stores.forEach((s) => this.stores.add(s));
    });
    for (const [name, branchCount] of stores.entries()) {
      if (branchCount === branchSymbols.length) {
        continue;
      }
      const target = this.findRef(name);
      if (target === null) throw new Error(""); // This should not happen
      const outerTarget = this.parent?.findRef(name) || null;
      if (outerTarget !== null) {
        this.loads[target] = [VAR_LOAD_ALIAS, outerTarget];
        continue;
      }
      this.loads[target] = [VAR_LOAD_ALIAS, outerTarget];
    }
  }

  dumpStores(): Record<string, string> {
    const rv: Record<string, string> = {};
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Symbols | null = this;
    while (node !== null) {
      node.stores.forEach((name) => {
        if (!(name in rv)) {
          const val = this.findRef(name);
          if (val === null) throw new Error("");
          rv[name] = val;
        }
      });
      node = node.parent;
    }
    return rv;
  }

  dumpParamTargets(): Set<string> {
    const rv: Set<string> = new Set();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Symbols | null = this;
    while (node !== null) {
      Object.entries(node.loads).forEach(([target, [instr]]) => {
        if (instr === VAR_LOAD_PARAMETER) {
          rv.add(target);
        }
      });
      node = node.parent;
    }
    return rv;
  }
}

const rootVisitor = (
  node: t.Node,
  symbols: Symbols,
  state?: RootVisitorState
) => {
  const symVisitor = new FrameSymbolVisitor(symbols);

  visit<RootVisitorState>(
    node,
    {
      visitNode(path) {
        throw new Error(`Cannot find symbols for ${path.node.type}`);
      },
      visitTemplate(path) {
        this.traverse(path);
      },
      visitBlock(path) {
        this.traverse(path);
      },
      visitMacro(path) {
        this.traverse(path);
      },
      visitFilterBlock(path) {
        this.traverse(path);
      },
      visitScope(path) {
        this.traverse(path);
      },
      visitIf(path) {
        this.traverse(path);
      },
      visitScopedEvalContextModifier(path) {
        this.traverse(path);
      },
      visitAssignBlock(path) {
        for (let i = 0; i < path.node.body.length; i++) {
          symVisitor.visit(path.get("body").get(i));
        }
        return false;
      },
      visitCallBlock(path) {
        path.eachChild((childPath) => {
          if (childPath.name === "call") return;
          if (!t.Node.check(childPath.value)) return;
          symVisitor.visit(childPath as Path<t.Node>);
        });
        return false;
      },
      visitOverlayScope(path) {
        for (let i = 0; i < path.node.body.length; i++) {
          symVisitor.visit(path.get("body").get(i));
        }
        return false;
      },
      visitFor(path, { forBranch }) {
        const branchVisitor = new FrameSymbolVisitor(symbols);
        let branch: t.Node[] = [];
        if (forBranch === "body") {
          branchVisitor.visit(path.get("target"), { storeAsParam: true });
          branch = path.node.body;
        } else if (forBranch === "else") {
          branch = path.node.else_;
        } else if (forBranch === "test") {
          branchVisitor.visit(path.get("target"), { storeAsParam: true });
          if (path.node.test) {
            symVisitor.visit(path.get("test"));
          }
        } else {
          throw new Error("Unknown for branch");
        }
        branch.forEach((child) => symVisitor.visit(child));
        return false;
      },
      visitWith({ node }) {
        node.targets.forEach((target) => symVisitor.visit(target));
        node.body.forEach((child) => symVisitor.visit(child));
        return false;
      },
    },
    state
  );
};

type frameSymbolVisitorContext = {
  forBranch?: "body" | "else" | "test";
  storeAsParam?: boolean;
};

export class FrameSymbolVisitor {
  symbols: Symbols;
  visitor: PathVisitor;
  constructor(symbols: Symbols) {
    this.symbols = symbols;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const visitor = PathVisitor.fromMethodsObject<frameSymbolVisitorContext>({
      visitName({ node }, state) {
        if (state?.storeAsParam || node.ctx === "param") {
          symbols.declareParameter(node.name);
        } else if (node.ctx === "store") {
          symbols.store(node.name);
        } else if (node.ctx === "load") {
          symbols.load(node.name);
        }
        return false;
      },
      visitNSRef(path) {
        symbols.load(path.node.name);
        return false;
      },
      visitIf(path, state) {
        const { node } = path;
        self.visit(node.test, state);
        const originalSymbols = self.symbols;

        const innerVisit = (nodes: t.Node[]): Symbols => {
          const rv = originalSymbols.copy();
          self.symbols = rv;
          nodes.forEach((subnode) => {
            self.visit(subnode, state);
          });
          self.symbols = originalSymbols;
          return rv;
        };
        const bodySymbols = innerVisit(node.body);
        const elifSymbols = innerVisit(node.elif);
        const elseSymbols = innerVisit(node.else_ || []);
        self.symbols.branchUpdate([bodySymbols, elifSymbols, elseSymbols]);

        return false;
      },
      visitMacro(path) {
        self.symbols.store(path.node.name);
        return false;
      },
      visitImport(path) {
        this.traverse(path);
        self.symbols.store(path.node.target);
      },
      visitFromImport(path) {
        this.traverse(path);
        path.node.names.forEach((name) => {
          if (Array.isArray(name)) {
            self.symbols.store(name[1]);
          } else {
            self.symbols.store(name);
          }
        });
      },
      visitAssign(path, state) {
        // Visit assignments in the correct order.
        self.visit(path.node.node, state);
        self.visit(path.node.target, state);
        return false;
      },
      visitFor(path, state) {
        // Visiting stops at for blocks.  However the block sequence
        // is visited as part of the outer scope.
        self.visit(path.node.iter, state);
        return false;
      },
      visitCallBlock(path) {
        this.traverse(path.get("call"));
      },
      visitFilterBlock(path) {
        this.traverse(path.get("filter"));
      },
      visitWith({ node }) {
        node.values.forEach((target) => {
          self.visit(target);
        });
        return false;
      },
      visitAssignBlock(path) {
        this.traverse(path.get("target"));
      },
      visitScope() {
        // Stop visiting at scopes.
        return false;
      },
      visitBlock() {
        // Stop visiting at blocks.
        return false;
      },
      visitOverlayScope() {
        // Do not visit into overlay scopes.
        return false;
      },
    });
    this.visitor = visitor;
  }
  visit(path: Path | t.Node, state: frameSymbolVisitorContext = {}): void {
    this.visitor.visit(path, state);
  }
}

export const findSymbols = (
  nodes: t.Node[],
  parentSymbols?: Symbols
): Symbols => {
  const sym = new Symbols(parentSymbols);
  const visitor = new FrameSymbolVisitor(sym);
  nodes.forEach((node) => visitor.visit(node));
  return sym;
};

export const symbolsForNode = (
  node: t.Node,
  parentSymbols?: Symbols
): Symbols => {
  const sym = new Symbols(parentSymbols);
  sym.analyzeNode(node);
  return sym;
};

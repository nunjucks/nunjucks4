import { types as t } from "@nunjucks/ast";
import { EvalContext } from "@nunjucks/runtime";

export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | SafeString
  | Serializable[]
  | { [key: string]: Serializable };

class Impossible extends Error {
  name = "Impossible";
  constructor(message = "Cannot convert to const") {
    super(message);
  }
}

const binopToFunc: Record<string, (a: any, b: any) => Serializable> = {
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  "//": (a, b) => Math.floor(a / b),
  "**": (a, b) => Math.pow(a, b),
  "%": (a, b) => a % b,
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  and: (a, b) => a && b,
  or: (a, b) => a || b,
};

const uaopToFunc: Record<string, (a: any) => any> = {
  not: (a) => !a,
  "+": (a) => +a,
  "-": (a) => -a,
};

const cmpopToFunc: Record<string, (a: any, b: any) => boolean> = {
  eq: (a, b) => a == b,
  ne: (a, b) => a != b,
  gt: (a, b) => a > b,
  gteq: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lteq: (a, b) => a <= b,
  in: (a, b) => {
    // TODO
    return a.includes(b);
  },
  notin: (a, b) => {
    // TODO
    return !a.includes(b);
  },
};

class SafeString extends String {
  val: string;
  _escape: boolean;
  constructor(val: unknown) {
    const strVal = `${val}`;
    super(strVal);
    this.val = strVal;
    this._escape = true;
  }
  valueOf() {
    return this.val;
  }
  toString() {
    return this.val;
  }
}

function toConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Pair | t.Keyword
): [Serializable, Serializable];
function toConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Slice
): { start: number | null; stop: number | null; step: number | null };
function toConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Keyword
): [string, Serializable];
function toConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Concat
): string;
function toConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Node
): Serializable;

function toConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Node
): Serializable {
  const { environment } = evalCtx;
  try {
    if (t.BinExpr.check(node)) {
      const f = binopToFunc[node.operator];
      return f(toConst(evalCtx, node.left), toConst(evalCtx, node.right));
    } else if (t.UnaryExpr.check(node)) {
      const f = uaopToFunc[node.operator];
      return f(toConst(evalCtx, node.node));
    } else if (t.Const.check(node)) {
      return node.value;
    } else if (t.TemplateData.check(node)) {
      if (evalCtx.volatile) {
        throw new Impossible();
      }
      return evalCtx.autoescape ? new SafeString(node.data) : node.data;
    } else if (t.Tuple.check(node) || t.List.check(node)) {
      return node.items.map((x) => toConst(evalCtx, x));
    } else if (t.Dict.check(node)) {
      return Object.fromEntries(
        node.items.map((pair) => toConst(evalCtx, pair))
      );
    } else if (t.Pair.check(node)) {
      return [toConst(evalCtx, node.key), toConst(evalCtx, node.value)];
    } else if (t.Keyword.check(node)) {
      return [node.key, toConst(evalCtx, node.value)];
    } else if (t.CondExpr.check(node)) {
      if (toConst(evalCtx, node.test)) {
        return toConst(evalCtx, node.expr1);
      }
      if (!node.expr2) {
        throw new Impossible();
      }
      return toConst(evalCtx, node.expr2);
    } else if (t.Filter.check(node)) {
      if (evalCtx.volatile) throw new Impossible();
      if (!(node.name in environment.filters)) {
        throw new Impossible();
      }
      const func = environment.filters[node.name];
      const [args, kwargs] = argsAsConst(evalCtx, node);
      args.unshift(toConst(evalCtx, node.node!)); // TODO: check type here
      return func(...args, {
        ...kwargs,
        __evalCtx: evalCtx,
        __environment: environment,
      });
    } else if (t.Test.check(node)) {
      if (evalCtx.volatile) throw new Impossible();
      if (!(node.name in environment.tests)) {
        throw new Impossible();
      }
      const func = environment.filters[node.name];
      const [args, kwargs] = argsAsConst(evalCtx, node);
      args.unshift(toConst(evalCtx, node.node!)); // TODO: check type here
      return func(...args, {
        ...kwargs,
        __evalCtx: evalCtx,
        __environment: environment,
      });
    } else if (t.Getitem.check(node)) {
      if (node.ctx !== "load") throw new Impossible();
      return environment.getitem(
        toConst(evalCtx, node.node),
        toConst(evalCtx, node.arg)
      );
    } else if (t.Getattr.check(node)) {
      return environment.getattr(toConst(evalCtx, node.node), node.attr);
    } else if (t.Slice.check(node)) {
      const [start, stop, step] = [node.start, node.stop, node.step]
        .map((n) => (n ? toConst(evalCtx, n) : null))
        .map((n) => {
          if (n !== null && typeof n !== "number") throw new Impossible();
          return n;
        });

      return { start, stop, step };
    } else if (t.Concat.check(node)) {
      return node.nodes.map((expr) => `${toConst(evalCtx, expr)}`).join("");
    } else if (t.Compare.check(node)) {
      let value = toConst(evalCtx, node.expr);
      let result = value;
      for (const op of node.ops) {
        const newValue = toConst(evalCtx, op.expr);
        result = cmpopToFunc[op.op](value, newValue);
        if (!result) return false;
        value = newValue;
      }
      return !!result;
    }
  } catch (e) {
    throw new Impossible();
  }
  throw new Impossible();
}

function isTwoTuple(val: Serializable): val is [Serializable, Serializable] {
  return Array.isArray(val) && val.length === 2;
}

function argsAsConst<IsAsync extends boolean>(
  evalCtx: EvalContext<IsAsync>,
  node: t.Filter | t.Test | t.Call
): [Serializable[], Record<string, Serializable>] {
  const args = node.args.map((x) => toConst(evalCtx, x));
  const kwargs = Object.fromEntries(
    node.kwargs.map((x) => {
      const [k, v] = toConst(evalCtx, x);
      return [`${k}`, v];
    })
  );
  kwargs.__isKwargs = true;
  if (node.dynArgs) {
    const dynArgs = toConst(evalCtx, node.dynArgs);
    if (!Array.isArray(dynArgs)) {
      throw new Impossible();
    }
    dynArgs.forEach((dynArg) => {
      if (!isTwoTuple(dynArg)) throw new Impossible();
      const [key, value] = dynArg;
      kwargs[`${key}`] = value;
    });
  }
  return [args, kwargs];
}

export default toConst;

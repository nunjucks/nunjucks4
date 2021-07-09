import { Type, builtInTypes as builtin } from "./types";

const isNumber = builtin.number;

// An example of constructing a new type with arbitrary constraints from
// an existing type.
export function geq(than: any) {
  return Type.from(
    (value: number) => isNumber.check(value) && value >= than,
    isNumber + " >= " + than
  );
}

// Default value-returning functions that may optionally be passed as a
// third argument to Def.prototype.field.
export const defaults = {
  // Functions were used because (among other reasons) that's the most
  // elegant way to allow for the emptyArray one always to give a new
  // array instance.
  null: (): null => null,
  emptyArray: (): never[] => [],
  false: (): false => false,
  true: (): true => true,
  "use strict": (): string => "use strict",
  undefined: (): void => void 0,
};

export type Primitive = string | number | boolean | null | undefined;

const naiveIsPrimitive = Type.or(
  builtin.string,
  builtin.number,
  builtin.boolean,
  builtin.null,
  builtin.undefined
);

export const isPrimitive = Type.from((value: unknown): value is Primitive => {
  if (value === null) return true;
  const type = typeof value;
  if (type === "object" || type === "function") {
    return false;
  }
  return true;
}, naiveIsPrimitive.toString());

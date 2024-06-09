import { Symbols } from "./idtracking";
import { EvalContext } from "@nunjucks/runtime";

export class Frame<IsAsync extends boolean> {
  async: IsAsync;
  evalCtx: EvalContext<IsAsync>;
  parent: Frame<IsAsync> | null;
  symbols: Symbols;
  requireOutputCheck: boolean;
  /**
   * inside some tags we are using a buffer rather than yield statements.
   * this for example affects {% filter %} or {% macro %}.  If a frame
   * is buffered this variable points to the name of the list used as
   * buffer.
   */
  buffer: string | null;
  /** The name of the block we're in, otherwise null */
  block: string | null;
  /** true for the root frame and soft frames such as if conditions */
  toplevel: boolean;
  /** true if this is the outermost frame */
  rootlevel: boolean;
  /** true if this frame is for a loop */
  loopFrame: boolean;
  /** true if this frame is for a block */
  blockFrame: boolean;
  /**
   * whether the frame is being used in an if-statement or conditional
   * expression as it determines which errors should be raised during runtime
   * or compile time */
  softFrame: boolean;

  constructor(
    evalCtx: EvalContext<IsAsync>,
    {
      parent = null,
      level,
    }: { parent?: Frame<IsAsync> | null; level?: number } = {},
  ) {
    this.evalCtx = evalCtx;
    this.parent = parent ?? null;
    this.symbols = new Symbols(parent?.symbols, level);
    this.requireOutputCheck = parent?.requireOutputCheck ?? false;
    this.buffer = parent?.buffer ?? null;
    this.block = parent?.block ?? null;
    this.toplevel = false;
    this.rootlevel = false;

    // variables set inside of loops and blocks should not affect outer frames,
    // but they still needs to be kept track of as part of the active context.
    this.loopFrame = false;
    this.blockFrame = false;
    this.softFrame = false;
  }

  copy(): Frame<IsAsync> {
    const frame = new Frame(this.evalCtx, { parent: this.parent });
    frame.symbols = this.symbols.copy();
    frame.requireOutputCheck = this.requireOutputCheck;
    frame.buffer = this.buffer;
    frame.block = this.block;
    frame.toplevel = this.toplevel;
    frame.rootlevel = this.rootlevel;
    frame.loopFrame = this.loopFrame;
    frame.blockFrame = this.blockFrame;
    frame.softFrame = this.softFrame;
    return frame;
  }
  inner({ isolated = false }: { isolated?: boolean } = {}): Frame<IsAsync> {
    if (isolated) {
      return new Frame(this.evalCtx, { level: this.symbols.level + 1 });
    } else {
      return new Frame(this.evalCtx, { parent: this });
    }
  }
  /**
   * Return a soft frame.  A soft frame may not be modified as
   * standalone thing as it shares the resources with the frame it
   * was created of, but it's not a rootlevel frame any longer.
   *
   * This is only used to implement if-statements and conditional
   * expressions.
   */
  soft(): Frame<IsAsync> {
    const frame = this.copy();
    frame.rootlevel = false;
    frame.softFrame = true;
    return frame;
  }
}

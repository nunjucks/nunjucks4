import { EventEmitter } from "events";

export class Environment extends EventEmitter {
  autoescape: boolean | ((templateName?: string | null) => boolean);
  missing: Record<never, never>;
  isAsync: boolean;
  constructor() {
    super();
    this.isAsync = false;
    this.missing = Object.freeze(Object.create(null));
  }
}

import { namedTypes } from "./namedTypes";

export interface IdentifierBuilder {
  (name: string): namedTypes.Identifier;
  from(
    params: {
      name: string,
      optional?: boolean,
    }
  ): namedTypes.Identifier;
}

export interface builders {
  identifier: IdentifierBuilder;
  [builderName: string]: any;
}

import fs from "fs";
import path from "path";
import * as prettier from "prettier";
import "../src/def";
import { Type, builders, njkTypes as t, getBuilderName } from "../src/types";
import { builders as b } from "ast-types";
import { Linter } from "eslint";

function prettyPrint(ast: any) {
  const src = prettier.format(".", { parser: () => ast });
  const linter = new Linter();
  const { output } = linter.verifyAndFix(src);
  const comment = "// !!! THIS FILE WAS AUTO-GENERATED BY `npm run gen` !!!";
  return `${comment}\n${output}`;
}

const Op = Object.prototype;
const hasOwn = Op.hasOwnProperty;

const RESERVED_WORDS: { [reservedWord: string]: boolean | undefined } = {
  extends: true,
  default: true,
  arguments: true,
  static: true,
};

function stringLiteral(value) {
  const node = b.stringLiteral(value);
  node.extra = { raw: JSON.stringify(value) };
  return node;
}

function booleanLiteral(value) {
  const node = b.booleanLiteral(value);
  node.extra = { raw: JSON.stringify(value) };
  return node;
}

const TYPES_ID = b.identifier("t");
const TYPES_IMPORT = b.importDeclaration(
  [b.importNamespaceSpecifier(TYPES_ID)],
  stringLiteral("./types"),
  "type"
);

const supertypeToSubtypes = getSupertypeToSubtypes();
const builderTypeNames = getBuilderTypeNames();

const out = [
  {
    file: "types.ts",
    ast: moduleWithBody([
      b.importDeclaration(
        [b.importSpecifier(b.identifier("Type"))],
        stringLiteral("../types")
      ),
      b.exportNamedDeclaration(
        b.tsModuleDeclaration(
          b.identifier("types"),
          b.tsModuleBlock([
            ...Object.keys(supertypeToSubtypes)
              .map((supertype) => {
                const typeDef = Type.def(supertype);
                if (!typeDef.isAbstract) {
                  return;
                }
                const buildableSubtypes = getBuildableSubtypes(supertype);
                if (buildableSubtypes.length === 0) {
                  // Some of the XML* types don't have buildable subtypes,
                  // so fall back to using the supertype's node type
                  return b.exportNamedDeclaration(
                    b.tsTypeAliasDeclaration(
                      b.identifier(supertype),
                      b.tsTypeReference(b.identifier(supertype))
                    )
                  );
                }

                return b.exportNamedDeclaration(
                  b.tsTypeAliasDeclaration(
                    b.identifier(supertype),
                    b.tsUnionType(
                      buildableSubtypes.map((subtype) =>
                        b.tsTypeReference(b.identifier(subtype))
                      )
                    )
                  )
                );
              })
              .filter(Boolean),
            ...Object.keys(t)
              .map((typeName) => {
                const typeDef = Type.def(typeName);
                const ownFieldNames = Object.keys(typeDef.ownFields);

                if (typeDef.isAbstract) {
                  return;
                }

                return b.exportNamedDeclaration(
                  b.tsInterfaceDeclaration.from({
                    id: b.identifier(typeName),
                    extends: typeDef.baseNames.map((baseName) =>
                      b.tsExpressionWithTypeArguments(b.identifier(baseName))
                    ),
                    body: b.tsInterfaceBody(
                      ownFieldNames.map((fieldName) => {
                        const field = typeDef.allFields[fieldName];

                        if (field.name === "type" && field.defaultFn) {
                          return b.tsPropertySignature(
                            b.identifier("type"),
                            b.tsTypeAnnotation(
                              b.tsLiteralType(stringLiteral(field.defaultFn()))
                            )
                          );
                        } else if (field.defaultFn) {
                          return b.tsPropertySignature(
                            b.identifier(field.name),
                            b.tsTypeAnnotation(
                              getTSTypeAnnotation(field.type, false)
                            ),
                            true // optional
                          );
                        }

                        return b.tsPropertySignature(
                          b.identifier(field.name),
                          b.tsTypeAnnotation(
                            getTSTypeAnnotation(field.type, false)
                          )
                        );
                      })
                    ),
                  })
                );
              })
              .filter(Boolean),

            b.exportNamedDeclaration(
              b.tsTypeAliasDeclaration(
                b.identifier("ASTNode"),
                b.tsUnionType(
                  Object.keys(t)
                    .filter((typeName) => Type.def(typeName).buildable)
                    .map((typeName) =>
                      b.tsTypeReference(b.identifier(typeName))
                    )
                )
              )
            ),

            ...Object.keys(t).map((typeName) =>
              b.exportNamedDeclaration(
                b.variableDeclaration("let", [
                  b.variableDeclarator(
                    b.identifier.from({
                      name: typeName,
                      typeAnnotation: b.tsTypeAnnotation(
                        b.tsTypeReference(
                          b.identifier("Type"),
                          b.tsTypeParameterInstantiation([
                            b.tsTypeReference(b.identifier(typeName)),
                          ])
                        )
                      ),
                    })
                  ),
                ])
              )
            ),
          ])
        )
      ),
      b.exportNamedDeclaration(
        b.tsInterfaceDeclaration(
          b.identifier("NunjucksTypes"),
          b.tsInterfaceBody([
            ...Object.keys(t).map((typeName) =>
              b.tsPropertySignature(
                b.identifier(typeName),
                b.tsTypeAnnotation(
                  b.tsTypeReference(
                    b.identifier("Type"),
                    b.tsTypeParameterInstantiation([
                      b.tsTypeReference(
                        b.tsQualifiedName(TYPES_ID, b.identifier(typeName))
                      ),
                    ])
                  )
                )
              )
            ),
          ])
        )
      ),
    ]),
  },
  {
    file: "builders.ts",
    ast: moduleWithBody([
      TYPES_IMPORT,
      ...builderTypeNames.map((typeName) => {
        const typeDef = Type.def(typeName);

        const returnType = b.tsTypeAnnotation(
          getTSTypeAnnotation(typeDef.type)
        );

        const buildParamAllowsUndefined: { [buildParam: string]: boolean } = {};
        const buildParamIsOptional: { [buildParam: string]: boolean } = {};
        [...typeDef.buildParams].reverse().forEach((cur, i, arr) => {
          const field = typeDef.allFields[cur];
          if (field && field.defaultFn) {
            if (i === 0) {
              buildParamIsOptional[cur] = true;
            } else {
              if (buildParamIsOptional[arr[i - 1]]) {
                buildParamIsOptional[cur] = true;
              } else {
                buildParamAllowsUndefined[cur] = true;
              }
            }
          }
        });

        return b.exportNamedDeclaration(
          b.tsInterfaceDeclaration(
            b.identifier(`${typeName}Builder`),
            b.tsInterfaceBody([
              b.tsCallSignatureDeclaration(
                typeDef.buildParams
                  .filter((buildParam) => !!typeDef.allFields[buildParam])
                  .map((buildParam) => {
                    const field = typeDef.allFields[buildParam];
                    const name = RESERVED_WORDS[buildParam]
                      ? `${buildParam}Param`
                      : buildParam;

                    return b.identifier.from({
                      name,
                      typeAnnotation: b.tsTypeAnnotation(
                        buildParamAllowsUndefined[buildParam]
                          ? b.tsUnionType([
                              getTSTypeAnnotation(field.type),
                              b.tsUndefinedKeyword(),
                            ])
                          : getTSTypeAnnotation(field.type)
                      ),
                      optional: !!buildParamIsOptional[buildParam],
                    });
                  }),
                returnType
              ),
              b.tsMethodSignature(
                b.identifier("from"),
                [
                  b.identifier.from({
                    name: "params",
                    typeAnnotation: b.tsTypeAnnotation(
                      b.tsTypeLiteral(
                        Object.keys(typeDef.allFields)
                          .filter((fieldName) => fieldName !== "type")
                          .sort() // Sort field name strings lexicographically.
                          .map((fieldName) => {
                            const field = typeDef.allFields[fieldName];
                            return b.tsPropertySignature(
                              b.identifier(field.name),
                              b.tsTypeAnnotation(
                                getTSTypeAnnotation(field.type)
                              ),
                              field.defaultFn != null || field.hidden
                            );
                          })
                      )
                    ),
                  }),
                ],
                returnType
              ),
            ])
          )
        );
      }),

      b.exportNamedDeclaration(
        b.tsInterfaceDeclaration(
          b.identifier("builders"),
          b.tsInterfaceBody([
            ...builderTypeNames.map((typeName) =>
              b.tsPropertySignature(
                b.identifier(getBuilderName(typeName)),
                b.tsTypeAnnotation(
                  b.tsTypeReference(b.identifier(`${typeName}Builder`))
                )
              )
            ),
            b.tsIndexSignature(
              [
                b.identifier.from({
                  name: "builderName",
                  typeAnnotation: b.tsTypeAnnotation(b.tsStringKeyword()),
                }),
              ],
              b.tsTypeAnnotation(b.tsAnyKeyword())
            ),
          ])
        )
      ),
    ]),
  },
  {
    file: "visitor.ts",
    ast: moduleWithBody([
      b.importDeclaration(
        [b.importSpecifier(b.identifier("Path"))],
        stringLiteral("../path")
      ),
      b.importDeclaration(
        [b.importSpecifier(b.identifier("Context"))],
        stringLiteral("../path-visitor")
      ),
      TYPES_IMPORT,
      b.exportNamedDeclaration(
        b.tsInterfaceDeclaration.from({
          id: b.identifier("Visitor"),
          typeParameters: b.tsTypeParameterDeclaration([
            b.tsTypeParameter(
              "M",
              void 0,
              b.tsTypeReference(
                b.identifier("Record"),
                b.tsTypeParameterInstantiation([
                  b.tsStringKeyword(),
                  b.tsAnyKeyword(),
                ])
              )
            ),
          ]),
          body: b.tsInterfaceBody([
            b.tsMethodSignature.from({
              key: b.identifier("reset"),
              parameters: [
                b.identifier.from({
                  name: "this",
                  typeAnnotation: b.tsTypeAnnotation(
                    b.tsTypeReference(
                      b.identifier("Context"),
                      b.tsTypeParameterInstantiation([
                        b.tsTypeReference(b.identifier("M")),
                      ])
                    )
                  ),
                }),
                b.identifier.from({
                  name: "path",
                  typeAnnotation: b.tsTypeAnnotation(
                    b.tsTypeReference(b.identifier("Path"))
                  ),
                }),
                b.identifier.from({
                  name: "state",
                  typeAnnotation: b.tsTypeAnnotation(
                    b.tsTypeReference(b.identifier("M"))
                  ),
                }),
              ],
              typeAnnotation: b.tsTypeAnnotation(b.tsAnyKeyword()),
              optional: true,
            }),
            ...Object.keys(t).map((typeName) => {
              return b.tsMethodSignature.from({
                key: b.identifier(`visit${typeName}`),
                parameters: [
                  b.identifier.from({
                    name: "this",
                    typeAnnotation: b.tsTypeAnnotation(
                      b.tsTypeReference(
                        b.identifier("Context"),
                        b.tsTypeParameterInstantiation([
                          b.tsTypeReference(b.identifier("M")),
                        ])
                      )
                    ),
                  }),
                  b.identifier.from({
                    name: "path",
                    typeAnnotation: b.tsTypeAnnotation(
                      b.tsTypeReference(
                        b.identifier("Path"),
                        b.tsTypeParameterInstantiation([
                          b.tsTypeReference(
                            b.tsQualifiedName(TYPES_ID, b.identifier(typeName))
                          ),
                        ])
                      )
                    ),
                  }),
                  b.identifier.from({
                    name: "state",
                    typeAnnotation: b.tsTypeAnnotation(
                      b.tsTypeReference(b.identifier("M"))
                    ),
                  }),
                ],
                optional: true,
                typeAnnotation: b.tsTypeAnnotation(b.tsAnyKeyword()),
              });
            }),
          ]),
        })
      ),
    ]),
  },
];

out.forEach(({ file, ast }) => {
  fs.writeFileSync(
    path.resolve(__dirname, `../src/gen/${file}`),
    prettyPrint(ast)
  );
});

function moduleWithBody(body: any[]) {
  return b.file.from({
    // comments: [b.commentBlock(" !!! THIS FILE WAS AUTO-GENERATED BY `npm run gen` !!! ")],
    program: b.program(body),
  });
}

function getSupertypeToSubtypes() {
  const supertypeToSubtypes: { [supertypeName: string]: string[] } = {};
  Object.keys(t).map((typeName) => {
    Type.def(typeName).aliasNames.forEach((supertypeName) => {
      supertypeToSubtypes[supertypeName] =
        supertypeToSubtypes[supertypeName] || [];
      supertypeToSubtypes[supertypeName].push(typeName);
    });
  });

  return supertypeToSubtypes;
}

function getBuilderTypeNames() {
  return Object.keys(t).filter((typeName) => {
    const typeDef = Type.def(typeName);
    const builderName = getBuilderName(typeName);

    return !!typeDef.buildParams && !!(builders as any)[builderName];
  });
}

function getBuildableSubtypes(supertype: string): string[] {
  return Array.from(
    new Set(
      Object.keys(t).filter((typeName) => {
        const typeDef = Type.def(typeName);
        return typeDef.allSupertypes[supertype] != null && typeDef.buildable;
      })
    )
  );
}

function getTSTypeAnnotation(
  type: import("../types").Type<any>,
  qname = true
): any {
  switch (type.kind) {
    case "ArrayType": {
      const elemTypeAnnotation = getTSTypeAnnotation(type.elemType, qname);
      // TODO Improve this test.
      return b.tsArrayType(elemTypeAnnotation);
    }

    case "IdentityType": {
      if (type.value === null) {
        return b.tsNullKeyword();
      }
      switch (typeof type.value) {
        case "undefined":
          return b.tsUndefinedKeyword();
        case "string":
          return b.tsLiteralType(stringLiteral(type.value));
        case "boolean":
          return b.tsLiteralType(booleanLiteral(type.value));
        case "number":
          return b.tsNumberKeyword();
        case "object":
          return b.tsObjectKeyword();
        case "function":
          return b.tsFunctionType([]);
        case "symbol":
          return b.tsSymbolKeyword();
        default:
          return b.tsAnyKeyword();
      }
    }

    case "ObjectType": {
      return b.tsTypeLiteral(
        type.fields.map((field) =>
          b.tsPropertySignature(
            b.identifier(field.name),
            b.tsTypeAnnotation(getTSTypeAnnotation(field.type, qname))
          )
        )
      );
    }

    case "OrType": {
      return b.tsUnionType(
        type.types.map((type) => getTSTypeAnnotation(type, qname))
      );
    }

    case "PredicateType": {
      if (typeof type.name !== "string") {
        return b.tsAnyKeyword();
      }

      if (hasOwn.call(t, type.name)) {
        if (qname) {
          return b.tsTypeReference(
            b.tsQualifiedName(TYPES_ID, b.identifier(type.name))
          );
        } else {
          return b.tsTypeReference(b.identifier(type.name));
        }
      }

      if (/^[$A-Z_][a-z0-9_$]*$/i.test(type.name)) {
        return b.tsTypeReference(b.identifier(type.name));
      }

      if (/^number [<>=]+ \d+$/.test(type.name)) {
        return b.tsNumberKeyword();
      }

      // Not much else to do...
      return b.tsAnyKeyword();
    }

    default:
      return assertNever(type);
  }
}

function assertNever(x: never): never {
  throw new Error("Unexpected: " + x);
}

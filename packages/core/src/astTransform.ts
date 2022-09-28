import * as path from "path";
import * as ts from "typescript";
import * as fs from "fs";

// const path = require("path");
// const ts = require("typescript");
// const fs = require("fs");

// Run source file through our transformer
const main = (filePath: string) => {
  console.log("filePath=", filePath);

  const program = ts.createProgram([filePath], {});
  // const checker = program.getTypeChecker();
  const source = program.getSourceFile(filePath);
  const printer = ts.createPrinter();

  const typeAliasToInterfaceTransformer: ts.TransformerFactory<
    ts.SourceFile
  > = (context) => {
    const visit: ts.Visitor = (node) => {
      console.log("node=", node);
      node = ts.visitEachChild(node, visit, context);
      // /*
      //   Convert type references to type literals
      //     interface IUser {
      //       username: string
      //     }
      //     type User = IUser <--- IUser is a type reference
      //     interface Context {
      //       user: User <--- User is a type reference
      //     }
      //   In both cases we want to convert the type reference to
      //   it's primitive literals. We want:
      //     interface IUser {
      //       username: string
      //     }
      //     type User = {
      //       username: string
      //     }
      //     interface Context {
      //       user: {
      //         username: string
      //       }
      //     }
      // */
      // if (ts.isTypeReferenceNode(node)) {
      //   const symbol = checker.getSymbolAtLocation(node.typeName);
      //   const type = checker.getDeclaredTypeOfSymbol(symbol);
      //   const declarations = _.flatMap(
      //     checker.getPropertiesOfType(type),
      //     (property) => {
      //       /*
      //       Type references declarations may themselves have type references, so we need
      //       to resolve those literals as well
      //     */
      //       return _.map(property.declarations, visit);
      //     }
      //   );
      //   return ts.createTypeLiteralNode(declarations.filter(ts.isTypeElement));
      // }

      // /*
      //   Convert type alias to interface declaration
      //     interface IUser {
      //       username: string
      //     }
      //     type User = IUser

      //   We want to remove all type aliases
      //     interface IUser {
      //       username: string
      //     }
      //     interface User {
      //       username: string  <-- Also need to resolve IUser
      //     }

      // */

      // if (ts.isTypeAliasDeclaration(node)) {
      //   const symbol = checker.getSymbolAtLocation(node.name);
      //   const type = checker.getDeclaredTypeOfSymbol(symbol);
      //   const declarations = _.flatMap(
      //     checker.getPropertiesOfType(type),
      //     (property) => {
      //       // Resolve type alias to it's literals
      //       return _.map(property.declarations, visit);
      //     }
      //   );

      //   // Create interface with fully resolved types
      //   return ts.createInterfaceDeclaration(
      //     [],
      //     [ts.createToken(ts.SyntaxKind.ExportKeyword)],
      //     node.name.getText(),
      //     [],
      //     [],
      //     declarations.filter(ts.isTypeElement)
      //   );
      // }
      // // Remove all export declarations
      // if (ts.isImportDeclaration(node)) {
      //   return null;
      // }

      return node;
    };

    return (node) => ts.visitNode(node, visit);
  };
  if (!source) {
    throw new Error("source is not");
  }
  const result = ts.transform(source, [typeAliasToInterfaceTransformer]);

  // Create our output folder
  const outputDir = path.resolve(__dirname, "../generated");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Write pretty printed transformed typescript to output directory
  fs.writeFileSync(
    path.resolve(__dirname, "../generated/models.ts"),
    printer.printFile(result.transformed[0])
  );
};

export default main;


// import { visit } from "@nunjucks/ast";
// import { parse } from "@nunjucks/parser";
export { CodeGenerator } from "./visitor";
export { Frame } from "./frame";

// export function compile(src: string) {
//   const ast = parse(src);
//   visit(ast, {
//     visitTemplate(path) {
//       this.traverse(path);
//     },
//   });
// }
//

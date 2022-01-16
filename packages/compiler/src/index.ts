import { visit } from "@nunjucks/ast";
import { parse } from "@nunjucks/parser";

export function compile(src: string) {
  const ast = parse(src);
  visit(ast, {
    visitTemplate(path) {
      console.log(path);
      this.traverse(path);
    },
  });
}

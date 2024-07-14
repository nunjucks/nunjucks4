export class KeyError extends Error {}

export class OverflowError extends Error {
  name = "OverflowError";
}

export class UnsupportedChar extends Error {
  name = "UnsupportedChar";
}

export class ValueError extends Error {
  name = "ValueError";
}

export class TemplateRuntimeError extends Error {
  name = "TemplateRuntimeError";
}

export class FilterArgumentError extends TemplateRuntimeError {
  name = "FilterArgumentError";
}

export class UndefinedError extends Error {
  name = "UndefinedError";
}

// Code adapted from brython. See
// https://github.com/brython-dev/brython/blob/f43b8e7f80e420fa53f84294bec4cbc90e0ceed3/www/src/py_string.js
/*
Copyright (c) 2012, Pierre Quentel pierre.quentel@gmail.com
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
Neither the name of the <ORGANIZATION> nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
import { OverflowError, UnsupportedChar, ValueError } from "./exceptions";
import { str } from "./markup";
import { getObjectTypeName, isPlainObject, toAscii } from "./utils";

// TODO repr function?
const repr = str;

interface FormatFlags {
  left?: boolean;
  conversion_type: string;
  padding?: string;
  space: boolean;
  sign: boolean;
  end: number;
  length_modifier: string;
  pad_char: string;
  precision?: number;
  mapping_key?: string | undefined;
  decimal_point?: boolean;
  alternate?: boolean;
  string?: string;
  conversion_flag?: string;
}
function number_check(
  s: unknown,
  flags: FormatFlags,
): asserts s is number | boolean {
  if (
    !(typeof s === "number" || typeof s === "boolean" || s instanceof Number)
  ) {
    const type = flags.conversion_type;
    throw new Error( // TypeError
      `%${type} format: a real number ` +
        `is required, not ${getObjectTypeName(s)}`,
    );
  }
}

function get_char_array(size: number, char: string): string {
  if (size <= 0) {
    return "";
  }
  return new Array(size + 1).join(char);
}

function format_padding(
  s: string,
  flags: FormatFlags,
  minus_one: boolean = false,
) {
  if (!flags.padding) {
    // undefined
    return s;
  }
  let padding = parseInt(flags.padding, 10);
  if (minus_one) {
    // numeric formatting where sign goes in front of padding
    padding -= 1;
  }
  if (!flags.left) {
    return get_char_array(padding - s.length, flags.pad_char) + s;
  } else {
    // left adjusted
    return s + get_char_array(padding - s.length, flags.pad_char);
  }
}

const max_precision = 2 ** 31 - 4,
  max_repeat = 2 ** 30 - 1;

function format_int_precision(val: unknown, flags: FormatFlags) {
  if (!flags.precision) {
    return str(val);
  }
  const precision = parseInt(`${flags.precision}`, 10);
  if (precision > max_precision) {
    throw new OverflowError("precision too large");
  }
  const s = str(val);
  if (precision - s.length > max_repeat) {
    throw new OverflowError("precision too large");
  }
  if (s.startsWith("-")) {
    return "-" + "0".repeat(Math.max(0, precision - s.length + 1)) + s.slice(1);
  }
  return "0".repeat(Math.max(0, precision - s.length)) + s;
}

function format_float_precision(
  val: number,
  upper: boolean,
  flags: FormatFlags,
  modifier: (
    val: number,
    precision: number | undefined,
    flags: FormatFlags,
    upper?: boolean,
  ) => string,
): string {
  const precision = flags.precision;
  if (isFinite(val)) {
    return modifier(val, precision, flags, upper);
  }
  let strval;
  if (val === Infinity) {
    strval = "inf";
  } else if (val === -Infinity) {
    strval = "-inf";
  } else {
    strval = "nan";
  }
  if (upper) {
    return strval.toUpperCase();
  }
  return strval;
}

function format_sign(val: unknown, flags: FormatFlags) {
  number_check(val, flags);
  if (flags.sign) {
    if (+val >= 0 || isNaN(+val) || val === Number.POSITIVE_INFINITY) {
      return "+";
    }
  } else if (flags.space) {
    if (+val >= 0 || isNaN(+val)) {
      return " ";
    }
  }
  return "";
}

function str_format(val: unknown, flags: FormatFlags) {
  // string format supports left and right padding
  flags.pad_char = " "; // even if 0 padding is defined, don't use it
  return format_padding(str(val), flags);
}

function num_format(v: unknown, flags: FormatFlags) {
  number_check(v, flags);
  const val = typeof v === "boolean" ? (v ? 1 : 0) : v;

  let s = format_int_precision(val, flags);
  if (flags.pad_char === "0") {
    if (val < 0) {
      s = s.substring(1);
      return "-" + format_padding(s, flags, true);
    }
    const sign = format_sign(val, flags);
    if (sign !== "") {
      return sign + format_padding(s, flags, true);
    }
  }

  return format_padding(format_sign(val, flags) + s, flags);
}

function repr_format(val: unknown, flags: FormatFlags) {
  flags.pad_char = " "; // even if 0 padding is defined, don't use it
  return format_padding(repr(val), flags);
}

function ascii_format(val: unknown, flags: FormatFlags) {
  flags.pad_char = " "; // even if 0 padding is defined, don't use it
  const ascii = toAscii(str(val));

  return format_padding(ascii, flags);
}

// converts val to float and sets precision if missing
function _float_helper(val: unknown, flags: FormatFlags) {
  number_check(val, flags);
  if (flags.precision === undefined) {
    if (!flags.decimal_point) {
      flags.precision = 6;
    } else {
      flags.precision = 0;
    }
  } else {
    if (typeof flags.precision === "string")
      flags.precision = parseInt(flags.precision, 10);
    if (flags.precision > 20) flags.precision = 20;
  }
  return +val;
}

function handle_special_values(value: number, upper?: boolean) {
  let special;
  if (isNaN(value)) {
    special = upper ? "NAN" : "nan";
  } else if (value == Number.POSITIVE_INFINITY) {
    special = upper ? "INF" : "inf";
  } else if (value == Number.NEGATIVE_INFINITY) {
    special = upper ? "-INF" : "-inf";
  }
  return special;
}

// gG
function floating_point_format(v: unknown, upper: boolean, flags: FormatFlags) {
  number_check(v, flags);

  const val = _float_helper(v, flags);

  const special = handle_special_values(val, upper);
  if (special) {
    return format_padding(format_sign(val, flags) + special, flags);
  }
  let p = flags.precision;
  if (typeof p === "undefined") throw new Error("TK");
  if (p == 0) {
    p = 1;
  }
  const exp_format = val.toExponential(p - 1);
  const e_index = exp_format.indexOf("e");
  const exp = parseInt(exp_format.substring(e_index + 1));
  let res;

  function remove_zeros(v: string) {
    if (flags.alternate) {
      return v;
    }
    if (v.indexOf(".") > -1) {
      while (v.endsWith("0")) {
        v = v.substring(0, v.length - 1);
      }
      if (v.endsWith(".")) {
        v = v.substring(0, v.length - 1);
      }
    }
    return v;
  }

  if (-4 <= exp && exp < p) {
    /*
        If m <= exp < p, where m is -4 for floats and -6 for Decimals, the
        number is formatted with presentation type 'f' and precision p-1-exp
        */
    flags.precision = Math.max(0, p - 1 - exp);
    res = floating_point_decimal_format(val, upper, flags);
    res = remove_zeros(res);
  } else {
    /*
        Otherwise, the number is formatted with presentation type 'e' and
        precision p-1
        */
    flags.precision = Math.max(0, p - 1);
    const delim = upper ? "E" : "e",
      exp_fmt = floating_point_exponential_format(val, upper, flags),
      parts = exp_fmt.split(delim);
    parts[0] = remove_zeros(parts[0]);
    res = parts.join(delim);
  }
  return format_padding(format_sign(val, flags) + res, flags);
}

function roundDownToFixed(v: number, d: number): string {
  if (d == 0 && v.toString().indexOf("e") > -1) {
    // with precision 0, never include "e"
    return BigInt(v).toString();
  }
  const mul = Math.pow(10, d);
  const is_neg = v < 0;
  if (is_neg) {
    v = -v;
  }
  const res_floor = Number((Math.floor(v * mul) / mul).toFixed(d));
  const res_ceil = Number((Math.ceil(v * mul) / mul).toFixed(d));
  let res;
  if (v - res_floor == res_ceil - v) {
    // if two multiples are equally close, rounding is done toward
    // the even choice
    const last = `${res_floor}`[`${res_floor}`.length - 1];
    res = last.match(/[02468]/) ? res_floor : res_ceil;
  } else {
    res = v - res_floor < res_ceil - v ? res_floor : res_ceil;
  }
  return is_neg ? "-" + res : `${res}`;
}

// fF
function floating_point_decimal_format(
  v: unknown,
  upper: boolean,
  flags: FormatFlags,
) {
  const val = _float_helper(v, flags);
  const unpadded = format_float_precision(
    val,
    upper,
    flags,
    function (val, precision, flags) {
      if (typeof precision === "undefined") throw new Error("TK");
      // can't use val.toFixed(precision) because
      // (2.5).toFixed(0) returns "3", not "2"...
      let res = `${roundDownToFixed(val, precision)}`;
      if (precision === 0 && flags.alternate) {
        res += ".";
      }
      if (Object.is(val, -0)) {
        res = "-" + res;
      }
      return res;
    },
  );
  return format_padding(format_sign(val, flags) + unpadded, flags);
}

function _floating_exp_helper(
  val: number,
  precision: number,
  flags: FormatFlags,
  upper?: boolean,
) {
  let is_neg = false,
    val_pos = val.toString();
  if (val < 0) {
    is_neg = true;
    val_pos = val_pos.substring(1);
  } else if (Object.is(val, -0)) {
    is_neg = true;
  }

  let parts = val_pos.split("."),
    exp = 0,
    exp_sign = "+",
    mant;
  if (parts[0] == "0") {
    if (parts[1]) {
      exp_sign = "-";
      exp++;
      let i = 0;
      while (parts[1][i] == "0") {
        i++;
      }
      exp += i;
      mant = parts[1][i];
      if (parts[1][i + 1]) {
        mant += "." + parts[1].substring(i + 1);
      }
    } else {
      mant = "0";
    }
  } else {
    exp = parts[0].length - 1;
    mant = parts[0][0];
    if (parts[0].length > 1) {
      mant += "." + parts[0].substring(1) + (parts[1] || "");
    } else if (parts[1]) {
      mant += "." + parts[1];
    }
  }
  // round mantissa to precision
  mant = roundDownToFixed(parseFloat(mant), precision);
  if (parseFloat(mant) == 10) {
    // 9.5 is rounded to 10 !
    parts = mant.split(".");
    parts[0] = "1";
    mant = parts.join(".");
    exp = parseInt(`${exp}`) + (exp_sign == "+" ? 1 : -1);
    if (exp == 0) {
      exp_sign = "+";
    }
  }
  if (flags.alternate && mant.indexOf(".") == -1) {
    mant += ".";
  }

  let exprString = exp.toString();
  if (exprString.length == 1) {
    // exponent has at least 2 digits
    exprString = "0" + exprString;
  }
  return `${is_neg ? "-" : ""}${mant}${upper ? "E" : "e"}${exp_sign}${exprString}`;
}

// eE
function floating_point_exponential_format(
  v: unknown,
  upper: boolean,
  flags: FormatFlags,
) {
  const val = _float_helper(v, flags);
  return format_padding(
    format_sign(val, flags) +
      format_float_precision(val, upper, flags, _floating_exp_helper),
    flags,
  );
}

function signed_hex_format(v: unknown, upper: boolean, flags: FormatFlags) {
  if (
    typeof v !== "number" &&
    typeof v !== "boolean" &&
    typeof v !== "bigint"
  ) {
    throw new TypeError(
      `%X format: an integer is required, not ${getObjectTypeName(v)}`,
    );
  }

  const val = typeof v === "boolean" ? +v : v;

  let ret = val.toString(16);

  ret = format_int_precision(ret, flags);
  if (flags.pad_char === "0") {
    if (val < 0) {
      ret = ret.substring(1);
      ret = "-" + format_padding(ret, flags, true);
    }
    const sign = format_sign(val, flags);
    if (sign !== "") {
      ret = sign + format_padding(ret, flags, true);
    }
  }

  if (flags.alternate) {
    if (ret.startsWith("-")) {
      ret = "-0x" + ret.slice(1);
    } else {
      ret = "0x" + ret;
    }
  }

  if (upper) ret = ret.toUpperCase();

  return format_padding(format_sign(val, flags) + ret, flags);
}

function octal_format(val: unknown, flags: FormatFlags) {
  number_check(val, flags);
  let ret = (+val).toString(8);

  ret = format_int_precision(ret, flags);

  if (flags.pad_char === "0") {
    if (+val < 0) {
      ret = ret.substring(1);
      ret = "-" + format_padding(ret, flags, true);
    }
    const sign = format_sign(+val, flags);
    if (sign !== "") {
      ret = sign + format_padding(ret, flags, true);
    }
  }

  if (flags.alternate) {
    if (ret.startsWith("-")) {
      ret = "-0o" + ret.slice(1);
    } else {
      ret = "0o" + ret;
    }
  }
  return format_padding(ret, flags);
}

function single_char_format(
  val: unknown,
  flags: FormatFlags,
  type?: "bytes" | "str",
): string {
  if (type == "bytes") {
    if (
      typeof val === "number" ||
      val instanceof Number ||
      val instanceof BigInt
    ) {
      if (
        val instanceof BigInt ||
        (val as number) < 0 ||
        (val as number) > 255
      ) {
        throw new OverflowError("%c arg not in range(256)");
      }
    } else if (typeof val === "string") {
      const char = val.charCodeAt(0);
      if (val.length > 1 || isNaN(char) || char > 256) {
        throw new TypeError(
          "%c requires an integer in range(256) or a single byte",
        );
      }
      val = char;
    }
  } else {
    if (typeof val === "string" || val instanceof String) {
      if (val.length == 1) {
        return `${val}`;
      }
      throw new TypeError("%c requires int or char");
    } else if (!(typeof val === "number" || val instanceof Number)) {
      throw new TypeError("%c requires int or char");
    }
    if (
      (typeof val === "number" || val instanceof Number) &&
      ((val as number) > Number.MAX_SAFE_INTEGER ||
        (val as number) < -1 * Number.MAX_SAFE_INTEGER)
    ) {
      throw new OverflowError("%c arg not in range(0x110000)");
    }
  }
  return format_padding(String.fromCodePoint(Number(val)), flags);
}

function num_flag(c: string, flags: FormatFlags) {
  if (c === "0" && !flags.padding && !flags.decimal_point && !flags.left) {
    flags.pad_char = "0";
    return;
  }
  if (!flags.decimal_point) {
    flags.padding = (flags.padding ?? "") + c;
  } else {
    flags.precision = parseInt((flags.precision ?? "") + c);
  }
}

function decimal_point_flag(val: unknown, flags: FormatFlags) {
  if (flags.decimal_point) {
    // can only have one decimal point
    throw new UnsupportedChar();
  }
  flags.decimal_point = true;
}

function neg_flag(val: unknown, flags: FormatFlags) {
  flags.pad_char = " "; // overrides '0' flag
  flags.left = true;
}

function space_flag(val: unknown, flags: FormatFlags) {
  flags.space = true;
}

function sign_flag(val: unknown, flags: FormatFlags) {
  flags.sign = true;
}

function alternate_flag(val: unknown, flags: FormatFlags) {
  flags.alternate = true;
}

const char_mapping: Record<
  string,
  (val: unknown, flags: FormatFlags, type?: "str" | "bytes") => string | void
> = {
  s: str_format,
  d: num_format,
  i: num_format,
  u: num_format,
  o: octal_format,
  r: repr_format,
  a: ascii_format,
  g: function (val, flags) {
    return floating_point_format(val, false, flags);
  },
  G: function (val, flags) {
    return floating_point_format(val, true, flags);
  },
  f: function (val, flags) {
    return floating_point_decimal_format(val, false, flags);
  },
  F: function (val, flags) {
    return floating_point_decimal_format(val, true, flags);
  },
  e: function (val, flags) {
    return floating_point_exponential_format(val, false, flags);
  },
  E: function (val, flags) {
    return floating_point_exponential_format(val, true, flags);
  },
  x: function (val, flags) {
    return signed_hex_format(val, false, flags);
  },
  X: function (val, flags) {
    return signed_hex_format(val, true, flags);
  },
  c: single_char_format,
  "0": function (val, flags) {
    return num_flag("0", flags);
  },
  "1": function (val, flags) {
    return num_flag("1", flags);
  },
  "2": function (val, flags) {
    return num_flag("2", flags);
  },
  "3": function (val, flags) {
    return num_flag("3", flags);
  },
  "4": function (val, flags) {
    return num_flag("4", flags);
  },
  "5": function (val, flags) {
    return num_flag("5", flags);
  },
  "6": function (val, flags) {
    return num_flag("6", flags);
  },
  "7": function (val, flags) {
    return num_flag("7", flags);
  },
  "8": function (val, flags) {
    return num_flag("8", flags);
  },
  "9": function (val, flags) {
    return num_flag("9", flags);
  },
  "-": neg_flag,
  " ": space_flag,
  "+": sign_flag,
  ".": decimal_point_flag,
  "#": alternate_flag,
};

// exception thrown when an unsupported char is encountered in legacy format

const conversion_flags = "#0- +",
  length_modifiers = "hlL",
  conversion_types = "diouxXeEfFgGcrsa";

function parse_mod_format(
  s: string,
  type: "bytes" | "str",
  pos: number,
): FormatFlags {
  const flags: FormatFlags = { pad_char: " " } as FormatFlags;
  const len = s.length;
  const start_pos = pos;
  let mo;
  pos++;
  while (pos < len) {
    let char = s[pos];
    if (char == "(") {
      const end = s.substring(pos).indexOf(")");
      if (end == -1) {
        throw new ValueError("incomplete format key");
      } else {
        flags.mapping_key = s.substring(pos + 1, end + pos);
        pos += end + 1;
      }
    } else if (conversion_flags.indexOf(char) > -1) {
      flags.conversion_flag = char;
      if (char == "#") {
        flags.alternate = true;
      } else if (char == "-") {
        flags.left = true;
      } else if (char == "+") {
        flags.sign = true;
      } else if (char == "0") {
        flags.pad_char = "0";
      } else if (char == " ") {
        flags.space = true;
      }
      pos++;
    } else if (char == "*") {
      flags.padding = "*";
      pos++;
    } else if ((mo = /^\d+/.exec(s.substring(pos)))) {
      flags.padding = mo[0];
      pos += mo[0].length;
    } else if (char == ".") {
      pos++;
      if (s[pos] == "*") {
        flags.precision = -1;
        pos++;
      } else if ((mo = /^\d+/.exec(s.substring(pos)))) {
        flags.precision = parseInt(mo[0]);
        pos += mo[0].length;
      } else {
        flags.precision = 0;
      }
    } else if (length_modifiers.indexOf(char) > -1) {
      flags.length_modifier = char;
      pos++;
    } else if (
      conversion_types.indexOf(char) > -1 ||
      (char == "b" && type == "bytes")
    ) {
      if (type == "bytes") {
        if (char == "s") {
          // for bytes, 's' is an alias for 'b'
          char = "b";
        } else if (char == "r") {
          char = "a";
        }
      }
      flags.conversion_type = char;
      flags.end = pos;
      flags.string = s.substring(start_pos, start_pos + pos);
      if (flags.left && flags.pad_char == "0") {
        // conversion flag "-" overrides "0" if both are given
        flags.pad_char = " ";
      }
      return flags;
    } else {
      throw new ValueError(`invalid character in format: ${char}`);
    }
  }
  throw new ValueError("invalid format");
}

function printf_format(
  s: string,
  type: "str" | "bytes",
  args: any[] | Record<string, any>,
) {
  // printf-style bytes or string formatting
  // s is a string
  // type is 'str' or 'bytes', the class of the original formatted object
  // args are the arguments passed to %
  let argpos = Array.isArray(args) ? 0 : null;
  let ret = ""; // return value
  let nbph = 0; // number of placeholders
  let pos = 0; // position in s
  const len = s.length;
  while (pos < len) {
    const fmtpos = s.indexOf("%", pos);
    if (fmtpos < 0) {
      ret += s.substring(pos);
      break;
    }
    ret += s.substring(pos, fmtpos);
    pos = fmtpos;
    if (s[pos + 1] == "%") {
      ret += "%";
      pos += 2;
    } else {
      nbph++;
      if (nbph > 1) {
        // issue 2184
        if ((!Array.isArray(args) || !args.length) && !isPlainObject(args)) {
          throw new TypeError("not enough arguments for format string");
        }
      }
      const fmt = parse_mod_format(s, type, pos);
      pos = fmt.end + 1;
      if (fmt.padding == "*") {
        if (argpos === null || !Array.isArray(args)) {
          throw new ValueError(
            "field width * requires positional arguments, not object",
          );
        }
        // read value in arguments
        if (args[argpos] === undefined) {
          throw new ValueError("no value for field width *");
        }
        fmt.padding = args[argpos];
        argpos++;
      }
      if (fmt.precision == -1) {
        if (argpos === null || !Array.isArray(args)) {
          throw new ValueError(
            "precision * requires positional arguments, not object",
          );
        }

        // read value in arguments
        if (args[argpos] === undefined) {
          throw new ValueError("no value for precision *");
        }
        fmt.precision = args[argpos];
        argpos++;
      }
      const func = char_mapping[fmt.conversion_type];
      let value;
      if (fmt.mapping_key !== undefined) {
        if (Array.isArray(args))
          throw new ValueError("%(name) syntax requires an object as argument");
        value = args[fmt.mapping_key];
      } else {
        if (argpos === null) {
          value = args;
        } else {
          value = (args as any[])[argpos];
          if (value === undefined) {
            throw new TypeError("not enough arguments for format string");
          }
          argpos++;
        }
      }
      ret += func(value, fmt, type);
    }
  }

  if (argpos !== null) {
    if (args.length > argpos) {
      throw new TypeError("not enough arguments for format string");
    } else if (args.length < argpos) {
      throw new TypeError(
        "not all arguments converted during string formatting",
      );
    }
  } else if (nbph == 0) {
    throw new TypeError("not all arguments converted during string formatting");
  }
  return ret;
}

export default function strMod(s: string, ...args_: any[]) {
  const args: Record<string, any> | any[] =
    args_.length === 1 && isPlainObject(args_[0]) ? args_[0] : args_;
  return printf_format(s, "str", args);
}

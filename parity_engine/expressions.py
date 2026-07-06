"""Safe evaluator for spec entry-condition `expression` strings.

The spec stores conditions like `"ribbon_compression < 0.2 and vama_slope > 0"`.
We evaluate them against a context dict of indicator values for the current bar.
No `eval()` — we use a tiny safe subset: comparisons, `and`/`or`/`not`, parens,
and variable names. This keeps the engine deterministic and auditable.
"""
from __future__ import annotations

import re
from typing import Any


class ExpressionError(ValueError):
    pass


# Allowed tokens: identifiers, numbers, comparison ops, logical ops, parens
TOKEN_RE = re.compile(
    r"""
    (?P<id>[A-Za-z_][A-Za-z0-9_]*) |
    (?P<num>-?\d+(?:\.\d+)?) |
    (?P<op><=|>=|<|>|==|!=) |
    (?P<log>and|or|not) |
    (?P<paren>[()])
    """,
    re.VERBOSE,
)


def tokenize(expr: str) -> list[tuple[str, str]]:
    tokens = []
    for m in TOKEN_RE.finditer(expr):
        kind = m.lastgroup
        val = m.group()
        if kind == "id":
            tokens.append(("ID", val))
        elif kind == "num":
            tokens.append(("NUM", val))
        elif kind == "op":
            tokens.append(("OP", val))
        elif kind == "log":
            tokens.append(("LOG", val))
        elif kind == "paren":
            tokens.append(("PAREN", val))
    # verify we consumed the whole string (ignoring whitespace)
    consumed = "".join(v for _, v in tokens)
    if consumed.replace(" ", "") != expr.replace(" ", ""):
        raise ExpressionError(f"Unrecognized characters in expression: {expr}")
    return tokens


class Parser:
    def __init__(self, tokens: list[tuple[str, str]]):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else ("EOF", "")

    def consume(self, expected_type=None):
        tok = self.peek()
        if expected_type and tok[0] != expected_type:
            raise ExpressionError(f"Expected {expected_type}, got {tok}")
        self.pos += 1
        return tok

    def parse(self):
        return self.parse_or()

    def parse_or(self):
        left = self.parse_and()
        while self.peek()[0] == "LOG" and self.peek()[1] == "or":
            self.consume("LOG")
            right = self.parse_and()
            left = ("OR", left, right)
        return left

    def parse_and(self):
        left = self.parse_not()
        while self.peek()[0] == "LOG" and self.peek()[1] == "and":
            self.consume("LOG")
            right = self.parse_not()
            left = ("AND", left, right)
        return left

    def parse_not(self):
        if self.peek()[0] == "LOG" and self.peek()[1] == "not":
            self.consume("LOG")
            return ("NOT", self.parse_not())
        return self.parse_comparison()

    def parse_comparison(self):
        left = self.parse_primary()
        while self.peek()[0] == "OP":
            op = self.consume("OP")[1]
            right = self.parse_primary()
            left = ("CMP", op, left, right)
        return left

    def parse_primary(self):
        tok = self.peek()
        if tok[0] == "PAREN" and tok[1] == "(":
            self.consume("PAREN")
            node = self.parse_or()
            if self.peek()[0] != "PAREN" or self.peek()[1] != ")":
                raise ExpressionError("Missing closing parenthesis")
            self.consume("PAREN")
            return node
        if tok[0] == "ID":
            self.consume("ID")
            return ("VAR", tok[1])
        if tok[0] == "NUM":
            self.consume("NUM")
            return ("NUM", float(tok[1]))
        raise ExpressionError(f"Unexpected token: {tok}")


def parse_expression(expr: str):
    tokens = tokenize(expr)
    if not tokens:
        raise ExpressionError("Empty expression")
    parser = Parser(tokens)
    return parser.parse()


def eval_node(node, ctx: dict[str, float | None]):
    """Returns float | bool depending on context. Comparisons always return bool."""
    typ = node[0]
    if typ == "VAR":
        name = node[1]
        if name not in ctx:
            raise ExpressionError(f"Unknown variable: {name}")
        val = ctx[name]
        return val  # return raw value; caller decides boolean context
    if typ == "NUM":
        return node[1]
    if typ == "NOT":
        v = eval_node(node[1], ctx)
        return not (bool(v) if v is not None else False)
    if typ == "AND":
        lv, rv = eval_node(node[1], ctx), eval_node(node[2], ctx)
        return (lv is not None and bool(lv)) and (rv is not None and bool(rv))
    if typ == "OR":
        lv, rv = eval_node(node[1], ctx), eval_node(node[2], ctx)
        return (lv is not None and bool(lv)) or (rv is not None and bool(rv))
    if typ == "CMP":
        op, left, right = node[1], node[2], node[3]
        lv = eval_node(left, ctx)
        rv = eval_node(right, ctx)
        if lv is None or rv is None:
            return False  # Pine: na in comparison → false
        if op == "<":
            return lv < rv
        if op == "<=":
            return lv <= rv
        if op == ">":
            return lv > rv
        if op == ">=":
            return lv >= rv
        if op == "==":
            return lv == rv
        if op == "!=":
            return lv != rv
        raise ExpressionError(f"Unknown operator: {op}")
    raise ExpressionError(f"Unknown node type: {typ}")


def evaluate(expr: str, ctx: dict[str, float | None]) -> bool:
    """Evaluate a boolean expression against a context of indicator values."""
    try:
        ast = parse_expression(expr)
        return eval_node(ast, ctx)
    except ExpressionError:
        raise
    except Exception as e:
        raise ExpressionError(f"Evaluation failed: {e}") from e

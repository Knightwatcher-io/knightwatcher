"""The path syntax of provider files: a strict subset of JSONPath as RFC 9535 defines it.

Allowed: the root `$`; a member by name (`$.data`, `$['X-Field']`); an element by index, from the
end when negative (`$.history[-1]`); every member or element (`[*]`, `.*`); and a filter of
comparisons with a literal by `==` or `!=`, or of existence tests, joined by `&&`
(`[?@.label == 'Blocked']`, `[?@.Item.Type && @.Index]`). The query inside a filter is a singular
one: `@` followed by names and indices. Literals are strings in single or double quotes, numbers,
`true`, `false` and `null`.

Left out, and refused with the position of the fault: descendants (`..`), slices, unions,
functions, `||`, `!`, parentheses and the comparisons other than `==` and `!=`.

Every allowed form means what the RFC says it means. A path that finds several values gives them in
document order, and one that finds nothing gives an empty list, never an error. A path that finds
more than MAX_VALUES values raises TooMany.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

# The most values one path may find.
MAX_VALUES = 10_000
# Indices as the RFC bounds them: I-JSON's exact integers.
_MAX_INDEX = 2**53 - 1

_BLANK = " \t\n\r"
_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?")
_INDEX = re.compile(r"0|-?[1-9][0-9]*")
_HEX4 = re.compile(r"[0-9A-Fa-f]{4}")
_ESCAPES = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "/": "/", "\\": "\\"}


class PathError(ValueError):
    """A path outside the subset, with the 1-based character where it goes wrong."""


class TooMany(Exception):
    """A path found more than MAX_VALUES values."""


def _name_first(ch: str) -> bool:
    if ch.isascii():
        return ch.isalpha() or ch == "_"
    return ch.isprintable()


def _name_char(ch: str) -> bool:
    return _name_first(ch) or ("0" <= ch <= "9")


# The parts of a compiled path ----------------------------------------------------------------


@dataclass(frozen=True)
class _Name:
    name: str


@dataclass(frozen=True)
class _Index:
    index: int


@dataclass(frozen=True)
class _All:
    pass


@dataclass(frozen=True)
class _Exists:
    query: tuple  # a singular query of _Name and _Index from @


@dataclass(frozen=True)
class _Compare:
    query: tuple
    equal: bool  # == when true, != when false
    literal: Any


@dataclass(frozen=True)
class _Filter:
    tests: tuple  # of _Exists and _Compare, all of which must hold


class Path:
    """A compiled path. find(value) gives the values it finds, in document order."""

    def __init__(self, text: str):
        self.text = text
        self.segments: tuple = _Parser(text).query()

    def __repr__(self) -> str:
        return f"Path({self.text!r})"

    def find(self, value: Any, limit: int = MAX_VALUES) -> list[Any]:
        nodes = [value]
        for segment in self.segments:
            out: list[Any] = []
            for node in nodes:
                out.extend(_select(segment, node))
                if len(out) > limit:
                    raise TooMany(self.text)
            nodes = out
        return nodes

    @property
    def singular(self) -> bool:
        """Whether the path can find at most one value: names and indices alone."""
        return all(isinstance(s, (_Name, _Index)) for s in self.segments)


def compile_path(text: str) -> Path:
    """The compiled path, or PathError naming what is wrong and where."""
    if not isinstance(text, str):
        raise PathError('expected a path in quotes, such as "$.data"')
    return Path(text)


# Evaluation -----------------------------------------------------------------------------------


def _select(segment, node: Any) -> list[Any]:
    if isinstance(segment, _Name):
        return [node[segment.name]] if isinstance(node, dict) and segment.name in node else []
    if isinstance(segment, _Index):
        if not isinstance(node, list):
            return []
        i = segment.index
        if i < 0:
            i += len(node)
        return [node[i]] if 0 <= i < len(node) else []
    children = list(node.values()) if isinstance(node, dict) else node
    if not isinstance(children, list):
        return []
    if isinstance(segment, _All):
        return list(children)
    return [c for c in children if all(_holds(t, c) for t in segment.tests)]


def _singular(query: tuple, node: Any) -> list[Any]:
    for segment in query:
        found = _select(segment, node)
        if not found:
            return []
        node = found[0]
    return [node]


def _holds(test, node: Any) -> bool:
    found = _singular(test.query, node)
    if isinstance(test, _Exists):
        return bool(found)
    same = bool(found) and equal(found[0], test.literal)
    return same if test.equal else not same


def equal(a: Any, b: Any) -> bool:
    """JSON equality as the RFC has it: numbers by value, true and false never numbers, and
    objects and arrays member by member."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, str) or isinstance(b, str):
        return isinstance(a, str) and isinstance(b, str) and a == b
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b, strict=True))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
    return False


# Parsing --------------------------------------------------------------------------------------


class _Parser:
    def __init__(self, text: str):
        self.text = text
        self.i = 0

    # The cursor

    def fail(self, what: str | None = None, at: int | None = None) -> PathError:
        at = self.i if at is None else at
        if at >= len(self.text):
            return PathError(f"unexpected end at character {at + 1}")
        if what is None:
            what = self.text[at]
            for token in ("..", "||", "&&", "==", "!=", "<=", ">="):
                if self.text.startswith(token, at):
                    what = token
                    break
            else:
                word = re.match(r"[A-Za-z_][A-Za-z0-9_]*", self.text[at:])
                if word:
                    what = word.group(0)
        return PathError(f"unexpected {json.dumps(what, ensure_ascii=False)} at character {at + 1}")

    def peek(self, n: int = 1) -> str:
        return self.text[self.i : self.i + n]

    def blank(self) -> None:
        while self.i < len(self.text) and self.text[self.i] in _BLANK:
            self.i += 1

    def expect(self, token: str) -> None:
        if not self.text.startswith(token, self.i):
            raise self.fail()
        self.i += len(token)

    # The grammar

    def query(self) -> tuple:
        self.expect("$")
        segments = []
        while True:
            self.blank()
            if self.i >= len(self.text):
                return tuple(segments)
            segments.append(self.segment(relative=False))

    def segment(self, relative: bool):
        """One child segment: .name, .*, or a bracket with one selector. Within a filter's query
        (relative), only names and indices."""
        if self.peek(2) == "..":
            raise self.fail()
        if self.peek() == ".":
            self.i += 1
            if self.peek() == "*" and not relative:
                self.i += 1
                return _All()
            return _Name(self.shorthand())
        if self.peek() == "[":
            self.i += 1
            self.blank()
            selector = self.selector(relative)
            self.blank()
            if self.peek() != "]":
                raise self.fail()
            self.i += 1
            return selector
        raise self.fail()

    def shorthand(self) -> str:
        start = self.i
        if self.i >= len(self.text) or not _name_first(self.text[self.i]):
            raise self.fail()
        while self.i < len(self.text) and _name_char(self.text[self.i]):
            self.i += 1
        return self.text[start : self.i]

    def selector(self, relative: bool):
        ch = self.peek()
        if ch in ("'", '"'):
            return _Name(self.string())
        if ch == "*" and not relative:
            self.i += 1
            return _All()
        if ch == "?" and not relative:
            self.i += 1
            self.blank()
            return self.filter()
        m = _INDEX.match(self.text, self.i)
        if m:
            value = int(m.group(0))
            if abs(value) > _MAX_INDEX:
                raise PathError(f"index out of range at character {self.i + 1}")
            self.i = m.end()
            return _Index(value)
        raise self.fail()

    def filter(self) -> _Filter:
        tests = [self.test()]
        while True:
            self.blank()
            if self.peek(2) != "&&":
                return _Filter(tuple(tests))
            self.i += 2
            self.blank()
            tests.append(self.test())

    def test(self):
        """A comparison of a query with a literal, either way round, or a query's existence."""
        if self.peek() == "@":
            query = self.relative()
            self.blank()
            op = self.peek(2)
            if op in ("==", "!="):
                self.i += 2
                self.blank()
                return _Compare(query, op == "==", self.literal())
            if op in ("<=", ">=") or self.peek() in ("<", ">"):
                raise self.fail()
            return _Exists(query)
        literal = self.literal()
        self.blank()
        op = self.peek(2)
        if op not in ("==", "!="):
            raise self.fail()
        self.i += 2
        self.blank()
        if self.peek() != "@":
            raise self.fail()
        return _Compare(self.relative(), op == "==", literal)

    def relative(self) -> tuple:
        self.expect("@")
        segments = []
        while self.peek() in (".", "["):
            segments.append(self.segment(relative=True))
        return tuple(segments)

    def literal(self) -> Any:
        ch = self.peek()
        if ch in ("'", '"'):
            return self.string()
        for word, value in (("true", True), ("false", False), ("null", None)):
            if self.text.startswith(word, self.i) and not _name_char(self.peek_at(len(word))):
                self.i += len(word)
                return value
        m = _NUMBER.match(self.text, self.i)
        if m:
            self.i = m.end()
            text = m.group(0)
            return float(text) if any(c in text for c in ".eE") else int(text)
        raise self.fail()

    def peek_at(self, offset: int) -> str:
        j = self.i + offset
        return self.text[j] if j < len(self.text) else ""

    def string(self) -> str:
        quote = self.text[self.i]
        self.i += 1
        out = []
        while True:
            if self.i >= len(self.text):
                raise self.fail()
            ch = self.text[self.i]
            if ch == quote:
                self.i += 1
                return "".join(out)
            if ch == "\\":
                nxt = self.peek_at(1)
                if nxt == quote:
                    out.append(quote)
                    self.i += 2
                elif nxt in _ESCAPES:
                    out.append(_ESCAPES[nxt])
                    self.i += 2
                elif nxt == "u" and _HEX4.fullmatch(self.text, self.i + 2, self.i + 6):
                    out.append(chr(int(self.text[self.i + 2 : self.i + 6], 16)))
                    self.i += 6
                else:
                    raise self.fail(at=self.i)
                continue
            if ord(ch) < 0x20:
                raise self.fail()
            out.append(ch)
            self.i += 1

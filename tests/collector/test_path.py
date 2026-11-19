"""The path syntax of provider files: the subset of JSONPath (RFC 9535) the engine reads.

Every allowed form, the RFC's results on its own examples within the subset, every refused form
with the position of the fault, and the limit on values found.
"""

import unittest

from collector.providers.path import MAX_VALUES, PathError, TooMany, compile_path, equal


def find(path, value):
    return compile_path(path).find(value)


# The example document of RFC 9535, section 1.5.
STORE = {
    "store": {
        "book": [
            {"category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century",
             "price": 8.95},
            {"category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour",
             "price": 12.99},
            {"category": "fiction", "author": "Herman Melville", "title": "Moby Dick",
             "isbn": "0-553-21311-3", "price": 8.99},
            {"category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings",
             "isbn": "0-395-19395-8", "price": 22.99},
        ],
        "bicycle": {"color": "red", "price": 399},
    }
}  # fmt: skip


class AllowedTest(unittest.TestCase):
    def test_the_root(self):
        self.assertEqual(find("$", {"a": 1}), [{"a": 1}])
        self.assertEqual(find("$", None), [None])

    def test_members_by_name(self):
        self.assertEqual(find("$.store.bicycle.color", STORE), ["red"])
        self.assertEqual(find("$['store']['bicycle']", STORE), [STORE["store"]["bicycle"]])
        self.assertEqual(find('$["X-Field"]', {"X-Field": 3}), [3])
        self.assertEqual(find("$['a\\'b']", {"a'b": 1}), [1])
        self.assertEqual(find('$["\\u00e9t\\u00e9"]', {"été": 2}), [2])
        self.assertEqual(find("$.été", {"été": 2}), [2])
        self.assertEqual(find("$._x1", {"_x1": 4}), [4])

    def test_elements_by_index(self):
        books = STORE["store"]["book"]
        self.assertEqual(find("$.store.book[0].title", STORE), ["Sayings of the Century"])
        self.assertEqual(find("$.store.book[-1].title", STORE), ["The Lord of the Rings"])
        self.assertEqual(find("$.store.book[ 1 ]", STORE), [books[1]])
        self.assertEqual(find("$.store.book[4]", STORE), [])
        self.assertEqual(find("$.store.book[-5]", STORE), [])

    def test_every_member_or_element(self):
        self.assertEqual(
            find("$.store.book[*].author", STORE),
            ["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"],
        )
        self.assertEqual(find("$.store.bicycle.*", STORE), ["red", 399])
        self.assertEqual(find("$.store.bicycle[*]", STORE), ["red", 399])
        self.assertEqual(find("$[*]", [1, [2], {"a": 3}]), [1, [2], {"a": 3}])

    def test_filters(self):
        self.assertEqual(
            find("$.store.book[?@.isbn].title", STORE), ["Moby Dick", "The Lord of the Rings"]
        )
        self.assertEqual(
            find("$.store.book[?@.category == 'reference'].author", STORE), ["Nigel Rees"]
        )
        self.assertEqual(find("$.store.book[?@.category != 'fiction'].price", STORE), [8.95])
        self.assertEqual(
            find("$.store.book[?@.isbn && @.price == 8.99].title", STORE), ["Moby Dick"]
        )
        self.assertEqual(find("$.store.book[?'Moby Dick' == @.title].price", STORE), [8.99])
        self.assertEqual(find("$.a[?@.b == null]", {"a": [{"b": None}, {"c": 1}]}), [{"b": None}])
        datasets = {"data": [{"label": "Total", "n": [3, 4]}, {"label": "Blocked", "n": [1, 2]}]}
        self.assertEqual(find("$.data[?@.label == 'Blocked'].n[*]", datasets), [1, 2])

    def test_a_filter_on_an_object_tests_its_members(self):
        value = {"x": {"on": True}, "y": {"on": False}, "z": 3}
        self.assertEqual(find("$[?@.on == true]", value), [{"on": True}])

    def test_existence_of_an_item_that_is_null_or_missing(self):
        sessions = [
            {"Id": "a", "Item": {"Type": "Episode"}},
            {"Id": "b", "Item": None},
            {"Id": "c"},
            {"Id": "d", "Item": {"Type": None}},
        ]
        # The RFC: a member that exists with the value null exists.
        self.assertEqual(find("$[?@.Item.Type].Id", sessions), ["a", "d"])

    def test_comparisons_are_json_equality(self):
        rows = [{"v": 1}, {"v": 1.0}, {"v": True}, {"v": "1"}, {"v": [1]}, {}]
        self.assertEqual(find("$[?@.v == 1]", rows), [{"v": 1}, {"v": 1.0}])
        self.assertEqual(find("$[?@.v == true]", rows), [{"v": True}])
        self.assertEqual(find("$[?@.v == '1']", rows), [{"v": "1"}])
        # Nothing found is never equal to a literal, so != keeps it.
        self.assertEqual(find("$[?@.v != 1]", rows), [{"v": True}, {"v": "1"}, {"v": [1]}, {}])
        self.assertTrue(equal({"a": [1, 2.0]}, {"a": [1.0, 2]}))
        self.assertFalse(equal(0, False))
        self.assertFalse(equal(None, 0))

    def test_numbers_as_literals(self):
        rows = [{"v": -2}, {"v": 0.5}, {"v": 1e3}]
        self.assertEqual(find("$[?@.v == -2]", rows), [{"v": -2}])
        self.assertEqual(find("$[?@.v == 5e-1]", rows), [{"v": 0.5}])
        self.assertEqual(find("$[?@.v == 1000]", rows), [{"v": 1e3}])

    def test_nothing_found_is_an_empty_list(self):
        self.assertEqual(find("$.a.b.c", {"a": 1}), [])
        self.assertEqual(find("$.a[0]", {"a": {"0": 1}}), [])
        self.assertEqual(find("$.a.*", {"a": "text"}), [])
        self.assertEqual(find("$[?@.a]", "text"), [])

    def test_singular(self):
        self.assertTrue(compile_path("$.a[0]['b']").singular)
        self.assertFalse(compile_path("$.a[*]").singular)
        self.assertFalse(compile_path("$.a[?@.b]").singular)

    def test_the_limit_on_values_found(self):
        compile_path("$[*]").find(list(range(MAX_VALUES)))
        with self.assertRaises(TooMany):
            compile_path("$[*]").find(list(range(MAX_VALUES + 1)))
        with self.assertRaises(TooMany):
            compile_path("$[*][*]").find([list(range(100))] * 101)


class RefusedTest(unittest.TestCase):
    def refused(self, path, message):
        with self.assertRaises(PathError) as cm:
            compile_path(path)
        self.assertEqual(str(cm.exception), message, path)

    def test_every_form_outside_the_subset(self):
        self.refused("$.MediaCont..x", 'unexpected ".." at character 12')
        self.refused("$..x", 'unexpected ".." at character 2')
        self.refused("$.a[1:2]", 'unexpected ":" at character 6')
        self.refused("$.a[0,1]", 'unexpected "," at character 6')
        self.refused("$.a[?length(@.b) == 1]", 'unexpected "length" at character 6')
        self.refused("$.a[?@.b || @.c]", 'unexpected "||" at character 10')
        self.refused("$.a[?!@.b]", 'unexpected "!" at character 6')
        self.refused("$.a[?@.b < 3]", 'unexpected "<" at character 10')
        self.refused("$.a[?@.b >= 3]", 'unexpected ">=" at character 10')
        self.refused("$.a[?(@.b)]", 'unexpected "(" at character 6')
        self.refused("$.a[?@.b[*]]", 'unexpected "*" at character 10')
        self.refused("$.a[?$.b]", 'unexpected "$" at character 6')
        self.refused("$.a[?@..b]", 'unexpected ".." at character 7')
        self.refused("$.a[?@.b == @.c]", 'unexpected "@" at character 13')
        self.refused("$.a[?1 == 2]", 'unexpected "2" at character 11')

    def test_malformed(self):
        self.refused("", "unexpected end at character 1")
        self.refused("a.b", 'unexpected "a" at character 1')
        self.refused("$.", "unexpected end at character 3")
        self.refused("$.1a", 'unexpected "1" at character 3')
        self.refused("$.X-Field", 'unexpected "-" at character 4')
        self.refused("$[", "unexpected end at character 3")
        self.refused("$['a'", "unexpected end at character 6")
        self.refused("$['a]", "unexpected end at character 6")
        self.refused("$['a\\x']", 'unexpected "\\\\" at character 5')
        self.refused("$[01]", 'unexpected "1" at character 4')
        self.refused("$[-0]", 'unexpected "-" at character 3')
        self.refused("$[9007199254740992]", "index out of range at character 3")
        self.refused("$.a b", 'unexpected "b" at character 5')
        self.refused("$[?@.a == 'x' &&]", 'unexpected "]" at character 17')
        self.refused("$[?@.a == tru]", 'unexpected "tru" at character 11')
        with self.assertRaises(PathError):
            compile_path(None)


if __name__ == "__main__":
    unittest.main()

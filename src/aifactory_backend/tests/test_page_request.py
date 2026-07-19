import unittest

from pydantic import ValidationError

from common.PageRequest import PageRequest


class PageRequestTest(unittest.TestCase):
    def test_defaults(self):
        request = PageRequest()
        self.assertEqual((request.current, request.pageSize, request.sortField), (1, 10, "descend"))

    def test_negative_and_zero_values_are_rejected(self):
        for payload in ({"current": 0}, {"current": -1}, {"pageSize": 0}, {"pageSize": -1}):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                PageRequest(**payload)

    def test_unbounded_page_size_is_rejected(self):
        with self.assertRaises(ValidationError):
            PageRequest(pageSize=201)


if __name__ == "__main__":
    unittest.main()

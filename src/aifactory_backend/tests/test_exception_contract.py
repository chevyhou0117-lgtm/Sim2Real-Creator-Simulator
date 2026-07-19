import unittest

from common.ErrorCode import ErrorCode
from exception.ExceptionClass import BusinessException
from exception.ExceptionHandler import http_status_for_error


class ExceptionContractTest(unittest.TestCase):
    def test_http_status_mapping(self):
        self.assertEqual(http_status_for_error(ErrorCode.PARAMS_ERROR), 400)
        self.assertEqual(http_status_for_error(ErrorCode.NOT_FOUND_ERROR), 404)
        self.assertEqual(http_status_for_error(ErrorCode.DATA_ALREADY_EXISTS), 409)
        self.assertEqual(http_status_for_error(ErrorCode.PAYLOAD_TOO_LARGE), 413)
        self.assertEqual(http_status_for_error(ErrorCode.DB_ERROR), 500)

    def test_legacy_positional_message_is_not_response_data(self):
        exc = BusinessException(ErrorCode.PARAMS_ERROR, "字段不能为空")
        self.assertIsNone(exc.data)
        self.assertEqual(exc.extra_msg, "字段不能为空")


if __name__ == "__main__":
    unittest.main()

import unittest
from unittest.mock import patch

from config.SecurityConfig import (
    api_key_matches,
    is_protected_request,
    parse_cors_origins,
    validate_security_config,
)


class SecurityConfigTest(unittest.TestCase):
    def test_production_requires_api_key(self):
        with self.assertRaises(RuntimeError):
            validate_security_config("production", "")

    def test_development_can_run_without_api_key(self):
        validate_security_config("development", "")

    def test_production_rejects_wildcard_cors(self):
        with self.assertRaises(RuntimeError):
            parse_cors_origins("*", production=True)

    def test_cors_origins_are_trimmed_and_deduplicated(self):
        self.assertEqual(
            parse_cors_origins(
                "https://creator.example/, https://creator.example, http://localhost:8081",
                production=True,
            ),
            ["https://creator.example", "http://localhost:8081"],
        )

    def test_only_api_write_methods_are_protected(self):
        self.assertTrue(is_protected_request("POST", "/api/v1/factory-project/create"))
        self.assertFalse(is_protected_request("GET", "/api/v1/factory-project/1"))
        self.assertFalse(is_protected_request("POST", "/health"))

    def test_api_key_uses_exact_match(self):
        self.assertTrue(api_key_matches("secret", "secret"))
        self.assertFalse(api_key_matches("secret", "Secret"))
        self.assertFalse(api_key_matches("secret", None))


if __name__ == "__main__":
    unittest.main()

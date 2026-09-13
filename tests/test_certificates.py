"""Certificate policy checks use fake sockets/certificates and never reach the network."""

from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import socket
import ssl
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location(
    "certificates", Path(__file__).resolve().parents[1] / "tools" / "check-certificates.py"
)
certificates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(certificates)
NOW = datetime(2026, 9, 13, tzinfo=timezone.utc)


def certificate(days):
    return {"notAfter": (NOW + timedelta(days=days)).strftime("%b %d %H:%M:%S %Y GMT")}


class CertificateChecks(unittest.TestCase):
    def inspect(self, returned=None, error=None, min_days=45):
        context = MagicMock()
        secured = context.wrap_socket.return_value.__enter__.return_value
        secured.getpeercert.return_value = returned if returned is not None else certificate(90)
        if error:
            context.wrap_socket.side_effect = error
        with patch.object(certificates.ssl, "create_default_context", return_value=context) as factory, \
                patch.object(certificates.socket, "create_connection") as connect:
            result = certificates.inspect_certificate(
                certificates.HOSTS[0], certificates.ORIGIN_TARGET, "192.0.2.1", min_days, now=NOW
            )
        self.assertEqual(context.wrap_socket.call_args.kwargs["server_hostname"], certificates.HOSTS[0])
        self.assertEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)
        self.assertEqual(factory.call_count, 1)
        connect.assert_called_once_with(("192.0.2.1", 443), timeout=10)
        return result

    def test_fresh_certificate_and_exact_threshold_pass(self):
        for days in (90, 45):
            result = self.inspect(certificate(days))
            self.assertTrue(result["ok"])
            self.assertEqual(result["daysRemaining"], days)
            self.assertEqual(result["notAfter"], (NOW + timedelta(days=days)).isoformat())

    def test_lead_threshold_uses_unrounded_validity(self):
        result = self.inspect(certificate(44.99999))
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "renewal-threshold")
        self.assertTrue(self.inspect(certificate(44), min_days=30)["ok"])

    def test_expired_and_malformed_expiry_fail(self):
        self.assertEqual(self.inspect(certificate(-1))["error"], "expired")
        self.assertEqual(self.inspect({})["error"], "invalid-certificate-expiry")
        self.assertEqual(self.inspect({"notAfter": "not a date"})["error"], "invalid-certificate-expiry")

    def test_hostname_mismatch_and_tls_errors_are_failures(self):
        for error, expected in [
            (ssl.SSLCertVerificationError(1, "Hostname mismatch"), "tls-verification-failed"),
            (ssl.SSLError("Handshake failed"), "tls-handshake-failed"),
            (TimeoutError("Timed out"), "connection-failed"),
        ]:
            result = self.inspect(error=error)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], expected)
            self.assertIsNone(result["notAfter"])

    def test_dns_is_resolved_and_duplicate_addresses_removed(self):
        entries = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))
                   for address in ("192.0.2.2", "192.0.2.1", "192.0.2.2")]
        with patch.object(certificates.socket, "getaddrinfo", return_value=entries) as resolve:
            self.assertEqual(certificates.resolve_addresses(certificates.ORIGIN_TARGET), ["192.0.2.1", "192.0.2.2"])
        resolve.assert_called_once_with(certificates.ORIGIN_TARGET, 443, family=socket.AF_INET, type=socket.SOCK_STREAM)

    def test_every_hostname_and_address_gets_repeated_fresh_connections(self):
        def inspect(host, target, address, *args):
            return {"host": host, "target": target, "address": address,
                    "notAfter": "2026-12-12T00:00:00+00:00", "daysRemaining": 90, "ok": True}
        with patch.object(certificates, "resolve_addresses", return_value=["192.0.2.1", "192.0.2.2"]) as resolve, \
                patch.object(certificates, "inspect_certificate", side_effect=inspect) as inspect_mock:
            result = certificates.check_certificates(now=NOW)
        self.assertTrue(result["ok"])
        self.assertEqual(resolve.call_count, 3)
        self.assertEqual(inspect_mock.call_count, 24)
        self.assertEqual(len(result["results"]), 8)
        self.assertTrue(all(row["samples"] == 3 for row in result["results"]))

    def test_mixed_old_certificate_cannot_be_hidden_by_newer_samples(self):
        sequence = iter([90, 40, 90, 90, 90, 90])
        def inspect(host, target, address, *args):
            days = next(sequence)
            result = {"host": host, "target": target, "address": address,
                      "notAfter": str(days), "daysRemaining": days, "ok": days >= 45}
            if days < 45:
                result["error"] = "renewal-threshold"
            return result
        with patch.object(certificates, "resolve_addresses", return_value=["192.0.2.1"]), \
                patch.object(certificates, "inspect_certificate", side_effect=inspect):
            result = certificates.check_certificates(origin_only=True, now=NOW)
        self.assertFalse(result["ok"])
        self.assertEqual(len(result["results"]), 3)
        self.assertEqual(sum(row["samples"] for row in result["results"]), 6)
        self.assertEqual(sum(not row["ok"] for row in result["results"]), 1)

    def test_cloudflare_and_origin_have_different_operational_lead_windows(self):
        def inspect(host, target, address, lead, *args):
            return {"host": host, "target": target, "address": address,
                    "notAfter": "2026-10-16T00:00:00+00:00", "daysRemaining": 33,
                    "ok": 33 >= lead}
        with patch.object(certificates, "resolve_addresses", return_value=["192.0.2.1"]), \
                patch.object(certificates, "inspect_certificate", side_effect=inspect) as inspect_mock:
            result = certificates.check_certificates(repeats=1, now=NOW)
        self.assertFalse(result["ok"])
        self.assertEqual([call.args[3] for call in inspect_mock.call_args_list], [14, 45, 14, 45])
        self.assertEqual([row["ok"] for row in result["results"]], [True, False, True, False])
        self.assertEqual(result["minimumDays"], 45)
        self.assertEqual(result["edgeMinimumDays"], 14)

    def test_dns_failure_is_json_failure_and_does_not_attempt_tls(self):
        with patch.object(certificates, "resolve_addresses", side_effect=socket.gaierror("No DNS")), \
                patch.object(certificates, "inspect_certificate") as inspect:
            result = certificates.check_certificates(origin_only=True, now=NOW)
        inspect.assert_not_called()
        self.assertFalse(result["ok"])
        self.assertEqual(len(result["results"]), 2)
        self.assertTrue(all(row["error"] == "dns-resolution-failed" for row in result["results"]))

    def test_cli_failure_exit_and_origin_only_arguments(self):
        output = io.StringIO()
        with patch.object(certificates, "check_certificates", return_value={"ok": False, "results": []}) as check, \
                redirect_stdout(output):
            self.assertEqual(certificates.main(["--origin-only", "--min-days", "60", "--edge-min-days", "21", "--repeats", "5"]), 1)
        check.assert_called_once_with(certificates.ORIGIN_TARGET, True, 60, 5, 10, socket.AF_INET, 21)
        self.assertFalse(json.loads(output.getvalue())["ok"])
        with patch.object(certificates, "check_certificates", return_value={"ok": True}), redirect_stdout(io.StringIO()):
            self.assertEqual(certificates.main([]), 0)


if __name__ == "__main__":
    unittest.main()

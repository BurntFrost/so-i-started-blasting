#!/usr/bin/env python3
"""Read-only verification of public-edge and direct-origin TLS certificates."""

import argparse
from datetime import datetime, timezone
import json
import socket
import ssl


HOSTS = ("soistartedblasting.com", "www.soistartedblasting.com")
ORIGIN_TARGET = "cb08fa2577a82a5a.vercel-dns-016.com"


def resolve_addresses(target, family=socket.AF_INET):
    """Resolve the provider target on every run; never cache origin IPs in source."""
    addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(
        target, 443, family=family, type=socket.SOCK_STREAM
    )})
    if not addresses:
        raise OSError("No addresses resolved")
    return addresses


def inspect_certificate(host, target, address, min_days=45, timeout=10, now=None):
    now = now or datetime.now(timezone.utc)
    result = {"host": host, "target": target, "address": address,
              "notAfter": None, "daysRemaining": None, "ok": False}
    try:
        # A fresh verified context per connection also avoids TLS session reuse.
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        with socket.create_connection((address, 443), timeout=timeout) as connection:
            with context.wrap_socket(connection, server_hostname=host) as secured:
                certificate = secured.getpeercert()
        expiration = datetime.fromtimestamp(
            ssl.cert_time_to_seconds(certificate["notAfter"]), timezone.utc
        )
        remaining = (expiration - now).total_seconds() / 86400
        result.update(notAfter=expiration.isoformat(), daysRemaining=round(remaining, 2),
                      ok=remaining >= min_days)
        if not result["ok"]:
            result["error"] = "renewal-threshold" if remaining > 0 else "expired"
    except ssl.SSLCertVerificationError:
        # Includes untrusted chains, expired certificates, and hostname/SAN mismatch.
        result["error"] = "tls-verification-failed"
    except ssl.SSLError:
        result["error"] = "tls-handshake-failed"
    except OSError:
        result["error"] = "connection-failed"
    except (KeyError, TypeError, ValueError, OverflowError):
        result["error"] = "invalid-certificate-expiry"
    return result


def check_certificates(origin_target=ORIGIN_TARGET, origin_only=False, min_days=45,
                       repeats=3, timeout=10, family=socket.AF_INET, edge_min_days=14, now=None):
    now = now or datetime.now(timezone.utc)
    results = []
    resolved = {}
    for host in HOSTS:
        for target in ([origin_target] if origin_only else [host, origin_target]):
            if target not in resolved:
                try:
                    resolved[target] = resolve_addresses(target, family)
                except OSError:
                    resolved[target] = []
            if not resolved[target]:
                results.append({"host": host, "target": target, "address": None,
                                "notAfter": None, "daysRemaining": None,
                                "ok": False, "error": "dns-resolution-failed", "samples": 0})
                continue
            for address in resolved[target]:
                samples = {}
                for _ in range(repeats):
                    lead = min_days if target == origin_target else edge_min_days
                    result = inspect_certificate(host, target, address, lead, timeout, now)
                    key = (result["notAfter"], result.get("error"))
                    if key not in samples:
                        samples[key] = {**result, "samples": 0}
                    samples[key]["samples"] += 1
                results.extend(samples.values())
    return {"ok": bool(results) and all(result["ok"] for result in results),
            "checkedAt": now.isoformat(), "minimumDays": min_days,
            "edgeMinimumDays": edge_min_days, "repeats": repeats,
            "addressFamily": "ipv4" if family == socket.AF_INET else "ipv6" if family == socket.AF_INET6 else "any",
            "results": results}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin-target", default=ORIGIN_TARGET,
                        help="Current Vercel-recommended project DNS target")
    parser.add_argument("--origin-only", action="store_true", help="Skip Cloudflare edge checks")
    parser.add_argument("--min-days", type=float, default=45, help="Required origin validity in days (default: 45)")
    parser.add_argument("--edge-min-days", type=float, default=14, help="Required Cloudflare edge validity in days (default: 14)")
    parser.add_argument("--repeats", type=int, default=3, help="Fresh handshakes per address (1–10; default: 3)")
    parser.add_argument("--timeout", type=float, default=10, help="Seconds per connection (default: 10)")
    parser.add_argument("--family", choices=("ipv4", "ipv6", "any"), default="ipv4",
                        help="DNS address family; default ipv4 avoids assuming local IPv6 connectivity")
    args = parser.parse_args(argv)
    if not 0 <= args.min_days <= 365 or not 0 <= args.edge_min_days <= 365 or not 1 <= args.repeats <= 10 or not 0 < args.timeout <= 60:
        parser.error("Require 0–365 minimum days, 1–10 repeats, and a timeout above 0 and at most 60 seconds")
    family = {"ipv4": socket.AF_INET, "ipv6": socket.AF_INET6, "any": socket.AF_UNSPEC}[args.family]
    result = check_certificates(args.origin_target, args.origin_only, args.min_days,
                                args.repeats, args.timeout, family, args.edge_min_days)
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

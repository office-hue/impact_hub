#!/bin/bash
set -euo pipefail
# No direct hook/config write and no sibling discovery. This wrapper is not a permit.
SCRIPT_DIR="$(cd -- "$(/usr/bin/dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec /usr/bin/python3 -I -B - "$SCRIPT_DIR/install-hooks-all.sh" "$@" <<'OFFICE_DEV_TARGET_HOOK_ENTRYPOINT'
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import uuid

TARGET = "impact_hub"
SCRIPT_NAME = "install-hooks-all.sh"
LIMIT = 2097152

def snapshot(file):
    """Stable no-follow bytes from the one fixed native-account loader."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in file.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            value = os.fstat(child)
            if (value.st_uid not in {0, os.getuid()} or value.st_mode & 0o022
                    and not (value.st_uid == 0 and value.st_mode & stat.S_ISVTX)):
                os.close(child)
                raise ValueError("unsafe_loader_ancestor")
            os.close(fd)
            fd = child
        opened = os.open(file.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            before = os.fstat(opened)
            def identity(value):
                return (value.st_dev, value.st_ino, value.st_uid, value.st_mode,
                        value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
            if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                    or before.st_uid != os.getuid() or stat.S_IMODE(before.st_mode) != 0o500
                    or not 0 < before.st_size <= LIMIT):
                raise ValueError("unsafe_loader_file")
            chunks, total = [], 0
            while total <= LIMIT:
                chunk = os.read(opened, min(65536, LIMIT + 1 - total))
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
            if (total != before.st_size or identity(before) != identity(os.fstat(opened))
                    or identity(before) != identity(os.stat(file.name, dir_fd=fd, follow_symlinks=False))):
                raise ValueError("loader_changed")
            return b"".join(chunks)
        finally:
            os.close(opened)
    finally:
        os.close(fd)

def run(script, arguments):
    parser = argparse.ArgumentParser(allow_abbrev=False,
        description="Repo-only hook tranzakció. Nem telepít automatikusan; külön jóváhagyott loader/bootstrap/grant szükséges.")
    parser.add_argument("operation", choices=["prepare", "status", "apply", "recover", "rollback"])
    parser.add_argument("--transaction-id", required=True)
    parser.add_argument("--expected-launcher-digest", required=True)
    parser.add_argument("--expected-bootstrap-digest", required=True)
    for key in ("request", "expected-manifest-digest", "expected-grant-digest", "expected-quiescence-digest"):
        parser.add_argument("--" + key)
    if not arguments:
        parser.print_help()
        return 0
    args = parser.parse_args(arguments)
    dispatched = False
    try:
        seen = set()
        for value in arguments:
            if value.startswith("--"):
                key = value.split("=", 1)[0]
                if key in seen:
                    raise ValueError("duplicate_argument")
                seen.add(key)
        for key, value in vars(args).items():
            if key.endswith("_digest") and value is not None and not re.fullmatch("[0-9a-f]{64}", value):
                raise ValueError("digest_invalid")
        if str(uuid.UUID(args.transaction_id)) != args.transaction_id:
            raise ValueError("transaction_invalid")
        if args.request is not None and not Path(args.request).is_absolute():
            raise ValueError("request_must_be_absolute")
        if not sys.flags.isolated or sys.platform != "darwin" or not os.getuid() or os.getuid() != os.geteuid():
            raise ValueError("native_runtime_required")
        home = Path(pwd.getpwuid(os.getuid()).pw_dir)
        if home.resolve(strict=True) != home or home.stat().st_uid != os.getuid():
            raise ValueError("native_home_invalid")
        if os.environ.get("HOME", str(home)) != str(home) or any(
                key.startswith(("GIT_", "LD_", "DYLD_", "OFFICE_DEV_")) or
                key in {"PYTHONPATH", "PYTHONHOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "CODEX_HOME"}
                for key in os.environ):
            raise ValueError("environment_override")
        script = Path(script)
        if (not script.is_absolute() or script.is_symlink() or script.resolve(strict=True) != script
                or script.name != SCRIPT_NAME or script.parent.name != "scripts"):
            raise ValueError("script_identity_invalid")
        repo = script.parent.parent
        loader = home / "Library/Application Support/office-dev/bin/dev-v4-target-hooks"
        raw = snapshot(loader)
        if hashlib.sha256(raw).hexdigest() != args.expected_launcher_digest:
            raise ValueError("launcher_digest_mismatch")
        forwarded = [str(loader), args.operation, "--expected-target", TARGET,
                     "--expected-repo", str(repo)]
        for key, value in vars(args).items():
            if key not in {"operation", "expected_launcher_digest"} and value is not None:
                forwarded.extend(["--" + key.replace("_", "-"), value])
        sys.argv = forwarded
        namespace = {"__file__": str(loader), "__name__": "__main__"}
        dispatched = True
        exec(compile(raw, str(loader), "exec"), namespace)
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(json.dumps({"schemaVersion": 1, "state": "unverified",
            "reasonCode": "hook_entrypoint_unverified", "authorityGranted": False,
            "writes": None if dispatched else False, "recoveryRequired": dispatched,
            "nextAction": "status" if dispatched else "diagnose_inputs"}))
        return 2

if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1], sys.argv[2:]))
OFFICE_DEV_TARGET_HOOK_ENTRYPOINT

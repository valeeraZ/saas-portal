"""Run an isolated local deployment drill. Invoke with the Auth virtualenv Python."""

import argparse
import json
import os
import secrets
import shutil
import signal
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path


def read_env(path):
    return dict(
        line.split("=", 1)
        for line in path.read_text().splitlines()
        if line and not line.startswith("#")
    )


def save_env(path, values):
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
    path.chmod(0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", type=Path, required=True)
    parser.add_argument("--admin", type=Path, required=True)
    parser.add_argument(
        "--consumer",
        type=Path,
        required=True,
        help="Packed-SDK tenant Next.js consumer directory",
    )
    parser.add_argument("--chromium", type=Path)
    args = parser.parse_args()
    import yaml

    source = Path(__file__).resolve().parents[1]
    auth = args.auth.resolve()
    admin_source = args.admin.resolve()
    consumer = args.consumer.resolve()
    python = auth / ".venv/bin/python"
    for path in [
        python,
        source / "node_modules",
        admin_source / "node_modules",
        consumer / "next-reports/package-lock.json",
        consumer / "next-metrics/package-lock.json",
    ]:
        if not path.exists():
            raise SystemExit(f"Missing prerequisite: {path}")
    docker_host = (
        None if os.environ.get("DOCKER_CONTEXT") else os.environ.get("DOCKER_HOST")
    )
    if not docker_host:
        docker_host = subprocess.check_output(
            ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
            text=True,
        ).strip()
    if not docker_host.startswith("unix://"):
        raise SystemExit("Local rollout requires a local Docker Unix socket")
    subprocess.run(["docker", "info"], check=True, stdout=subprocess.DEVNULL)
    work = Path(tempfile.mkdtemp(prefix="saas-local-rollout-")).resolve()
    work.chmod(0o700)
    portal = work / "portal"
    admin = work / "admin"
    project = "saas-saa7-" + secrets.token_hex(5)
    used = set()

    def port():
        while True:
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                selected = listener.getsockname()[1]
            if selected not in used:
                used.add(selected)
                return selected

    ports = dict(
        zip(
            ["database", "keycloak", "auth", "admin", "portal", "example", "smtp"],
            [port() for _ in range(7)],
        )
    )
    replacements = {
        "55434": ports["database"],
        "59443": ports["keycloak"],
        "59000": ports["auth"],
        "59100": ports["admin"],
        "58999": ports["portal"],
        "59200": ports["example"],
        "59025": ports["smtp"],
    }

    def urls(value):
        for old, new in replacements.items():
            value = value.replace(":" + old, ":" + str(new))
        return value

    log = (work / "execution.log").open("w")
    children = []
    started_compose = False
    results = {
        "project": project,
        "ports": ports,
        "status": "running",
        "productionDeployment": False,
        "checks": [],
    }
    results["sourceRevisions"] = {
        name: subprocess.check_output(
            ["git", "-C", str(path), "rev-parse", "HEAD"], text=True
        ).strip()
        for name, path in [("portal", source), ("admin", admin_source), ("auth", auth)]
    }
    print(f"Isolated local rollout: {work}", flush=True)

    def run(command, cwd=portal, env=None, timeout=600):
        child = subprocess.Popen(
            command, cwd=cwd, env=env, stdout=log, stderr=log, start_new_session=True
        )
        try:
            code = child.wait(timeout=timeout)
            if code:
                raise subprocess.CalledProcessError(code, command)
        finally:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            if child.poll() is None:
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()

    def start(command, cwd, env):
        child = subprocess.Popen(
            command, cwd=cwd, env=env, stdout=log, stderr=log, start_new_session=True
        )
        children.append(child)
        return child

    def wait(url, child=None, context=None):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if child and child.poll() is not None:
                raise RuntimeError("Local service exited before readiness")
            try:
                with urllib.request.urlopen(
                    url, timeout=2, context=context
                ) as response:
                    if response.status == 200:
                        return
            except OSError:
                time.sleep(0.5)
        raise RuntimeError("Local service readiness timeout")

    compose = [
        "docker",
        "compose",
        "-p",
        project,
        "--env-file",
        str(portal / ".local/auth-config/.env"),
        "-f",
        str(portal / "integration/compose.yaml"),
    ]
    try:
        for src, dst in [(source, portal), (admin_source, admin)]:
            shutil.copytree(
                src,
                dst,
                symlinks=True,
                ignore=shutil.ignore_patterns(
                    ".git",
                    ".agents",
                    ".codex",
                    ".aws",
                    ".local",
                    ".env*",
                    ".next",
                    ".venv",
                    "__pycache__",
                    "*.tsbuildinfo",
                    "*.log",
                ),
            )
        base = os.environ.copy()
        base.update(
            AUTH_SOURCE=str(auth),
            ADMIN_SOURCE=str(admin),
            PORTAL_SOURCE=str(portal),
            SAAS_TENANT_CONSUMER=str(consumer),
            NEXT_TELEMETRY_DISABLED="1",
        )
        if args.chromium:
            base["PORTAL_CHROMIUM"] = str(args.chromium.resolve())
        run([str(python), "integration/prepare.py"], env=base)
        realm = portal / ".local/auth-config/.local/saas-local-realm.json"
        realm.write_text(urls(realm.read_text()))
        data = json.loads(realm.read_text())
        data["smtpServer"]["port"] = str(ports["smtp"])
        realm.write_text(json.dumps(data, indent=2) + "\n")
        for path in [portal / ".env.local", portal / ".local/auth.env"]:
            values = read_env(path)
            values = {
                key: urls(value) if "://" in value else value
                for key, value in values.items()
            }
            if path.name == "auth.env":
                values["SAAS_AUTH_PORT"] = str(ports["auth"])
                values["SAAS_SMTP_PORT"] = str(ports["smtp"])
            save_env(path, values)
        config = yaml.safe_load((portal / "integration/compose.yaml").read_text())
        results["images"] = {
            name: service["image"] for name, service in config["services"].items()
        }
        config["services"]["db"]["ports"] = [f"127.0.0.1:{ports['database']}:5432"]
        config["services"]["keycloak"]["ports"] = [
            f"127.0.0.1:{ports['keycloak']}:8443"
        ]
        config["services"]["keycloak"]["command"] = [
            urls(value) for value in config["services"]["keycloak"]["command"]
        ]
        (portal / "integration/compose.yaml").write_text(yaml.safe_dump(config))
        started_compose = True
        run(compose + ["up", "-d", "--wait"], timeout=180)
        base["NODE_EXTRA_CA_CERTS"] = str(portal / ".local/auth-config/.local/tls.crt")
        base["KEYCLOAK_TEST_CONTAINER"] = project + "-keycloak-1"
        context = ssl.create_default_context(cafile=base["NODE_EXTRA_CA_CERTS"])
        wait(
            f"https://127.0.0.1:{ports['keycloak']}/realms/saas-local/.well-known/openid-configuration",
            context=context,
        )
        run(["python3", "integration/run.py", "migrate"], env=base)
        run([str(python), "integration/prepare.py"], cwd=admin, env=base)
        values = read_env(admin / ".env.local")
        values = {
            key: urls(value) if "://" in value else value
            for key, value in values.items()
        }
        values["PORT"] = str(ports["admin"])
        save_env(admin / ".env.local", values)
        run([str(python), "integration/prepare-proxy.py"], env=base)
        example = read_env(portal / ".local/example.env")
        example = {
            key: urls(value) if "://" in value else value
            for key, value in example.items()
        }
        example["EXAMPLE_PORT"] = str(ports["example"])
        save_env(portal / ".local/example.env", example)
        values = read_env(portal / ".env.local")
        values = {
            key: urls(value) if "://" in value else value
            for key, value in values.items()
        }
        for key in [
            "PORTAL_ALLOWED_APP_ORIGINS",
            "PORTAL_NEXT_APP_ORIGINS",
            "PORTAL_APP_ASSETS",
        ]:
            values.pop(key, None)
        values.update(
            PORTAL_REGISTRY_MODE="admin",
            PORT=str(ports["portal"]),
            EXAMPLE_ORIGIN=f"http://127.0.0.1:{ports['example']}",
            PORTAL_APP_EGRESS_ORIGINS=f"http://127.0.0.1:{ports['example']}",
        )
        save_env(portal / ".env.local", values)
        print("Migrating Admin before publishing API and Portal", flush=True)
        run(
            ["node", "--env-file=.env.local", "src/cli.ts", "migrate"],
            cwd=admin,
            env=base,
        )
        results["checks"].append("Admin migration and retry before API publication")
        # Re-running migrations proves the operational retry path is safe.
        run(
            ["node", "--env-file=.env.local", "src/cli.ts", "migrate"],
            cwd=admin,
            env=base,
        )
        results["checks"].append("Repeated Admin migration succeeded")
        auth_child = start(["python3", "integration/run.py", "auth"], portal, base)
        wait(f"http://127.0.0.1:{ports['auth']}/health/ready", auth_child)
        start(
            [str(python), "integration/mailpit.py"],
            portal,
            {**base, "PORTAL_TEST_SMTP_PORT": str(ports["smtp"])},
        )
        admin_child = start(
            ["node", "--env-file=.env.local", "src/server.ts"], admin, base
        )
        wait(f"http://127.0.0.1:{ports['admin']}/health/ready", admin_child)
        start(
            ["node", "--env-file=.local/example.env", "integration/example-app.ts"],
            portal,
            base,
        )
        run(["npm", "run", "build"], env=base)
        print(
            "Testing legacy cutover, live Next.js releases, resource expiry and rollback",
            flush=True,
        )
        run(["node", "integration/rollout.test.ts"], env=base, timeout=900)
        results["checks"].append(
            "Real login, legacy cutover, existing sessions/data, Next release/retention and explicit rollback"
        )
        print("Running real Keycloak/Registry regression after rollout", flush=True)
        portal_child = start(["python3", "integration/run.py", "portal"], portal, base)
        wait(values["PORTAL_ORIGIN"], portal_child, context)
        run(["npm", "run", "test:keycloak-registry"], env=base, timeout=300)
        results["checks"].append(
            "Post-rollout real Keycloak/Registry authorization and dependency failures"
        )
        results["status"] = "passed"
        print(
            "PASS local rollout, rollback, real Next.js and real Keycloak regression",
            flush=True,
        )
    except BaseException:
        results["status"] = "failed"
        print(
            f"Rollout failed. Inspect the private log: {work / 'execution.log'}",
            flush=True,
        )
        raise
    finally:
        for child in reversed(children):
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
        cleanup = True
        if started_compose:
            cleanup = (
                subprocess.run(
                    compose + ["down", "--volumes"],
                    cwd=portal,
                    stdout=log,
                    stderr=log,
                    check=False,
                ).returncode
                == 0
            )
        results["cleanupSucceeded"] = cleanup
        if not cleanup:
            results["status"] = "cleanup_failed"
        (work / "result.json").write_text(json.dumps(results, indent=2) + "\n")
        log.close()
        print(
            f"Result: {work / 'result.json'}; private evidence/configuration retained locally",
            flush=True,
        )
        if not cleanup:
            raise RuntimeError("Local rollout resource cleanup failed")


if __name__ == "__main__":
    # Ctrl-C still runs cleanup; SIGTERM follows the same path.
    def interrupted(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupted)
    main()

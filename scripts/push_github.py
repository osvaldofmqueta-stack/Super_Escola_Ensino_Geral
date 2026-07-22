#!/usr/bin/env python3
"""
push_github.py — Envia o projecto para múltiplos repositórios GitHub em paralelo.
Auto-instala dependências, tem retry automático e timeouts.

Uso:
    python3 scripts/push_github.py
    GITHUB_PAT=ghp_xxx python3 scripts/push_github.py
"""
import os, sys, shutil, subprocess, threading, time
from pathlib import Path
from datetime import datetime, timezone

# ── Auto-instalação do dulwich ───────────────────────────────────────────────
def _ensure_dulwich():
    try:
        import dulwich  # noqa: F401
        return True
    except ImportError:
        pass
    print("[setup] dulwich não encontrado — a instalar…", flush=True)
    for attempt in range(3):
        r = subprocess.run(
            [sys.executable, "-m", "pip", "install", "dulwich", "--quiet", "--disable-pip-version-check"],
            capture_output=True, text=True,
        )
        if r.returncode == 0:
            print("[setup] dulwich instalado com sucesso.", flush=True)
            return True
        print(f"[setup] tentativa {attempt+1}/3 falhou: {r.stderr.strip()}", flush=True)
        time.sleep(2)
    print("[setup] ❌ Não foi possível instalar dulwich. Verifica a ligação à internet.", flush=True)
    return False

if not _ensure_dulwich():
    sys.exit(1)

# ── Configuração ─────────────────────────────────────────────────────────────
TOKEN = os.environ.get("GITHUB_PAT", "")
REPOS = [
    "https://github.com/osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar.git",
    "https://github.com/osvaldofmqueta-stack/Super_Escola_Ensino_Geral.git",
]
SRC = Path(__file__).resolve().parent.parent   # raiz do projecto

EXCLUDE_PREFIXES = (
    "backups/",
    "tmp/",
    ".git/",
    ".local/",
    "node_modules/",
)

PUSH_TIMEOUT_SEC  = 120   # máximo por push
MAX_PUSH_RETRIES  = 3     # tentativas por repositório
RETRY_DELAY_SEC   = 5     # pausa entre tentativas
# ─────────────────────────────────────────────────────────────────────────────


def log(prefix: str, msg: str):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {prefix} {msg}", flush=True)


def get_tracked_files() -> list[str]:
    """Lista ficheiros rastreados pelo git, excluindo pastas desnecessárias."""
    result = subprocess.run(
        ["git", "--no-optional-locks", "ls-files"],
        capture_output=True, text=True, cwd=str(SRC), timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git ls-files falhou: {result.stderr.strip()}")
    return [
        l for l in result.stdout.splitlines()
        if l.strip() and not any(l.startswith(p) for p in EXCLUDE_PREFIXES)
    ]


def build_fresh_repo(fresh_path: Path, tracked: list[str]) -> tuple[str, int]:
    """Cria um repositório dulwich limpo com todos os ficheiros tracked."""
    from dulwich.repo import Repo
    from dulwich import porcelain

    if fresh_path.exists():
        shutil.rmtree(fresh_path)
    fresh_path.mkdir(parents=True)
    Repo.init(str(fresh_path))

    copied = 0
    failed = []
    for rel in tracked:
        src_f = SRC / rel
        dst_f = fresh_path / rel
        if not src_f.exists():
            continue
        dst_f.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(str(src_f), str(dst_f))
            copied += 1
        except Exception as e:
            failed.append(f"{rel}: {e}")

    if failed:
        log("⚠", f"{len(failed)} ficheiros não copiados (sem acesso de leitura — ignorados)")

    paths_to_add = [str(fresh_path / r) for r in tracked if (fresh_path / r).exists()]
    porcelain.add(str(fresh_path), paths=paths_to_add)

    ts_label = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    commit_sha = porcelain.commit(
        str(fresh_path),
        message=f"SIGA v3 Super Escola - {ts_label}".encode(),
        author=b"Super Escola Deploy <deploy@superescola.ao>",
        committer=b"Super Escola Deploy <deploy@superescola.ao>",
    )
    sha = commit_sha.decode() if isinstance(commit_sha, bytes) else str(commit_sha)
    return sha[:12], copied


def push_to_repo_once(fresh_path: Path, remote_url: str) -> None:
    """Tenta um único push (levanta excepção em caso de falha)."""
    from dulwich import porcelain
    from dulwich.repo import Repo

    repo = Repo(str(fresh_path))
    symrefs = repo.refs.get_symrefs()
    local_branch = symrefs.get(b"HEAD", b"refs/heads/main")
    refspec = local_branch + b":refs/heads/main"
    porcelain.push(
        str(fresh_path),
        remote_location=remote_url,
        refspecs=[refspec],
        force=True,
    )


def push_with_retry(fresh_path: Path, remote_url: str, label: str, results: dict) -> None:
    """Push com retry automático e timeout por tentativa."""
    display = remote_url.split("@")[-1] if "@" in remote_url else remote_url
    log(label, f"A enviar para {display}…")

    last_error = None
    for attempt in range(1, MAX_PUSH_RETRIES + 1):
        exc_holder: list = []

        def _do_push():
            try:
                push_to_repo_once(fresh_path, remote_url)
            except Exception as e:
                exc_holder.append(e)

        t = threading.Thread(target=_do_push, daemon=True)
        t.start()
        t.join(timeout=PUSH_TIMEOUT_SEC)

        if t.is_alive():
            last_error = f"timeout após {PUSH_TIMEOUT_SEC}s"
            log(label, f"⚠ tentativa {attempt}/{MAX_PUSH_RETRIES} — {last_error}")
            if attempt < MAX_PUSH_RETRIES:
                time.sleep(RETRY_DELAY_SEC)
            continue

        if exc_holder:
            last_error = str(exc_holder[0])
            log(label, f"⚠ tentativa {attempt}/{MAX_PUSH_RETRIES} — {last_error}")
            if attempt < MAX_PUSH_RETRIES:
                log(label, f"  ↳ nova tentativa em {RETRY_DELAY_SEC}s…")
                time.sleep(RETRY_DELAY_SEC)
            continue

        # Sucesso
        results[label] = "OK"
        log(label, "✅ Push concluído!")
        return

    results[label] = f"ERRO após {MAX_PUSH_RETRIES} tentativas: {last_error}"
    log(label, f"❌ {results[label]}")


def validate_token(token: str) -> bool:
    """Verifica se o token tem o formato esperado e não está vazio."""
    if not token:
        return False
    if len(token) < 10:
        return False
    return True


def main():
    # ── Pré-requisitos ───────────────────────────────────────────────────────
    if not validate_token(TOKEN):
        print("❌ ERRO: variável GITHUB_PAT não definida ou inválida.")
        print("   Define-a em Replit → Secrets → GITHUB_PAT")
        sys.exit(1)

    # Verificar git disponível
    if not shutil.which("git"):
        print("❌ ERRO: git não encontrado no PATH.")
        sys.exit(1)

    print("=" * 60)
    print("  SIGA v3 — Push para GitHub")
    print("=" * 60)

    # ── Ficheiros ────────────────────────────────────────────────────────────
    log("→", "A obter lista de ficheiros tracked…")
    try:
        tracked = get_tracked_files()
    except Exception as e:
        print(f"❌ Erro ao listar ficheiros: {e}")
        sys.exit(1)
    log("→", f"{len(tracked)} ficheiros a incluir (excluindo backups/, node_modules/, etc.)")

    # ── Snapshot ─────────────────────────────────────────────────────────────
    fresh_path = Path("/tmp/siga_push_fresh")
    log("→", "A construir snapshot do projecto…")
    try:
        sha, copied = build_fresh_repo(fresh_path, tracked)
    except Exception as e:
        print(f"❌ Erro ao construir snapshot: {e}")
        sys.exit(1)
    log("→", f"Snapshot pronto — {copied} ficheiros, commit {sha}")

    # ── Push paralelo ────────────────────────────────────────────────────────
    labeled = []
    for r in REPOS:
        label = r.rstrip("/").split("/")[-1].replace(".git", "")
        url_auth = "https://x-access-token:" + TOKEN + "@" + r.replace("https://", "")
        labeled.append((label, url_auth))

    print()
    log("→", f"A lançar push para {len(labeled)} repositórios em paralelo…")
    print()

    results: dict = {}
    threads = []
    for label, url_auth in labeled:
        t = threading.Thread(
            target=push_with_retry,
            args=(fresh_path, url_auth, label, results),
            daemon=True,
        )
        threads.append(t)
        t.start()

    # Aguardar todas as threads (com margem total)
    total_timeout = PUSH_TIMEOUT_SEC * MAX_PUSH_RETRIES + 10
    deadline = time.time() + total_timeout
    for t in threads:
        remaining = deadline - time.time()
        if remaining > 0:
            t.join(timeout=remaining)

    # ── Resultado ────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  Resultado final")
    print("=" * 60)
    all_ok = True
    for label, _ in labeled:
        status = results.get(label, "sem resposta (timeout global)")
        icon = "✅" if status == "OK" else "❌"
        display_url = next((r for r in REPOS if label in r), "?")
        print(f"  {icon}  {label}")
        print(f"       {display_url}")
        if status != "OK":
            print(f"       {status}")
            all_ok = False
    print("=" * 60)

    if not all_ok:
        print()
        print("  ⚠  Um ou mais pushes falharam.")
        print("  Verifica: ligação à internet, validade do GITHUB_PAT,")
        print("  e permissões de escrita nos repositórios.")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()

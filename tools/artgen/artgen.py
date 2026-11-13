#!/usr/bin/env python3
"""Paid image generation for the art bake-off, behind a call ledger.

Every paid request goes through send_paid(). It writes an entry to art/ledger.json before the
request leaves, and refuses once the provider's count reaches its ceiling. A failed request still
counts. Keys come from environment variables and are never printed or stored.

  artgen.py price  --provider fal
  artgen.py gen    --provider fal --purpose idle [--dry-run]
  artgen.py ledger
"""

import argparse
import base64
import fcntl
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import assets
import prompts
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art"
LEDGER = ART / "ledger.json"
CAND = ART / "candidates"

# Ceilings. LIFETIME is the owner's total. ALLOWED is what has been released so far and is raised
# by hand when the next phase is released.
LIFETIME = {"fal": 80, "gemini": 100, "openai": 60}
ALLOWED = {"fal": 72, "gemini": 20, "openai": 20}

# Unit price limits per call, in USD.
MAX_UNIT_PRICE = {"fal": 0.05, "gemini": 0.04, "openai": 0.065}

CONFIG = {
    "fal": {
        "model": "bytedance/seedream/v5.5/edit",
        "key_env": "FAL_API_KEY",
        "knight_size": (1024, 1024),
        "backdrop_size": (1280, 800),
    },
    "gemini": {
        "model": "gemini-3.1-flash-lite-image",
        "key_env": "GEMINI_API_KEY",
        "knight_aspect": "1:1",
        "backdrop_aspect": "3:2",
        "image_size": "1K",
        # From the provider's pricing page: $30 per million output image tokens, about $0.0336
        # for a 1K image, and $0.25 per million input tokens (a reference image is a few
        # hundred).
        "price_note": (
            "ai.google.dev/gemini-api/docs/pricing: $0.0336 per 1K image plus input tokens"
        ),
        "est_price": 0.036,
    },
    "openai": {
        "model": "gpt-image-2",
        "key_env": "OPENAI_API_KEY",
        "quality": "medium",
        "knight_size": "1024x1024",
        "backdrop_size": "1536x1024",
        # From the image generation guide: medium is $0.053 at 1024x1024 and $0.041 at 1536x1024
        # for output; reference images add input tokens at $8 per million.
        "price_note": (
            "developers.openai.com image generation guide: medium $0.053 at 1024x1024, "
            "$0.041 at 1536x1024, output only"
        ),
        "est_price": 0.062,
    },
}

PURPOSES = [*prompts.STATES, "backdrop", *assets.REGISTRY]


class Refusal(Exception):
    pass


def redact(text: str) -> str:
    for cfg in CONFIG.values():
        key = os.environ.get(cfg["key_env"], "")
        if key and key in text:
            text = text.replace(key, "[key]")
    return text


# ---------------------------------------------------------------- ledger and the one paid path


def _read_ledger() -> list:
    if not LEDGER.exists():
        return []
    return json.loads(LEDGER.read_text())


def _write_ledger(entries: list) -> None:
    tmp = LEDGER.with_suffix(".tmp")
    tmp.write_text(json.dumps(entries, indent=1))
    os.replace(tmp, LEDGER)


def counts() -> dict:
    out = {p: 0 for p in LIFETIME}
    for e in _read_ledger():
        out[e["provider"]] = out.get(e["provider"], 0) + 1
    return out


def reserve(provider: str, model: str, purpose: str) -> str:
    """Add the ledger entry and write it. Refuse when the provider is at its ceiling."""
    CAND.mkdir(parents=True, exist_ok=True)
    lock = CAND / ".ledger.lock"
    with open(lock, "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        entries = _read_ledger()
        used = sum(1 for e in entries if e["provider"] == provider)
        ceiling = min(ALLOWED[provider], LIFETIME[provider])
        if used >= ceiling:
            raise Refusal(f"{provider}: {used} calls made, ceiling {ceiling}; refusing")
        entry_id = uuid.uuid4().hex[:8]
        entries.append(
            {
                "id": entry_id,
                "provider": provider,
                "model": model,
                "purpose": purpose,
                "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "sent",
            }
        )
        _write_ledger(entries)
        return entry_id


def settle(entry_id: str, status: str, note: str = "") -> None:
    with open(CAND / ".ledger.lock", "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        entries = _read_ledger()
        for e in entries:
            if e["id"] == entry_id:
                e["status"] = status
                if note:
                    e["note"] = redact(note)[:300]
        _write_ledger(entries)


def send_paid(provider: str, model: str, purpose: str, do_request):
    """The only function that spends money. do_request() performs the HTTP call."""
    entry_id = reserve(provider, model, purpose)
    try:
        result = do_request()
    except BaseException as exc:  # a failed request still counts
        settle(entry_id, "failed", f"{type(exc).__name__}: {exc}")
        raise
    settle(entry_id, "ok")
    return result


# ---------------------------------------------------------------- HTTP


def http(
    url: str, data: bytes | None = None, headers: dict | None = None, timeout: int = 400
) -> bytes:
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(
            redact(f"HTTP {err.code} from {urllib.parse.urlparse(url).netloc}: {body}")
        ) from None
    except urllib.error.URLError as err:
        raise RuntimeError(redact(f"request failed: {err.reason}")) from None


def need_key(provider: str) -> str:
    key = os.environ.get(CONFIG[provider]["key_env"], "")
    if not key:
        sys.exit(f"{CONFIG[provider]['key_env']} is not set; run through tools/artgen/local-env.sh")
    return key


def fal_unit_price(model: str) -> dict:
    """Free lookup of the current fal price for an endpoint. Cached for ten minutes, and retried
    when the pricing endpoint rate-limits, so a burst of calls does not trip it."""
    cache = CAND / ".price-cache.json"
    try:
        c = json.loads(cache.read_text())
        if c["model"] == model and time.time() - c["at"] < 600:
            return c["price"]
    except (OSError, ValueError, KeyError):
        pass
    key = need_key("fal")
    url = "https://api.fal.ai/v1/models/pricing?endpoint_id=" + urllib.parse.quote(model)
    for attempt in range(8):
        try:
            data = json.loads(http(url, headers={"Authorization": "Key " + key}, timeout=60))
            break
        except RuntimeError as exc:
            if "429" not in str(exc) or attempt == 7:
                raise
            time.sleep(3 + attempt * 3)
    prices = data.get("prices") or []
    if not prices:
        raise Refusal(f"fal: no price found for {model}")
    CAND.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"model": model, "at": time.time(), "price": prices[0]}))
    return prices[0]


# ---------------------------------------------------------------- reference images


def png_bytes(path: Path, max_side: int | None = None) -> bytes:
    img = Image.open(path).convert("RGB")
    if max_side and max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def raw_attempts(provider: str, purpose: str) -> list:
    """Raw files for exactly this purpose, oldest first (idle-2 is not idle-bare-1)."""
    pat = re.compile(rf"^{re.escape(purpose)}-(\d+)$")
    found = [
        (int(m.group(1)), p)
        for p in (CAND / provider / "raw").glob("*.*")
        if (m := pat.match(p.stem))
    ]
    return [p for _, p in sorted(found)]


def latest_raw(provider: str, purpose: str):
    files = raw_attempts(provider, purpose)
    return files[-1] if files else None


def references(provider: str, purpose: str, dry: bool = False) -> list:
    """Reference images as PNG bytes, most important first."""
    if purpose in assets.REGISTRY:
        return references2(purpose)
    code = CAND / "_refs" / "code-reference.png"
    if not code.exists():
        sys.exit("missing art/candidates/_refs/code-reference.png; run process.py refs first")
    if purpose == "backdrop":
        # only the edit endpoints that insist on an input image get the scenery-only style sheet
        style = CAND / "_refs" / "smithy-style.png"
        return [png_bytes(style)] if provider == "fal" and style.exists() else []
    refs = []
    if purpose != "idle":
        idle = latest_raw(provider, "idle")
        if idle is None and dry:
            refs.append(b"")
        elif idle is None:
            sys.exit(f"make the idle reference sheet for {provider} first")
        else:
            refs.append(png_bytes(idle, 512))
    refs.append(png_bytes(code))
    return refs


def references2(purpose: str) -> list:
    """Phase 2 (fal only): the phase 1 idle image is the one identity reference."""
    kind = assets.REGISTRY[purpose][0]
    code = CAND / "_refs" / "code-reference.png"
    smithy = CAND / "fal" / "processed" / "backdrop-smithy.png"
    idle = CAND / "fal" / "raw" / "idle-1.png"
    if kind in ("knight", "bed"):
        return [png_bytes(idle, 512), png_bytes(code)]
    return [png_bytes(smithy)]


# ---------------------------------------------------------------- providers


def build_request(provider: str, purpose: str, dry: bool = False) -> dict:
    cfg = CONFIG[provider]
    backdrop = purpose == "backdrop"
    refs = references(provider, purpose, dry)
    if purpose in assets.REGISTRY:
        prompt = assets.prompt_for(purpose)
    elif backdrop:
        prompt = (prompts.BACKDROP_REF_NOTE if refs else "") + prompts.BACKDROP
    else:
        prompt = prompts.knight_prompt(purpose, purpose != "idle")
    if provider == "fal":
        if purpose in assets.REGISTRY:
            size = assets.REGISTRY[purpose][1]
        else:
            w, h = cfg["backdrop_size"] if backdrop else cfg["knight_size"]
            size = f"{w}x{h}"
    elif provider == "gemini":
        size = (
            f"{cfg['backdrop_aspect'] if backdrop else cfg['knight_aspect']} at {cfg['image_size']}"
        )
    else:
        size = cfg["backdrop_size"] if backdrop else cfg["knight_size"]
    return {
        "provider": provider,
        "model": cfg["model"],
        "purpose": purpose,
        "size": size,
        "refs": refs,
        "prompt": prompt,
    }


def run_fal(req: dict) -> bytes:
    key = need_key("fal")
    w, h = (int(v) for v in req["size"].split("x"))
    body = {
        "prompt": req["prompt"],
        "image_urls": [
            "data:image/png;base64," + base64.b64encode(r).decode() for r in req["refs"]
        ],
        "image_size": {"width": w, "height": h},
        "num_images": 1,
        "output_format": "png",
    }
    if not req["refs"]:
        body.pop("image_urls")
    raw = http(
        "https://fal.run/" + req["model"],
        json.dumps(body).encode(),
        {"Authorization": "Key " + key, "Content-Type": "application/json"},
    )
    url = json.loads(raw)["images"][0]["url"]
    return http(url, timeout=120)


def run_gemini(req: dict) -> bytes:
    key = need_key("gemini")
    cfg = CONFIG["gemini"]
    aspect = req["size"].split(" ")[0]
    parts = [{"text": req["prompt"]}]
    for r in req["refs"]:
        parts.append(
            {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(r).decode()}}
        )
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect, "imageSize": cfg["image_size"]},
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{req['model']}:generateContent"
    raw = http(
        url, json.dumps(body).encode(), {"x-goog-api-key": key, "Content-Type": "application/json"}
    )
    for cand in json.loads(raw).get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            blob = part.get("inlineData") or part.get("inline_data")
            if blob:
                return base64.b64decode(blob["data"])
    raise RuntimeError("no image in the response")


def run_openai(req: dict) -> bytes:
    key = need_key("openai")
    cfg = CONFIG["openai"]
    if cfg["quality"] not in ("low", "medium"):
        raise Refusal("openai: quality above medium is not allowed")
    auth = {"Authorization": "Bearer " + key}
    if not req["refs"]:
        body = {
            "model": req["model"],
            "prompt": req["prompt"],
            "size": req["size"],
            "quality": cfg["quality"],
            "n": 1,
        }
        raw = http(
            "https://api.openai.com/v1/images/generations",
            json.dumps(body).encode(),
            {**auth, "Content-Type": "application/json"},
        )
    else:
        boundary = "----artgen" + uuid.uuid4().hex
        out = io.BytesIO()

        def field(name, value):
            out.write(
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'
                ).encode()
            )

        for name, value in (
            ("model", req["model"]),
            ("prompt", req["prompt"]),
            ("size", req["size"]),
            ("quality", cfg["quality"]),
            ("n", "1"),
        ):
            field(name, value)
        for i, r in enumerate(req["refs"]):
            out.write(
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; '
                    f'filename="ref{i}.png"\r\nContent-Type: image/png\r\n\r\n'
                ).encode()
            )
            out.write(r)
            out.write(b"\r\n")
        out.write(f"--{boundary}--\r\n".encode())
        raw = http(
            "https://api.openai.com/v1/images/edits",
            out.getvalue(),
            {**auth, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
    data = json.loads(raw)
    if "usage" in data:
        print("usage:", json.dumps(data["usage"]))
    return base64.b64decode(data["data"][0]["b64_json"])


RUNNERS = {"fal": run_fal, "gemini": run_gemini, "openai": run_openai}


def cmd_gen(args) -> int:
    provider, purpose = args.provider, args.purpose
    if purpose in assets.REGISTRY and provider != "fal":
        raise Refusal("phase 2 assets are made on fal only")
    req = build_request(provider, purpose, args.dry_run)
    print(
        f"provider={provider} model={req['model']} size={req['size']} purpose={purpose} "
        f"refs={len(req['refs'])} prompt_chars={len(req['prompt'])}"
    )
    if args.dry_run:
        print("dry run: nothing sent, nothing counted")
        print(req["prompt"])
        return 0
    if provider == "fal":  # free lookup, checked before any ledger entry
        price = fal_unit_price(req["model"])
        print("fal price:", json.dumps(price))
        if price["unit_price"] > MAX_UNIT_PRICE["fal"] or price["unit"] not in ("images", "units"):
            raise Refusal(f"fal: price {price} is not confirmed under ${MAX_UNIT_PRICE['fal']}")
    elif CONFIG[provider]["est_price"] > MAX_UNIT_PRICE[provider]:
        raise Refusal(f"{provider}: estimated unit price over the limit")
    try:
        blob = send_paid(provider, req["model"], purpose, lambda: RUNNERS[provider](req))
    except Refusal:
        raise
    except Exception as exc:  # noqa: BLE001 - any failure is reported, and the call still counts
        print("request failed (still counted):", redact(str(exc)), file=sys.stderr)
        return 3
    img = Image.open(io.BytesIO(blob))
    ext = "png" if img.format == "PNG" else "jpg"
    d = CAND / provider / "raw"
    d.mkdir(parents=True, exist_ok=True)
    n = 1 + max([int(p.stem.rsplit("-", 1)[1]) for p in raw_attempts(provider, purpose)] or [0])
    out = d / f"{purpose}-{n}.{ext}"
    out.write_bytes(blob)
    print(f"saved {out.relative_to(ROOT)} ({img.size[0]}x{img.size[1]})")
    return 0


def cmd_ledger(_args) -> int:
    c = counts()
    for p in LIFETIME:
        print(f"{p}: {c.get(p, 0)} calls (released {ALLOWED[p]}, lifetime {LIFETIME[p]})")
    return 0


def cmd_price(args) -> int:
    if args.provider == "fal":
        print(json.dumps(fal_unit_price(CONFIG["fal"]["model"])))
    else:
        print(CONFIG[args.provider]["price_note"])
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gen")
    g.add_argument("--provider", choices=list(CONFIG), required=True)
    g.add_argument("--purpose", choices=PURPOSES, required=True)
    g.add_argument("--dry-run", action="store_true")
    g.set_defaults(fn=cmd_gen)
    p = sub.add_parser("price")
    p.add_argument("--provider", choices=list(CONFIG), required=True)
    p.set_defaults(fn=cmd_price)
    sub.add_parser("ledger").set_defaults(fn=cmd_ledger)
    args = ap.parse_args()
    try:
        return args.fn(args)
    except Refusal as exc:
        print("refused:", exc, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

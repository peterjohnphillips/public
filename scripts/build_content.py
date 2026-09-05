"""Parse the content/ tree into a single JSON blob the static frontend embeds.

This is the browser build's substitute for the FastAPI content loader: it runs
the exact same parser (`backend/app/content`), so the single-file GitHub Pages
build reads identical structures to the local full-stack app. Re-run this
whenever anything under content/ changes, then rebuild the frontend.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.content.loader import load_content  # noqa: E402

OUT = REPO_ROOT / "frontend" / "src" / "generated" / "content.json"


def main() -> None:
    store = load_content(REPO_ROOT / "content" / "lessons", REPO_ROOT / "content" / "vocab")

    payload = {
        "lessons": {lid: json.loads(l.model_dump_json()) for lid, l in store.lessons.items()},
        "lesson_order": [l.id for l in store.lesson_list],
        "vocab": {vid: json.loads(v.model_dump_json()) for vid, v in store.vocab.items()},
        "characters": {cid: json.loads(c.model_dump_json()) for cid, c in store.characters.items()},
        "srs_item_ids": list(store.srs_item_ids),
        "errors": [{"path": e.path, "line": e.line, "reason": e.reason} for e in store.errors],
        "has_real_content": store.has_real_content,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {OUT.relative_to(REPO_ROOT)}: "
        f"{len(payload['lessons'])} lessons, {len(payload['vocab'])} vocab, "
        f"{len(payload['characters'])} characters, {len(payload['errors'])} errors"
    )


if __name__ == "__main__":
    main()

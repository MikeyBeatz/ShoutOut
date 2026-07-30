#!/usr/bin/env python3
"""Generate draft UI translation maps from the English transitional map."""

from __future__ import annotations

import ast
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "lib" / "l10n" / "text.dart"
OUTPUTS = {
    "sk": ROOT / "lib" / "l10n" / "text_sk.dart",
    "uk": ROOT / "lib" / "l10n" / "text_uk.dart",
    "vi": ROOT / "lib" / "l10n" / "text_vi.dart",
}
NAMES = {"sk": "slovakTranslations", "uk": "ukrainianTranslations", "vi": "vietnameseTranslations"}
OVERRIDES = {
    "sk": {
        "My shouts": "Moje Shouty",
        "Shouts": "Shouty",
    },
    "uk": {
        "My shouts": "Мої Shouts",
        "Shouts": "Shouts",
    },
    "vi": {
        "My shouts": "Shout của tôi",
        "Shouts": "Shout",
    },
}


def english_entries() -> list[tuple[str, str]]:
    source = SOURCE.read_text(encoding="utf-8")
    block = source.split("const _english = <String, String>{", 1)[1].split(
        "\n};\n\nconst _german", 1
    )[0]
    pattern = re.compile(
        r"^\s*('(?:\\.|[^'])*'):\s*((?:\s*'(?:\\.|[^'])*')+),",
        re.MULTILINE,
    )
    entries: list[tuple[str, str]] = []
    for match in pattern.finditer(block):
        key = ast.literal_eval(match.group(1))
        value = "".join(
            ast.literal_eval(piece)
            for piece in re.findall(r"'(?:\\.|[^'])*'", match.group(2))
        )
        entries.append((key, value))
    if len(entries) < 200:
        raise RuntimeError(f"Only {len(entries)} English entries were parsed.")
    return entries


def translate_segment(text: str, language: str) -> str:
    if not text.strip():
        return text
    leading = text[: len(text) - len(text.lstrip())]
    trailing = text[len(text.rstrip()) :]
    core = text.strip()
    query = urllib.parse.urlencode(
        {"client": "gtx", "sl": "en", "tl": language, "dt": "t", "q": core}
    )
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read())
            translated = "".join(part[0] for part in payload[0] if part[0])
            return leading + translated + trailing
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)
    raise AssertionError("unreachable")


def translate(text: str, language: str) -> str:
    if text in OVERRIDES[language]:
        return OVERRIDES[language][text]
    # Shout/Shouts is a product term throughout the app, not the ordinary verb.
    # Translate only the surrounding text so the service cannot alter the brand.
    protected = re.split(r"(\bShoutOut\b|\bShouts?\b)", text, flags=re.IGNORECASE)
    return "".join(
        part
        if re.fullmatch(r"\b(?:ShoutOut|Shouts?)\b", part, re.IGNORECASE)
        else translate_segment(part, language)
        for part in protected
    )


def dart_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def generate(language: str, entries: list[tuple[str, str]]) -> None:
    translated: list[str | None] = [None] * len(entries)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(translate, value, language): index
            for index, (_, value) in enumerate(entries)
        }
        for future in as_completed(futures):
            translated[futures[future]] = future.result()

    lines = [
        "// Generated draft translations. Review context and wording before release.",
        f"const {NAMES[language]} = <String, String>{{",
    ]
    for (key, _), value in zip(entries, translated, strict=True):
        lines.append(f"  {dart_quote(key)}: {dart_quote(value or '')},")
    lines.append("};")
    lines.append("")
    OUTPUTS[language].write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    entries = english_entries()
    for language in OUTPUTS:
        generate(language, entries)
        print(f"Generated {OUTPUTS[language].relative_to(ROOT)} ({len(entries)} entries)")


if __name__ == "__main__":
    main()

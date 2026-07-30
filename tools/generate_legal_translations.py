#!/usr/bin/env python3
"""Generate draft SK/UK/VI legal-document translations from English."""

from __future__ import annotations

import ast
from pathlib import Path
import re

from generate_transitional_translations import translate


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "lib" / "legal.dart"
OUTPUT = ROOT / "lib" / "l10n" / "legal_translations.dart"
LANGUAGES = {
    "sk": ("legalSkTerms", "legalSkPrivacy"),
    "uk": ("legalUkTerms", "legalUkPrivacy"),
    "vi": ("legalViTerms", "legalViPrivacy"),
}


def sections(name: str) -> list[tuple[str, str]]:
    source = SOURCE.read_text(encoding="utf-8")
    block = source.split(f"const {name} = [", 1)[1].split("\n];", 1)[0]
    return [
        (ast.literal_eval(title), ast.literal_eval(body))
        for title, body in re.findall(
            r"LegalSection\(\s*('(?:\\.|[^'])*'),\s*('(?:\\.|[^'])*'),\s*\)",
            block,
            re.DOTALL,
        )
    ]


def quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def main() -> None:
    english_terms = sections("_enTerms")
    english_privacy = sections("_enPrivacy")
    lines = [
        "// Generated draft legal translations. Professional legal and language",
        "// review is required before a public production release.",
        "",
    ]
    for language, names in LANGUAGES.items():
        for name, source_sections in zip(names, (english_terms, english_privacy), strict=True):
            lines.append(f"const {name} = <(String, String)>[")
            for title, body in source_sections:
                lines.append(
                    f"  ({quote(translate(title, language))}, "
                    f"{quote(translate(body, language))}),"
                )
            lines.extend(["];", ""])
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

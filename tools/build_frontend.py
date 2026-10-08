"""Build renderer/frontend/index.html from frontend_src/letter-tagger.html.

The source is the same page that runs on claude.ai. This script wraps it in a full HTML
document and points its libraries at the copies in renderer/static/renderer/vendor, so the
page works without internet access.

    python tools/build_frontend.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend_src" / "letter-tagger.html"
OUT = ROOT / "renderer" / "frontend" / "index.html"

CDN = {
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js": "__STATIC__/vendor/jszip.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js": "__STATIC__/vendor/papaparse.min.js",
}

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<script>window.LT_VENDOR={nunjucks:'__STATIC__/vendor/nunjucks.min.js', xlsx:'__STATIC__/vendor/xlsx.full.min.js'};</script>
</head>
<body>
"""


def main():
    html = SRC.read_text(encoding="utf-8")
    for url, local in CDN.items():
        if url not in html:
            raise SystemExit(f"Expected script tag not found: {url}")
        html = html.replace(url, local)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(HEAD + html + "\n</body>\n</html>\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

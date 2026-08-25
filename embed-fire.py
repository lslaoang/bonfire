#!/usr/bin/env python3
"""Wire an audio file into index.html as the recorded fire bed.

    ./embed-fire.py fire.mp3            # inline it as a data: URI (single file)
    ./embed-fire.py fire.mp3 --link     # just point FIRE_BED_URL at the path
    ./embed-fire.py --clear             # back to pure synthesis

Inlining keeps index.html openable straight from disk: fetch() on a file://
sibling is blocked by CORS, but fetch() on a data: URI is not.
"""
import base64, mimetypes, pathlib, re, sys

HTML = pathlib.Path(__file__).with_name("index.html")
PATTERN = re.compile(r'^const FIRE_BED_URL = ".*?";$', re.M | re.S)

def set_url(url, note):
    html = HTML.read_text()
    if not PATTERN.search(html):
        sys.exit("error: FIRE_BED_URL declaration not found in index.html")
    HTML.write_text(PATTERN.sub(f'const FIRE_BED_URL = "{url}";', html, count=1))
    print(f"index.html <- {note}  ({HTML.stat().st_size / 1e6:.2f} MB total)")

AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}

def candidates():
    """Newest audio files sitting here or in ~/Downloads, to save you typing
    out whatever Pixabay named the download."""
    seen = []
    for d in (HTML.parent, pathlib.Path.home() / "Downloads"):
        if not d.is_dir():
            continue
        seen += [f for f in d.iterdir()
                 if f.is_file() and f.suffix.lower() in AUDIO_EXT]
    return sorted(seen, key=lambda f: f.stat().st_mtime, reverse=True)[:5]

args = sys.argv[1:]
if "--clear" in args:
    set_url("", "synthesis only")
    sys.exit()
if not args:
    print(__doc__)
    found = candidates()
    if found:
        print("audio files nearby, newest first:")
        for f in found:
            print(f"    ./embed-fire.py '{f}'   # {f.stat().st_size / 1e6:.2f} MB")
    sys.exit()

src = pathlib.Path(args[0])
if not src.is_file():
    sys.exit(f"error: no such file: {src}")

if "--link" in args:
    set_url(src.name, f"{src.name} (linked; needs http://, not file://)")
else:
    mime = mimetypes.guess_type(src.name)[0] or "audio/mpeg"
    data = base64.b64encode(src.read_bytes()).decode()
    set_url(f"data:{mime};base64,{data}",
            f"{src.name} inlined, {src.stat().st_size / 1e6:.2f} MB -> {len(data) / 1e6:.2f} MB base64")

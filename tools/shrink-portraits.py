# Makes the small portraits the app loads (public/djs/<id>.jpg, 320 px) from the full-size renders
# in private/dj-portraits/<id>.png (written by tools/make-dj-portraits.mjs; kept out of git and out of the build).
# Usage: python tools/shrink-portraits.py [--sheet]   (--sheet also writes private/dj-portraits/_sheet.jpg to review them)
import sys
from pathlib import Path
from PIL import Image

SRC = Path('private/dj-portraits')
OUT = Path('public/djs')
OUT.mkdir(parents=True, exist_ok=True)
files = sorted(SRC.glob('*.png'))
for f in files:
    img = Image.open(f).convert('RGB').resize((320, 320), Image.LANCZOS)
    img.save(OUT / f'{f.stem}.jpg', quality=84, optimize=True, progressive=True)
    print(f'{f.stem}.jpg', (OUT / f'{f.stem}.jpg').stat().st_size // 1024, 'KB')
if '--sheet' in sys.argv and files:
    sheet = Image.new('RGB', (4 * 320, ((len(files) + 3) // 4) * 320))
    for n, f in enumerate(files):
        sheet.paste(Image.open(OUT / f'{f.stem}.jpg'), ((n % 4) * 320, (n // 4) * 320))
    sheet.save(SRC / '_sheet.jpg', quality=80)

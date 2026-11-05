import base64, io, os, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]  # cartella build
SS = 8  # supersampling


def glyph(size, stroke, color=(255, 255, 255, 255), pad=0.0, arcs=(30, 56)):
    """Mouse wireless in bianco: corpo, tasti, rotella e due onde. Disegnato su 256 e scalato."""
    n = 256 * SS
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = SS
    w = int(stroke * s)
    # corpo
    d.rounded_rectangle([88 * s, 112 * s, 168 * s, 236 * s], radius=40 * s, outline=color, width=w)
    # divisione dei tasti e rotella
    thin = max(1, int(stroke * 0.6 * s))
    d.line([128 * s, 112 * s, 128 * s, 152 * s], fill=color, width=thin)
    d.line([88 * s, 152 * s, 168 * s, 152 * s], fill=color, width=thin)
    d.rounded_rectangle([121 * s, 122 * s, 135 * s, 142 * s], radius=7 * s, fill=color)
    # onde wireless sopra il mouse
    import math
    for r in arcs:
        box = [(128 - r) * s, (92 - r) * s, (128 + r) * s, (92 + r) * s]
        d.arc(box, 232, 308, fill=color, width=w)
        for ang in (232, 308):
            x = 128 + (r - stroke / 2) * math.cos(math.radians(ang))
            y = 92 + (r - stroke / 2) * math.sin(math.radians(ang))
            d.ellipse([(x - stroke / 2) * s, (y - stroke / 2) * s, (x + stroke / 2) * s, (y + stroke / 2) * s], fill=color)
    # ritaglio sul contenuto e margine
    bbox = im.getbbox()
    im = im.crop(bbox)
    inner = int(size * (1 - 2 * pad))
    sc = inner / max(im.size)
    im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def tile(size):
    t = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    r = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(10, 11, 13, 255), outline=(44, 51, 60, 255), width=max(1, size // 128))
    g = glyph(size, 11, pad=0.2)
    t.alpha_composite(g)
    return t


os.makedirs(OUT, exist_ok=True)
big = tile(512)
big.save(os.path.join(OUT, "icon.png"))
big.save(os.path.join(OUT, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
tray = glyph(32, 24, pad=0.02, arcs=(40,))
buf = io.BytesIO()
tray.save(buf, "PNG")
open(os.path.join(OUT, "tray.b64"), "w").write(base64.b64encode(buf.getvalue()).decode())
# anteprime
prev = Image.new("RGBA", (512 + 40 + 128, 512), (30, 30, 34, 255))
prev.alpha_composite(big, (0, 0))
prev.alpha_composite(tray.resize((128, 128), Image.NEAREST), (552, 20))
prev.alpha_composite(tray, (552, 200))
prev.convert("RGB").save(os.path.join(OUT, "preview.png"))
print("ok")

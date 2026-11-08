from PIL import Image, ImageDraw
import os, math

BG   = (18, 16, 14)
INK  = (247, 245, 240)
ACC  = (234, 88, 12)   # orange
DIM  = (90, 84, 76)

def make(size, pad_ratio=0.0, rounded=True):
    S = size * 4  # supersample
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(S * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, S-1, S-1], radius=r, fill=BG)

    # plot area
    m = S * 0.24
    x0, y0, x1, y1 = m, S - m, S - m, m   # axes box (y up)
    # diagonal reference line
    d.line([(x0, y0), (x1, y1)], fill=DIM, width=max(2, int(S*0.018)))
    # calibration polyline: starts under diagonal, ends over -> shows a bias being corrected
    pts = [
        (x0, y0 - S*0.055),
        (x0 + (x1-x0)*0.25, y0 - (y0-y1)*0.20),
        (x0 + (x1-x0)*0.50, y0 - (y0-y1)*0.46),
        (x0 + (x1-x0)*0.75, y0 - (y0-y1)*0.79),
        (x1, y1),
    ]
    d.line(pts, fill=ACC, width=max(3, int(S*0.035)), joint="curve")
    for i, (px, py) in enumerate(pts):
        rad = S*0.026 if i not in (0, len(pts)-1) else S*0.034
        d.ellipse([px-rad, py-rad, px+rad, py+rad], fill=ACC if i not in (0,len(pts)-1) else INK)
    return img.resize((size, size), Image.LANCZOS)

os.makedirs("public/icons", exist_ok=True)
for s in (192, 512, 180, 32):
    img = make(s)
    name = f"public/icons/icon-{s}.png" if s in (192,512) else (
        "public/icons/apple-touch-icon.png" if s == 180 else "public/icons/favicon-32.png")
    img.save(name)
    print("wrote", name, img.size, os.path.getsize(name))

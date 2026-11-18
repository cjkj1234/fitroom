"""Generate flat-lay demo product photos (front/back) for the FITROOM demo catalog.

The demo stores are fictional, so their "product photos" are drawn by this script rather than photographed:
garment outlines come from each product's default-size measurements (cm -> px), then fabric texture
(jersey rib, twill, denim), soft folds, construction details (rib bands, stitching, pockets, pleats,
waistband) and a soft drop shadow on a light studio background are added.

Output per product and side, in the same format the seller upload produces (lib/seller/photo-prepare.ts):
  public/catalog/photos/<id>-<side>.jpg       garment cropped with a 4% margin, long side <= 720 px
  public/catalog/photos/<id>-<side>-mask.png  same size, white = garment

Run (numpy, pillow):
  uv run --no-project --python 3.13 --with numpy --with pillow python docs/assets/source/generate_demo_photos.py
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "public" / "catalog" / "photos"
BACKGROUND = np.array([214, 210, 203], dtype=np.float32)
MAX_SIDE = 720
SS = 3  # supersampling for outlines and line details


def rng_for(name: str):
    return np.random.default_rng(abs(hash(name)) % (2**32) if False else sum(map(ord, name)) * 7919)


def smooth_noise(rng, h: int, w: int, cell: float) -> np.ndarray:
    """Band-limited noise in [-1, 1] (random grid upsampled with bicubic)."""
    gh, gw = max(2, int(h / cell) + 2), max(2, int(w / cell) + 2)
    grid = Image.fromarray(((rng.random((gh, gw)) * 255)).astype(np.uint8))
    up = np.asarray(grid.resize((w, h), Image.BICUBIC), dtype=np.float32) / 127.5 - 1
    return up


class Photo:
    def __init__(self, name: str, w: int, h: int, scale: float):
        self.name, self.w, self.h, self.s = name, w, h, scale
        self.rng = rng_for(name)
        self.mask_img = Image.new("L", (w * SS, h * SS), 0)
        self.mask_draw = ImageDraw.Draw(self.mask_img)
        # line overlay: (alpha, rgb) painted on top of the fabric
        self.lines = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.ld = ImageDraw.Draw(self.lines)

    def P(self, x: float, y: float):
        return (x * SS, y * SS)

    def polygon(self, pts, fill=255):
        self.mask_draw.polygon([self.P(*p) for p in pts], fill=fill)

    def line(self, pts, rgba, width_px: float, dash: float = 0):
        pts = [self.P(*p) for p in pts]
        w = max(1, int(round(width_px * SS)))
        if not dash:
            self.ld.line(pts, fill=rgba, width=w, joint="curve")
            return
        step = dash * SS
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            length = math.hypot(x1 - x0, y1 - y0)
            n = max(1, int(length / step))
            for i in range(0, n, 2):
                a, b = i / n, min(1, (i + 1) / n)
                self.ld.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=rgba, width=w)

    def fill_poly(self, pts, rgba):
        self.ld.polygon([self.P(*p) for p in pts], fill=rgba)

    def ellipse(self, cx, cy, r, rgba):
        self.ld.ellipse([self.P(cx - r, cy - r), self.P(cx + r, cy + r)], fill=rgba)

    def render(self, base_rgb, texture: np.ndarray) -> tuple[Image.Image, Image.Image]:
        h, w = self.h, self.w
        alpha = np.asarray(self.mask_img.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255
        mask_l = Image.fromarray((alpha * 255).astype(np.uint8))
        # background: soft top-left light, fine sensor noise
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        light = 1.03 - 0.06 * (xx / w * 0.4 + yy / h * 0.6)
        bg = BACKGROUND[None, None, :] * light[..., None] + self.rng.normal(0, 1.2, (h, w, 1))
        # drop shadow
        shadow = np.asarray(mask_l.filter(ImageFilter.GaussianBlur(9 * self.s / 4)), dtype=np.float32) / 255
        shadow = np.roll(np.roll(shadow, int(5 * self.s / 4), axis=0), int(4 * self.s / 4), axis=1)
        bg = bg * (1 - 0.22 * shadow[..., None])
        # garment: fabric texture, broad folds, slightly darker towards the edges (fabric thickness)
        inner = np.asarray(mask_l.filter(ImageFilter.GaussianBlur(5 * self.s / 4)), dtype=np.float32) / 255
        folds = smooth_noise(self.rng, h, w, 34 * self.s / 4) * 0.045 + smooth_noise(self.rng, h, w, 12 * self.s / 4) * 0.02
        shade = (0.9 + 0.1 * inner) * (1 + folds) * light
        garment = np.asarray(base_rgb, dtype=np.float32)[None, None, :] if np.ndim(base_rgb) == 1 else base_rgb
        garment = garment * texture[..., None] * shade[..., None] if texture.ndim == 2 else garment * texture * shade[..., None]
        lines = np.asarray(self.lines.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255
        la = lines[..., 3:4]
        garment = garment * (1 - la) + lines[..., :3] * 255 * la * shade[..., None]
        out = bg * (1 - alpha[..., None]) + garment * alpha[..., None]
        img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        return img, mask_l

    def save(self, side: str, base_rgb, texture):
        img, mask_l = self.render(base_rgb, texture)
        binary = np.asarray(mask_l) > 127
        ys, xs = np.nonzero(binary)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        m = 0.04 * max(x1 - x0, y1 - y0)
        box = (int(max(0, x0 - m)), int(max(0, y0 - m)), int(min(self.w, x1 + m)), int(min(self.h, y1 + m)))
        crop, mcrop = img.crop(box), Image.fromarray((binary * 255).astype(np.uint8)).crop(box)
        k = min(1, MAX_SIDE / max(crop.size))
        size = (max(8, round(crop.width * k)), max(8, round(crop.height * k)))
        crop, mcrop = crop.resize(size, Image.LANCZOS), mcrop.resize(size, Image.NEAREST)
        OUT.mkdir(parents=True, exist_ok=True)
        crop.save(OUT / f"{self.name}-{side}.jpg", quality=86, optimize=True, progressive=True)
        mcrop.convert("L").point(lambda v: 255 if v > 127 else 0).save(OUT / f"{self.name}-{side}-mask.png", optimize=True)
        return size


# ---------- fabric textures (multiplicative, ~1.0) ----------

def jersey(ph: Photo, strength=1.0):
    yy, xx = np.mgrid[0 : ph.h, 0 : ph.w].astype(np.float32)
    rib = np.sin(xx / (ph.s * 0.32) * 2 * math.pi) * 0.022
    loop = np.sin(yy / (ph.s * 0.26) * 2 * math.pi + np.sin(xx / (ph.s * 0.32) * math.pi) * 2) * 0.012
    grain = ph.rng.normal(0, 0.018, (ph.h, ph.w))
    return 1 + (rib + loop + grain) * strength


def twill(ph: Photo, period=0.42, strength=1.0):
    yy, xx = np.mgrid[0 : ph.h, 0 : ph.w].astype(np.float32)
    diag = np.sin((xx + yy) / (ph.s * period) * 2 * math.pi) * 0.03
    grain = ph.rng.normal(0, 0.02, (ph.h, ph.w))
    return 1 + (diag + grain) * strength


def denim(ph: Photo):
    t = twill(ph, period=0.36, strength=1.4)
    slub = smooth_noise(ph.rng, ph.h, ph.w, 2.2)  # short vertical streaks
    streak = np.asarray(Image.fromarray(((slub + 1) * 127.5).astype(np.uint8)).resize((ph.w, ph.h)).filter(ImageFilter.BoxBlur(0)), dtype=np.float32)
    vertical = smooth_noise(ph.rng, ph.h, ph.w // 6 or 1, 1.5)
    vertical = np.asarray(Image.fromarray(((vertical + 1) * 127.5).astype(np.uint8)).resize((ph.w, ph.h), Image.BICUBIC), dtype=np.float32) / 127.5 - 1
    return t * (1 + vertical * 0.05 + (streak / 255 - 0.5) * 0.02)


# ---------- tops ----------

def tee_outline(cx, top, s, chest, shoulder, length, sleeve, neck=19.0, armhole=None, angle=28, cuff=None, back_drop=2.0):
    """Return (outline points, landmarks) in px for a short-sleeve tee laid flat. Right side is +x (image right)."""
    armhole = armhole or 21 + (chest - 50) * 0.35
    cuff = cuff or chest * 0.36
    th = math.radians(angle)
    L = {}
    def side(sg):
        hps = (cx + sg * neck / 2 * s, top)
        sp = (cx + sg * shoulder / 2 * s, top + 3.5 * s)
        ct = (sp[0] + sg * sleeve * s * math.cos(th), sp[1] + sleeve * s * math.sin(th))
        cb = (ct[0] - sg * cuff * s * math.sin(th), ct[1] + cuff * s * math.cos(th))
        ap = (cx + sg * chest / 2 * s, top + armhole * s)
        hem = (cx + sg * chest / 2 * s * 1.0, top + length * s)
        return hps, sp, ct, cb, ap, hem
    r, l = side(1), side(-1)
    L.update(right=r, left=l, neck=neck, back_drop=back_drop)
    neck_curve = []
    for i in range(1, 12):  # back neckline: shallow curve between the two HPS
        t = i / 12
        x = l[0][0] + (r[0][0] - l[0][0]) * t
        neck_curve.append((x, top + back_drop * s * math.sin(math.pi * t)))
    pts = [l[5], l[4], l[3], l[2], l[1], l[0], *neck_curve, r[0], r[1], r[2], r[3], r[4], r[5]]
    return pts, L


def draw_tee(name, size, color, front_style, view, stripes=False, print_logo=False):
    s = 9.0
    chest, length = size["chestFlat"], size["length"]
    shoulder, sleeve = size.get("shoulder", chest * 0.92), size.get("sleeve", 21)
    w, h = int((chest + 2 * sleeve + 26) * s), int((length + 16) * s)
    ph = Photo(name, w, h, s)
    cx, top = w / 2, 6 * s
    pts, L = tee_outline(cx, top, s, chest, shoulder, length, sleeve)
    ph.polygon(pts)
    rgb = np.array(color, dtype=np.float32)
    dark = tuple(int(c * 0.72) for c in color)
    darker = tuple(int(c * 0.55) for c in color)
    light = tuple(min(255, int(c * 1.12 + 10)) for c in color)
    r, l = L["right"], L["left"]
    # stripes (horizontal, on body and sleeves), drawn before stitching
    if stripes:
        navy = (39, 52, 82, 255)
        y = top + 15 * s
        while y < top + length * s - 3.5 * s:
            ph.fill_poly([(0, y), (w, y), (w, y + 1.0 * s), (0, y + 1.0 * s)], navy)
            y += 2.6 * s
    # shoulder seams
    for side_pts in (r, l):
        ph.line([side_pts[0], side_pts[1]], (*dark, 150), 0.9)
    # sleeve hems (double-needle stitching) and body hem
    for side_pts, sg in ((r, 1), (l, -1)):
        ct, cb = side_pts[2], side_pts[3]
        ux, uy = (ct[0] - side_pts[1][0]), (ct[1] - side_pts[1][1])
        n = math.hypot(ux, uy); ux, uy = ux / n * 2.4 * s, uy / n * 2.4 * s
        ph.line([(ct[0] - ux, ct[1] - uy), (cb[0] - ux, cb[1] - uy)], (*dark, 170), 0.7, dash=0.5 * s)
        ph.line([(ct[0] - ux * 1.1, ct[1] - uy * 1.1), (cb[0] - ux * 1.1, cb[1] - uy * 1.1)], (*dark, 140), 0.7, dash=0.5 * s)
    hem_y = top + size["length"] * s - 2.4 * s
    ph.line([(l[5][0] + 0.3 * s, hem_y), (r[5][0] - 0.3 * s, hem_y)], (*dark, 160), 0.7, dash=0.5 * s)
    ph.line([(l[5][0] + 0.3 * s, hem_y + 0.4 * s), (r[5][0] - 0.3 * s, hem_y + 0.4 * s)], (*dark, 130), 0.7, dash=0.5 * s)
    # neckline
    hl, hr = l[0], r[0]
    if view == "front":
        drop = (18 if front_style == "vneck" else 8.5) * s
        def front_neck(t):
            x = hl[0] + (hr[0] - hl[0]) * t
            if front_style == "vneck":
                y = top + drop * (1 - abs(2 * t - 1)) ** 1.15
            else:
                y = top + drop * math.sin(math.pi * t) ** 0.85
            return (x, y)
        curve = [front_neck(i / 30) for i in range(31)]
        back = [(hl[0] + (hr[0] - hl[0]) * i / 30, top + L["back_drop"] * s * math.sin(math.pi * i / 30)) for i in range(31)]
        # inside of the back panel seen through the neck opening, and the back neck tape
        ph.fill_poly(back + curve[::-1], (*darker, 255))
        ph.line(back, (*dark, 255), 1.6 * s)
        # rib band along the front neckline
        ph.line(curve, (*dark, 120), 2.0 * s)
        ph.line(curve, (*light, 70), 0.5 * s)
        ph.line([(x, y + 2.1 * s) for x, y in curve], (*dark, 150), 0.6, dash=0.45 * s)
    else:
        back = [(hl[0] + (hr[0] - hl[0]) * i / 30, top + L["back_drop"] * s * math.sin(math.pi * i / 30)) for i in range(31)]
        ph.line([(x, y + 0.9 * s) for x, y in back], (*dark, 120), 1.9 * s)
        ph.line([(x, y + 2.0 * s) for x, y in back], (*dark, 150), 0.6, dash=0.45 * s)
    # small chest print on the wearer's left chest (image right in the front photo)
    if print_logo and view == "front":
        px, py = cx + chest * 0.22 * s, top + 17 * s
        ph.ellipse(px, py, 2.4 * s, (226, 222, 210, 235))
        ph.ellipse(px, py, 1.7 * s, (*color, 255))
        ph.ellipse(px, py - 0.35 * s, 0.75 * s, (226, 222, 210, 235))
        ph.fill_poly([(px - 1.8 * s, py + 0.5 * s), (px + 1.8 * s, py + 0.5 * s), (px + 1.8 * s, py + 0.75 * s), (px - 1.8 * s, py + 0.75 * s)], (226, 222, 210, 235))
        try:
            font = ImageFont.load_default(size=int(1.25 * s * SS))
            ph.ld.text(ph.P(px - 4.6 * s, py + 2.9 * s), "AFTERNOON", font=font, fill=(226, 222, 210, 230))
        except TypeError:
            pass
    texture = jersey(ph, 1.2 if front_style == "vneck" else 1.0)
    if front_style == "vneck":
        texture = texture * (1 + smooth_noise(ph.rng, ph.h, ph.w, 1.2) * 0.035)  # heathered cooling yarn
    return ph.save(view, rgb, texture)


# ---------- bottoms ----------

def pants_outline(cx, top, s, waist, hips, length, rise, hem, gap):
    hip_y, crotch_y, hem_y = top + rise * 0.55 * s, top + rise * s, top + length * s
    half_h = max(hips / 2, waist / 2 + 2)
    def side(sg):
        return [(cx + sg * waist / 2 * s, top), (cx + sg * half_h * s, hip_y), (cx + sg * half_h * s * 1.01, crotch_y), (cx + sg * (gap + hem) * s, hem_y), (cx + sg * gap * s, hem_y)]
    r, l = side(1), side(-1)
    crotch = [(cx + 0.5 * s, crotch_y + 1.2 * s), (cx - 0.5 * s, crotch_y + 1.2 * s)]
    pts = [l[0], r[0], r[1], r[2], r[3], r[4], *crotch, l[4], l[3], l[2], l[1]]
    return pts, dict(r=r, l=l, hip_y=hip_y, crotch_y=crotch_y, hem_y=hem_y, half_h=half_h)


def draw_pants(name, size, color, kind, view):
    s = 7.0
    waist, length = size["waistFlat"], size["length"]
    hips = size.get("hipsFlat") or waist * 1.3
    rise = size.get("rise") or 31
    hem = size.get("hemFlat") or 24
    gap = {"slacks": 3.5, "banding": 4.5, "denim": 2.6}[kind]
    w, h = int((max(hips, 2 * (gap + hem)) + 22) * s), int((length + 14) * s)
    ph = Photo(name, w, h, s)
    cx, top = w / 2, 6 * s
    pts, G = pants_outline(cx, top, s, waist, hips, length, rise, hem, gap)
    ph.polygon(pts)
    dark = tuple(int(c * 0.7) for c in color)
    light = tuple(min(255, int(c * 1.18 + 12)) for c in color)
    band = 4.0 * s
    r, l = G["r"], G["l"]
    # waistband edge and stitching
    def at_y(side_pts, y):  # outer edge x at height y along the waistband/hip segment
        (x0, y0), (x1, y1) = side_pts[0], side_pts[1]
        return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
    yb = top + band
    ph.line([(at_y(l, yb), yb), (at_y(r, yb), yb)], (*dark, 190), 0.9)
    ph.line([(at_y(l, top + 0.5 * s), top + 0.5 * s), (at_y(r, top + 0.5 * s), top + 0.5 * s)], (*dark, 140), 0.6, dash=0.45 * s)
    if kind == "banding":
        # elastic gathers: short vertical ripples across the band and just below it
        x = at_y(l, top) + 0.8 * s
        while x < at_y(r, top) - 0.8 * s:
            ph.line([(x, top + 0.4 * s), (x + 0.15 * s, top + band - 0.3 * s)], (*dark, 120), 0.5 * s)
            ph.line([(x + 0.5 * s, top + band + 0.2 * s), (x + 0.6 * s, top + band + 2.4 * s)], (*dark, 50), 0.35 * s)
            x += 1.15 * s
    else:
        # belt loops
        for f in (-0.42, -0.22, 0.22, 0.42) if view == "front" else (-0.35, 0, 0.35):
            x = cx + f * waist * s
            ph.fill_poly([(x - 0.55 * s, top - 0.2 * s), (x + 0.55 * s, top - 0.2 * s), (x + 0.55 * s, yb + 0.6 * s), (x - 0.55 * s, yb + 0.6 * s)], (*dark, 110))
            ph.line([(x - 0.55 * s, top), (x - 0.55 * s, yb + 0.5 * s)], (*dark, 160), 0.5)
            ph.line([(x + 0.55 * s, top), (x + 0.55 * s, yb + 0.5 * s)], (*light, 110), 0.5)
    stitch = (205, 160, 110, 170) if kind == "denim" else (*dark, 150)
    if view == "front":
        if kind != "banding":
            # fly: J stitch on the wearer's left (image right)
            fx, fy = cx + 3.6 * s, yb
            j = [(fx, fy), (fx, G["crotch_y"] - 7 * s)] + [(cx + 3.6 * s * math.cos(a), G["crotch_y"] - 7 * s + 4.5 * s * math.sin(a)) for a in np.linspace(0, math.pi / 2, 8)]
            ph.line(j, stitch, 0.7, dash=0.45 * s)
            ph.line([(cx, yb), (cx, G["crotch_y"] - 2 * s)], (*dark, 170), 0.8)
        # front pockets
        for sg in (-1, 1):
            if kind == "denim":
                p0, p1 = (cx + sg * waist * 0.29 * s, yb), (at_y(r if sg > 0 else l, top + 12 * s) - sg * 0.2 * s, top + 12 * s)
                curve = [(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * (t ** 0.6)) for t in np.linspace(0, 1, 10)]
                ph.line(curve, (*dark, 190), 0.9)
                ph.line([(x - sg * 0.45 * s, y + 0.45 * s) for x, y in curve], stitch, 0.6, dash=0.45 * s)
                ph.ellipse(p1[0] - sg * 0.6 * s, p1[1] - 0.3 * s, 0.35 * s, (190, 180, 160, 230))
                ph.ellipse(p0[0], p0[1] + 0.5 * s, 0.35 * s, (190, 180, 160, 230))
                if sg > 0:  # coin pocket
                    cx0 = p0[0] + 1.2 * s
                    ph.line([(cx0, yb + 0.5 * s), (cx0 + 0.3 * s, yb + 5 * s), (cx0 + 4.5 * s, yb + 5 * s), (cx0 + 4.7 * s, yb + 1.8 * s)], stitch, 0.6, dash=0.4 * s)
            else:
                side_pts = r if sg > 0 else l
                p0 = (cx + sg * waist * 0.36 * s, yb)
                p1 = (at_y(side_pts, top + 18 * s) - sg * 0.3 * s, top + 18 * s)
                ph.line([p0, p1], (*dark, 200), 0.9)
                ph.line([(p0[0] - sg * 0.4 * s, p0[1]), (p1[0] - sg * 0.4 * s, p1[1])], stitch, 0.55, dash=0.4 * s)
        if kind == "slacks":
            # two pleats each side, then a pressed crease down the leg
            for sg in (-1, 1):
                for f, depth in ((0.16, 9), (0.27, 7)):
                    x = cx + sg * f * waist * s
                    ph.line([(x, yb), (x + sg * 0.25 * s, yb + depth * s)], (*dark, 150), 0.6 * s)
                    ph.line([(x + sg * 0.35 * s, yb), (x + sg * 0.55 * s, yb + depth * s)], (*light, 90), 0.45 * s)
                leg_top = (cx + sg * (G["half_h"] * 0.5) * s, G["crotch_y"] - 6 * s)
                leg_bottom = (cx + sg * (gap + hem / 2) * s, G["hem_y"] - 0.5 * s)
                ph.line([(cx + sg * 0.16 * waist * s, yb + 9 * s), leg_top, leg_bottom], (*light, 70), 0.55 * s)
                ph.line([(cx + sg * 0.16 * waist * s + sg * 0.3 * s, yb + 9 * s), (leg_top[0] + sg * 0.3 * s, leg_top[1]), (leg_bottom[0] + sg * 0.3 * s, leg_bottom[1])], (*dark, 60), 0.4 * s)
    else:
        ph.line([(cx, yb), (cx, G["crotch_y"])], (*dark, 160), 0.8)
        if kind == "denim":
            # yoke and patch pockets
            yk = [(at_y(l, top + 9 * s), top + 9 * s), (cx, top + 12 * s), (at_y(r, top + 9 * s), top + 9 * s)]
            ph.line(yk, (*dark, 170), 0.9)
            ph.line([(x, y + 0.5 * s) for x, y in yk], stitch, 0.6, dash=0.45 * s)
            for sg in (-1, 1):
                x0, y0 = cx + sg * 3.5 * s, top + 13 * s
                pocket = [(x0, y0), (x0 + sg * 14 * s, y0 - 1 * s), (x0 + sg * 13.3 * s, y0 + 13 * s), (x0 + sg * 7 * s, y0 + 15.5 * s), (x0 + sg * 0.8 * s, y0 + 13.5 * s), (x0, y0)]
                ph.line(pocket, (*dark, 200), 0.9)
                ph.line([(x + sg * 0.5 * s, y + 0.4 * s) for x, y in pocket], stitch, 0.6, dash=0.45 * s)
        elif kind == "slacks":
            for sg in (-1, 1):
                x0, y0 = cx + sg * 5 * s, top + 11 * s
                ph.line([(x0, y0), (x0 + sg * 12 * s, y0)], (*dark, 220), 0.8)
                ph.line([(x0, y0 + 0.9 * s), (x0 + sg * 12 * s, y0 + 0.9 * s)], (*dark, 160), 0.6)
                ph.ellipse(x0 + sg * 6 * s, y0 - 1.0 * s, 0.6 * s, (*dark, 230))
        # back darts
        for sg in (-1, 1):
            x = cx + sg * waist * 0.3 * s
            ph.line([(x, yb), (x + sg * 0.2 * s, yb + 7 * s)], (*dark, 100), 0.5 * s)
    # side seams down the legs and hem stitching
    for sp in (r, l):
        ph.line([sp[2], sp[3]], (*dark, 70), 0.6)
    for sg in (-1, 1):
        y = G["hem_y"] - 2.6 * s
        ph.line([(cx + sg * (gap + 0.3) * s, y), (cx + sg * (gap + hem - 0.3) * s, y)], stitch, 0.6, dash=0.45 * s)
    base = np.array(color, dtype=np.float32)
    if kind == "denim":
        texture = denim(ph)
        # washed: lighter thighs and knees, whiskers near the crotch (front), honeycombs at the back of the knee
        yy, xx = np.mgrid[0 : ph.h, 0 : ph.w].astype(np.float32)
        fade = np.zeros((ph.h, ph.w), np.float32)
        for sg in (-1, 1):
            lx = cx + sg * (gap + hem / 2 + 2) * s
            fade += np.exp(-(((xx - lx) / (7 * s)) ** 2 + ((yy - (G["crotch_y"] + 14 * s)) / (22 * s)) ** 2))
            fade += 0.6 * np.exp(-(((xx - lx) / (6 * s)) ** 2 + ((yy - (G["crotch_y"] + 42 * s)) / (9 * s)) ** 2))
            if view == "front":
                for k in range(5):
                    a = math.radians(8 + k * 9)
                    x0, y0 = cx + sg * 2 * s, G["crotch_y"] - (2 - k) * 1.6 * s
                    x1, y1 = x0 + sg * 13 * s * math.cos(a), y0 - 13 * s * math.sin(a) + 6 * s
                    ph.line([(x0, y0), (x1, y1)], (*light, 55), 0.7 * s)
        base = base[None, None, :] * (1 + 0.28 * fade[..., None])
        return ph.save(view, base, texture)
    texture = twill(ph, 0.5, 0.8) if kind == "slacks" else twill(ph, 0.3, 0.5) * (1 + smooth_noise(ph.rng, ph.h, ph.w, 3) * 0.01)
    return ph.save(view, base, texture)


SIZES = {
    "3777371": dict(length=70, shoulder=52, chestFlat=55, sleeve=23),
    "6170660": dict(length=71, shoulder=56, chestFlat=56, sleeve=22),
    "4964048": dict(length=68, chestFlat=53),
    "3504218": dict(length=107, waistFlat=40, hipsFlat=56.5, thighFlat=35.75, rise=31.5, hemFlat=25.5),
    "5196637": dict(length=96, waistFlat=33, hipsFlat=48, thighFlat=48, hemFlat=28),
    "3547134": dict(waistFlat=42.5, rise=35, thighFlat=32, hemFlat=25.5, length=111),
}

if __name__ == "__main__":
    report = {}
    for view in ("front", "back"):
        report[f"3777371-{view}"] = draw_tee("3777371", SIZES["3777371"], (36, 39, 43), "tee", view, print_logo=True)
        report[f"6170660-{view}"] = draw_tee("6170660", SIZES["6170660"], (240, 238, 232), "tee", view, stripes=True)
        report[f"4964048-{view}"] = draw_tee("4964048", SIZES["4964048"], (54, 56, 61), "vneck", view)
        report[f"3504218-{view}"] = draw_pants("3504218", SIZES["3504218"], (169, 156, 136), "slacks", view)
        report[f"5196637-{view}"] = draw_pants("5196637", SIZES["5196637"], (42, 44, 46), "banding", view)
        report[f"3547134-{view}"] = draw_pants("3547134", SIZES["3547134"], (98, 97, 104), "denim", view)
    for key, size in report.items():
        print(key, size)

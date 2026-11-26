#!/usr/bin/env python3
"""Regenerate icons/icon{16,32,48,128}.png from icons/source.svg.

macOS only (uses Quick Look `qlmanage` and `sips`), standard library otherwise.
Quick Look flattens transparency onto white, so the SVG is rendered twice, on black
and on white, and the true alpha is recovered from the difference:
    alpha = 1 - (white - black) / 255        premultiplied colour = black render
The result is then area-averaged down to each size and written as an RGBA PNG.
"""
import os, re, struct, subprocess, sys, tempfile, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "icons", "source.svg")
SIZES = (128, 48, 32, 16)
BIG = 1024
VB_OLD = 'viewBox="0 0 800 859.0954"'
PAD = (859.0954 - 800) / 2  # pad the artwork to a square canvas so Quick Look adds no margin of its own
VB_NEW = 'viewBox="%.4f 0 859.0954 859.0954"' % -PAD


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render(svg, tmp, name, colour):
    svg = svg.replace(VB_OLD, VB_NEW)
    bg = '<rect x="%.4f" y="0" width="859.0954" height="859.0954" fill="%s"/>' % (-PAD, colour)
    svg = re.sub(r"(<svg[^>]*>)", lambda m: m.group(1) + bg, svg, count=1)
    path = os.path.join(tmp, name + ".svg")
    open(path, "w").write(svg)
    run("qlmanage", "-t", "-s", str(BIG), "-o", tmp, path)
    bmp = os.path.join(tmp, name + ".bmp")
    run("sips", "-s", "format", "bmp", os.path.join(tmp, name + ".svg.png"), "--out", bmp)
    return read_bmp(bmp)


def read_bmp(path):
    d = open(path, "rb").read()
    off = struct.unpack_from("<I", d, 10)[0]
    w, h = struct.unpack_from("<ii", d, 18)
    bpp = struct.unpack_from("<H", d, 28)[0]
    assert bpp in (24, 32), "unexpected BMP depth %d" % bpp
    bottom_up, h = h > 0, abs(h)
    bpr, bp = ((w * bpp + 31) // 32) * 4, bpp // 8
    rows = []
    for y in range(h):
        sy = h - 1 - y if bottom_up else y
        rows.append(d[off + sy * bpr: off + sy * bpr + w * bp])
    return w, h, bp, rows


def recover(black, white):
    w, h, bp, rb = black
    assert (w, h) == white[:2] and w == h
    rw = white[3]
    R, G, B, A = [], [], [], []
    for y in range(h):
        b, wt = rb[y], rw[y]
        bB, bG, bR = b[0::bp], b[1::bp], b[2::bp]
        wB, wG, wR = wt[0::bp], wt[1::bp], wt[2::bp]
        a = [255 - ((x1 - y1) + (x2 - y2) + (x3 - y3)) // 3
             for x1, y1, x2, y2, x3, y3 in zip(wB, bB, wG, bG, wR, bR)]
        A.append([0 if v < 0 else 255 if v > 255 else v for v in a])
        R.append(list(bR)); G.append(list(bG)); B.append(list(bB))  # premultiplied by the black background
    return w, [R, G, B, A]


def box(v, T):
    """Area-average a list to length T (exact for fractional box edges)."""
    n = len(v)
    s = n / T
    cs = [0.0] * (n + 1)
    acc = 0.0
    for i, x in enumerate(v):
        acc += x
        cs[i + 1] = acc

    def F(x):
        i = int(x)
        return cs[n] if i >= n else cs[i] + (x - i) * v[i]

    return [(F((t + 1) * s) - F(t * s)) / s for t in range(T)]


def downscale(chan, T):
    rows = [box(r, T) for r in chan]                       # horizontal
    cols = [box([rows[y][x] for y in range(len(rows))], T) for x in range(T)]  # vertical
    return cols                                            # cols[x][y]


def write_png(path, T, planes):
    pr, pg, pb, pa = planes
    raw = bytearray()
    for y in range(T):
        raw.append(0)
        for x in range(T):
            a = pa[x][y]
            if a < 0.5:
                raw += b"\x00\x00\x00\x00"
                continue
            k = 255.0 / a
            raw += bytes((min(255, round(pr[x][y] * k)), min(255, round(pg[x][y] * k)),
                          min(255, round(pb[x][y] * k)), min(255, round(a))))

    def chunk(t, data):
        c = struct.pack(">I", len(data)) + t + data
        return c + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", T, T, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    open(path, "wb").write(png)


def main():
    svg = open(SRC).read()
    if VB_OLD not in svg:
        sys.exit("icons/source.svg: expected %s" % VB_OLD)
    with tempfile.TemporaryDirectory() as tmp:
        n, planes = recover(render(svg, tmp, "black", "#000000"), render(svg, tmp, "white", "#ffffff"))
        corner = planes[3][2][2]
        print("rendered %dx%d, corner alpha %d (0 = transparent)" % (n, n, corner))
        for T in SIZES:
            out = os.path.join(HERE, "icons", "icon%d.png" % T)
            write_png(out, T, [downscale(c, T) for c in planes])
            print("wrote", os.path.relpath(out, HERE))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate the extension icons (pure stdlib): a rounded tile with three clock columns."""
import math
import struct
import zlib
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)


def rr_sdf(px, py, cx, cy, hw, hh, r):
    dx = abs(px - cx) - (hw - r)
    dy = abs(py - cy) - (hh - r)
    return math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - r


def render(size, ss=4):
    S = size * ss
    pix = bytearray()
    bg = (35, 131, 226)
    white = (255, 255, 255)
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    u = (x * ss + sx + 0.5) / S  # 0..1
                    v = (y * ss + sy + 0.5) / S
                    col, a = None, 0.0
                    if rr_sdf(u, v, 0.5, 0.5, 0.5, 0.5, 0.22) < 0:
                        col, a = bg, 1.0
                        # three columns of "hour ticks"
                        for cx in (0.27, 0.5, 0.73):
                            for cy in (0.28, 0.5, 0.72):
                                if rr_sdf(u, v, cx, cy, 0.075, 0.05, 0.04) < 0:
                                    col = white
                    if col:
                        acc[0] += col[0]
                        acc[1] += col[1]
                        acc[2] += col[2]
                        acc[3] += a
            n = ss * ss
            if acc[3] == 0:
                row += bytes([0, 0, 0, 0])
            else:
                row += bytes([int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(255 * acc[3] / n)])
        pix += row
    return bytes(pix)


def png(size):
    raw = render(size)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


for s in (16, 32, 48, 128):
    with open(os.path.join(OUT, f"icon{s}.png"), "wb") as f:
        f.write(png(s))
    print("wrote icon%d.png" % s)

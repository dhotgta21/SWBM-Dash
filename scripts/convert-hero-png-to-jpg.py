"""
Convert hero PNG images to web-optimized JPEG.

Source: C:/Users/sarpa/Downloads/hero-{1,2,3,4}-4kgen.png  (5504x3072 RGB)
Target: C:/Users/sarpa/PycharmProjects/SWBM/public/hero-{1,2,3,4}-4kgen.jpg

Resizes to 1920px wide so the Next.js Image pipeline can downscale
further per viewport without re-encoding a giant source. JPEG quality
85 with chroma subsampling gives a ~200-400 KB file that looks the
same as the source at the sizes we actually render (hero crops to
~1280-1920px wide on desktop, much smaller on mobile).

Progressive JPEG + optimize=True keeps the file a touch smaller
without a visible quality hit.
"""
import os
from PIL import Image

SRC = r"C:\Users\sarpa\Downloads"
DST = r"C:\Users\sarpa\PycharmProjects\SWBM\public"

# Match the existing WEBP source width — Next.js generates
# smaller widths on the fly for each breakpoint.
TARGET_WIDTH = 1920
JPEG_QUALITY = 85


def convert(idx: int) -> None:
    src_path = os.path.join(SRC, f"hero-{idx}-4kgen.png")
    dst_path = os.path.join(DST, f"hero-{idx}-4kgen.jpg")

    with Image.open(src_path) as img:
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Resize so the longest side is TARGET_WIDTH, preserving
        # aspect ratio. LANCZOS is the highest-quality downscale
        # filter in Pillow — important when shrinking 4K → 1920.
        w, h = img.size
        if w > TARGET_WIDTH:
            new_h = round(h * (TARGET_WIDTH / w))
            img = img.resize((TARGET_WIDTH, new_h), Image.LANCZOS)

        img.save(
            dst_path,
            "JPEG",
            quality=JPEG_QUALITY,
            optimize=True,
            progressive=True,
            subsampling=2,  # 4:2:0 — best size/quality tradeoff for photos
        )

    src_bytes = os.path.getsize(src_path)
    dst_bytes = os.path.getsize(dst_path)
    print(
        f"hero-{idx}-4kgen.jpg  "
        f"{img.size[0]}x{img.size[1]}  "
        f"{dst_bytes/1024:>6.1f} KB  "
        f"(was {src_bytes/1024/1024:.1f} MB PNG)"
    )


for i in (1, 2, 3, 4):
    convert(i)
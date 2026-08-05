"""Build deterministic, metadata-free WebP variants and a visual review contact sheet."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "public" / "images" / "synthetic-stores"
MASTER = OUTPUT / "1280w"

ASSETS = (
    "blue-finch-curios-cover",
    "cedar-and-brass-cover",
    "elm-street-finds-cover",
    "juniper-house-cover",
    "maple-lantern-cover",
    "north-star-relics-cover",
    "prairie-cabinet-cover",
    "redbud-market-cover",
    "sunflower-salvage-cover",
    "tallgrass-treasures-cover",
    "union-station-vintage-cover",
    "willow-and-wren-cover",
    "blue-finch-curios-gallery-aisle",
    "blue-finch-curios-gallery-vignette",
    "blue-finch-curios-gallery-cabinet",
)

VARIANTS = ((480, 76), (800, 80))


def build() -> None:
    for width, quality in VARIANTS:
        (OUTPUT / f"{width}w").mkdir(parents=True, exist_ok=True)

    previews: list[tuple[str, Image.Image]] = []
    for slug in ASSETS:
        source_path = MASTER / f"{slug}.webp"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        with Image.open(source_path) as raw:
            source = ImageOps.exif_transpose(raw).convert("RGB")
            for width, quality in VARIANTS:
                height = round(source.height * width / source.width)
                resized = source.resize((width, height), Image.Resampling.LANCZOS)
                resized.save(
                    OUTPUT / f"{width}w" / f"{slug}.webp",
                    "WEBP",
                    quality=quality,
                    method=6,
                    exif=b"",
                    icc_profile=None,
                )
            preview = ImageOps.fit(source, (320, 214), method=Image.Resampling.LANCZOS)
            previews.append((slug.replace("-", " ").title(), preview))

    sheet = Image.new("RGB", (1400, 1030), "#f7f2e7")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("arial.ttf", 20)
    small = ImageFont.truetype("arial.ttf", 15)
    draw.text((42, 24), "Antique Trail · Synthetic Store image set", fill="#172421", font=font)
    for index, (label, preview) in enumerate(previews):
        x = 42 + (index % 4) * 340
        y = 72 + (index // 4) * 238
        sheet.paste(preview, (x, y))
        draw.text((x, y + 219), label, fill="#33423f", font=small)
    evidence = ROOT / "docs" / "evidence" / "ui-03"
    evidence.mkdir(parents=True, exist_ok=True)
    sheet.save(evidence / "synthetic-store-contact-sheet.webp", "WEBP", quality=88, method=6)


if __name__ == "__main__":
    build()

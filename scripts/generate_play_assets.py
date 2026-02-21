#!/usr/bin/env python3
"""
Generate Google Play listing assets for Ishmael (ko-KR).

Outputs:
- fastlane/metadata/android/ko-KR/images/icon.png (512x512)
- fastlane/metadata/android/ko-KR/images/featureGraphic.png (1024x500)
- fastlane/metadata/android/ko-KR/images/phoneScreenshots/*.png
- fastlane/metadata/android/ko-KR/images/sevenInchScreenshots/*.png
- fastlane/metadata/android/ko-KR/images/tenInchScreenshots/*.png
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
TARGET_BASE = ROOT / "fastlane/metadata/android/ko-KR/images"
SCREEN_DIR = TARGET_BASE / "phoneScreenshots"
SEVEN_INCH_DIR = TARGET_BASE / "sevenInchScreenshots"
TEN_INCH_DIR = TARGET_BASE / "tenInchScreenshots"

ICON_SRC = ROOT / "assets/branding/ishmael-logo-1024.png"
SCREEN_SOURCES = [
    ("assets/readme/screen-wallets.png", "01-Wallets.png"),
    ("assets/readme/screen-settings.png", "02-Settings.png"),
    ("assets/readme/screen-about.png", "03-About.png"),
    ("assets/readme/screen-donate.png", "04-Donation.png"),
]


def ensure_dirs(paths: Iterable[Path]) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                "/Library/Fonts/Arial Bold.ttf",
                "/System/Library/Fonts/Supplemental/Helvetica.ttc",
                "DejaVuSans-Bold.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                "/System/Library/Fonts/Supplemental/Arial.ttf",
                "/Library/Fonts/Arial.ttf",
                "/System/Library/Fonts/Supplemental/Helvetica.ttc",
                "DejaVuSans.ttf",
            ]
        )

    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def center_crop_to_ratio(image: Image.Image, target_ratio: float) -> Image.Image:
    width, height = image.size
    source_ratio = width / height

    if source_ratio > target_ratio:
        # Too wide -> crop width
        new_width = int(round(height * target_ratio))
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))

    # Too tall -> crop height
    new_height = int(round(width / target_ratio))
    top = (height - new_height) // 2
    return image.crop((0, top, width, top + new_height))


def generate_icon() -> None:
    icon = Image.open(ICON_SRC).convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
    icon.save(TARGET_BASE / "icon.png", format="PNG")


def make_gradient_bg(width: int, height: int) -> Image.Image:
    top = (14, 23, 40)
    bottom = (34, 61, 108)
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / (height - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        draw.line((0, y, width, y), fill=(r, g, b))
    return img


def generate_feature_graphic() -> None:
    canvas = make_gradient_bg(1024, 500).convert("RGBA")
    accent = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accent)
    accent_draw.ellipse((560, -260, 1250, 430), fill=(88, 142, 255, 56))
    accent_draw.ellipse((430, 120, 1100, 720), fill=(45, 210, 195, 44))
    canvas = Image.alpha_composite(canvas, accent)

    logo = Image.open(ICON_SRC).convert("RGBA").resize((280, 280), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, dest=(72, 110))

    draw = ImageDraw.Draw(canvas)
    title_font = load_font(68, bold=True)
    sub_font = load_font(34, bold=False)
    draw.text((390, 156), "ISHMAEL Wallet", font=title_font, fill=(245, 248, 255, 255))
    draw.text((392, 244), "Mobick Watch-only Wallet", font=sub_font, fill=(190, 207, 238, 255))

    canvas.convert("RGB").save(TARGET_BASE / "featureGraphic.png", format="PNG")


def generate_screenshot_set(target_dir: Path, target_size: tuple[int, int]) -> None:
    target_ratio = target_size[0] / target_size[1]

    for src_relative, output_name in SCREEN_SOURCES:
        src = ROOT / src_relative
        image = Image.open(src).convert("RGB")
        cropped = center_crop_to_ratio(image, target_ratio)
        out = cropped.resize(target_size, Image.Resampling.LANCZOS)
        out.save(target_dir / output_name, format="PNG")


def main() -> None:
    ensure_dirs([TARGET_BASE, SCREEN_DIR, SEVEN_INCH_DIR, TEN_INCH_DIR])
    generate_icon()
    generate_feature_graphic()
    # Keep 9:16 and >=1080px for Play large-screen screenshot recommendations.
    generate_screenshot_set(SCREEN_DIR, (1080, 1920))
    generate_screenshot_set(SEVEN_INCH_DIR, (1080, 1920))
    generate_screenshot_set(TEN_INCH_DIR, (1080, 1920))
    print(f"Generated assets in: {TARGET_BASE}")


if __name__ == "__main__":
    main()

"""Extract an existing ShoutOut avatar without regenerating its artwork."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def extract_avatar(source: Path, destination: Path) -> None:
    image = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Cannot read {source}")

    height, width = image.shape[:2]
    mask = np.full((height, width), cv2.GC_PR_BGD, dtype=np.uint8)
    border = max(24, round(min(width, height) * 0.055))
    mask[:border, :] = cv2.GC_BGD
    mask[-border:, :] = cv2.GC_BGD
    mask[:, :border] = cv2.GC_BGD
    mask[:, -border:] = cv2.GC_BGD

    center_x, center_y = width // 2, height // 2
    foreground_width = round(width * 0.52)
    foreground_height = round(height * 0.62)
    x0 = center_x - foreground_width // 2
    y0 = center_y - foreground_height // 2
    mask[y0 : y0 + foreground_height, x0 : x0 + foreground_width] = (
        cv2.GC_PR_FGD
    )

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        image,
        mask,
        None,
        background_model,
        foreground_model,
        8,
        cv2.GC_INIT_WITH_MASK,
    )

    foreground = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)

    component_count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        foreground, connectivity=8
    )
    if component_count <= 1:
        raise ValueError(f"No foreground detected in {source}")

    center = np.array([center_x, center_y])
    candidates = []
    for label in range(1, component_count):
        area = stats[label, cv2.CC_STAT_AREA]
        distance = np.linalg.norm(centroids[label] - center)
        candidates.append((area - distance * 20, label))
    main_label = max(candidates)[1]
    foreground = np.where(labels == main_label, 255, 0).astype(np.uint8)

    kernel = np.ones((3, 3), np.uint8)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, kernel)

    rgba = cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = foreground
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba).save(destination, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    extract_avatar(args.source, args.destination)


if __name__ == "__main__":
    main()

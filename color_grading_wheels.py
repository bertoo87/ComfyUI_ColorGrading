import colorsys
import math

import torch


class ColorGradingWheels:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "shadows_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "shadows_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "shadows_split": ("FLOAT", {"default": 0.35, "min": 0.0, "max": 1.0, "step": 0.01}),
                "midtones_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "midtones_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "midtones_split": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "highlights_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "highlights_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01}),
                "highlights_split": ("FLOAT", {"default": 0.65, "min": 0.0, "max": 1.0, "step": 0.01}),
                "intensity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "apply"
    CATEGORY = "image/color"

    @staticmethod
    def _smoothstep(edge0, edge1, x):
        denom = max(abs(edge1 - edge0), 1e-6)
        t = torch.clamp((x - edge0) / denom, 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    @staticmethod
    def _wheel_vector(x, y, device, dtype):
        radius = min(1.0, math.sqrt(x * x + y * y))
        if radius < 1e-6:
            return torch.zeros(3, device=device, dtype=dtype)

        hue = (math.atan2(-y, x) / (2.0 * math.pi)) % 1.0
        r, g, b = colorsys.hsv_to_rgb(hue, 1.0, 1.0)
        color = torch.tensor([r, g, b], device=device, dtype=dtype)
        return (color - 0.5) * (radius * 0.35)

    def apply(
        self,
        image,
        shadows_x,
        shadows_y,
        shadows_split,
        midtones_x,
        midtones_y,
        midtones_split,
        highlights_x,
        highlights_y,
        highlights_split,
        intensity,
    ):
        if image.shape[-1] != 3:
            return (image,)

        img = image
        device = img.device
        dtype = img.dtype

        shadows_split = float(max(0.0, min(1.0, shadows_split)))
        highlights_split = float(max(0.0, min(1.0, highlights_split)))
        midtones_split = float(max(0.0, min(1.0, midtones_split)))
        intensity = float(max(0.0, min(2.0, intensity)))

        if shadows_split > highlights_split - 0.05:
            center = (shadows_split + highlights_split) * 0.5
            shadows_split = max(0.0, center - 0.025)
            highlights_split = min(1.0, center + 0.025)
        midtones_split = max(shadows_split + 0.01, min(highlights_split - 0.01, midtones_split))

        luma = (
            img[..., 0] * 0.2126
            + img[..., 1] * 0.7152
            + img[..., 2] * 0.0722
        ).unsqueeze(-1)

        softness = 0.08 + abs(midtones_split - 0.5) * 0.12
        shadow_w = 1.0 - self._smoothstep(shadows_split - softness, shadows_split + softness, luma)
        highlight_w = self._smoothstep(highlights_split - softness, highlights_split + softness, luma)

        sigma = max(0.08, (highlights_split - shadows_split) * 0.55)
        midtones_w = torch.exp(-0.5 * ((luma - midtones_split) / sigma) ** 2)

        total_w = shadow_w + midtones_w + highlight_w + 1e-6
        shadow_w = shadow_w / total_w
        midtones_w = midtones_w / total_w
        highlight_w = highlight_w / total_w

        shadow_vec = self._wheel_vector(shadows_x, shadows_y, device, dtype).view(1, 1, 1, 3)
        midtones_vec = self._wheel_vector(midtones_x, midtones_y, device, dtype).view(1, 1, 1, 3)
        highlights_vec = self._wheel_vector(highlights_x, highlights_y, device, dtype).view(1, 1, 1, 3)

        delta = shadow_w * shadow_vec + midtones_w * midtones_vec + highlight_w * highlights_vec
        graded = torch.clamp(img + delta * intensity, 0.0, 1.0)
        return (graded,)


NODE_CLASS_MAPPINGS = {
    "ColorGradingWheels": ColorGradingWheels,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ColorGradingWheels": "Color Grading Wheels",
}

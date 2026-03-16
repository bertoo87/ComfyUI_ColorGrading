# ComfyUI Color Grading Wheels

Custom Node fur ComfyUI mit drei Farbradern (Shadows, Midtones, Highlights), je einem Bereichsregler und einem globalen Intensity-Slider.

## Features

- Drei interaktive Farbrader direkt im Node
- Je ein Tonbereichs-Split-Regler pro Rad
- Globaler Intensitatsregler fur den gesamten Effekt
- Echtzeitfahig auf GPU (Torch-basiert)

## Installation

1. Ordner nach `ComfyUI/custom_nodes/ComfyUI_ColorGrading` legen.
2. ComfyUI neu starten.
3. Node in ComfyUI suchen: `Color Grading Wheels`.

## Hinweise

- Die Node erwartet RGB-`IMAGE`-Tensors im ComfyUI-Standardformat.
- Die Farbrader schreiben ihre Werte in versteckte Float-Widgets, damit Workflows die Einstellungen speichern.

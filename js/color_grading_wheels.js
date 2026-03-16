import { app } from "../../scripts/app.js";

const TARGET_NODE = "ColorGradingWheels";
const MIN_SPLIT_GAP = 0.05;
const MIN_NODE_WIDTH = 280;
const MIN_NODE_HEIGHT = 500;

const WHEELS = [
  { id: "midtones", label: "Mid-Tones", xName: "midtones_x", yName: "midtones_y", splitName: "midtones_split" },
  { id: "shadows", label: "Shadows", xName: "shadows_x", yName: "shadows_y", splitName: "shadows_split" },
  { id: "highlights", label: "Highlights", xName: "highlights_x", yName: "highlights_y", splitName: "highlights_split" },
];

const wheelImageCache = new Map();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

function getWheelImage(radius) {
  const r = Math.max(8, Math.floor(radius));
  if (wheelImageCache.has(r)) {
    return wheelImageCache.get(r);
  }

  const size = r * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const rn = Math.sqrt(dx * dx + dy * dy) / r;
      const offset = (y * size + x) * 4;

      if (rn <= 1.0) {
        const hue = ((Math.atan2(-dy, dx) / (Math.PI * 2)) + 1.0) % 1.0;
        const sat = rn;
        const [rr, gg, bb] = hsvToRgb(hue, sat, 1.0);
        data[offset + 0] = Math.round(rr * 255);
        data[offset + 1] = Math.round(gg * 255);
        data[offset + 2] = Math.round(bb * 255);
        data[offset + 3] = 255;
      } else {
        data[offset + 3] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  wheelImageCache.set(r, canvas);
  return canvas;
}

function isTargetNode(node) {
  return node?.comfyClass === TARGET_NODE || node?.type === TARGET_NODE;
}

function findWidget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  if (typeof widget.callback === "function") {
    widget.callback(value);
  }
}

function hideWidget(widget) {
  if (!widget) return;
  widget.type = "hidden";
  widget.computeSize = () => [0, -4];
  widget.serialize = true;
}

function getLayout(node) {
  const width = Math.max(MIN_NODE_WIDTH, node.size?.[0] ?? MIN_NODE_WIDTH);
  const wheelRadius = 48;
  const topY = 132;
  const bottomY = 320;
  const sliderOffset = wheelRadius + 24;
  const splitHalf = 50;

  return {
    width,
    wheelRadius,
    splitHalf,
    anchors: {
      midtones: { cx: width * 0.5, cy: topY, sy: topY + sliderOffset },
      shadows: { cx: width * 0.3, cy: bottomY, sy: bottomY + sliderOffset },
      highlights: { cx: width * 0.7, cy: bottomY, sy: bottomY + sliderOffset },
    },
    intensity: {
      x0: 30,
      x1: width - 30,
      y: bottomY + sliderOffset + 58,
    },
  };
}

function enforceMinNodeSize(node) {
  const current = node.size ?? [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
  const width = Math.max(MIN_NODE_WIDTH, Number(current[0] ?? 0));
  const height = Math.max(MIN_NODE_HEIGHT, Number(current[1] ?? 0));
  if (!node.size || node.size[0] !== width || node.size[1] !== height) {
    node.size = [width, height];
  }
}

function ensureState(node) {
  if (node._cgState) return node._cgState;

  const state = {
    intensity: Number(findWidget(node, "intensity")?.value ?? 1.0),
    shadows: { x: 0.0, y: 0.0, split: 0.35 },
    midtones: { x: 0.0, y: 0.0, split: 0.5 },
    highlights: { x: 0.0, y: 0.0, split: 0.65 },
  };

  for (const wheel of WHEELS) {
    state[wheel.id].x = clamp(Number(findWidget(node, wheel.xName)?.value ?? state[wheel.id].x), -1.0, 1.0);
    state[wheel.id].y = clamp(Number(findWidget(node, wheel.yName)?.value ?? state[wheel.id].y), -1.0, 1.0);
    state[wheel.id].split = Number(findWidget(node, wheel.splitName)?.value ?? state[wheel.id].split);
  }

  normalizeSplits(state, "midtones");
  state.intensity = clamp(state.intensity, 0.0, 2.0);
  node._cgState = state;
  return state;
}

function syncWidgets(node) {
  const state = ensureState(node);

  for (const wheel of WHEELS) {
    setWidgetValue(findWidget(node, wheel.xName), state[wheel.id].x);
    setWidgetValue(findWidget(node, wheel.yName), state[wheel.id].y);
    setWidgetValue(findWidget(node, wheel.splitName), state[wheel.id].split);
  }

  setWidgetValue(findWidget(node, "intensity"), state.intensity);
}

function normalizeSplits(state, changedId) {
  state.shadows.split = clamp(state.shadows.split, 0.0, 1.0);
  state.highlights.split = clamp(state.highlights.split, 0.0, 1.0);

  if (state.shadows.split > state.highlights.split - MIN_SPLIT_GAP) {
    if (changedId === "shadows") {
      state.shadows.split = state.highlights.split - MIN_SPLIT_GAP;
    } else if (changedId === "highlights") {
      state.highlights.split = state.shadows.split + MIN_SPLIT_GAP;
    } else {
      const center = (state.shadows.split + state.highlights.split) * 0.5;
      state.shadows.split = center - MIN_SPLIT_GAP * 0.5;
      state.highlights.split = center + MIN_SPLIT_GAP * 0.5;
    }
  }

  state.shadows.split = clamp(state.shadows.split, 0.0, 1.0 - MIN_SPLIT_GAP);
  state.highlights.split = clamp(state.highlights.split, MIN_SPLIT_GAP, 1.0);
  state.midtones.split = clamp(state.midtones.split, state.shadows.split + 0.01, state.highlights.split - 0.01);
}

function drawWheel(ctx, wheelImage, anchor, radius, label, value) {
  ctx.drawImage(wheelImage, anchor.cx - radius, anchor.cy - radius, radius * 2, radius * 2);

  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(anchor.cx, anchor.cy, radius + 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#dfdfdf";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, anchor.cx, anchor.cy - radius - 16);

  const px = anchor.cx + value.x * radius;
  const py = anchor.cy + value.y * radius;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRangeSlider(ctx, anchor, half, value) {
  const x0 = anchor.cx - half;
  const x1 = anchor.cx + half;
  const y = anchor.sy;
  const px = x0 + (x1 - x0) * value;

  ctx.strokeStyle = "#bababa";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();

  ctx.fillStyle = "#f0f0f0";
  ctx.beginPath();
  ctx.moveTo(px, y - 10);
  ctx.lineTo(px - 6, y + 2);
  ctx.lineTo(px + 6, y + 2);
  ctx.closePath();
  ctx.fill();
}

function drawIntensitySlider(ctx, info, intensity) {
  const value = clamp(intensity / 2.0, 0.0, 1.0);
  const px = info.x0 + (info.x1 - info.x0) * value;

  ctx.fillStyle = "#dfdfdf";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Intensity", info.x0, info.y - 16);

  ctx.strokeStyle = "#bababa";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(info.x0, info.y);
  ctx.lineTo(info.x1, info.y);
  ctx.stroke();

  ctx.fillStyle = "#f0f0f0";
  ctx.beginPath();
  ctx.arc(px, info.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawNodeUI(node, ctx) {
  if (!ctx || node.flags?.collapsed) return;
  enforceMinNodeSize(node);

  const state = ensureState(node);
  const layout = getLayout(node);
  const wheelImage = getWheelImage(layout.wheelRadius);

  drawWheel(ctx, wheelImage, layout.anchors.midtones, layout.wheelRadius, "Mid-Tones", state.midtones);
  drawWheel(ctx, wheelImage, layout.anchors.shadows, layout.wheelRadius, "Shadows", state.shadows);
  drawWheel(ctx, wheelImage, layout.anchors.highlights, layout.wheelRadius, "Highlights", state.highlights);

  drawRangeSlider(ctx, layout.anchors.midtones, layout.splitHalf, state.midtones.split);
  drawRangeSlider(ctx, layout.anchors.shadows, layout.splitHalf, state.shadows.split);
  drawRangeSlider(ctx, layout.anchors.highlights, layout.splitHalf, state.highlights.split);

  drawIntensitySlider(ctx, layout.intensity, state.intensity);
}

function hitTest(node, pos) {
  if (!pos) return null;
  const layout = getLayout(node);

  for (const wheel of WHEELS) {
    const anchor = layout.anchors[wheel.id];
    const dx = pos[0] - anchor.cx;
    const dy = pos[1] - anchor.cy;
    if (Math.sqrt(dx * dx + dy * dy) <= layout.wheelRadius + 3) {
      return { type: "wheel", id: wheel.id };
    }

    const sx0 = anchor.cx - layout.splitHalf;
    const sx1 = anchor.cx + layout.splitHalf;
    if (pos[0] >= sx0 - 8 && pos[0] <= sx1 + 8 && Math.abs(pos[1] - anchor.sy) <= 12) {
      return { type: "split", id: wheel.id };
    }
  }

  if (
    pos[0] >= layout.intensity.x0 - 8 &&
    pos[0] <= layout.intensity.x1 + 8 &&
    Math.abs(pos[1] - layout.intensity.y) <= 12
  ) {
    return { type: "intensity" };
  }

  return null;
}

function applyDrag(node, pos) {
  if (!pos) return;
  const drag = node._cgDrag;
  if (!drag) return;

  const state = ensureState(node);
  const layout = getLayout(node);

  if (drag.type === "wheel") {
    const anchor = layout.anchors[drag.id];
    let x = (pos[0] - anchor.cx) / layout.wheelRadius;
    let y = (pos[1] - anchor.cy) / layout.wheelRadius;
    const len = Math.sqrt(x * x + y * y);
    if (len > 1.0) {
      x /= len;
      y /= len;
    }
    state[drag.id].x = Number(x.toFixed(3));
    state[drag.id].y = Number(y.toFixed(3));
  } else if (drag.type === "split") {
    const anchor = layout.anchors[drag.id];
    const x0 = anchor.cx - layout.splitHalf;
    const x1 = anchor.cx + layout.splitHalf;
    state[drag.id].split = clamp((pos[0] - x0) / (x1 - x0), 0.0, 1.0);
    normalizeSplits(state, drag.id);
  } else if (drag.type === "intensity") {
    const t = clamp((pos[0] - layout.intensity.x0) / (layout.intensity.x1 - layout.intensity.x0), 0.0, 1.0);
    state.intensity = Number((t * 2.0).toFixed(3));
  }

  syncWidgets(node);
  node.setDirtyCanvas(true, true);
}

app.registerExtension({
  name: "colorgrading.wheels",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET_NODE) return;

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      this._cgState = null;
      this._cgDrag = null;
      if (onConfigure) return onConfigure.apply(this, args);
      return undefined;
    };
  },

  nodeCreated(node) {
    if (!isTargetNode(node)) return;

    for (const wheel of WHEELS) {
      hideWidget(findWidget(node, wheel.xName));
      hideWidget(findWidget(node, wheel.yName));
      hideWidget(findWidget(node, wheel.splitName));
    }
    hideWidget(findWidget(node, "intensity"));

    const originalResize = node.onResize?.bind(node);
    node.onResize = function (size) {
      if (size) {
        size[0] = Math.max(MIN_NODE_WIDTH, Number(size[0] ?? 0));
        size[1] = Math.max(MIN_NODE_HEIGHT, Number(size[1] ?? 0));
      }
      const result = originalResize ? originalResize(size) : undefined;
      enforceMinNodeSize(this);
      return result;
    };

    node.size = [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
    enforceMinNodeSize(node);
    ensureState(node);
    syncWidgets(node);

    const originalDraw = node.onDrawForeground?.bind(node);
    node.onDrawForeground = function (ctx) {
      if (originalDraw) {
        originalDraw(ctx);
      }
      drawNodeUI(this, ctx);
    };

    const originalMouseDown = node.onMouseDown?.bind(node);
    node.onMouseDown = function (event, pos, canvas) {
      const hit = hitTest(this, pos);
      if (!hit) {
        if (originalMouseDown) return originalMouseDown(event, pos, canvas);
        return false;
      }
      this._cgDrag = hit;
      applyDrag(this, pos);
      return true;
    };

    const originalMouseMove = node.onMouseMove?.bind(node);
    node.onMouseMove = function (event, pos, canvas) {
      if (this._cgDrag) {
        applyDrag(this, pos);
        return true;
      }
      if (originalMouseMove) return originalMouseMove(event, pos, canvas);
      return false;
    };

    const originalMouseUp = node.onMouseUp?.bind(node);
    node.onMouseUp = function (event, pos, canvas) {
      this._cgDrag = null;
      if (originalMouseUp) return originalMouseUp(event, pos, canvas);
      return false;
    };

    const originalMouseLeave = node.onMouseLeave?.bind(node);
    node.onMouseLeave = function (event, pos, canvas) {
      this._cgDrag = null;
      if (originalMouseLeave) return originalMouseLeave(event, pos, canvas);
      return false;
    };
  },
});

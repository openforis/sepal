// Pure behavior for the compact vertical scrub control. Values are bounded to [min, max].

export const clampValue = (value, min, max) => Math.min(max, Math.max(min, value))

// Map a vertical pointer drag to a bounded value. Dragging UP (currentY < startY) increases the value, DOWN
// decreases it; horizontal movement is ignored (x is not a parameter). `sensitivity` is the vertical pixels
// for a full min->max sweep. Result is clamped to [min, max].
export const valueFromVerticalDrag = ({startValue, startY, currentY, min = 0, max = 1, sensitivity = 100}) =>
    clampValue(startValue + ((startY - currentY) / sensitivity) * (max - min), min, max)

// Default click/keyboard toggle: from the minimum jump to the maximum, otherwise drop to the minimum. For
// [0, 1] this is a strict 0 <-> 1 toggle.
export const toggleMinMax = (value, min = 0, max = 1) => value <= min ? max : min

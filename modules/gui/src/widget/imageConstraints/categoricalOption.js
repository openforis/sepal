// Content-aware width for tabular category values. `ch` follows the input text size closely enough for ids and
// class codes; the bounds keep single digits compact and prevent an unusually long value consuming the label.
export const categoricalValueColumnWidth = values => {
    const maxLength = Math.max(0, ...(values || []).map(value => `${value ?? ''}`.length))
    return `${Math.min(14, Math.max(4, maxLength + 2))}ch`
}

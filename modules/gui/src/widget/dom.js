export const isOverElement = (e, element) =>
    element.contains(e.target)

export const isOverElementDeep = (e, element) =>
    document.elementsFromPoint(e.clientX, e.clientY).includes(element)

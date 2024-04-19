export const isOverElement = (e, element) =>
    typeof e === MouseEvent
        ? document.elementsFromPoint(e.clientX, e.clientY).includes(element)
        : element.contains(e.target)

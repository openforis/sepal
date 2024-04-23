export const isOverElement = (e, element) =>
    e.type === 'mousemove'
        ? document.elementsFromPoint(e.clientX, e.clientY).includes(element)
        : element.contains(e.target)

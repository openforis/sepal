import React from 'react'

// A message's '|'-separated lines, each an array of nodes. A rich message (richMsg with element
// values) is an array of strings and elements, and only its strings can hold a separator.
export const messageLines = message =>
    [message].flat().reduce(
        (lines, part) => typeof part === 'string'
            ? part.split('|').reduce(
                (lines, text, index) => index ? [...lines, [text]] : appendToLast(lines, text),
                lines
            )
            : appendToLast(lines, part),
        [[]]
    )

// The lines as plain text, for copying a message to the clipboard.
export const messageTextLines = message =>
    messageLines(message).map(line => line.map(nodeText).join(''))

const appendToLast = (lines, part) =>
    [...lines.slice(0, -1), [...lines.at(-1), part]]

const nodeText = node =>
    typeof node === 'string' || typeof node === 'number'
        ? String(node)
        : React.isValidElement(node)
            ? node.type.text?.(node.props) ?? React.Children.toArray(node.props.children).map(nodeText).join('')
            : ''

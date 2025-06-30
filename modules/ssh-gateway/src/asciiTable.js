const {format} = require('./console')
const _ = require('lodash')

const th = cells => ({type: 'hr', cells})
const tr = cells => ({type: 'tr', cells})
const td = props => {
    props.width = props.width || `${props.value}`.length
    return props
}
const table = rows => new AsciiTable(rows).toString()

const transpose = a => a[0].map((_, c) => a.map(r => r[c]))

const INTERSECTION = {
    urdl: '┿',
    rd: '┏',
    dl: '┓',
    ur: '┗',
    ul: '┛',
    urd: '┠',
    udl: '┨',
    rdl: '┯',
    url: '┷',
    ud: '┃',
    rl: '━',
}
const VERTICAL_OUTER = '┃'
const VERTICAL_INNER = '│'
const HORIZONTAL = '━'

class Row {
    constructor(i, props, cells, table) {
        this.i = i
        this.cells = cells
        this.isHeader = props.type === 'hr'
        this.table = table
    }

    getCell(columnIndex) {
        return this.cells.map(cell =>
            new Array(cell.colSpan || 0).fill(cell)
        ).flat()[columnIndex]
    }

    inSpan(columnIndex) {
        return columnIndex !== this.table.columnCount &&
            this.getCell(columnIndex).i !== columnIndex
    }

    toString() {
        const i = this.i
        const top = (i === 0 || (this.isHeader && !this.table.rows[i - 1].isHeader)) ? this.table.lineSeparator(i) : ''
        const line = `${VERTICAL_OUTER} ${this.cells.join(` ${VERTICAL_INNER} `)} ${VERTICAL_OUTER}\n`
        const bottom = this.isHeader ? this.table.lineSeparator(i + 1) : (i === this.table.rows.length - 1 ? this.table.lineSeparator(i + 1) : '')
        return top + line + bottom
    }

}

class Cell {
    constructor(i, props, table) {
        this.i = i
        this.value = props.value
        this.colSpan = props.colSpan || 1
        this.width = _.sum(_.range(0, this.colSpan).map(offset => table.columnWidths[offset + i])) + (this.colSpan - 1) * 3
        this.align = this.colSpan > 1
            ? 'center'
            : props.align || _.isNumber(props.value) ? 'right' : 'left'
        this.styles = props.styles || []
    }

    paddedValue() {
        const s = _.toString(this.value)
        switch (this.align) {
            case 'right': return s.padStart(this.width)
            case 'left': return s.padEnd(this.width)
            default: return s.padStart((s.length + this.width) / 2).padEnd(this.width)
        }
    }

    toString() {
        return format(this.paddedValue(), ...this.styles)
    }
}

class AsciiTable {
    constructor(rows) {
        this.columnCount = Math.max(...rows.map(row => row.cells.length))
        this.columnWidths = transpose(
            rows.map(row =>
                row.cells.map(cell =>
                    cell.colSpan ? new Array(this.columnCount).fill(0) : cell.width
                ).flat()
            )
        ).map(c => Math.max(...c))

        this.rows = rows.map((row, rowIndex) => {
            const cells = row.cells.map((cell, cellIndex) =>
                new Cell(cellIndex, cell, this)
            )
            return new Row(rowIndex, row, cells, this)
        })
    }

    lineSeparator(rowIndex) {
        return `${this.columnWidths.map((width, columnIndex) => {
            return this.border(rowIndex, columnIndex) + HORIZONTAL.repeat(width + 2)
        }
        ).join('') + this.border(rowIndex, this.columnCount)}\n`
    }

    border(rowIndex, columnIndex) {
        const up = rowIndex > 0 && !this.rows[rowIndex - 1].inSpan(columnIndex) ? 'u' : ''
        const right = columnIndex < this.columnCount ? 'r' : ''
        const down = rowIndex < this.rows.length && !this.rows[rowIndex].inSpan(columnIndex) ? 'd' : ''
        const left = columnIndex > 0 ? 'l' : ''
        return INTERSECTION[up + right + down + left]
    }

    toString() {
        return this.rows.join('')
    }

}

module.exports = {table, th, tr, td}

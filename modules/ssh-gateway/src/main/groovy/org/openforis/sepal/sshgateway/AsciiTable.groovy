package org.openforis.sepal.sshgateway

class AsciiTable {
    private static final INTERSECTION = [
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
    ]
    private static final VERTICAL_OUTER = '┃'
    private static final VERTICAL_INNER = '│'
    private static final HORIZONTAL = '━'

    private final List<Row> rows
    private final List<Integer> columnWidths
    private final int columnCount

    AsciiTable(List rows) {
        this.columnWidths = rows
            .collect { row ->
                row.cells.collect { cell ->
                    cell.colSpan ? [0] * cell.colSpan : cell.width
                }.flatten()
            }
            .transpose()
            .collect { it.max() }
        this.columnCount = columnWidths.size()

        this.rows = rows.withIndex().collect { row, rowIndex ->
            def cells = row.cells.withIndex().collect { cell, cellIndex ->
                new Cell(cellIndex, cell)
            }
            new Row(rowIndex, row, cells)
        }
    }


    String lineSeparator(int rowIndex) {
        columnWidths.withIndex().collect { width, columnIndex ->
            border(rowIndex, columnIndex) + HORIZONTAL * (width + 2)
        }.join('') + border(rowIndex, columnCount) + '\n'
    }

    String border(int rowIndex, int columnIndex) {
        def up = rowIndex > 0 && !rows[rowIndex - 1].inSpan(columnIndex) ? 'u' : ''
        def right = columnIndex < columnCount ? 'r' : ''
        def down = rowIndex < rows.size() && !rows[rowIndex].inSpan(columnIndex) ? 'd' : ''
        def left = columnIndex > 0 ? 'l' : ''
        return INTERSECTION[up + right + down + left]

    }

    String toString() {
        rows.join('')
    }

    private class Row {
        final int i
        final List<Cell> cells
        final isHeader

        Row(int i, Map props, List<Cell> cells) {
            this.i = i
            this.cells = cells
            this.isHeader = props.type == 'hr'
        }

        Cell getCell(int columnIndex) {
            cells.collect {
                [it] * it.colSpan
            }.flatten()[columnIndex] as Cell
        }

        boolean inSpan(int columnIndex) {
            columnIndex != columnCount &&
                getCell(columnIndex).i != columnIndex
        }

        String toString() {
            def top = (i == 0 || (isHeader && !rows[i - 1].isHeader)) ? lineSeparator(i) : ''
            def line = VERTICAL_OUTER + ' ' + cells.join(' ' + VERTICAL_INNER + ' ') + ' ' + VERTICAL_OUTER + '\n'
            def bottom = isHeader ? lineSeparator(i + 1) : (i == rows.size() - 1 ? lineSeparator(i + 1) : '')
            return top + line + bottom
        }

    }

    private class Cell {
        final i
        final value
        final colSpan
        final width
        final String align
        final List<Style> styles

        Cell(int i, Map props) {
            this.i = i
            value = props.value
            colSpan = props.colSpan ?: 1
            width = (0..<colSpan).collect { offset -> columnWidths[offset + i] }.sum() + (colSpan - 1) * 3
            align = colSpan > 1
                ? 'center'
                : props.align ?: props.value instanceof Number ? 'right' : 'left'
            styles = props.styles ?: [] as List<Style>
        }

        String paddedValue() {
            switch (align) {
                case 'right': return value.toString().padLeft(width)
                case 'left': return value.toString().padRight(width)
                default: return value.toString().center(width)
            }
        }

        String toString() {
            return Style.format(paddedValue(), *styles)
        }
    }

    static Map th(List<Map> cells) {
        [type: 'hr', cells: cells]
    }

    static Map tr(List<Map> cells) {
        [type: 'tr', cells: cells]
    }

    static Map td(Map props) {
        props.width = props.width ?: props.value.toString().length()
        return props
    }

    static void main(String[] args) {
        def table = new AsciiTable([
            th([
                td(value: 'Available instance types', colSpan: 4)
            ]),
            th([
                td(value: 'ID'),
                td(value: 'CPU', align: 'right'),
                td(value: 'GB RAM', align: 'right'),
                td(value: 'USD/h', align: 'right')
            ]),
            tr([
                td(value: 't1'),
                td(value: 1),
                td(value: 2),
                td(value: 0.02d)
            ]),
            tr([
                td(value: 'm16'),
                td(value: 16),
                td(value: 64),
                td(value: 0.76d)
            ])
        ])

        println(table)
    }

}

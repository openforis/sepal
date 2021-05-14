import {FileSelect} from 'widget/fileSelect'
import {Form} from 'widget/form/form'
import {FormCombo} from 'widget/form/combo'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '../../../recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {parseCsvFile$} from 'csv'
import Color from 'color'
import Icon from 'widget/icon'
import Label from 'widget/label'
import React from 'react'
import _ from 'lodash'
import guid from 'guid'
import styles from './legendImport.module.css'

const fields = {
    rows: new Form.Field()
        .notEmpty(),
    name: new Form.Field()
        .notBlank(),
    valueColumn: new Form.Field()
        .notBlank(),
    labelColumn: new Form.Field()
        .notBlank(),
    colorColumnType: new Form.Field()
        .notBlank(),
    colorColumn: new Form.Field()
        .skip((v, {colorColumnType}) => colorColumnType !== 'single')
        .notBlank(),
    redColumn: new Form.Field()
        .skip((v, {colorColumnType}) => colorColumnType !== 'multiple')
        .notBlank(),
    greenColumn: new Form.Field()
        .skip((v, {colorColumnType}) => colorColumnType !== 'multiple')
        .notBlank(),
    blueColumn: new Form.Field()
        .skip((v, {colorColumnType}) => colorColumnType !== 'multiple')
        .notBlank(),
    alphaColumn: new Form.Field()
        .skip((v, {colorColumnType}) => colorColumnType !== 'multiple')
}

class _LegendImport extends React.Component {
    state = {
        columns: undefined,
        rows: undefined,
        validMappings: undefined
    }

    render() {
        const {form, activatable: {deactivate}} = this.props
        const invalid = form.isInvalid()
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <Panel.Header
                    icon='file-import'
                    title={msg('process.classification.panel.legend.import.title')}
                />

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {validMappings} = this.state
        return (
            <Layout>
                {this.renderFileSelect()}
                {validMappings ? this.renderForm() : null}
            </Layout>
        )
    }

    renderForm() {
        const {inputs: {colorColumnType}} = this.props
        return (
            <React.Fragment>
                {this.renderColorColumnType()}
                {colorColumnType.value === 'single'
                    ? this.renderMapping('colorColumn')
                    : (
                        <React.Fragment>
                            <Layout type='horizontal'>
                                {this.renderMapping('redColumn')}
                                {this.renderMapping('greenColumn')}
                            </Layout>
                            <Layout type='horizontal'>
                                {this.renderMapping('blueColumn')}
                                {this.renderMapping('alphaColumn')}
                            </Layout>
                        </React.Fragment>
                    )}
                <Layout type='horizontal'>
                    {this.renderMapping('valueColumn')}
                    {this.renderMapping('labelColumn')}
                </Layout>
            </React.Fragment>
        )
    }

    renderColorColumnType() {
        const {inputs: {colorColumnType}} = this.props
        return (
            <Form.Buttons
                label={msg('process.classification.panel.legend.import.colorColumnType.label')}
                tooltip={msg('process.classification.panel.legend.import.colorColumnType.tooltip')}
                input={colorColumnType}
                options={[
                    {value: 'single', label: msg('process.classification.panel.legend.import.colorColumnType.single')},
                    {value: 'multiple', label: msg('process.classification.panel.legend.import.colorColumnType.multiple')},
                ]}
            />
        )
    }

    renderMapping(name) {
        const {inputs} = this.props
        const {validMappings} = this.state
        const options = (validMappings[name] || []).map(column => ({value: column, label: column}))
        return (
            <FormCombo
                className={styles.field}
                input={inputs[name]}
                options={options}
                label={msg(['process.classification.panel.legend.import.column', name, 'label'])}
                placeholder={msg(['process.classification.panel.legend.import.column', name, 'placeholder'])}
                tooltip={msg(['process.classification.panel.legend.import.column', name, 'tooltip'])}
                onChange={({value}) => this.selectedColumn(name, value)}
            />
        )
    }

    renderFileSelect() {
        const {stream, inputs: {name}} = this.props
        return (
            <Layout spacing={'compact'}>
                <Label>{msg('process.classification.panel.legend.import.file.label')}</Label>
                <FileSelect
                    single
                    onSelect={file => this.onSelectFile(file)}>
                    {name.value
                        ? <div>
                            {stream('LOAD_CSV_ROWS').active
                                ? <Icon name={'spinner'} className={styles.spinner}/>
                                : null}
                            {name.value}
                        </div>
                        : null
                    }
                </FileSelect>
            </Layout>
        )
    }

    componentDidUpdate(prevProps, prevState) {
        const {rows: prevRows} = prevState
        const {rows} = this.state
        if (rows !== prevRows) {
            this.setDefaults()
        }
    }

    selectedColumn(field, column) {
        const {inputs} = this.props;
        ['valueColumn', 'labelColumn', 'colorColumn', 'redColumn', 'blueColumn', 'greenColumn', 'alphaColumn']
            .filter(f => f !== field)
            .forEach(f => {
                if (inputs[f].value === column) {
                    inputs[f].set(null) // TODO: This is not having any effect
                }
            })
    }

    setDefaults() {
        const {inputs} = this.props
        const {columns, rows} = this.state
        const validMappings = getValidMappings(columns, rows)
        this.setState({validMappings})
        const defaults = getDefaults(columns, rows, validMappings)
        Object.keys(defaults).forEach(field => inputs[field].set(defaults[field]))
    }

    onSelectFile(file) {
        const {stream, inputs: {name, rows: rowsInput}} = this.props
        name.set(file.name)
        stream('LOAD_CSV_ROWS',
            parseCsvFile$(file),
            ({columns, rows}) => {
                rowsInput.set(rows)
                this.setState({columns, rows})
            }
        )
    }

    save() {
        console.log('save')
    }
}

const policy = () => ({_: 'allow'})

const valuesToModel = ({
    rows,
    valueColumn,
    labelColumn,
    colorColumnType,
    colorColumn,
    redColumn,
    greenColumn,
    blueColumn
}) => {
    return {entries: rows.map(row => ({
        id: guid(),
        color: colorColumnType === 'single'
            ? Color(row[colorColumn]).hex()
            : Color.rgb([row[redColumn], row[greenColumn], row[blueColumn]]).hex(),
        value: row[valueColumn],
        label: row[labelColumn]
    }))}
}

const modelToValues = () => ({})

export const LegendImport = compose(
    _LegendImport,
    recipeFormPanel({
        id: 'legendImport',
        path: () => 'legend',
        fields,
        valuesToModel,
        modelToValues,
        policy,
    })
)

export const getValidMappings = (columns, rows) => {
    const toInts = column => {
        return rows
            .map(row => {
                const value = row[column]
                try {
                    return _.isInteger(value)
                        ? value
                        : _.isInteger(parseInt(value))
                            ? parseInt(value)
                            : null
                } catch (_e) {
                    return false
                }
            })
            .filter(i => _.isInteger(i))
    }
    const valueColumn = columns.filter(column =>
        _.uniq(toInts(column)).length === rows.length
    )
    const labelColumn = columns.filter(column =>
        _.uniq(rows
            .map(row => _.isNaN(row[column])
                ? null
                : row[column].toString().trim()
            )
            .filter(value => value)
        ).length === rows.length
    )
    const colorColumn = columns.filter(column =>
        _.uniq(rows
            .map(row => {
                try {
                    return Color(row[column].trim()).hex()
                } catch(_e) {
                    return false
                }
            })
            .filter(value => value)
        ).length === rows.length
    )
    const colorChannel = columns.filter(column =>
        toInts(column).length === rows.length
    )
    return ({valueColumn, labelColumn, colorColumn, redColumn: colorChannel, greenColumn: colorChannel, blueColumn: colorChannel, alphaColumn: colorChannel})
}

export const getDefaults = (columns, rows, validMappings) => {
    const mappings = _.cloneDeep(validMappings)
    const selectedColumn = column => {
        if (!column) return
        Object.keys(mappings).forEach(key =>
            mappings[key] = mappings[key].filter(c => c !== column)
        )
    }

    const firstContaining = (columns, strings) =>
        columns.find(column => strings.find(s => column.toLowerCase().includes(s.toLowerCase())))

    const colorColumnType = mappings.colorColumn.length
        ? 'single'
        : (mappings.redColumn.length >= 4 &&
            mappings.greenColumn.length >= 4 &&
            mappings.blueColumn.length >= 4)
            ? 'multiple'
            : null

    const colorColumn = mappings.colorColumn.length
        ? mappings.colorColumn[0]
        : null
    selectedColumn(colorColumn)

    const valueColumn = mappings.valueColumn.length
        ? colorColumnType === 'single'
            ? mappings.valueColumn[0]
            : firstContaining(mappings.valueColumn, ['class', 'value', 'type'])
        : null
    selectedColumn(valueColumn)

    const labelColumn = mappings.labelColumn.length
        ? firstContaining(mappings.labelColumn, ['desc', 'label', 'name'])
        : null
    selectedColumn(labelColumn)

    const redColumn = mappings.redColumn.length
        ? firstContaining(mappings.redColumn, ['red'])
        : null
    selectedColumn(redColumn)

    const greenColumn = mappings.greenColumn.length
        ? firstContaining(mappings.greenColumn, ['green'])
        : null
    selectedColumn(greenColumn)

    const blueColumn = mappings.blueColumn.length
        ? firstContaining(mappings.blueColumn, ['blue'])
        : null
    selectedColumn(blueColumn)

    const alphaColumn = mappings.alphaColumn.length
        ? firstContaining(mappings.alphaColumn, ['alpha'])
        : null
    selectedColumn(alphaColumn)
    return _.transform({
        valueColumn,
        labelColumn,
        colorColumnType,
        colorColumn,
        redColumn,
        greenColumn,
        blueColumn,
        alphaColumn
    }, (defaults, value, key) => {
        if (value) {
            defaults[key] = value
        }
        return defaults
    })
}

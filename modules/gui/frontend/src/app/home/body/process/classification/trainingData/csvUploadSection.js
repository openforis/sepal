import * as PropTypes from 'prop-types'
import React, {Component} from 'react'
import {Subject, zip} from 'rxjs'
import {toArray} from 'rxjs/operators'
import Papa from 'papaparse'
import {FileSelect} from 'widget/fileSelect'
import {Layout} from 'widget/layout'
import Label from 'widget/label'
import {msg} from 'translate'
import styles from './csvUploadSection.module.css'
import Icon from 'widget/icon'

export default class CsvUploadSection extends Component {
    render() {
        const {stream, inputs: {name}} = this.props
        return (
            <Layout spacing={'compact'}>
                <Label>{msg('process.classification.panel.trainingData.form.csvUpload.file.label')}</Label>
                <FileSelect
                    single
                    onSelect={files => this.onSelect(files)}>
                    {name.value
                        ? <div className={styles.name}>
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


    onSelect(files) {
        if (!files || !files.length)
            return
        const {stream, inputs: {name, inputData, columns}} = this.props
        name.set(files[0].name)
        inputData.set(null)
        columns.set(null)
        const {row$, columns$} = this.parse(files)
        stream('LOAD_CSV_ROWS',
            zip(
                row$.pipe(toArray()),
                columns$
            ),
            ([data, csvColumns]) => {
                inputData.set(data)
                columns.set(csvColumns)
            }
        )
    }


    parse(files) {
        const row$ = new Subject()
        const columns$ = new Subject()
        let first = true
        if (files.length) {
            const file = files[0]
            Papa.parse(file, {
                worker: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: 'greedy',
                step: ({data, meta: {fields}}) => {
                    // if (Object.keys(data).length === fields.length)
                    row$.next(data)
                    if (first) {
                        columns$.next(fields)
                        columns$.complete()
                        first = false
                    }
                },
                complete: () => row$.complete()
            })
        } else {
            row$.complete()
        }
        return {row$, columns$}
    }

}

CsvUploadSection.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.object
}

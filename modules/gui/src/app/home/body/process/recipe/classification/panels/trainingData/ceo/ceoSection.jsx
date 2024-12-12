// import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {loadAndParseCeoCsv$, loadInstitutions$, loadProjectsForInstitutions$} from '~/ceo'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'

import {CeoConnection} from './ceoConnection'
import {CeoLogin} from './ceoLogin'

const mapStateToProps = () => {
    return {
        token: select('ceo.session.token'),
        institutions: select('ceo.data.institutions'),
        projects: select('ceo.data.projects'),
        // sampleType: select('ceo.data.sampleType'),
    }
}

export class _CeoSection extends React.Component {

    cancel$ = new Subject()

    constructor(props) {
        super(props)
        this.onInstitutionChange = this.onInstitutionChange.bind(this)
    }

    render() {
        const {token, inputs} = this.props
        return (
            <Layout>
                <CeoConnection token={token} inputs={inputs}/>
                {token ? this.renderForm() : null}
                <CeoLogin/>
            </Layout>
        )
    }

    componentDidUpdate({token: prevToken, inputs: {project: {value: prevProjectId}, csvType: {value: prevCsvType}}}) {
        const {token, inputs: {project: {value: projectId}, csvType: {value: csvType}}} = this.props

        if (token && token !== prevToken) {
            this.loadInstitutions()
        }

        if (projectId && csvType && (projectId !== prevProjectId || csvType !== prevCsvType)) {
            this.loadData()
        }
        
    }
    
    loadInstitutions() {
        const {institutions, stream} = this.props
        if (!institutions && !stream('LOAD_INSTITUTIONS').active && !stream('LOAD_INSTITUTIONS').failed) {
            this.props.stream('LOAD_INSTITUTIONS',
                loadInstitutions$(),
                null,
                () => Notifications.error({
                    message: msg('process.classification.panel.trainingData.form.ceo.loadInstitutions.failed'),
                    timeout: 10
                })
            )
        }
    }

    loadInstitutionProjects(institutionId) {
        const {stream, inputs: {csvType}} = this.props
        if (!stream('LOAD_PROJECTS').active && !stream('LOAD_PROJECTS').failed) {
            stream('LOAD_PROJECTS',
                loadProjectsForInstitutions$(institutionId, csvType.value),
                null,
                () => Notifications.error({
                    message: msg('process.classification.panel.trainingData.form.ceo.loadProjects.failed'),
                    timeout: 10
                })
            )
        }
    }

    isInstitutionInputDisabled() {
        const {stream, institutions} = this.props
        const loadInstitutions = stream('LOAD_INSTITUTIONS')

        return loadInstitutions.active || loadInstitutions.failed || !institutions
    }
 
    isProjectInputDisabled() {

        const {inputs: {institution}, stream, projects} = this.props
        const loadProjects = stream('LOAD_PROJECTS')

        return this.isInstitutionInputDisabled() || !projects || loadProjects.active || loadProjects.failed || !institution.value
    }

    onInstitutionChange(option) {
        const {inputs: {project}} = this.props
        project.set('')
        this.loadInstitutionProjects(option.value)
    }

    loadData() {
        const {stream, inputs: {name, inputData, columns, project: {value: projectId}, csvType: {value: csvType}}} = this.props
        name.set(projectId)
        inputData.set(null)
        columns.set(null)

        if (stream('LOAD_CEO_CSV').active) {
            this.cancel$.next()
        }
        
        stream('LOAD_CEO_CSV',
            loadAndParseCeoCsv$(projectId, csvType).pipe(
                takeUntil(this.cancel$)
            ),
            ([data, csvColumns]) => {
                inputData.set(data)
                columns.set(csvColumns)
            },
            () => Notifications.error({
                message: msg('process.classification.panel.trainingData.form.ceo.loadCsv.failed'),
                timeout: 10
            })
        )
    }

    renderForm() {

        const {stream, institutions, projects, inputs: {institution, project, csvType}} = this.props
        const loadInstitutions = stream('LOAD_INSTITUTIONS')
        const loadProjects = stream('LOAD_PROJECTS')
        const loadCeoCsv = stream('LOAD_CEO_CSV')
        
        return (
            <Layout>
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.ceo.institution.label')}
                    input={institution}
                    options={institutions || []}
                    placeholder={msg('process.classification.panel.trainingData.form.ceo.institution.placeholder')}
                    busyMessage={loadInstitutions.active}
                    disabled={this.isInstitutionInputDisabled()}
                    autoFocus
                    onChange={this.onInstitutionChange}
                />
                <Form.Buttons
                    label={msg('process.classification.panel.trainingData.form.ceo.dataType.title')}
                    tooltip={msg('process.classification.panel.trainingData.form.ceo.dataType.tooltip')}
                    input={csvType}
                    multiple={false}
                    disabled={this.isProjectInputDisabled()}
                    options={[{
                        value: 'sample',
                        label: msg('process.classification.panel.trainingData.form.ceo.dataType.sample.label'),
                        tooltip: msg('process.classification.panel.trainingData.form.ceo.dataType.sample.tooltip')
                    }, {
                        value: 'plot',
                        label: msg('process.classification.panel.trainingData.form.ceo.dataType.plot.label'),
                        tooltip: msg('process.classification.panel.trainingData.form.ceo.dataType.plot.tooltip')
                    }]}
                    type='horizontal-nowrap'
                />
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.ceo.project.label')}
                    input={project}
                    options={(projects || [])}
                    placeholder={msg('process.classification.panel.trainingData.form.ceo.project.placeholder')}
                    busyMessage={loadProjects.active || loadCeoCsv.active}
                    disabled={this.isProjectInputDisabled()}
                    allowClear
                />
            </Layout>
        )
    }
}

export const CeoSection = compose(
    _CeoSection,
    connect(mapStateToProps)
)


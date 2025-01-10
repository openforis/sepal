// import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {loadInstitutionProjects$, loadInstitutions$, loadProjectData$} from '~/ceo'
import {ceoLogout} from '~/ceo'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'

import {CeoConnection} from './ceoConnection'
import {CeoLogin} from './ceoLogin'

const LOAD_CSV_DATA = 'LOAD_CSV_DATA'
const LOAD_PROJECTS = 'LOAD_PROJECTS'
const LOAD_INSTITUTIONS = 'LOAD_INSTITUTIONS'

const mapStateToProps = () => {
    return {
        token: select('ceo.session.token'),
        institutions: select('ceo.data.institutions'),
        projects: select('ceo.data.projects'),
    }
}

export class _CeoSection extends React.Component {
    cancel$ = new Subject()

    constructor(props) {
        super(props)
        this.onInstitutionChange = this.onInstitutionChange.bind(this)
        this.onProjectChange = this.onProjectChange.bind(this)
        this.onInstitutionsLoaded = this.onInstitutionsLoaded.bind(this)
        this.onInstitutionProjectsLoaded = this.onInstitutionProjectsLoaded.bind(this)
        this.onCsvTypeChange = this.onCsvTypeChange.bind(this)
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

    renderForm() {
        return (
            <Layout>
                {this.renderInstitution()}
                {this.renderProject()}
                {this.renderCsvType()}
            </Layout>
        )
    }

    renderInstitution() {
        const {stream, institutions, inputs: {institution}} = this.props
        const loadingInstitutions = stream(LOAD_INSTITUTIONS).active
        return (
            <Form.Combo
                label={msg('process.classification.panel.trainingData.form.ceo.institution.label')}
                tooltip={msg('process.classification.panel.trainingData.form.ceo.institution.tooltip')}
                input={institution}
                options={institutions || []}
                placeholder={msg('process.classification.panel.trainingData.form.ceo.institution.placeholder')}
                busyMessage={loadingInstitutions}
                disabled={this.isInstitutionInputDisabled()}
                autoFocus
                onChange={this.onInstitutionChange}
            />
        )
    }

    renderProject() {
        const {stream, projects, inputs: {project}} = this.props
        const loadingProjects = stream(LOAD_PROJECTS).active
        const loadingCeoCsv = stream(LOAD_CSV_DATA).active
        return (
            <Form.Combo
                label={msg('process.classification.panel.trainingData.form.ceo.project.label')}
                tooltip={msg('process.classification.panel.trainingData.form.ceo.project.tooltip')}
                input={project}
                options={(projects || [])}
                placeholder={msg('process.classification.panel.trainingData.form.ceo.project.placeholder')}
                busyMessage={loadingProjects || loadingCeoCsv}
                disabled={this.isProjectInputDisabled()}
                onChange={this.onProjectChange}
            />
        )
    }

    renderCsvType() {
        const {inputs: {csvType}} = this.props
        return (
            <Form.Buttons
                label={msg('process.classification.panel.trainingData.form.ceo.dataType.title')}
                tooltip={msg('process.classification.panel.trainingData.form.ceo.dataType.tooltip')}
                input={csvType}
                multiple={false}
                disabled={this.isProjectInputDisabled()}
                options={[
                    {
                        value: 'plot',
                        label: msg('process.classification.panel.trainingData.form.ceo.dataType.plot.label'),
                        tooltip: msg('process.classification.panel.trainingData.form.ceo.dataType.plot.tooltip')
                    },
                    {
                        value: 'sample',
                        label: msg('process.classification.panel.trainingData.form.ceo.dataType.sample.label'),
                        tooltip: msg('process.classification.panel.trainingData.form.ceo.dataType.sample.tooltip')
                    }
                ]}
                type='horizontal-nowrap'
                onChange={this.onCsvTypeChange}
            />)
    }

    componentDidMount() {
        const {token, inputs: {csvType}} = this.props
        if (token) {
            this.loadInstitutions()
        }
        if (!csvType.value) {
            csvType.set('plot')
        }
    }

    componentDidUpdate({token: prevToken}) {
        const {token} = this.props
        if (!prevToken && token) {
            this.loadInstitutions()
        }
    }

    isInstitutionInputDisabled() {
        const {institutions} = this.props
        return !institutions
            || this.streamActive(LOAD_INSTITUTIONS)
    }
 
    isProjectInputDisabled() {
        const {inputs: {institution}, projects} = this.props
        return !institution.value
            || !projects
            || this.isInstitutionInputDisabled()
            || this.streamActive(LOAD_PROJECTS)
    }
    
    onInstitutionChange({value: institution}) {
        const {inputs: {project}} = this.props
        project.set(null)
        this.loadInstitutionProjects(institution)
    }

    onProjectChange({label}) {
        const {inputs: {name, csvType}} = this.props
        name.set(label)
        this.resetInputs()
        this.loadData(csvType.value)
    }

    onCsvTypeChange(csvType) {
        this.resetInputs()
        this.loadData(csvType)
    }

    resetInputs() {
        const {inputs: {inputData, columns, locationType, geoJsonColumn, xColumn, yColumn, filterExpression, invalidFilterExpression, classColumnFormat, valueColumn, valueMapping, columnMapping, customMapping, defaultValue, referenceData}} = this.props
        inputData.set(null)
        columns.set(null)
        locationType.set('')
        geoJsonColumn.set('')
        xColumn.set('')
        yColumn.set('')
        filterExpression.set('')
        invalidFilterExpression.set('')
        classColumnFormat.set('')
        valueColumn.set('')
        valueMapping.set('')
        columnMapping.set('')
        customMapping.set('')
        defaultValue.set('')
        referenceData.set('')
    }

    loadInstitutions() {
        const {token} = this.props
        if (!this.streamActive(LOAD_INSTITUTIONS)) {
            this.props.stream(LOAD_INSTITUTIONS,
                loadInstitutions$(token),
                this.onInstitutionsLoaded,
                ({status}) => status === 403
                    ? this.onTokenExpired()
                    : Notifications.error({
                        message: msg('process.classification.panel.trainingData.form.ceo.loadInstitutions.failed'),
                        timeout: 0
                    })
            )
        }
    }

    onInstitutionsLoaded(institutions) {
        const {inputs: {institution}} = this.props
        const institutionId = institution.value
        const institutionIsSelected = institutionId && institutions.find(({value}) => value === institutionId)
        if (institutionIsSelected) {
            this.loadInstitutionProjects()
        } else {
            this.resetInputs()
        }
    }

    loadInstitutionProjects() {
        const {stream, token, inputs: {institution}} = this.props
        if (!this.streamActive(LOAD_PROJECTS)) {
            stream(LOAD_PROJECTS,
                loadInstitutionProjects$(token, institution.value),
                this.onInstitutionProjectsLoaded,
                ({status}) => status === 403
                    ? this.onTokenExpired()
                    : Notifications.error({
                        message: msg('process.classification.panel.trainingData.form.ceo.loadProjects.failed'),
                        timeout: 0
                    })
            )
        }
    }

    onInstitutionProjectsLoaded(projects) {
        const {inputs: {project, csvType}} = this.props
        const projectId = project.value
        const projectIsSelected = projectId && projects.find(({value}) => value === projectId)
        if (projectIsSelected) {
            this.loadData(csvType.value)
        } else {
            this.resetInputs()
        }
    }

    loadData(csvType) {
        const {stream, token, inputs: {inputData, columns, project: {value: projectId}, classColumnFormat}} = this.props
        
        classColumnFormat.set(csvType === 'plot'
            ? 'MULTIPLE_COLUMNS'
            : 'SINGLE_COLUMN'
        )

        if (stream(LOAD_CSV_DATA).active || stream(LOAD_INSTITUTIONS).active || stream(LOAD_PROJECTS).active) {
            this.cancel$.next()
        }
        stream(LOAD_CSV_DATA,
            loadProjectData$(token, projectId, csvType).pipe(
                takeUntil(this.cancel$)
            ),
            ([data, csvColumns]) => {
                inputData.set(data)
                columns.set(csvColumns)
            },
            ({status}) => status === 403
                ? this.onTokenExpired()
                : Notifications.error({
                    message: msg('process.classification.panel.trainingData.form.ceo.loadCsv.failed'),
                    timeout: 0
                })
        )
    }

    onTokenExpired() {
        Notifications.warning({
            message: msg('process.classification.panel.trainingData.form.ceo.token.timedOut'),
            timeout: 0
        })
        ceoLogout()
    }

    streamActive(streamName) {
        const {stream} = this.props
        return stream(streamName).active
    }
}

export const CeoSection = compose(
    _CeoSection,
    connect(mapStateToProps)
)


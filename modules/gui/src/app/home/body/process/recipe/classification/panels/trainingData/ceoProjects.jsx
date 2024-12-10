/* eslint-disable no-console */
import React from 'react'

import {ceoLogout, loadInstitutions$, loadProjectsForInstitutions$} from '~/ceo'
import {compose} from '~/compose'
import {select} from '~/store'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'

// import {Panel} from '~/widget/panel/panel'
import {CeoLogin, CeoLoginButton} from './ceoLogin'
import styles from './ceoProjects.module.css'

const fields = {
    institution: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    project: new Form.Field()
        .notBlank('user.userDetails.form.email.required'),
}

const mapStateToProps = () => {

    return {
        values: {
            institution: select('ceo.selection.institution'),
            project: select('ceo.selection.project')
        },
        institutions: select('ceo.data.institutions'),
        projects: select('ceo.data.projects'),
    }
}

export class _ceoDisconnected extends React.Component {
    render() {
        const {activator: {activatables: {ceoLogin: {activate}}}} = this.props
        return (
            <Layout type='horizontal-nowrap' >
                <Layout type='horizontal' className={styles.disconnected}>
                    <Icon name='meh' size='2x'/>
                    <div>
                        {msg('process.classification.panel.trainingData.form.ceo.login.disconnected.title')}
                    </div>
                </Layout>
                <CeoLoginButton onClick={activate}/>
            </Layout>
        )
    }
}

export class _ceoConnected extends React.Component {
    
    render() {

        return (
            <Layout>
                <CeoLogin/>
                {this.renderContend()}
            </Layout>
        )
    }
    
    update() {
        
        const {institutions, stream} = this.props
        if (!institutions && !stream('LOAD_INSTITUTIONS').active && !stream('LOAD_INSTITUTIONS').failed) {
            this.props.stream('LOAD_INSTITUTIONS',
                loadInstitutions$(),
                null,
                () => Notifications.error({
                    message: msg('process.mosaic.panel.areaOfInterest.form.country.country.loadFailed'),
                    timeout: 10
                })
            )
        }
    }

    renderContend() {
        this.update()
        return (
            <Layout type='vertical' >
                <Layout type='horizontal-nowrap'>
                    <Layout type='horizontal' className={styles.connected}>
                        <Icon name='smile' size='2x'/>
                        <div>
                            {msg('process.classification.panel.trainingData.form.ceo.login.connected.title')}
                        </div>
                    </Layout>
                    {this.renderDisconnectButton()}
                </Layout>
                {this.renderCombos()}
            </Layout>
        )
    }

    renderDisconnectButton() {
        return (
            <Button
                icon={'key'}
                label={msg('process.classification.panel.trainingData.form.ceo.login.disconnect.label')}
                disabled={false}
                onClick={() => ceoLogout()}/>
        )
    }

    loadInstitutionProjects(institutionId) {
        console.log('************** loadInstitutionProjects', institutionId)

        const {stream} = this.props
        if (!stream('LOAD_PROJECTS').active && !stream('LOAD_PROJECTS').failed) {
            this.props.stream('LOAD_PROJECTS',
                loadProjectsForInstitutions$(institutionId),
                null,
                () => Notifications.error({
                    message: msg('process.mosaic.panel.areaOfInterest.form.country.country.loadFailed'),
                    timeout: 10
                })
            )
        }
    }

    renderCombos() {

        console.log('----  CeoProjects  -----', this.props)

        const {stream, institutions, projects, inputs: {institution, project}} = this.props

        const institutionsPlaceholder = msg('process.classification.panel.trainingData.form.ceo.institution.placeholder')
        const projectPlaceholder = msg('process.classification.panel.trainingData.form.ceo.project.placeholder')

        const loadInstitutions = stream('LOAD_INSTITUTIONS')
        const loadProjects = stream('LOAD_PROJECTS')
        
        const loadingInstitutions = loadInstitutions.active
        const loadingProjects = loadProjects.active
        
        return (
            <Layout>
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.ceo.institution.label')}
                    input={institution}
                    options={institutions || []}
                    placeholder={institutionsPlaceholder}
                    busyMessage={loadingInstitutions}
                    disabled={loadInstitutions.failed || loadingInstitutions}
                    autoFocus
                    onChange={option => {
                        project.set('')
                        this.loadInstitutionProjects(option.value)
                    }}
                />
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.ceo.project.label')}
                    input={project}
                    options={(projects || [])}
                    placeholder={projectPlaceholder}
                    busyMessage={loadingProjects}
                    disabled={loadProjects.failed || !institutions || institutions.length === 0 || loadingInstitutions || loadingProjects}
                    autoFocus
                    // onChange={() => this.aoiChanged$.next()}
                    allowClear
                />
            </Layout>
        )
    }
    
}

export const CeoConnected = compose(
    _ceoConnected,
    withForm({fields, mapStateToProps}),
)

export const CeoDisconnected = compose(
    _ceoDisconnected,
    withActivators('ceoLogin')
)

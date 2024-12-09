/* eslint-disable no-console */
import React from 'react'

import {isCeoValid, loadInstitutions$} from '~/ceo'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'

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
        institution: select('ceo.selection.institution'),
        project: select('ceo.selection.project'),
    }
}

export class _CeoProjects extends React.Component {
    
    render() {
        // const {form} = this.props

        // Activate this component

        console.log('############################### projects props', this.props)

        const {activator} = this.props
        const activateCeoLogin = activator.activatables.ceoLogin.activate
        // eslint-disable-next-line no-unused-vars
        const {form, inputs: {projectId}, activatable: {mandatory}} = this.props

        return (
            // <Form.Panel
            //     // className={styles.panel}
            //     form={form}
            //     modal
            //     onApply={this.updateProject$}
            //     onClose={this.close}>
            //     <Panel.Header
            //         icon='key'
            //         title={msg('user.googleAccount.title')}
            //     />
            //     <Panel.Content>
            //         {this.renderContent()}
            //     </Panel.Content>
            // </Form.Panel>
            <Layout>
                {this.renderContent()}
                <CeoLogin/>
                <CeoLoginButton disabled={false} onClick={activateCeoLogin}/>
                {isCeoValid() && this.renderCombos()}
            </Layout>
        )
    }

    renderContent() {
        return isCeoValid()
            ? this.renderConnected()
            : this.renderDisconnected()
    }

    renderConnected() {
        return (
            <Layout type='horizontal-nowrap' className={styles.connected}>
                <Icon name='smile' size='2x'/>
                <div>
                    {msg('process.classification.panel.trainingData.form.ceo.login.connected.title')}
                </div>
            </Layout>
        )
    }

    renderDisconnected() {
        return (
            <Layout type='vertical'>
                <Layout type='horizontal-nowrap' className={styles.disconnected} >
                    <Icon name='meh' size='2x'/>
                    <div>
                        {msg('process.classification.panel.trainingData.form.ceo.login.disconnected.title')}
                    </div>
                </Layout>
            </Layout>

        )
    }

    renderGoogleProjectSelector() {
        const {inputs: {projectId}} = this.props
        const {projects} = this.state
        return (
            <Form.Combo
                input={projectId}
                placeholder={projectId.value}
                label={msg('user.googleAccount.form.projectId.label')}
                options={this.getProjectOptions()}
                // className={styles.durationUnit}
                busyMessage={projects === null}
            />
        )
    }

    renderCombos() {

        console.log('--  CeoProjects  -----', this.props)

        loadInstitutions$()

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
                    // onChange={option => {
                    //     area.set('')
                    //     this.aoiChanged$.next()
                    //     this.loadCountryAreas(option.value)
                    // }}
                />
                <Form.Combo
                    label={msg('process.classification.panel.trainingData.form.ceo.project.label')}
                    input={project}
                    options={(projects || [])}
                    placeholder={projectPlaceholder}
                    busyMessage={loadingProjects}
                    disabled={loadProjects.failed || !institutions || institutions.length === 0 || loadingInstitutions || loadingProjects}
                    autoFocus
                    onChange={() => this.aoiChanged$.next()}
                    allowClear
                />
            </Layout>
        )
    }
    
}

// const policy = () => ({
//     _: 'disallow',
//     ceoCredentials: 'allow-then-deactivate',
// })

export const CeoProjects = compose(
    _CeoProjects,
    withForm({fields, mapStateToProps}),
    withActivators('ceoLogin')
    // withActivatable({id: 'ceoProjects'})
)

CeoProjects.propTypes = {}

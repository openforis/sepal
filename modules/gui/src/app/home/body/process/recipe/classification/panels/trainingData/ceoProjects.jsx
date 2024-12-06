/* eslint-disable no-console */
// import PropTypes from 'prop-types'
import React from 'react'
import {map, Subject, takeUntil} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
// import {Form} from '~/widget/form'
// import {withForm} from '~/widget/form/form'
// import {Layout} from '~/widget/layout'
import {select} from '~/store'
// import {actionBuilder} from '~/action-builder'
// import {withForm} from '~/widget/form/form'
// import {Panel} from '~/widget/panel/panel'
// import {withRecipe} from '~/app/home/body/process/recipeContext'
import {msg} from '~/translate'
// import {compose} from '~/compose'
// import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

// import {Panel} from '~/widget/panel/panel'
import {CeoLogin, CeoLoginButton} from './ceoLogin'

// const fields = {
//     email: new Form.Field()
//         .notBlank('user.userDetails.form.name.required')
//         .match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/, 'user.userDetails.form.email.invalid'),
//     password: new Form.Field()
//         .notBlank('user.userDetails.form.email.required'),
// }

// const mapStateToProps = state => ({
//     email: state.ceo.email,
//     password: state.ceo.password,
// })

export const isCeoValid = () => select('ceo.login.email') && select('ceo.login.password')

const mapStateToProps = (state, ownProps) => {
    const country = ownProps.inputs.country.value
    return {
        countries: select('countries'),
        countryAreas: country ? select(['areasByCountry', ownProps.inputs.country.value]) : [],
    }
}

const loadInstitutions$ = () => {
    return api.ceoGateway.queryInstitutions$({
        // select: ['id', 'label'],
        // from: countryEETable,
        // where: [['parent_id', 'equals', null]],
        // distinct: ['id'],
        // orderBy: ['label']
    }).pipe(
        map(institutions => institutions.map(({id, label}) => ({value: id, label}))),
        map(institutions =>
            actionBuilder('SET_COUNTRIES', {institutions})
                .set('ceo.institutions', institutions)
                .dispatch()
        )
    )
}

const loadCountryForArea$ = areaId => {
    return api.gee.queryEETable$({
        select: ['parent_id'],
        from: countryEETable,
        where: [['id', 'equals', areaId]],
        orderBy: ['label']
    }).pipe(
        map(rows => rows.length ? rows[0]['parent_id'] : null)
    )
}

export class _CeoProjects extends React.Component {
    
    render() {
        // const {form} = this.props

        // Activate this component

        console.log('############################### projects props', this.props)

        const {activator} = this.props
        const activateCeoLogin = activator.activatables.ceoLogin.activate
        const {form, inputs: {projectId}, activatable: {mandatory}} = this.props

        return (
            <Form.Panel
                // className={styles.panel}
                form={form}
                modal
                onApply={this.updateProject$}
                onClose={this.close}>
                <Panel.Header
                    icon='key'
                    title={msg('user.googleAccount.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
            </Form.Panel>
            // <Layout>
            //     <CeoLogin/>
            //     <CeoLoginButton disabled={false} onClick={activateCeoLogin}/>
            // </Layout>
        )
    }

    renderContent() {
        return isCeoValid()
            ? this.renderConnected()
            : this.renderDisconnected()
    }

    renderConnected() {
        return (
            <Layout type='vertical'>
                <Layout type='horizontal-nowrap' >
                    <Icon name='smile' size='2x'/>
                    <div>
                        {msg('user.googleAccount.connected.title')}
                    </div>
                </Layout>
                {this.renderGoogleProjectSelector()}
                <div>
                    {msg('user.googleAccount.connected.info')}
                </div>
            </Layout>
        )
    }

    renderDisconnectButton() {
        const taskCount = this.getTaskCount()
        return (
            <ModalConfirmationButton
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.disconnect.label')}
                title={msg('user.googleAccount.disconnect.warning.title')}
                message={msg('user.googleAccount.disconnect.warning.message', {taskCount})}
                skipConfirmation={!taskCount}
                busy={this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT').active}
                onConfirm={this.useSepalGoogleAccount}
            />
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

    rendeCombos() {

        const {stream, institutions, projects, inputs: {institution, project}} = this.state

        const institutionsPlaceholder = msg('process.mosaic.panel.areaOfInterest.form.country.country.placeholder.')
        const areaPlaceholder = msg('process.mosaic.panel.areaOfInterest.form.country.area.placeholder.')

        const loadInstitutions = stream('LOAD_INSTITUTIONS')
        const loadingProjects = stream('LOAD_PROJECTS')
        
        const loadingInstitutions = loadInstitutions.active
        const loadProjects = loadProjects.active

        return (
            <Layout>
                <Form.Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.country.country.label')}
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
                    label={msg('process.mosaic.panel.areaOfInterest.form.country.area.label')}
                    input={project}
                    options={(projects || [])}
                    placeholder={areaPlaceholder}
                    busyMessage={loadingProjects}
                    // disabled={loadProjects.failed || !countryAreas || countryAreas.length === 0 || loadingCountries || loadingAreas}
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
    connect(mapStateToProps),
    withActivators('ceoLogin')          // Get activator for ceoLogin
    // withActivatable({id: 'ceoProjects'})
)

CeoProjects.propTypes = {}

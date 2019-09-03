import {compose} from 'compose'
import format from 'format'
import React from 'react'
import {connect, select} from 'store'
import {msg} from 'translate'
import {activatable} from 'widget/activation/activatable'
import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import Label from 'widget/label'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import styles from './usage.module.css'
import UserResources from './userResources'
import UserSession from './userSession'
import UserSessions from './userSessions'

const mapStateToProps = () => ({
    userReport: select('user.currentUserReport'),
    selectedSessionId: select('ui.selectedSessionId')
})

class _Usage extends React.Component {
    renderOverview() {
        const {activatable: {deactivate}} = this.props
        const close = () => deactivate()
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='user'
                    title={msg('user.report.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderResosurces()}
                        {this.renderSessions()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons onEnter={close} onEscape={close}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={close}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderResosurces() {
        return (
            <React.Fragment>
                <Label msg={msg('user.report.resources.title')} size='large'/>
                <UserResources/>
            </React.Fragment>
        )
    }

    renderSessions() {
        return (
            <React.Fragment>
                <Label msg={msg('user.report.sessions.title')} size='large'/>
                <UserSessions/>
            </React.Fragment>
        )
    }

    renderSession() {
        return (
            <UserSession/>
        )
    }

    render() {
        const {selectedSessionId} = this.props
        return selectedSessionId
            ? this.renderSession()
            : this.renderOverview()
    }
}

const policy = () => ({
    _: 'disallow'
})

const Usage = compose(
    _Usage,
    connect(mapStateToProps),
    activatable({id: 'userReport', policy, alwaysAllow: true})
)

Usage.propTypes = {}

const _UsageButton = ({userReport, budgetExceeded, budgetWarning}) => {
    const hourlySpending = userReport.sessions
        ? userReport.sessions.reduce((acc, session) => acc + session.instanceType.hourlyCost, 0)
        : 0
    const label = budgetExceeded
        ? msg('home.sections.user.report.budgetExceeded')
        : format.unitsPerHour(hourlySpending)
    return (
        <React.Fragment>
            <Activator id='userReport'>
                {({active, activate}) =>
                    <Button
                        chromeless
                        look='transparent'
                        size='large'
                        air='less'
                        additionalClassName={budgetExceeded ? styles.budgetExceeded
                            : budgetWarning ? styles.budgetWarning : null}
                        icon='dollar-sign'
                        label={label}
                        disabled={active}
                        onClick={() => activate()}
                        tooltip={msg('home.sections.user.report.tooltip')}
                        tooltipPlacement='top'
                        tooltipDisabled={active}/>
                }
            </Activator>
            <Usage/>
        </React.Fragment>
    )
}

export const UsageButton = compose(
    _UsageButton,
    connect(state => ({
        userReport: (state.user && state.user.currentUserReport) || {},
        budgetExceeded: select('user.budgetExceeded'),
        budgetWarning: select('user.budgetWarning'),
    }))
)

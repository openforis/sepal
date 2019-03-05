import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {activatable} from 'widget/activation/activatable'
import {connect, select} from 'store'
import {msg} from 'translate'
import Label from 'widget/label'
import React from 'react'
import UserResources from './userResources'
import UserSession from './userSession'
import UserSessions from './userSessions'
import format from 'format'
import styles from './usage.module.css'

const mapStateToProps = () => ({
    userReport: select('user.currentUserReport'),
    selectedSessionId: select('ui.selectedSessionId')
})

class _Usage extends React.Component {
    renderOverview() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <PanelHeader
                    icon='user'
                    title={msg('user.report.title')}/>
                <PanelContent>
                    <ScrollableContainer>
                        <Scrollable>
                            <div className={styles.section}>
                                <Label msg={msg('user.report.resources.title')} size='large'/>
                                <UserResources/>
                            </div>
                            <div className={styles.section}>
                                <Label msg={msg('user.report.sessions.title')} size='large'/>
                                <UserSessions/>
                            </div>
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Close
                            onClick={() => deactivate()}/>
                    </PanelButtons.Main>
                </PanelButtons>
            </Panel>
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

const Usage = (
    activatable('userReport', policy)(
        connect(mapStateToProps)(
            _Usage
        )
    )
)

Usage.propTypes = {}

const _UsageButton = ({userReport, budgetExceeded}) => {
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
                        additionalClassName={budgetExceeded ? styles.budgetExceeded : null}
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

export const UsageButton = connect(state => ({
    userReport: (state.user && state.user.currentUserReport) || {},
    budgetExceeded: select('user.budgetExceeded')
}))(_UsageButton)

import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {activatable} from 'widget/activation/activatable'
import {connect, select} from 'store'
import {msg} from 'translate'
import Label from 'widget/label'
import React from 'react'
import UserSessions from './userSessions'
import format from 'format'
import styles from './userReport.module.css'

const mapStateToProps = state => {
    return {
        userReport: (state.user && state.user.currentUserReport) || {}
    }
}

class _Usage extends React.Component {
    renderResources() {
        const {spending} = this.props.userReport
        return (
            <table className={styles.resources}>
                <thead>
                    <tr>
                        <th></th>
                        <th className={styles.quota}>{msg('user.report.resources.quota')}</th>
                        <th className={styles.used}>{msg('user.report.resources.used')}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>{msg('user.report.resources.monthlyInstance')}</th>
                        <td className={styles.number}>{format.dollars(spending.monthlyInstanceBudget)}</td>
                        <td className={styles.number}>{format.dollars(spending.monthlyInstanceSpending)}</td>
                        <PercentCell used={spending.monthlyInstanceSpending} budget={spending.monthlyInstanceBudget}/>
                    </tr>
                    <tr>
                        <th>{msg('user.report.resources.monthlyStorage')}</th>
                        <td className={styles.number}>{format.dollars(spending.monthlyStorageBudget)}</td>
                        <td className={styles.number}>{format.dollars(spending.monthlyStorageSpending)}</td>
                        <PercentCell used={spending.monthlyStorageSpending} budget={spending.monthlyStorageBudget}/>
                    </tr>
                    <tr>
                        <th>{msg('user.report.resources.storage')}</th>
                        <td className={styles.number}>{format.number({value: spending.storageQuota, scale: 'G', unit: 'B'})}</td>
                        <td className={styles.number}>{format.number({value: spending.storageUsed, scale: 'G', unit: 'B'})}</td>
                        <PercentCell used={spending.storageUsed} budget={spending.storageQuota}/>
                    </tr>
                </tbody>
            </table>
        )
    }

    render() {
        const {deactivate} = this.props
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
                            <div className={styles.report}>
                                <div className={styles.section}>
                                    <Label msg={msg('user.report.resources.title')} size='large'/>
                                    {this.renderResources()}
                                </div>
                                <div className={styles.section}>
                                    <Label msg={msg('user.report.sessions.title')} size='large'/>
                                    <UserSessions/>
                                </div>
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
}

const PercentCell = ({used, budget}) => {
    const ratio = used / budget
    let level = 'high'
    if (ratio < 0.75)
        level = 'low'
    else if (ratio < 1)
        level = 'medium'
    return <td className={[styles.percent, styles[level]].join(' ')}>
        {format.percent(used, budget, 0)}
    </td>
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

const _UserReportButton = ({userReport, budgetExceeded}) => {
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

export const UserReportButton = connect(state => ({
    userReport: (state.user && state.user.currentUserReport) || {},
    budgetExceeded: select('user.budgetExceeded')
}))(_UserReportButton)

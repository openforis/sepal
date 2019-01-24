import {Button} from 'widget/button'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect, select} from 'store'
import {msg} from 'translate'
import Label from 'widget/label'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import React from 'react'
import UserSessions from './userSessions'
import actionBuilder from 'action-builder'
import format from 'format'
import styles from './userReport.module.css'

const mapStateToProps = state => {
    return {
        userReport: (state.user && state.user.currentUserReport) || {},
        panel: state.ui && state.ui.userBudget,
        modal: state.ui && state.ui.modal,
        budgetExceeded: select('user.budgetExceeded'),
    }
}

const action = mode =>
    actionBuilder('USER_BUDGET')
        .set('ui.userBudget', mode)
        .set('ui.modal', !!mode)
        .dispatch()

export const showUserBudget = () => {
    action('USER_BUDGET')
}

export const closePanel = () =>
    action()

class Usage extends React.Component {
    buttonHandler() {
        const {modal} = this.props
        !modal && showUserBudget()
    }

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

    renderPanel() {
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    statePath='userReport'
                    modal
                    onCancel={() => closePanel()}>
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
                    <PanelButtons/>
                </Panel>
            </Portal>
        )
    }

    renderButton() {
        const {modal, userReport, budgetExceeded} = this.props
        const hourlySpending = userReport.sessions
            ? userReport.sessions.reduce((acc, session) => acc + session.instanceType.hourlyCost, 0)
            : 0
        const label = budgetExceeded
            ? msg('home.sections.user.report.budgetExceeded')
            : format.unitsPerHour(hourlySpending)
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                additionalClassName={budgetExceeded ? styles.budgetExceeded : null}
                icon='dollar-sign'
                label={label}
                onClick={() => this.buttonHandler()}
                tooltip={msg('home.sections.user.report.tooltip')}
                tooltipPlacement='top'
                tooltipDisabled={modal}/>
        )
    }

    render() {
        const {panel} = this.props
        const showUserBudget = panel === 'USER_BUDGET'
        return (
            <React.Fragment>
                {this.renderButton()}
                {showUserBudget ? this.renderPanel() : null}
            </React.Fragment>
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

Usage.propTypes = {}

export default connect(mapStateToProps)(Usage)

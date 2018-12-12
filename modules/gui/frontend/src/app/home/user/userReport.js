import {Button} from 'widget/button'
import {connect} from 'store'
import {msg} from 'translate'
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
        modal: state.ui && state.ui.modal
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
        const {panel, modal} = this.props
        panel
            ? closePanel()
            : !modal && showUserBudget()
    }

    renderResources() {
        // const {spending} = {
        //     spending: {
        //         monthlyInstanceBudget: 10.0,
        //         monthlyInstanceSpending: 0.0,
        //         monthlyStorageBudget: 10.0,
        //         monthlyStorageSpending: 0.0,
        //         storageQuota: 100.0,
        //         storageUsed: 0.0
        //     }
        // }
        const {spending} = this.props.userReport
        return (
            <table className={styles.resources}>
                <thead>
                    <tr>
                        <th></th>
                        <th className={styles.number}>{msg('user.report.resources.quota')}</th>
                        <th className={styles.number}>{msg('user.report.resources.used')}</th>
                        <th className={styles.number}>{msg('user.report.resources.used%')}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>{msg('user.report.resources.monthlyInstance')}</th>
                        <td className={styles.number}>{format.dollars(spending.monthlyInstanceBudget)}</td>
                        <td className={styles.number}>{format.dollars(spending.monthlyInstanceSpending)}</td>
                        <td className={styles.number}>{format.percent(spending.monthlyInstanceSpending, spending.monthlyInstanceBudget)}</td>
                    </tr>
                    <tr>
                        <th>{msg('user.report.resources.monthlyStorage')}</th>
                        <td className={styles.number}>{format.dollars(spending.monthlyStorageBudget)}</td>
                        <td className={styles.number}>{format.dollars(spending.monthlyStorageSpending)}</td>
                        <td className={styles.number}>{format.percent(spending.monthlyStorageSpending, spending.monthlyStorageBudget)}</td>
                    </tr>
                    <tr>
                        <th>{msg('user.report.resources.storage')}</th>
                        <td className={styles.number}>{format.dollars(spending.storageQuota)}</td>
                        <td className={styles.number}>{format.dollars(spending.storageUsed)}</td>
                        <td className={styles.number}>{format.percent(spending.storageUsed, spending.storageQuota)}</td>
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
                    isActionForm={true}
                    center
                    modal
                    onCancel={() => closePanel()}>
                    <PanelHeader
                        icon='user'
                        title={msg('user.report.title')}/>
                    <PanelContent>
                        <div className={styles.report}>
                            <div className={styles.section}>
                                <div className={styles.title}>{msg('user.report.resources.title')}</div>
                                {this.renderResources()}
                            </div>
                            <div className={styles.section}>
                                <div className={styles.title}>{msg('user.report.sessions.title')}</div>
                                <UserSessions/>
                            </div>
                        </div>
                    </PanelContent>
                    <PanelButtons/>
                </Panel>
            </Portal>
        )
    }

    renderButton() {
        const {className, modal, userReport} = this.props
        const hourlySpending = userReport.sessions
            ? userReport.sessions.reduce((acc, session) => acc + session.instanceType.hourlyCost, 0)
            : 0
        return (
            <Button
                className={className}
                icon='dollar-sign'
                label={' ' + format.unitsPerHour(hourlySpending)}
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

Usage.propTypes = {}

export default connect(mapStateToProps)(Usage)

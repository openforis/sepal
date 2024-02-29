import {Gauge} from 'widget/gauge'
import {Label} from 'widget/label'
import {Layout} from 'widget/layout'
import {Message} from 'widget/message'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import React from 'react'
import format from 'format'
import styles from './userResources.module.css'

const mapStateToProps = () => ({
    userReport: select('user.currentUserReport') || {}
})

class UserResources extends React.Component {
    render() {
        const {userReport: {spending}} = this.props
        return spending ? (
            <Layout type='vertical'>
                {/* {this.renderInfo()} */}
                <Layout
                    className={styles.container}
                    type='vertical'
                    spacing='tight'>
                    {this.renderHeader()}
                    {this.renderInstanceBudget(spending)}
                    {this.renderStorageBudget(spending)}
                    {this.renderStorage(spending)}
                </Layout>
            </Layout>
        ) : null
    }

    renderInfo() {
        return (
            <Message
                type='info'
                icon='comment'
                iconSize='2x'
                text={msg('user.report.resources.info')}/>
        )
    }

    renderHeader() {
        return (
            <div className={styles.resources}>
                <div className={styles.label}/>
                <Label className={styles.quota} msg={msg('user.report.resources.max')}/>
                <Label className={styles.user} msg={msg('user.report.resources.used')}/>
                <div/>
            </div>
        )
    }

    renderInstanceBudget({monthlyInstanceSpending, monthlyInstanceBudget}) {
        return (
            <div className={styles.resources}>
                <Label className={styles.label} msg={msg('user.report.resources.instanceSpending')}/>
                <div className={styles.quota}>{format.dollars(monthlyInstanceBudget, {suffix: '/mo.'})}</div>
                <div className={styles.used}>{format.percent(monthlyInstanceSpending, monthlyInstanceBudget, 0)}</div>
                <Gauge value={monthlyInstanceSpending} maxValue={monthlyInstanceBudget}/>
            </div>
        )
    }

    renderStorageBudget({monthlyStorageSpending, monthlyStorageBudget}) {
        return (
            <div className={styles.resources}>
                <Label className={styles.label} msg={msg('user.report.resources.storageSpending')}/>
                <div className={styles.quota}>{format.dollars(monthlyStorageBudget, {suffix: '/mo.'})}</div>
                <div className={styles.used}>{format.percent(monthlyStorageSpending, monthlyStorageBudget, 0)}</div>
                <Gauge value={monthlyStorageSpending} maxValue={monthlyStorageBudget}/>
            </div>
        )
    }

    renderStorage({storageUsed, storageQuota}) {
        return (
            <div className={styles.resources}>
                <Label className={styles.label} msg={msg('user.report.resources.storageSpace')}/>
                <div className={styles.quota}>{format.number({value: storageQuota, scale: 'G', unit: 'B'})}</div>
                <div className={styles.used}>{format.percent(storageUsed, storageQuota, 0)}</div>
                <Gauge value={storageUsed} maxValue={storageQuota}/>
            </div>
        )
    }
}

export default compose(
    UserResources,
    connect(mapStateToProps)
)

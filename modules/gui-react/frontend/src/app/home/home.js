import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import Body from './body/body'
import Footer from './footer/footer'
import styles from './home.module.css'
import NavBar, {isNavBarLocked} from './navBar/navBar'

const mapStateToProps = () => ({
    navBarLocked: isNavBarLocked()
})

const Home = ({user, navBarLocked}) => {
    return (
        <div className={styles.homeContainer}>
            <div className={styles.map}/>
            <div className={styles.mapOverlay}/>
            <div className={[styles.home, navBarLocked && styles.navBarLocked].join(' ')}>
                <NavBar className={styles.navBar}/>
                <Footer className={styles.footer} user={user}/>
                <Body className={styles.body}/>
            </div>
        </div>
    )
}
export default connect(mapStateToProps)(Home)

Home.propTypes = {
    user: PropTypes.object.isRequired,
    navBarLocked: PropTypes.bool.isRequired
}

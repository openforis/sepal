import React from 'react'
import {connect} from 'store'
import PropTypes from 'prop-types'
import styles from './home.module.css'
import NavBar, {isNavBarLocked} from './navBar/navBar'
import Footer from './footer/footer'
import Body from './body/body'

const mapStateToProps = () => ({
    navBarLocked: isNavBarLocked()
})

const Home = ({user, navBarLocked}) => {
    return (
        <div className={[styles.home, navBarLocked && styles.navBarLocked].join(' ')}>
            <NavBar className={styles.navBar}/>
            <Footer className={styles.footer} user={user}/>
            <Body className={styles.body}/>
        </div>
    )
}
export default connect(mapStateToProps)(Home)

Home.propTypes = {
    user: PropTypes.object.isRequired,
    navBarLocked: PropTypes.bool.isRequired
}

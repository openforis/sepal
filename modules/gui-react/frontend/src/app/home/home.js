import React from 'react'
import PropTypes from 'prop-types'
import styles from './home.module.css'
import Footer from 'app/home/footer'

export default class Home extends React.Component {
    render() {
        return (
            <div className={styles.home}>
                <NavBar/>
                <Footer className={styles.footer} user={this.props.user}/>
                <Body/>
            </div>
        )
    }
}
Home.propTypes = {
    user: PropTypes.object.isRequired
}

const NavBar = () =>
    <div className={styles.navBar}>
        Nav bar
    </div>


const Body = () =>
    <div className={styles.body}>
        Body
    </div>
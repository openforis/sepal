import React from 'react'
import FontAwesome from 'react-fontawesome'
import 'font-awesome/css/font-awesome.css';

const Icon = props =>
  <FontAwesome{...props}/>

Icon.propTypes = FontAwesome.propTypes

export default Icon
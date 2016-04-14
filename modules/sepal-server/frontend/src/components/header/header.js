// var EventBus	= require( '../event-bus/event-bus' );

var template = require('./header.html')
var html = template({});

var appLoaded = function( e ){
	console.log( 'apploaded' );
};
EventBus.addEventListener( 'app.loaded' , appLoaded );

module.exports = { html: html };
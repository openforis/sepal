require('bootstrap')

var EventBus	= require( '../event-bus/event-bus' );

var template = require('./app.html')
var $ = require('jquery')

var html = template({name: 'World'});
var app = $('.app');
app.html(html);

var header = require('../header/header');
app.find('.header').html(header.html);



$('.app').click(function(){
	//app.find( '.container' ).fadeOut()
	EventBus.dispatch( 'app.loaded' );
});

require('bootstrap')
var template = require('./app.html')
var $ = require('jquery')

var html = template({name: 'World'})
$('.app').html(html)

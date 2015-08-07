#!/usr/bin/expect

spawn "./OpenForisToolkit.run"
expect "2)" { send "1\r" }
interact
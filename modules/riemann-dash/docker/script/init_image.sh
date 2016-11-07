#!/bin/bash
apt-get -y update && apt-get install -y software-properties-common
apt-add-repository -y ppa:brightbox/ruby-ng
apt-get update
apt-get install -y ruby2.2 ruby2.2-dev

gem install riemann-dash
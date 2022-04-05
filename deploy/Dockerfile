FROM debian:bullseye

RUN apt-get update && apt-get install -y \
  curl \
  gettext \
  git \
  nano \
  packer \
  procps \
  python3 \
  python3-pip
RUN pip3 install \
  ansible \
  boto \
  boto3 \
  pyyaml==5.4.1 \
  requests

RUN ansible-galaxy collection install community.aws
RUN ansible-galaxy collection install amazon.aws
ADD boto.conf /root/.boto
ENV SEPAL_HOME=/usr/local/lib/sepal

FROM debian:bullseye

RUN apt-get -y update && apt-get install -y ca-certificates curl gnupg2 software-properties-common
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | apt-key add -
RUN apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
RUN apt-get update && apt-get install -y \
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
RUN packer plugins install github.com/hashicorp/amazon && packer plugins install github.com/hashicorp/ansible
ADD boto.conf /root/.boto
ENV SEPAL_HOME=/usr/local/lib/sepal

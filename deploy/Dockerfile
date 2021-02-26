FROM debian:buster
RUN apt-get update && apt-get install -y \
  curl \
  git \
  nano \
  packer \
  procps \
  python3 \
  python3-pip
RUN pip3 install \
  ansible==2.9.15 \
  boto \
  boto3
RUN ansible-galaxy collection install community.aws
ENV SEPAL_HOME=/usr/local/lib/sepal

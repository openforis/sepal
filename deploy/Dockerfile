FROM debian:bookworm

RUN apt-get -y update && apt-get install -y ca-certificates curl gnupg2
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
RUN . /etc/os-release && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $VERSION_CODENAME main" > /etc/apt/sources.list.d/hashicorp.list
RUN apt-get update && apt-get install -y \
  gettext \
  git \
  nano \
  packer \
  procps \
  python3 \
  python3-pip
# Targets are Amazon Linux 2, whose /usr/bin/python3 is 3.7; ansible-core 2.18+
# emits positional-only syntax in its module payload and can't run there.
RUN pip3 install --break-system-packages \
  ansible==8.7.0 \
  boto \
  boto3 \
  pyyaml \
  requests

RUN ansible-galaxy collection install community.docker:4.8.8 -v --no-cache -f
RUN packer plugins install github.com/hashicorp/amazon && packer plugins install github.com/hashicorp/ansible
ADD boto.conf /root/.boto
ENV SEPAL_HOME=/usr/local/lib/sepal

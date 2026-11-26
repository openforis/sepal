FROM debian:trixie

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
RUN pip3 install --break-system-packages \
  ansible==14.6.0 \
  boto3 \
  pyyaml \
  requests

RUN packer plugins install github.com/hashicorp/amazon && packer plugins install github.com/hashicorp/ansible
ENV SEPAL_HOME=/usr/local/lib/sepal
# Keeps root-owned bytecode out of the mounted sources
ENV PYTHONDONTWRITEBYTECODE=1

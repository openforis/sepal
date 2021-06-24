FROM ubuntu:bionic
ARG DEBIAN_FRONTEND=noninteractive

# update and install base packages
RUN apt-get update && apt-get install -y \
  apt-utils  \
  curl \
  dnsutils \
  gettext \
  git \
  gnupg \
  htop \
  jq \
  libssl-dev \
  libffi-dev \
  multitail \
  nano \
  packer \
  procps \
  python3 \
  python3-dev \
  python3-pip \
  python3-venv \
  python3-wheel \
  screen \
  software-properties-common \
  sudo \
  unzip \
  wget \
  zip

RUN pip3 install --upgrade pip

# fix "mesg: ttyname failed: Inappropriate ioctl for device" warning
RUN cp /etc/profile /root/.profile

# install gdal
RUN apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y
RUN apt-get update && apt-get install -y \
  libgdal-dev \
  gdal-bin \
  python3-gdal

# install diskus
RUN wget -q https://github.com/sharkdp/diskus/releases/download/v0.6.0/diskus_0.6.0_amd64.deb
RUN dpkg -i diskus_0.6.0_amd64.deb && rm diskus_0.6.0_amd64.deb

# create sepal user
RUN useradd sepal -m && usermod -aG sudo sepal && echo 'sepal     ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# switch to sepal user
USER sepal

# install sdkman and java
RUN curl -s "https://get.sdkman.io" | bash
RUN bash -c "source '/home/sepal/.sdkman/bin/sdkman-init.sh' && sdk install java 12.0.2.hs-adpt"

# install nvm, nodejs (stable) and global npm packages
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
RUN bash -c "source /home/sepal/.nvm/nvm.sh && nvm install node stable && npm install -g nodemon npm-check-updates"

# setup sepal
ENV SEPAL_HOME=/usr/local/lib/sepal
RUN echo 'PATH="$HOME/.local/bin:$PATH"' >> /home/sepal/.bashrc

# rabbitmqctl alias via docker
RUN echo 'alias rabbitmqctl="sudo docker exec -it rabbitmq rabbitmqctl"' >> /home/sepal/.bash_aliases

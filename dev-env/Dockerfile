FROM debian:buster
RUN apt-get update && apt-get install -y \
  curl \
  git \
  nano \
  packer \
  procps \
  python3 \
  python3-pip \
  gdal-bin \
  screen \
  sudo \
  unzip \
  zip
RUN useradd sepal -m && usermod -aG sudo sepal && echo 'sepal     ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers
USER sepal
RUN curl -s "https://get.sdkman.io" | bash
RUN bash -c "source '/home/sepal/.sdkman/bin/sdkman-init.sh' && sdk install java 12.0.2.hs-adpt"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
RUN bash -c "source /home/sepal/.nvm/nvm.sh && nvm install node 13"
ADD ./sepal-setup.sh /usr/local/bin/sepal-setup
ADD ./sepal.sh /usr/local/bin/sepal
ADD ./template.d /etc/sepal/template.d
ENV SEPAL_HOME=/usr/local/lib/sepal
# USER root
# CMD /usr/local/bin/sepal-setup

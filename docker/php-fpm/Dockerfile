FROM php:7.1-fpm
RUN usermod -u 1000 www-data
RUN usermod -G staff www-data

RUN apt-get update && apt-get install -y \
    git zip vim libxml2-dev zlib1g-dev libicu-dev g++  \
    openssh-server iputils-ping netcat libcurl4-openssl-dev libmcrypt-dev\
;

RUN docker-php-ext-configure intl && docker-php-ext-install intl

RUN pecl install xdebug-2.5.0
RUN docker-php-ext-enable  xdebug
RUN docker-php-ext-install -j$(nproc) mcrypt curl pdo pdo_mysql mysqli bcmath opcache soap pcntl

COPY ./insecure_id_rsa.pub /root/insecure_id_rsa.pub

RUN mkdir /var/run/sshd && mkdir -p /root/.ssh \
    && cat /root/insecure_id_rsa.pub >> /root/.ssh/authorized_keys \
    && rm -rf /root/insecure_id_rsa.pub \
;

RUN mkdir -p /var/log/stayintel && chmod -R 777 /var/log/stayintel

COPY php.ini /usr/local/etc/php/php.ini

WORKDIR /var/www/stayintel

CMD ["/usr/sbin/sshd", "-D"]
CMD ["php-fpm"]
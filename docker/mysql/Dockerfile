FROM mysql:8.0

COPY init.sql /docker-entrypoint-initdb.d/init.sql

RUN mkdir /var/lib/mysql-files
RUN chmod 644 /etc/mysql/my.cnf

ENTRYPOINT [ \
    "docker-entrypoint.sh", \
    "--default-authentication-plugin=mysql_native_password", \
    "--character-set-server=utf8mb4", \
    "--collation-server=utf8mb4_unicode_ci" ]
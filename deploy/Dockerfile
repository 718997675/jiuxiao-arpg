# 九霄·山海录 —— 一行命令跑起来
#
# 在项目根目录（有 index.html 的那层）执行：
#   docker build -f deploy/Dockerfile -t jiuxiao .
#   docker run -d --name jiuxiao -p 8080:80 jiuxiao
# 打开 http://服务器IP:8080
#
# 这个镜像只做一件事：把静态文件用 nginx 吐出去，体积约 60MB（主要是 three.js）。

FROM nginx:alpine
RUN rm -f /usr/share/nginx/html/index.html
COPY index.html /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY lib /usr/share/nginx/html/lib
COPY deploy/nginx-docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

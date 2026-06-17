# sim_frontend 开发镜像（Vite dev server，热重载）
# 源码由 docker-compose 以 volume 挂进 /app；node_modules 用匿名卷保留容器内安装结果。
FROM node:22-alpine

WORKDIR /app

# 先装依赖，命中 Docker 层缓存（package.json 不变则不重装）
COPY package.json package-lock.json* ./
RUN npm install

# 兜底拷源码；dev 模式会被 volume 覆盖
COPY . .

EXPOSE 5174

# --host 监听 0.0.0.0，容器外（宿主浏览器）可访问
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

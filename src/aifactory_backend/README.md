
# 部署 MinIO
## 1. 创建目录
sudo mkdir -p /opt/minio-data /opt/minio-config /opt/minio-logs

##  2. 赋予权限 (777 确保容器内任意用户可写，生产环境可根据需求细化)
sudo chmod -R 777 /opt/minio-data /opt/minio-config /opt/minio-logs

docker-compose -f docker-compose.yaml up -d


## 部署服务

[//]: # (sudo docker-compose build --no-cache app #重新构建 --no-cache 是不重新编译。 )
sudo docker-compose build app #重新构建 --no-cache 是不重新编译。
sudo docker-compose up -d # 启动项目

[//]: # (/usr/local/bin/docker-compose -f /opt/AIFactoryUplaodFileService/docker-compose.yml up -d )
[//]: # (docker-compose -f docker-_compose_.yaml up -d)
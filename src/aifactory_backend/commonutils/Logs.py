import logging

# 基础日志配置
def init_logging(name: str = __name__):
    logging.basicConfig(
        level=logging.INFO,  #
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",  # 日志格式
        handlers=[
            logging.StreamHandler()  # 输出到控制台（可追加 FileHandler 输出到文件）
        ]
    )
    logger = logging.getLogger(name)
    return logger

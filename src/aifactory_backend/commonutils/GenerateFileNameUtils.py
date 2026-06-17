import uuid
from datetime import datetime
from typing import List


def generate_date_filename(original_filename: str) -> tuple[str, str | None]:
    """
    根据当天日期生成文件名
    有扩展名: YYYYMMDD.扩展名
    """
    # 获取当前日期
    today = datetime.now().strftime("%Y%m%d")
    # 获取文件扩展名
    if '.' in original_filename:
        file_extension = original_filename.split('.')[-1].lower()
        file_name= original_filename.split('.')[0]
    else:
        file_extension = None
    # 构建文件名，年月日+ filename
    if file_extension:
        filename = f"{today}-{file_name}.{file_extension}"
    else:
        # 没有扩展名时添加随机后缀
        random_suffix = str(uuid.uuid4())[:8]
        filename = f"{today}-{random_suffix}"

    return filename,file_extension
from typing import Type, TypeVar, List, Dict, Any, Optional
from pydantic import BaseModel

# 类型变量
T = TypeVar('T', bound=BaseModel)
ModelType = TypeVar('ModelType')
VOType = TypeVar('VOType', bound=BaseModel)


class ModelToVOConverter:
    """
    通用Model转VO转换工具类
    """

    @staticmethod
    def model_to_vo_dict(model_instance: ModelType, exclude_none: bool = True) -> Dict[str, Any]:
        """
        将Model实例转换为VO字典（使用模型原生字段名，不做转换）
        Args:
            model_instance: SQLModel/Pydantic模型实例
            exclude_none: 是否排除值为None的字段
        Returns:
            原生字段名字典
        """
        # 获取模型字典（保留原生字段名）
        if hasattr(model_instance, 'dict'):
            # 优先使用模型自带的dict方法
            model_dict = model_instance.dict(exclude_none=exclude_none)
        elif hasattr(model_instance, '__dict__'):
            # 处理普通类实例
            model_dict = model_instance.__dict__
            model_dict = {k: v for k, v in model_dict.items() if not k.startswith('_')}
        else:
            # 处理其他可迭代对象
            model_dict = dict(model_instance)
        return model_dict

    @staticmethod
    def batch_model_to_vo_dict(model_list: List[ModelType], exclude_none: bool = True) -> List[Dict[str, Any]]:
        """
        批量将Model列表转换为VO字典列表（保留原生字段名）
        """
        return [ModelToVOConverter.model_to_vo_dict(model, exclude_none) for model in model_list]

    @staticmethod
    def create_model_to_vo(model_instance: ModelType, vo_class: Type[VOType], exclude_none: bool = True) -> VOType:
        """
        从Model实例创建VO实例（直接使用原生字段名映射）
        """
        vo_dict = ModelToVOConverter.model_to_vo_dict(model_instance, exclude_none)
        return vo_class(** vo_dict)

    @staticmethod
    def batch_models_to_vos(model_list: List[ModelType], vo_class: Type[VOType], exclude_none: bool = True) -> List[VOType]:
        """
        批量从Model列表创建VO实例列表（保留原生字段名）
        """
        return [ModelToVOConverter.create_model_to_vo(model, vo_class, exclude_none) for model in model_list]

    @staticmethod
    def convert_and_wrap_pagination(
            model_list: List[ModelType],
            vo_class: Type[VOType],
            total: int,
            page: int,
            size: int,
            exclude_none: bool = True
    ) -> Dict[str, Any]:
        """
        转换并包装分页结果（保留原生字段名）
        """
        records = ModelToVOConverter.batch_models_to_vos(model_list, vo_class, exclude_none)
        pages = (total + size - 1) // size if total > 0 else 0
        return {
            "records": [vo.dict() for vo in records],
            "current": page,
            "pages": pages,
            "pageSize": size,
            "total": total
        }
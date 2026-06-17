# from pxr import Usd
# import os
# import sys
# def convert_usd_to_usda(input_usd_path, output_usda_path=None):
#     """
#     将 USD/USDC 二进制文件 转换为 USDA 文本文件
#     :param input_usd_path: 输入文件路径（.usd / .usdc）
#     :param output_usda_path: 输出 USDA 路径（不填则自动生成同名文件）
#     :return: 成功返回 True，失败返回 False
#     """
#     # 自动生成输出路径
#     if not output_usda_path:
#         base_name = os.path.splitext(input_usd_path)[0]
#         output_usda_path = f"{base_name}.usda"
#
#     try:
#         # 打开 USD 文件
#         stage = Usd.Stage.Open(input_usd_path)
#         if not stage:
#             print(f"无法打开文件: {input_usd_path}")
#             return False
#
#         # 另存为 USDA 格式
#         stage.Export(output_usda_path, format="usda")
#         print(f"转换成功: {output_usda_path}")
#         return True
#
#     except Exception as e:
#         print(f"转换失败: {str(e)}")
#         return False
#
# def batch_convert(folder_path):
#     """批量转换文件夹内所有 .usd / .usdc 文件"""
#     for filename in os.listdir(folder_path):
#         if filename.lower().endswith((".usd", ".usdc")):
#             file_path = os.path.join(folder_path, filename)
#             convert_usd_to_usda(file_path)
#
# if __name__ == "__main__":
#     # 用法：python usd2usda.py 你的文件.usd
#     if len(sys.argv) > 1:
#         input_path = sys.argv[1]
#         if os.path.isdir(input_path):
#             batch_convert(input_path)
#         else:
#             convert_usd_to_usda(input_path)
#     # 方式 2：直接写死路径（新手友好）
#     else:
#         # 在这里替换成你的文件路径
#         YOUR_USD_FILE = "./a_L_HST_Dis_Assy_Sub.usd"  # Windows
#         convert_usd_to_usda(YOUR_USD_FILE)from pxr import Usd
# import os
# import sys
# def convert_usd_to_usda(input_usd_path, output_usda_path=None):
#     """
#     将 USD/USDC 二进制文件 转换为 USDA 文本文件
#     :param input_usd_path: 输入文件路径（.usd / .usdc）
#     :param output_usda_path: 输出 USDA 路径（不填则自动生成同名文件）
#     :return: 成功返回 True，失败返回 False
#     """
#     # 自动生成输出路径
#     if not output_usda_path:
#         base_name = os.path.splitext(input_usd_path)[0]
#         output_usda_path = f"{base_name}.usda"
#
#     try:
#         # 打开 USD 文件
#         stage = Usd.Stage.Open(input_usd_path)
#         if not stage:
#             print(f"无法打开文件: {input_usd_path}")
#             return False
#
#         # 另存为 USDA 格式
#         stage.Export(output_usda_path, format="usda")
#         print(f"转换成功: {output_usda_path}")
#         return True
#
#     except Exception as e:
#         print(f"转换失败: {str(e)}")
#         return False
#
# def batch_convert(folder_path):
#     """批量转换文件夹内所有 .usd / .usdc 文件"""
#     for filename in os.listdir(folder_path):
#         if filename.lower().endswith((".usd", ".usdc")):
#             file_path = os.path.join(folder_path, filename)
#             convert_usd_to_usda(file_path)
#
# if __name__ == "__main__":
#     # 用法：python usd2usda.py 你的文件.usd
#     if len(sys.argv) > 1:
#         input_path = sys.argv[1]
#         if os.path.isdir(input_path):
#             batch_convert(input_path)
#         else:
#             convert_usd_to_usda(input_path)
#     # 方式 2：直接写死路径（新手友好）
#     else:
#         # 在这里替换成你的文件路径
#         YOUR_USD_FILE = "./a_L_HST_Dis_Assy_Sub.usd"  # Windows
#         convert_usd_to_usda(YOUR_USD_FILE)
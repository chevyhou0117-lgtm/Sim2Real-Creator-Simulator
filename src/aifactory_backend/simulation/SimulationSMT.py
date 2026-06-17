
import simpy
import random
from collections import defaultdict

class SMTLineSimulation:

    def __init__(self, env, line_config):
        self.env = env
        self.line_name = line_config.get("line_name", "Default SMT Line")

        # 从数据库表 factory_line_details + base_production_line 映射过来的数据
        self.shift_count = line_config.get("shift_count", 3)       # 班次数量
        self.shift_duration = 8 * 60        # 每班 8小时 (转换为分钟)
        self.break_duration = 20            # 换班休息时间(分钟)

        # 统计数据收集器
        self.stats = {
            "produced_count": 0,
            "scrapped_count": 0,
            "cycle_times": [],
            "station_queue_times": defaultdict(list),
            "station_utilization": defaultdict(float), # 记录工作时间
        }

        # 初始化工序设备 (基于工厂设备模型)
        self.stations = {}
        station_configs = line_config.get("stations", [])
        for cfg in station_configs:
            name = cfg["name"]
            self.stations[name] = {
                "resource": simpy.Resource(env, capacity=cfg.get("count", 1)),
                "process_time": cfg["ct"], # 标准节拍时间(秒)
                "failure_rate": cfg.get("failure_rate", 0.005), # 故障概率 0.5%
                "repair_time": cfg.get("repair_time", 10),      # 维修时间(分钟)
            }

    def run_shifts(self, total_shifts):
        """模拟多班次运行"""
        for shift in range(total_shifts):
            print(f"\n⏰ --- 【{self.line_name}】第 {shift + 1} 班次开始 (时间: {self.env.now:.0f} 分钟) ---")

            # 在班次内持续投入产品 (假设投料节拍略大于瓶颈节拍)
            yield self.env.process(self.feed_materials(shift))

            # 班次结束，换班休息
            if shift < total_shifts - 1:
                print(f"⏰ --- 第 {shift + 1} 班次结束，开始换班休息 ---")
                yield self.env.timeout(self.break_duration)

    def feed_materials(self, shift):
        """投料逻辑：模拟 PCB 板不断进入线体"""
        # 假设投料间隔为 50秒
        feed_interval = 50
        end_time = self.env.now + self.shift_duration

        board_id = shift * 500 # 简单的板子ID生成逻辑
        while self.env.now < end_time:
            board_id += 1
            # 启动一块板子的生产流程
            self.env.process(self.process_board(f"PCB-{board_id}"))
            yield self.env.timeout(feed_interval)

    def process_board(self, board_name):
        """单块 PCB 板的流转过程"""
        start_time = self.env.now

        # SMT 标准工艺流程顺序
        process_flow = ["Solder Printer", "SPI", "Chip Mounter", "Reflow Oven", "AOI"]
        is_scrapped = False

        for station_name in process_flow:
            if is_scrapped:
                break

            station = self.stations[station_name]
            arrive_time = self.env.now

            # 1. 排队等待设备
            with station["resource"].request() as req:
                yield req
                wait_time = self.env.now - arrive_time
                self.stats["station_queue_times"][station_name].append(wait_time)

                # 2. 模拟设备随机故障 (除了回流焊，回流焊不停机)
                if station_name != "Reflow Oven" and random.random() < station["failure_rate"]:
                    print(f" [{self.env.now:.1f}m] {station_name} 发生故障！{board_name} 被迫等待维修。")
                    yield self.env.timeout(station["repair_time"])

                # 3. 开始加工 (加入高斯分布的抖动，让模拟更真实)
                actual_ct = max(10, random.gauss(station["process_time"], 2))
                yield self.env.timeout(actual_ct / 60.0) # SimPy以分钟为单位，除以60转分钟
                self.stats["station_utilization"][station_name] += actual_ct / 60.0

            # 4. 质量检测逻辑 (SPI 和 AOI 会拦截不良品)
            if station_name in ["SPI", "AOI"]:
                # 假设直通率 FPY 为 98.5%
                if random.random() > 0.985:
                    print(f"[{self.env.now:.1f}m] {board_name} 在 {station_name} 检出不良，报废！")
                    is_scrapped = True
                    self.stats["scrapped_count"] += 1
                    break

        # 5. 下线统计
        if not is_scrapped:
            cycle_time = self.env.now - start_time
            self.stats["produced_count"] += 1
            self.stats["cycle_times"].append(cycle_time)

    def print_report(self):
        """输出仿真报告"""
        print("\n" + "= " *40)
        print(f"【{self.line_name}】仿真统计报告")
        print("= " *40)
        print(f"总产出 (良品): {self.stats['produced_count']} pcs")
        print(f"总报废: {self.stats['scrapped_count']} pcs")

        if self.stats['produced_count'] > 0:
            avg_ct = (sum(self.stats['cycle_times']) / len(self.stats['cycle_times'])) * 60
            print(f"平均实际周期: {avg_ct:.2f} 秒/pcs")
            # 计算良率
            total_passed = self.stats['produced_count'] + self.stats['scrapped_count']
            fpy = (self.stats['produced_count'] / total_passed) * 100 if total_passed > 0 else 0
            print(f"整体直通率 (FPY): {fpy:.2f}%")

        print("\n🛠️ 各工位表现:")
        total_time_mins = self.shift_count * self.shift_duration
        for name, util_time in self.stats["station_utilization"].items():
            util_percent = (util_time / total_time_mins) * 100
            avg_queue = (sum(self.stats["station_queue_times"][name]) / len
                (self.stats["station_queue_times"][name])) * 60 if self.stats["station_queue_times"][name] else 0
            print(f" - {name:15s} | 利用率: {util_percent:5.1f}% | 平均排队: {avg_queue:5.2f}秒")



if __name__ == "__main__":
    # 这里的数据结构对应从 factory_line_details / factory_equipment_details / factory_asset_3d_model 和 base_* 表查出来的 JOIN 结果
    smt_line_config = {
        "line_name": "SMT01# Line",
        "shift_count": 3,  # 三班倒
        "stations": [
            # name 对应 equipment_name, ct 对应 standard_ct
            {"name": "Solder Printer", "ct": 35, "count": 1, "failure_rate": 0.005, "repair_time": 15},
            {"name": "SPI",            "ct": 30, "count": 1, "failure_rate": 0.002, "repair_time": 10},
            {"name": "Chip Mounter",  "ct": 45, "count": 2, "failure_rate": 0.008, "repair_time": 20}, # 瓶颈：节拍最长，且算上2台设备
            {"name": "Reflow Oven",   "ct": 40, "count": 1, "failure_rate": 0.000, "repair_time": 0},  # 连续炉，不停机
            {"name": "AOI",            "ct": 35, "count": 1, "failure_rate": 0.003, "repair_time": 10},
        ]
    }

    # 初始化 SimPy 环境
    env = simpy.Environment()

    # 实例化线体仿真
    simulator = SMTLineSimulation(env, smt_line_config)

    # 运行 1 天 (3个班次)
    env.process(simulator.run_shifts(total_shifts=3))

    print("仿真开始启动...")
    env.run() # 运行直到没有事件为止

    # 打印结果
    simulator.print_report()

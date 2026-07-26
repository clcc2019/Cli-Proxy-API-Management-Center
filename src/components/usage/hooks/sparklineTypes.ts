/**
 * Sparkline 数据形状
 *
 * 原先与 `useSparklines` 同文件。那个 hook 从未被调用（只有类型被引用），
 * 且内部对同两份数据做了 5 次 memo（其中 4 次互为重复），因此已删除；
 * 类型定义保留在此，供 SvgSparkline 与 useUsageAggregateSparklines 使用。
 */

export interface SparklineData {
  labels: string[];
  datasets: [
    {
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
      borderWidth: number;
    },
  ];
}

export interface SparklineBundle {
  data: SparklineData;
}

import { ALL_MODELS_CHART_LABEL, type ChartData } from '@/utils/usage';

export const relabelAllModels = (chartData: ChartData, allModelsLabel?: string): ChartData => {
  if (!allModelsLabel || chartData.datasets.length === 0) {
    return chartData;
  }

  return {
    ...chartData,
    datasets: chartData.datasets.map((dataset) =>
      dataset.label === ALL_MODELS_CHART_LABEL ? { ...dataset, label: allModelsLabel } : dataset
    ),
  };
};

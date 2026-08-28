import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { IconDollarSign, IconInfo } from '@/components/ui/icons';
import styles from './PricingPage.module.scss';

type ModelPrice = {
  model: string;
  vendor: 'Claude' | 'OpenAI';
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  officialInput?: number;
  officialOutput?: number;
};

type PricingResponse = {
  claude?: { models?: Record<string, Record<string, number>> };
  openai?: { models?: Record<string, Record<string, number>> };
  updatedAt?: string;
};

const API_ROOT = 'https://api.derouter.network/api';
const FALLBACK_PRICES: ModelPrice[] = [
  {
    model: 'claude-fable-5',
    vendor: 'Claude',
    input: 1.6245,
    output: 8.1225,
    cacheWrite: 2.0311,
    cacheRead: 0.1625,
    officialInput: 10,
    officialOutput: 50,
  },
  {
    model: 'claude-opus-4-6',
    vendor: 'Claude',
    input: 0.8122,
    output: 4.0613,
    cacheWrite: 1.0155,
    cacheRead: 0.0812,
    officialInput: 5,
    officialOutput: 25,
  },
  {
    model: 'claude-sonnet-4-6',
    vendor: 'Claude',
    input: 0.4874,
    output: 2.4367,
    cacheWrite: 0.6092,
    cacheRead: 0.0487,
    officialInput: 3,
    officialOutput: 15,
  },
  {
    model: 'claude-haiku-4-5',
    vendor: 'Claude',
    input: 0.1625,
    output: 0.8122,
    cacheWrite: 0.2031,
    cacheRead: 0.0162,
    officialInput: 1,
    officialOutput: 5,
  },
  {
    model: 'claude-sonnet-5',
    vendor: 'Claude',
    input: 0.3249,
    output: 1.6245,
    cacheWrite: 0.4066,
    cacheRead: 0.0325,
    officialInput: 2,
    officialOutput: 10,
  },
  {
    model: 'gpt-5.5',
    vendor: 'OpenAI',
    input: 0.3325,
    output: 1.995,
    cacheWrite: 0.0333,
    cacheRead: 0.0333,
    officialInput: 5,
    officialOutput: 30,
  },
  {
    model: 'gpt-5.4',
    vendor: 'OpenAI',
    input: 0.1662,
    output: 0.9975,
    cacheWrite: 0.0166,
    cacheRead: 0.0166,
    officialInput: 2.5,
    officialOutput: 15,
  },
  {
    model: 'gpt-5.6-terra',
    vendor: 'OpenAI',
    input: 0.133,
    output: 0.798,
    cacheWrite: 0.1662,
    cacheRead: 0.0133,
    officialInput: 2,
    officialOutput: 12,
  },
  {
    model: 'gpt-5.6-sol',
    vendor: 'OpenAI',
    input: 0.266,
    output: 1.596,
    cacheWrite: 0.3325,
    cacheRead: 0.0266,
    officialInput: 4,
    officialOutput: 20,
  },
];

const roundPrice = (value: number) => Math.ceil(value * 10000) / 10000;
const formatUsd = (value: number) => `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`;

function normalizePricing(
  data: PricingResponse | null,
  official: Record<string, { input?: number; output?: number }>
) {
  if (!data) return FALLBACK_PRICES;
  const rows: ModelPrice[] = [];
  (['claude', 'openai'] as const).forEach((group) => {
    Object.entries(data[group]?.models ?? {}).forEach(([model, values]) => {
      const officialPrice = official[model];
      rows.push({
        model,
        vendor: group === 'claude' ? 'Claude' : 'OpenAI',
        input: Number(values.input ?? 0),
        output: Number(values.output ?? 0),
        cacheWrite: Number(values.cache_write ?? 0),
        cacheRead: Number(values.cache_read ?? 0),
        officialInput: officialPrice?.input,
        officialOutput: officialPrice?.output,
      });
    });
  });
  return rows.length ? rows : FALLBACK_PRICES;
}

export function PricingPage() {
  const { t } = useTranslation();
  const [claudeMargin, setClaudeMargin] = useState(30);
  const [gptMargin, setGptMargin] = useState(30);
  const [prices, setPrices] = useState<ModelPrice[]>(FALLBACK_PRICES);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState(false);

  const loadPricing = useCallback(async () => {
    setLoading(true);
    setSourceError(false);
    try {
      const [providerResponse, officialResponse] = await Promise.all([
        fetch(`${API_ROOT}/providers/pricing`),
        fetch(`${API_ROOT}/market/official-pricing`),
      ]);
      if (!providerResponse.ok || !officialResponse.ok) throw new Error('pricing unavailable');
      const providerData = (await providerResponse.json()) as PricingResponse;
      const officialData = (await officialResponse.json()) as {
        models?: Record<string, { input?: number; output?: number }>;
      };
      setPrices(normalizePricing(providerData, officialData.models ?? {}));
      setUpdatedAt(providerData.updatedAt ?? new Date().toISOString());
    } catch {
      setSourceError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  const claudeMultiplier = 1 / (1 - claudeMargin / 100);
  const gptMultiplier = 1 / (1 - gptMargin / 100);
  const pricedRows = useMemo(
    () =>
      prices.map((price) => {
        const costMultiplier = price.vendor === 'Claude' ? claudeMultiplier : gptMultiplier;
        const sellInput = roundPrice(price.input * costMultiplier);
        const sellOutput = roundPrice(price.output * costMultiplier);
        const officialAverage =
          price.officialInput !== undefined && price.officialOutput !== undefined
            ? (price.officialInput + price.officialOutput) / 2
            : null;
        const sellAverage = (sellInput + sellOutput) / 2;
        return {
          ...price,
          sellInput,
          sellOutput,
          costMultiplier,
          officialMultiplier:
            officialAverage && officialAverage > 0 ? sellAverage / officialAverage : null,
          savings:
            officialAverage && officialAverage > 0
              ? Math.max(0, Math.round((1 - sellAverage / officialAverage) * 100))
              : null,
        };
      }),
    [claudeMultiplier, gptMultiplier, prices]
  );

  const averageSavings = useMemo(() => {
    const comparable = pricedRows.filter((row) => row.savings !== null);
    return comparable.length
      ? Math.round(comparable.reduce((sum, row) => sum + (row.savings ?? 0), 0) / comparable.length)
      : 0;
  }, [pricedRows]);

  return (
    <div className={styles.page}>
      <ManagementPageHeader
        title={t('pricing.title')}
        description={t('pricing.description')}
        count={prices.length}
        countAriaLabel={t('pricing.models_count', { count: prices.length })}
        actions={
          <RefreshButton
            loading={loading}
            label={t('pricing.refresh')}
            variant="secondary"
            size="sm"
            onClick={() => void loadPricing()}
          >
            {t('pricing.refresh')}
          </RefreshButton>
        }
      />

      <section className={styles.strategy} aria-labelledby="pricing-strategy-title">
        <div className={styles.strategyIntro}>
          <span className={styles.eyebrow}>
            <IconDollarSign size={16} /> {t('pricing.strategy_eyebrow')}
          </span>
          <h2 id="pricing-strategy-title">{t('pricing.strategy_title')}</h2>
          <p>{t('pricing.strategy_description')}</p>
        </div>
        <div className={styles.controls}>
          <label htmlFor="claude-margin">{t('pricing.claude_margin')}</label>
          <div className={styles.marginControl}>
            <input
              id="claude-margin"
              type="number"
              min="0"
              max="99"
              step="0.1"
              value={claudeMargin}
              onChange={(event) =>
                setClaudeMargin(Math.min(99, Math.max(0, Number(event.target.value) || 0)))
              }
            />
            <span>%</span>
          </div>
          <label htmlFor="gpt-margin">{t('pricing.gpt_margin')}</label>
          <div className={styles.marginControl}>
            <input
              id="gpt-margin"
              type="number"
              min="0"
              max="99"
              step="0.1"
              value={gptMargin}
              onChange={(event) =>
                setGptMargin(Math.min(99, Math.max(0, Number(event.target.value) || 0)))
              }
            />
            <span>%</span>
          </div>
          <div className={styles.formula}>
            <span>{t('pricing.multiplier')}</span>
            <strong>
              {t('pricing.claude')} {claudeMultiplier.toFixed(2)}× · {t('pricing.gpt')}{' '}
              {gptMultiplier.toFixed(2)}×
            </strong>
          </div>
        </div>
      </section>

      <div className={styles.summary} role="status">
        <div>
          <span>{t('pricing.models')}</span>
          <strong>{prices.length}</strong>
        </div>
        <div>
          <span>{t('pricing.claude_margin')}</span>
          <strong>{claudeMargin}%</strong>
        </div>
        <div>
          <span>{t('pricing.gpt_margin')}</span>
          <strong>{gptMargin}%</strong>
        </div>
        <div>
          <span>{t('pricing.average_savings')}</span>
          <strong>{averageSavings}%</strong>
        </div>
        <div className={styles.source}>
          <span>{sourceError ? t('pricing.fallback_source') : t('pricing.live_source')}</span>
          <small>{updatedAt ? new Date(updatedAt).toLocaleString() : t('pricing.loading')}</small>
        </div>
      </div>

      <section className={styles.tablePanel} aria-labelledby="pricing-table-title">
        <div className={styles.panelHeader}>
          <div>
            <h2 id="pricing-table-title">{t('pricing.table_title')}</h2>
            <p>{t('pricing.table_description')}</p>
          </div>
          <span className={styles.unit}>{t('pricing.unit')}</span>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>{t('pricing.model')}</th>
                <th className={styles.mobileOnly}>{t('pricing.price_breakdown')}</th>
                <th className={styles.mobileOptional}>{t('pricing.vendor')}</th>
                <th className={styles.mobileOptional}>{t('pricing.provider_input')}</th>
                <th className={styles.mobileOptional}>{t('pricing.provider_output')}</th>
                <th className={styles.mobileOptional}>{t('pricing.provider_cache')}</th>
                <th className={styles.mobileOptional}>{t('pricing.your_input')}</th>
                <th className={styles.mobileOptional}>{t('pricing.your_output')}</th>
                <th className={styles.mobileOptional}>{t('pricing.your_cache')}</th>
                <th>{t('pricing.official_multiplier')}</th>
                <th className={styles.mobileOptional}>{t('pricing.savings')}</th>
              </tr>
            </thead>
            <tbody>
              {pricedRows.map((row) => (
                <tr key={row.model}>
                  <td className={styles.model}>{row.model}</td>
                  <td className={styles.mobileOnly}>
                    <div className={styles.mobilePriceStack}>
                      <span>
                        <small>{t('pricing.input_short')}</small>
                        {formatUsd(row.sellInput)} <small>{t('pricing.output_short')}</small>
                        {formatUsd(row.sellOutput)}
                      </span>
                      <span>
                        <small>{t('pricing.cache_short')}</small>
                        {formatUsd(roundPrice(row.cacheWrite * row.costMultiplier))} /{' '}
                        {formatUsd(roundPrice(row.cacheRead * row.costMultiplier))}
                      </span>
                    </div>
                  </td>
                  <td className={styles.mobileOptional}>
                    <span className={styles.vendor}>{row.vendor}</span>
                  </td>
                  <td className={`${styles.cost} ${styles.mobileOptional}`}>
                    {formatUsd(row.input)}
                  </td>
                  <td className={`${styles.cost} ${styles.mobileOptional}`}>
                    {formatUsd(row.output)}
                  </td>
                  <td className={`${styles.cost} ${styles.mobileOptional}`}>
                    {formatUsd(row.cacheWrite)} / {formatUsd(row.cacheRead)}
                  </td>
                  <td className={`${styles.recommended} ${styles.mobileOptional}`}>
                    {formatUsd(row.sellInput)}
                  </td>
                  <td className={`${styles.recommended} ${styles.mobileOptional}`}>
                    {formatUsd(row.sellOutput)}
                  </td>
                  <td className={`${styles.recommended} ${styles.mobileOptional}`}>
                    {formatUsd(roundPrice(row.cacheWrite * row.costMultiplier))} /{' '}
                    {formatUsd(roundPrice(row.cacheRead * row.costMultiplier))}
                  </td>
                  <td className={styles.multiplier}>
                    {row.officialMultiplier === null
                      ? '—'
                      : `${row.officialMultiplier.toFixed(2)}×`}
                  </td>
                  <td className={styles.mobileOptional}>
                    {row.savings === null ? (
                      '—'
                    ) : (
                      <span className={styles.savings}>−{row.savings}%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.note}>
          <IconInfo size={16} />
          <span>{t('pricing.note')}</span>
        </div>
      </section>
    </div>
  );
}

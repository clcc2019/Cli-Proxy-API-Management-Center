import type { PropsWithChildren, ReactNode } from 'react';

type CardDensity = 'regular' | 'compact' | 'cozy';

interface CardProps {
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
  /**
   * 内边距密度
   * - 'regular'（默认）: 页面主卡
   * - 'compact': 14px 紧凑内边距，适合密集列表卡
   * - 'cozy': 20px 舒适内边距，适合重要数据展示
   */
  density?: CardDensity;
  /** 去掉默认边框和阴影，让内容自己带视觉层级 */
  flush?: boolean;
  /** 去掉 header 底部分割线 */
  headerFlush?: boolean;
  /** 直接把 header 贴到卡片顶边（不占 padding） */
  headerBleed?: boolean;
}

export function Card({
  title,
  extra,
  children,
  className,
  density = 'regular',
  flush = false,
  headerFlush = false,
  headerBleed = false,
}: PropsWithChildren<CardProps>) {
  const classes = ['card'];
  if (density === 'compact') classes.push('card-compact');
  if (density === 'cozy') classes.push('card-cozy');
  if (flush) classes.push('card-flush');
  if (className) classes.push(className);

  const headerClasses = ['card-header'];
  if (headerFlush) headerClasses.push('card-header-flush');
  if (headerBleed) headerClasses.push('card-header-bleed');

  return (
    <div className={classes.join(' ')}>
      {(title || extra) && (
        <div className={headerClasses.join(' ')}>
          <div className="title">{title}</div>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

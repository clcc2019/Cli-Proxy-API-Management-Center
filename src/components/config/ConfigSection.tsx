import { forwardRef, type HTMLAttributes, type PropsWithChildren, type ReactNode } from 'react';
import { IconChevronDown } from '@/components/ui/icons';
import styles from './ConfigSection.module.scss';

interface ConfigSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  collapsible?: boolean;
  expanded?: boolean;
  state?: 'dirty' | 'error';
  stateLabel?: string;
  onExpandedChange?: (expanded: boolean) => void;
}

export const ConfigSection = forwardRef<HTMLElement, PropsWithChildren<ConfigSectionProps>>(
  function ConfigSection(
    {
      title,
      description,
      collapsible = false,
      expanded = true,
      state,
      stateLabel,
      onExpandedChange,
      className,
      children,
      id,
      ...rest
    },
    ref
  ) {
    const sectionClassName = [styles.section, className].filter(Boolean).join(' ');
    const titleId = id ? `${id}-title` : undefined;
    const contentId = id ? `${id}-content` : undefined;

    return (
      <section
        ref={ref}
        id={id}
        className={sectionClassName}
        data-state={state}
        aria-labelledby={titleId}
        {...rest}
      >
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {state ? (
            <span
              className={styles.stateMark}
              role={stateLabel ? 'img' : undefined}
              aria-label={stateLabel}
              aria-hidden={stateLabel ? undefined : true}
            />
          ) : null}
          {collapsible ? (
            <button
              type="button"
              className={styles.toggle}
              aria-labelledby={titleId}
              aria-controls={contentId}
              aria-expanded={expanded}
              onClick={() => onExpandedChange?.(!expanded)}
            >
              <IconChevronDown size={18} aria-hidden="true" />
            </button>
          ) : null}
        </header>
        {expanded ? (
          <div id={contentId} className={styles.content}>
            {children}
          </div>
        ) : null}
      </section>
    );
  }
);

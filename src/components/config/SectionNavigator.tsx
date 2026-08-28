import { useEffect, useState } from 'react';
import styles from './SectionNavigator.module.scss';

export type SectionNavigationItem = {
  id: string;
  label: string;
  state?: 'dirty' | 'error';
};

export function SectionNavigator({
  items,
  label,
  dirtyLabel,
  errorLabel,
}: {
  items: SectionNavigationItem[];
  label: string;
  dirtyLabel: string;
  errorLabel: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const sections = items
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (current) setActiveId(current.target.id);
      },
      { rootMargin: '-18% 0px -70% 0px' }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className={styles.navigator} aria-label={label}>
      {items.map((item) => (
        <a
          key={item.id}
          className={styles.item}
          href={`#${item.id}`}
          aria-current={activeId === item.id ? 'location' : undefined}
          data-state={item.state}
          aria-label={
            item.state
              ? `${item.label}, ${item.state === 'error' ? errorLabel : dirtyLabel}`
              : undefined
          }
          onClick={(event) => {
            event.preventDefault();
            setActiveId(item.id);
            document.getElementById(item.id)?.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
              block: 'start',
            });
          }}
        >
          <span>{item.label}</span>
          {item.state ? <span className={styles.state} aria-hidden="true" /> : null}
        </a>
      ))}
    </nav>
  );
}

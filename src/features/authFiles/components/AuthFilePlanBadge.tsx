import { useTranslation } from 'react-i18next';
import { IconDiamond } from '@/components/ui/icons';
import type { AuthFilePlanBadgeInfo } from '@/features/authFiles/planMetadata';
import styles from '@/pages/AuthFilesPage.module.scss';

type AuthFilePlanBadgeProps = {
  badge: AuthFilePlanBadgeInfo;
};

export function AuthFilePlanBadge(props: AuthFilePlanBadgeProps) {
  const { badge } = props;
  const { t } = useTranslation();
  const planLabel = t(badge.labelKey);
  const text = t('auth_files.plan_badge', {
    plan: planLabel,
  });

  return (
    <span
      title={text}
      className={`${styles.planBadge} ${
        badge.kind === 'plus' ? styles.planBadgePlus : styles.planBadgePro
      }`}
    >
      {badge.kind === 'plus' && <IconDiamond className={styles.planBadgeIcon} size={12} />}
      <span className={styles.planBadgeText}>{text}</span>
    </span>
  );
}

export function LoadingSpinner({
  size = 20,
  className = '',
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`loading-spinner${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, borderWidth: size / 7 }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

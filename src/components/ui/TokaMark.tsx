import type { SVGProps } from 'react';

export function TokaMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="2" y="2" width="60" height="60" rx="15" fill="#0e0d0c" />
      <path
        d="M21 18h22v6H35v23h-6V24h-8z"
        fill="#fff"
      />
      <path
        d="M16 3.5h32"
        fill="none"
        stroke="#fff"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.14"
      />
      <circle cx="48" cy="48" r="5" fill="#ff6e06" />
    </svg>
  );
}

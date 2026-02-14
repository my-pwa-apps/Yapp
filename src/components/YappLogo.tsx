import React from 'react';

interface Props {
  size?: number;
  className?: string;
}

export const YappLogo: React.FC<Props> = ({ size = 72, className }) => (
  <img
    src={`${import.meta.env.BASE_URL}icons/logo.svg`}
    alt="Yapp"
    width={size}
    height={size}
    className={className || undefined}
  />
);

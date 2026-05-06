export { formatKoboAsNaira } from '@examready/shared';

export const formatNaira = (naira: number): string =>
  `₦${naira.toLocaleString('en-NG')}`;

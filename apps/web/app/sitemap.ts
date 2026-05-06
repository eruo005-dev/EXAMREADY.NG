import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://examready.ng';
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, priority: 1 },
    { url: `${base}/pricing`, lastModified, priority: 0.8 },
    { url: `${base}/about`, lastModified, priority: 0.5 },
    { url: `${base}/contact`, lastModified, priority: 0.5 },
    { url: `${base}/privacy`, lastModified, priority: 0.3 },
    { url: `${base}/terms`, lastModified, priority: 0.3 },
  ];
}

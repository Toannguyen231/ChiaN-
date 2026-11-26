const { isIP } = require('node:net');

module.exports = ({ config }) => {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  const release = process.env.CHIANE_RELEASE_BUILD === '1' ||
    ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE);
  const url = raw ? new URL(raw) : null;
  if (release && (!url || url.protocol !== 'https:' || url.pathname !== '/' ||
      url.username || url.password || url.hash || url.search || !url.hostname.includes('.') ||
      isIP(url.hostname) || /\.(invalid|local|localhost|test)$/.test(url.hostname))) {
    throw new Error('Set EXPO_PUBLIC_API_URL to the public HTTPS API origin in the selected EAS environment.');
  }

  const hosts = new Set(['chiane.app']);
  if (url?.protocol === 'https:') hosts.add(url.hostname);
  return {
    ...config,
    android: {
      ...config.android,
      intentFilters: [...hosts].map(host => ({
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host, pathPrefix: '/moi/' }],
      })),
    },
  };
};

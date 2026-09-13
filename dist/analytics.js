const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';

if (!local && !optedOut) {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', event => {
    const url = new URL(event.url, location.href);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  });
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  script.onerror = () => { window.va = () => {}; window.vaq = []; };
  document.head.append(script);
}

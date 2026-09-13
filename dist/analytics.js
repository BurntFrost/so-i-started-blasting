const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';

if (!local && !optedOut) {
  const beforeSend = event => {
    const url = new URL(event.url, location.href);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  };
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', beforeSend);
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  script.onerror = () => { window.va = () => {}; window.vaq = []; };
  document.head.append(script);

  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  window.si('beforeSend', beforeSend);
  const speedScript = document.createElement('script');
  speedScript.defer = true;
  speedScript.src = '/_vercel/speed-insights/script.js';
  speedScript.onerror = () => { window.si = () => {}; window.siq = []; };
  document.head.append(speedScript);
}

(() => {
  let theme;
  try { theme = JSON.parse(localStorage.getItem('cf:theme')); } catch {}
  document.documentElement.dataset.theme = theme === 'dark' || theme === 'light' ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();

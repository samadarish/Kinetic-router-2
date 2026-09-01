(() => {
  try {
    const saved = localStorage.getItem('kineticrouter-theme');
    const theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.className = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.className = 'dark';
  }
})();

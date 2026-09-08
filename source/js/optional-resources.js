(function () {
  if (window.datLoadScript) return;
  const pending = new Map();
  window.datLoadScript = function (url) {
    if (pending.has(url)) return pending.get(url);
    const task = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      const timeout = setTimeout(() => fail(), 20000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        pending.delete(url);
        reject(new Error('资源加载失败，请重试'));
      }
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = fail;
      document.head.appendChild(script);
    });
    pending.set(url, task);
    return task;
  };
})();

(function () {
  if (window.datResponsiveCovers) return;
  window.datResponsiveCovers = true;
  const manifest = window.DAT_COVER_VARIANTS || {};
  function apply(image) {
    if (!image.matches('img.article-cover, .blog-slider__img img')) return;
    const source = image.getAttribute('data-lazy-src') || image.getAttribute('src');
    if (!source) return;
    if (!image.datResponsiveErrorBound) {
      image.datResponsiveErrorBound = true;
      image.addEventListener('error', () => {
        image.removeAttribute('srcset');
        image.src = image.dataset.responsiveSource || source;
      }, { once: true });
    }
    if (source === image.dataset.responsiveSource) return;
    const entry = manifest[source];
    // Projected posts clone old cards. Never inherit the template's srcset.
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.dataset.responsiveSource = source;
    if (entry) {
      image.srcset = entry.srcset;
      image.sizes = entry.sizes;
    }
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = source;
    image.removeAttribute('data-lazy-src');
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('img')) apply(node);
    node.querySelectorAll('img.article-cover, .blog-slider__img img').forEach(apply);
  }
  scan(document.documentElement);
  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'attributes') apply(record.target);
    else record.addedNodes.forEach(scan);
  })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-lazy-src'] });
})();

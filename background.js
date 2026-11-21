// Dynamic background: side flowers (built here) + slow-scroll (parallax) motion.
// Everything here is cosmetic: if this file fails, the page still works.
(function () {
  // ---------------------------------------------------------------
  // SIDE FLOWERS: list every file in assets/sides/ here.
  // A file whose name contains "left" goes on the left edge, "right" on the right edge.
  // Add, remove or rename files freely; just keep this list in sync with the folder.
  // (A website can't list a folder by itself, so this list is how the page knows what exists.)
  // ---------------------------------------------------------------
  const SIDE_DIR = 'assets/sides/';
  const SIDE_FILES = [
    'blue_left.svg',
    'yellow_left.svg',
    'red_left.svg',
    'blue_left_dragon.svg',
    'red_left_tiger.svg',
    'yellow_right_dragon.svg',
    'blue_right.svg',
    'red_right.svg',
    'blue_right_tiger.svg',
    'yellow_right.svg',
  ];

  const MAX_FLOWER_VW = 0.20; // no flower (corner or side) is wider than this fraction of the screen width
  const MAX_CORNER_PX = 360;  // ...and corners never exceed this many pixels on very large screens
  const SIDE_MIN_WIDTH = 900; // side flowers only appear on screens at least this wide (px)
  // Minimum space between any two neighbouring flowers on an edge (corner to side flower, or side to side).
  // It is a fraction of the corner flower's current width, so it scales with the flowers (0.067 is about 24px on a wide screen).
  const SIDE_GAP_RATIO = 0.067;
  // Only used if a side SVG has no width/height of its own (so its true size can't be read):
  // it is then drawn this fraction of the corner width wide.
  const SIDE_FALLBACK_WIDTH = 0.5;

  const PHOTO_SPEED = 0.05;   // photo drifts at 5% of scroll speed (barely moves)
  // Corner and side flowers are fixed to the page: they scroll exactly with it, like the page's own corners and edges.
  // (0 = fixed to the page. A value above 0 makes them trail behind the page by that fraction. If you change one,
  // give the other the same value, otherwise the sides leave extra empty space to stay clear of the corners.)
  const CORNER_SPEED = 0;
  const SIDE_SPEED = CORNER_SPEED;

  const layer = document.getElementById('bg-flowers');
  if (!layer) return;

  const photo = document.getElementById('bg-photo');
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const corners = Array.from(layer.querySelectorAll('[data-parallax="top"], [data-parallax="bottom"]'));

  // ---- side flower stacks --------------------------------------
  const sides = [
    { key: 'left',  box: document.getElementById('bg-side-left'),  files: [], imgs: [], start: 0 },
    { key: 'right', box: document.getElementById('bg-side-right'), files: [], imgs: [], start: 0 }
  ];
  sides.forEach(function (s) {
    s.track = s.box && s.box.querySelector('.bg-side-track');
    s.files = SIDE_FILES.filter(function (f) { return f.toLowerCase().indexOf(s.key) !== -1; });
  });

  // file name -> { w, h, ratio }: the picture's own size (w, h; 0 if it has none) and height / width.
  const sizes = {};
  let sizesReady = false;

  // Load every side picture once in a hidden box to learn its own size and shape.
  function measureSizes() {
    const all = sides[0].files.concat(sides[1].files);
    if (!all.length) return;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;left:0;width:200px;visibility:hidden;pointer-events:none;';
    layer.appendChild(probe);
    let pending = all.length;
    function done() {
      if (--pending > 0) return;
      probe.remove();
      sides.forEach(function (s) {
        s.files = s.files.filter(function (f) { return sizes[f]; }); // drop files that failed to load
      });
      sizesReady = true;
      layoutSides();
      update();
    }
    all.forEach(function (f) {
      const img = new Image();
      img.alt = '';
      img.style.cssText = 'display:block;';
      img.onload = function () {
        const nw = img.naturalWidth, nh = img.naturalHeight;
        const r = img.getBoundingClientRect();
        if (nw > 0 && nh > 0) sizes[f] = { w: nw, h: nh, ratio: nh / nw };
        else if (r.width > 0 && r.height > 0) sizes[f] = { w: 0, h: 0, ratio: r.height / r.width };
        done();
      };
      img.onerror = done;
      img.src = SIDE_DIR + f;
      probe.appendChild(img);
    });
  }

  // Page scroll distance the background has to cover (0 when motion is switched off).
  function scrollRange() {
    if (reduceMotion) return 0;
    return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  }

  // Rendered height of the corner flower at the top or bottom of one edge (0 until its picture loads).
  function cornerHeight(sideKey, where) {
    const el = layer.querySelector('.bg-corner-' + (where === 'top' ? 't' : 'b') + (sideKey === 'left' ? 'l' : 'r'));
    return el ? el.offsetHeight : 0;
  }

  // Keep every flower within MAX_FLOWER_VW of the screen width. All flowers share one scale (display pixels per
  // SVG unit), so the cap is applied to the scale: the widest flower (corner or side) sets the limit, and the corner
  // width is set to match. Everything then shrinks and grows together.
  function applyFlowerCap() {
    const corner = layer.querySelector('.bg-corner-tl img');
    const cornerNat = corner ? corner.naturalWidth : 0;
    if (!(cornerNat > 0)) return;
    let widest = cornerNat;
    if (window.innerWidth >= SIDE_MIN_WIDTH) { // side flowers only count while they are shown
      Object.keys(sizes).forEach(function (f) { if (sizes[f].w > widest) widest = sizes[f].w; });
    }
    const k = Math.min(MAX_FLOWER_VW * window.innerWidth / widest, MAX_CORNER_PX / cornerNat);
    document.documentElement.style.setProperty('--corner-width', (k * cornerNat).toFixed(1) + 'px');
  }

  // The corner flower's width and its scale: display pixels per unit of the SVG's own size.
  // Side flowers are drawn at this same scale, so a flower looks the same size on a corner and on a side.
  function cornerScale(sideKey) {
    const el = layer.querySelector('.bg-corner-t' + (sideKey === 'left' ? 'l' : 'r'));
    const img = el && el.querySelector('img');
    const width = el ? el.getBoundingClientRect().width : 0; // exact (not rounded) width
    const natural = img ? img.naturalWidth : 0;
    return { width: width, k: natural > 0 ? width / natural : 0 };
  }

  // Fill each edge with whole side flowers, only in the stretch that no corner flower can reach, spread evenly
  // together with the corner flowers (all gaps equal).
  //
  // (With the default speeds of 0 nothing moves relative to the page, and this simply reduces to: sides start just
  // below the top corner and end just above the bottom corner.)
  // If the speeds are above 0, the corners move while scrolling: top corners sit at  y * CORNER_SPEED  below their start, bottom corners
  // at (maxScroll - y) * CORNER_SPEED. The side flowers move at  y * SIDE_SPEED  inside a track that starts
  // (maxScroll * SIDE_SPEED) above the page. Working that through for every scroll position y gives the
  // safe stretch (measured down the track), which holds at any scroll position:
  //   starts at:  topCornerHeight + max(SIDE_SPEED, CORNER_SPEED) * maxScroll
  //   ends at:    pageHeight - bottomCornerHeight
  // (The flowers are then spread between those two points with equal gaps, the end gaps included.)
  function layoutSides() {
    if (!sizesReady) return;
    applyFlowerCap();
    const wide = window.innerWidth >= SIDE_MIN_WIDTH;
    const range = scrollRange();
    const shift = range * SIDE_SPEED;
    const pageH = layer.offsetHeight;

    sides.forEach(function (s) {
      if (!s.track || !s.files.length) return;
      const cs = cornerScale(s.key);                        // follows the screen size, like the corners
      const gap = Math.round(cs.width * SIDE_GAP_RATIO);

      // drawn size of one side flower at the corners' scale
      function drawn(file) {
        const sz = sizes[file];
        const w = (cs.k > 0 && sz.w > 0) ? sz.w * cs.k : cs.width * SIDE_FALLBACK_WIDTH;
        return { w: w, h: w * sz.ratio };
      }

      // The edge runs: top corner, side flowers, bottom corner. 'start' and 'end' are the inner edges of the two
      // corner flowers, so 'room' is all the space between them.
      const start = cornerHeight(s.key, 'top') + Math.max(SIDE_SPEED, CORNER_SPEED) * range;
      const end = pageH - cornerHeight(s.key, 'bottom');
      const room = end - start;

      // How many whole flowers fit if every gap (corner-to-flower included) must be at least the minimum gap?
      // With n flowers there are n + 1 gaps, all equal: (room - total flower height) / (n + 1).
      let count = 0;
      let heights = 0;   // total height of the flowers that fit
      if (wide && cs.width > 0 && room > 0) {
        while (count < 200) {
          const file = s.files[(s.start + count) % s.files.length];
          const h = drawn(file).h;
          if ((room - heights - h) / (count + 2) < gap) break;   // whole pictures only: stop when the next won't fit
          heights += h;
          count++;
        }
      }

      // add to the end / remove from the end (sequential order stays stable while resizing)
      while (s.imgs.length > count) s.imgs.pop().remove();
      while (s.imgs.length < count) {
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = SIDE_DIR + s.files[(s.start + s.imgs.length) % s.files.length];
        s.track.appendChild(img);
        s.imgs.push(img);
      }
      // (re)size every flower to the current scale
      s.imgs.forEach(function (img, i) {
        const d = drawn(s.files[(s.start + i) % s.files.length]);
        img.style.width = d.w.toFixed(1) + 'px';
        img.style.height = d.h.toFixed(1) + 'px';
      });

      // Spread everything evenly, the corner flowers included: the gap from the top corner to the first side
      // flower, between neighbouring side flowers, and from the last side flower to the bottom corner are all equal.
      // (One flower is therefore centred between the two corners.)
      const spread = count > 0 ? (room - heights) / (count + 1) : 0;
      s.track.style.gap = spread.toFixed(1) + 'px';
      s.track.style.top = (start + spread - shift).toFixed(1) + 'px';
    });
  }

  // ---- scroll motion -------------------------------------------
  let ticking = false;

  function update() {
    ticking = false;
    if (reduceMotion) return;
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;
    const vh = window.innerHeight;
    const maxScroll = Math.max(document.documentElement.scrollHeight - vh, 0);

    if (photo) {
      // drift up slowly, never further than the photo's built-in oversize margin
      const limit = vh * 0.07;
      const ty = Math.max(-limit, Math.min(limit, -y * PHOTO_SPEED));
      photo.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
    }

    corners.forEach(function (el) {
      // top corners trail behind the page; bottom corners rise into place as you reach the end
      const ty = el.dataset.parallax === 'top'
        ? y * CORNER_SPEED
        : (maxScroll - y) * CORNER_SPEED;
      el.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
    });

    sides.forEach(function (s) {
      if (s.track) s.track.style.transform = 'translate3d(0,' + (y * SIDE_SPEED).toFixed(1) + 'px,0)';
    });
  }

  function requestUpdate() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }

  let layoutQueued = false;
  function requestLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    window.requestAnimationFrame(function () {
      layoutQueued = false;
      layoutSides();
      update();
    });
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestLayout);
  // page height changes when the guest moves between screens or toggles fields
  if (window.ResizeObserver) {
    const pageObserver = new ResizeObserver(requestLayout);
    pageObserver.observe(document.body);
    pageObserver.observe(document.documentElement);
  }

  // corner heights are only known once their pictures load (and change with the screen width)
  corners.forEach(function (el) {
    const img = el.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', requestLayout);
    if (window.ResizeObserver) new ResizeObserver(requestLayout).observe(el);
  });

  sides.forEach(function (s) {
    if (s.box && window.ResizeObserver) new ResizeObserver(requestLayout).observe(s.box);
  });

  measureSizes();
  update();
})();

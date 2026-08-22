/* Innovation Atlas — all the interactivity, no libraries.
   Figures are pre-rendered; this only handles reading them. */
(function () {
  "use strict";

  /* ---------- 1. firm-page chapters, as tabs ----------
     One firm is ONE page. The five chapters all live in this document and the
     bar swaps which is on show: nothing loads, nothing is fetched, nothing
     scrolls -- and the atlas does not grow by 68,000 files to give a reader
     five views of a firm. Guarded to firm pages: the overview has no .chap and
     drives its own tables through the .tabbar/.oview mechanism, untouched. */
  (function () {
    if (document.getElementById("natmap")) return;      // overview, not a firm page
    var bar = document.querySelector(".chapbar");
    var chaps = Array.prototype.slice.call(document.querySelectorAll(".chap"));
    if (!bar || !chaps.length) return;
    var links = Array.prototype.slice.call(bar.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;

    /* A chapter can be more than one <section>: Summary owns the ownership
       block beneath it, which carries data-panel="summary" and no id of its
       own. Match on either, so a chapter always arrives whole. */
    function show(id) {
      var any = false;
      chaps.forEach(function (c) {
        var on = (c.id === id) || (c.getAttribute("data-panel") === id);
        c.classList.toggle("is-on", on);
        if (on) any = true;
      });
      if (!any) return false;
      links.forEach(function (a) {
        a.classList.toggle("is-on", a.getAttribute("href") === "#" + id);
      });
      return true;
    }

    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = (a.getAttribute("href") || "").slice(1);
        if (!id) return;
        /* preventDefault BEFORE show(): the panel swaps in place and the page
           must not jump. Without it the browser scrolls to the anchor and the
           reader loses their position for no reason -- the whole point of a
           tab is that nothing moves but the content. */
        e.preventDefault();
        if (!show(id)) return;
        if (history.replaceState) history.replaceState(null, "", "#" + id);
      });
    });

    /* Deep links (/atlas/ibm/#technology) open on that chapter. The browser has
       already jumped to where that anchor sat in the un-tabbed document, and
       once the other four chapters are hidden the page is far shorter than the
       jump assumed -- the reader lands in blank space below the end of the
       content. Swapping the panel is the whole navigation, so put them back at
       the top of the page it opens. */
    /* Deep links (/atlas/ibm/#technology): the head script lifted the fragment
       off the URL so the browser never jumped. Open on that chapter and hand
       the fragment back, so the address bar still says where the reader is. */
    var start = window.__chap || (location.hash || "").slice(1);
    if (start && show(start)) {
      if (history.replaceState) history.replaceState(null, "", "#" + start);
    } else {
      show(chaps[0].id);
    }
    window.addEventListener("hashchange", function () {
      var id = (location.hash || "").slice(1);
      if (id) show(id);
    });
  })();

  /* ---------- 2. map background ----------
     The shaded counties are the SUBJECT on the overview and CONTEXT behind a
     firm's circles. Loading them must therefore not sit inside the firm-only
     foreground guard below -- that is what left the overview map blank. */
  var bgCache = {};
  function loadBackground(which) {
    var el = document.getElementById("mapbg");
    if (!el || !window.BG) return;
    if (bgCache[which]) { el.innerHTML = bgCache[which]; return; }
    fetch(window.BG[which]).then(function (r) { return r.text(); }).then(function (t) {
      bgCache[which] = t.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      el.innerHTML = bgCache[which];
    }).catch(function () {});
  }
  /* the initial background follows the page's declared extent (world for
     non-US firms); racing an unconditional US fetch could overwrite it */
  var mw0 = document.getElementById("mapwrap");
  loadBackground((mw0 && mw0.dataset.extent) || "us");

  /* Leaderboard placement: in the gutter beside the map only when the gutter
     actually fits it -- floated over the map it covered Maine. */
  (function () {
    var ld = document.getElementById("natleader"),
        mw = document.querySelector(".natmap");
    if (!ld || !mw) return;
    function place() {
      var free = (window.innerWidth - mw.getBoundingClientRect().width) / 2;
      ld.classList.toggle("gutter", free >= 240);
    }
    place();
    window.addEventListener("resize", place);
  })();

  /* ---------- county readout on the national map ----------
     Counts are lifetime totals across all technologies. Choosing a CPC section
     re-shades the map but does not re-number the tooltip: carrying nine
     sections x three counts on every county would roughly triple the SVG. */
  var nat = document.getElementById("natmap");
  var ntip = nat && document.getElementById("tip");
  if (nat && ntip) {
    var num = function (v) { return (+(v || 0)).toLocaleString(); };
    nat.addEventListener("mousemove", function (e) {
      /* while a county card is open the map speaks through the card, not the
         hover tip -- the two would otherwise stack on top of each other */
      if (nat.dataset.card) { ntip.hidden = true; return; }
      var c = e.target.closest("path[data-n]");
      if (!c) { ntip.hidden = true; return; }
      ntip.dataset.kind = "cty";
      ntip.innerHTML =
        '<b>' + c.dataset.n + '</b>' +
        '<span class="tr"><span>Patents, inventors here</span><i>' + num(c.dataset.pi) + '</i></span>' +
        '<span class="tr"><span>Patents, offices here</span><i>' + num(c.dataset.pa) + '</i></span>' +
        '<span class="tr"><span>Inventors</span><i>' + num(c.dataset.iv) + '</i></span>';
      ntip.hidden = false;
      var b = nat.getBoundingClientRect();
      var x = e.clientX - b.left + 14, y = e.clientY - b.top + 14;
      if (x + ntip.offsetWidth > b.width) x = e.clientX - b.left - ntip.offsetWidth - 14;
      ntip.style.left = x + "px"; ntip.style.top = y + "px";
    });
    nat.addEventListener("mouseleave", function () { ntip.hidden = true; });
  }

  /* ---------- 3. map: hover to identify ---------- */
  var svg = document.querySelector(".map-fg");
  var tip = document.getElementById("tip");
  if (svg && tip) {
    var wrap = svg.parentNode;
    var metric = "p";
    var fmt = function (n) { return (+n).toLocaleString(); };

    function label(c) {
      var p = +c.dataset.p, i = +c.dataset.i;
      var place = c.dataset.c + (c.dataset.s ? ", " + c.dataset.s : "");
      var line = fmt(p) + " patent" + (p === 1 ? "" : "s") + " · " +
                 fmt(i) + " inventor" + (i === 1 ? "" : "s");
      if (c.dataset.t) line += " · " + fmt(c.dataset.t) + " towns";
      if (c.dataset.r && +c.dataset.r >= 40) line += " · " + c.dataset.r + " per inventor";
      if (c.dataset.q === "suspect") line += "<br>⚠ flagged: likely a city-name mismatch";
      return "<b>" + place + "</b><span>" + line + "</span>";
    }
    function place(evt) {
      var box = wrap.getBoundingClientRect();
      var x = evt.clientX - box.left, y = evt.clientY - box.top;
      tip.style.left = Math.min(Math.max(x + 14, 4), box.width - tip.offsetWidth - 4) + "px";
      tip.style.top  = Math.max(y - tip.offsetHeight - 12, 4) + "px";
    }
    svg.addEventListener("mouseover", function (e) {
      var c = e.target.closest("circle"); if (!c) return;
      tip.innerHTML = label(c); tip.hidden = false; svg.classList.add("dim");
      c.classList.add("on"); place(e);
    });
    svg.addEventListener("mousemove", function (e) { if (!tip.hidden) place(e); });
    svg.addEventListener("mouseout", function (e) {
      var c = e.target.closest("circle"); if (c) c.classList.remove("on");
      if (!e.relatedTarget || !svg.contains(e.relatedTarget)) {
        tip.hidden = true; svg.classList.remove("dim");
      }
    });
    /* keyboard + touch: tap a circle */
    svg.addEventListener("click", function (e) {
      var c = e.target.closest("circle"); if (!c) return;
      tip.innerHTML = label(c); tip.hidden = false; place(e);
    });

    /* ---------- 3. US <-> World ---------- */
    /* The firm's own circle layers are FETCHED, not inlined. Inlining them as
       <template> while also writing them to disk stored every circle twice and
       made IBM's page 1.6 MB of HTML. */
    var layCache = {};
    function loadLayer(which, addr) {
      if (!window.LAY) return;
      var k = which + "-" + addr;
      if (layCache[k] !== undefined) { svg.innerHTML = layCache[k]; return; }
      fetch(window.LAY + k + ".svg").then(function (r) { return r.text(); })
        .then(function (x) {
          layCache[k] = x.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
          svg.innerHTML = layCache[k];
        }).catch(function () {});
    }
    /* A Japanese firm arriving on a US map with one invisible dot answers the
       wrong question first. The page declares the firm's home extent
       (data-extent on #mapwrap: world for non-US firms); boot from it. */
    var extent = (wrap && wrap.dataset.extent) || "us", addrType = "inv";
    if (extent !== "us") setExtent(extent);   // hides the county key/caption too
    else loadLayer("us", "inv");

    /* address type: inventor homes vs assignee offices — switches the firm's
       circles AND the national context shading together */
    var segA = document.getElementById("addr");
    if (segA) segA.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-addr]"); if (!b) return;
      segA.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      addrType = b.dataset.addr;
      document.getElementById("mapwrap").dataset.layer = addrType;
      document.querySelectorAll(".binlab").forEach(function (x) {
        x.hidden = x.dataset.layer !== addrType;
      });
      var ch = document.getElementById("caphead");
      if (ch) ch.textContent = addrType === "inv" ? "Inventor" : "Assignee";
      var cn = document.getElementById("capnote");
      if (cn) cn.textContent = addrType === "inv"
        ? "These are inventors\u2019 addresses on the patent, so they show where the people are — not where the firm is registered."
        : "These are assignee addresses — where the patent was legally assigned, which for most firms is a head office.";
      var cl = document.getElementById("ctxlabel");
      if (cl) cl.textContent = addrType === "inv" ? "All firms, inventors by county"
                                                  : "All firms, offices by county";
      setExtent(extent);
    });
    function setExtent(which) {
      extent = which;
      loadLayer(which, addrType);
      loadBackground(which);
      /* The county choropleth exists only on the US map: bg-world.svg carries 255
         country outlines and no shaded county at all. Leaving the key and the
         "grey shading is ... by county" clause on screen for the world view
         described a layer that was not there. */
      var isUS = which === "us";
      var key = document.querySelector(".ctxkey");
      if (key) key.hidden = !isUS;
      var cc = document.getElementById("capcounty");
      if (cc) cc.hidden = !isUS;
      var g = window.GEO ? window.GEO[which] : null;
      var stat = document.getElementById("geostat");
      if (g && stat) stat.textContent = (g[addrType] || 0).toLocaleString() +
        (which === "us" ? " US places" : " places worldwide");
      tip.hidden = true; svg.classList.remove("dim");
    }
    var segE = document.getElementById("extent");
    if (segE) segE.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-extent]"); if (!b) return;
      segE.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      setExtent(b.dataset.extent);
    });

  }
})();

/* ---------- the lines on every time-series chart ----------------------------
   The charts arrive as axis, grid, value labels and legend -- everything that
   names what is being shown -- with the lines themselves left to here. The path
   data was 91% of a chart's bytes (one IBM curve is 4,699 characters) and it is
   pure rendering: the numbers it is drawn from already ship on the adjacent
   <p class="tsread"> for the hover readout. Drawing rather than shipping them
   takes ~380 MB off the atlas and changes not one pixel.

   bars() in pipeline/build_site_pages.py still makes every decision -- the scale,
   the ticks, whether points are far enough apart to mark -- and hands the result
   over in data-render. This file only plots. The two must agree exactly, down to
   the last rounded coordinate; the notes below mark each place where agreeing is
   not automatic.

   Runs before the hover binder, which removes the tsread element it reads. */
(function () {
  var NS = "http://www.w3.org/2000/svg";

  /* Python's format(x, ".0f"), which is NOT toFixed(0): both round to nearest,
     but Python breaks an exact tie to the EVEN integer and JavaScript breaks it
     upward. Ties are not exotic here -- a four-year span puts a point at
     x = 284.5 -- and Python wrote 284 where toFixed would write 285. Every
     coordinate on the page would drift by a pixel at every such point. */
  function f0(x) {
    var fl = Math.floor(x), d = x - fl;   /* exact: fl and x are neighbours */
    if (d > 0.5) return fl + 1;
    if (d < 0.5) return fl;
    return fl % 2 === 0 ? fl : fl + 1;
  }

  /* Catmull-Rom through the points, clamped so it never leaves their range.

     Unclamped, the spline overshoots wherever points are sparse or turn sharply,
     which drew counts below zero for the many firms whose series is only a
     handful of years. A curve must not imply a value the data cannot take. */
  function curve(pts) {
    var i, p0, p1, p2, p3, c1x, c1y, c2x, c2y, lo, hi, seg = [];
    if (pts.length < 3) {
      for (i = 0; i < pts.length; i++) seg.push(f0(pts[i][0]) + "," + f0(pts[i][1]));
      return "M" + seg.join("L");
    }
    seg.push("M" + f0(pts[0][0]) + "," + f0(pts[0][1]));
    for (i = 0; i < pts.length - 1; i++) {
      p0 = i ? pts[i - 1] : pts[0];
      p1 = pts[i];
      p2 = pts[i + 1];
      p3 = i + 2 < pts.length ? pts[i + 2] : p2;
      c1x = p1[0] + (p2[0] - p0[0]) / 6;
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
      c2x = p2[0] - (p3[0] - p1[0]) / 6;
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
      lo = Math.min(p1[1], p2[1]);
      hi = Math.max(p1[1], p2[1]);
      c1y = Math.min(hi, Math.max(lo, c1y));
      c2y = Math.min(hi, Math.max(lo, c2y));
      seg.push("C" + f0(c1x) + "," + f0(c1y) + " " + f0(c2x) + "," + f0(c2y) +
               " " + f0(p2[0]) + "," + f0(p2[1]));
    }
    return seg.join("");
  }

  /* One chart's marks, given its rows. Split out so a test harness can drive it
     without a document -- the Python and this must be diffed, not trusted. */
  function marks(spec, rows, W, LEFT, RIGHT, TOP, PH) {
    var out = [];
    spec.series.forEach(function (s) {
      var pts = [], i, r;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        if (s.start && r[0] < s.start) continue;
        /* the same expression, in the same order, as bars()' xy() */
        pts.push([LEFT + (r[0] - spec.y0) / spec.span * (W - LEFT - RIGHT),
                  TOP + PH - ((r[s.col] || 0) / spec.vmax) * PH]);
      }
      if (pts.length < 2) return;          /* one point is not a line */
      out.push({ tag: "path", cls: "ln " + s.cls, d: curve(pts) });
      if (spec.dots) {
        pts.forEach(function (p) {
          out.push({ tag: "circle", cls: "pt " + s.cls,
                     cx: f0(p[0]), cy: f0(p[1]) });
        });
      }
    });
    return out;
  }

  function draw(svg, readout) {
    var spec;
    try { spec = JSON.parse(svg.dataset.render); } catch (e) { return; }
    if (!spec || !spec.series) return;
    /* The rows come from the readout beside the chart wherever there is one --
       shipping them twice would give back a fifth of what this saves. The
       quarterly grain has no readout of its own and carries its own rows. */
    var rows = spec.rows || (spec.src ? readout(spec.src) : null);
    if (!rows || !rows.length) return;
    /* Geometry off the figure, exactly as the hover readout reads it. */
    var vb = (svg.getAttribute("viewBox") || "").split(/[ ,]+/);
    var pl = (svg.dataset.plot || "").split(",").map(Number);
    var frag = document.createDocumentFragment();
    marks(spec, rows, +vb[2], pl[0], pl[1], pl[2], pl[3]).forEach(function (m) {
      var el = document.createElementNS(NS, m.tag);
      el.setAttribute("class", m.cls);
      if (m.tag === "path") {
        el.setAttribute("d", m.d);
      } else {
        el.setAttribute("cx", m.cx);
        el.setAttribute("cy", m.cy);
        el.setAttribute("r", "1.8");
      }
      frag.appendChild(el);
    });
    /* Over the grid, under the legend -- where bars() used to emit them.
       insertBefore(frag, null) appends, which is right when there is no legend. */
    svg.insertBefore(frag, svg.querySelector("g.lg"));
  }

  var cache = {};
  function readout(id) {
    if (!(id in cache)) {
      var p = document.querySelector('p.tsread[data-for="' + id + '"]');
      cache[id] = p ? JSON.parse(p.dataset.series || "[]") : [];
    }
    return cache[id];
  }
  document.querySelectorAll("svg.ts[data-render]").forEach(function (svg) {
    draw(svg, readout);
  });

  /* the harness diffs these against the Python's own output */
  if (typeof window !== "undefined") window.__tsmarks = marks;
})();

/* ---------- summary chart hover ----------------------------------------
   The readout follows the cursor, in the same floating tip the maps use. It
   previously wrote into a static paragraph below the figure, which meant looking
   away from the line you were tracing to read its value. One tip element, one
   grammar, both charts and maps. A vertical rule marks the year being read. */
(function () {
  /* Its own element, fixed to the viewport. The map's #tip sits inside a
     position:relative wrapper, so sharing it would need two different coordinate
     systems; sharing the .tip CLASS keeps them identical to look at. */
  var tip = document.createElement("div");
  tip.className = "tip tip-fixed";
  tip.hidden = true;
  document.body.appendChild(tip);
  document.querySelectorAll("p.tsread").forEach(function (out) {
    /* The chart may sit INSIDE a wrapper div (the year/quarter grain pair on
       firm pages), so a pure sibling walk misses it -- and the readout element
       then survived as an empty bordered strip under the chart. Descend into
       wrappers, and remove the element no matter what: the floating tip is the
       only readout, so a tsread must never render. */
    /* Walk back to THIS readout's own chart. The readout's series are yearly,
       so quarter wrappers are skipped -- binding the nearest svg blindly gave
       the quarter chart yearly data, and querying the whole section gave the
       Documents chart the Inventors readout. */
    var svg = out.previousElementSibling;
    while (svg && svg.tagName !== "svg") {
      if (svg.querySelector && !/\bgrain-q\b/.test(svg.className || "")) {
        var inner = svg.querySelector("svg.ts");
        if (inner) { svg = inner; break; }
      }
      svg = svg.previousElementSibling;
    }
    var rows = JSON.parse(out.dataset.series || "[]");
    var labels = (out.dataset.labels || "").split(",");
    out.remove();
    if (!svg || !rows.length) return;
    var y0 = rows[0][0], y1 = rows[rows.length - 1][0], span = Math.max(1, y1 - y0);
    /* Read the plot box off the figure. Hardcoding it worked only for the
       firm pages it was measured from. */
    var vb = (svg.getAttribute("viewBox") || "0 0 680 190").split(/[ ,]+/);
    var pl = (svg.dataset.plot || "42,8,10,156").split(",").map(Number);
    var W = +vb[2], H = +vb[3];
    var LEFT = pl[0], RIGHT = pl[1], TOP = pl[2], PH = pl[3];
    var rule = document.createElementNS("http://www.w3.org/2000/svg", "line");
    rule.setAttribute("class", "vrule");
    rule.setAttribute("y1", TOP); rule.setAttribute("y2", TOP + PH);
    rule.style.display = "none";
    svg.appendChild(rule);

    function show(e) {
      var b = svg.getBoundingClientRect();
      var f = ((e.clientX - b.left) / b.width * W - LEFT) / (W - LEFT - RIGHT);
      var t = y0 + Math.min(1, Math.max(0, f)) * span;
      var row = rows[0], best = Infinity;          /* nearest point, not rounding */
      for (var i = 0; i < rows.length; i++) {
        var d = Math.abs(rows[i][0] - t);
        if (d < best) { best = d; row = rows[i]; }
      }
      var lab = (row[0] % 1) ? (Math.floor(row[0]) + " Q" + (Math.round((row[0] % 1) * 4) + 1))
                             : String(row[0]);
      tip.dataset.kind = "ts";
      tip.innerHTML = "<b>" + lab + "</b>" + labels.map(function (l, k) {
        return "<span>" + l + " <b>" + (row[k + 1] || 0).toLocaleString() + "</b></span>";
      }).join("");
      tip.hidden = false;
      var x = LEFT + (row[0] - y0) / span * (W - LEFT - RIGHT);
      rule.setAttribute("x1", x); rule.setAttribute("x2", x);
      rule.style.display = "";
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.max(6, Math.min(window.innerWidth - tw - 6,
                                            e.clientX - tw / 2)) + "px";
      tip.style.top = (e.clientY - th - 14 < 4 ? e.clientY + 18
                                               : e.clientY - th - 14) + "px";
    }
    function hide() { tip.hidden = true; rule.style.display = "none"; }
    svg.addEventListener("mousemove", show);
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener("touchstart", function (e) {
      if (e.touches[0]) show(e.touches[0]);
    }, {passive: true});
  });
})();

/* CPC title expansion: one delegated listener, no per-row markup. */
document.addEventListener("click", function (e) {
  var b = e.target.closest("button.expand");
  if (!b) return;
  b.setAttribute("aria-expanded", b.getAttribute("aria-expanded") === "true" ? "false" : "true");
});

/* Year / quarter grain for the Documents chart. Both are pre-rendered; this only
   swaps which is shown, so there is nothing to recompute in the browser. */
(function () {
  var seg = document.getElementById("grain");
  if (!seg) return;
  seg.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-grain]"); if (!b) return;
    seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
    var q = b.dataset.grain === "q";
    document.querySelector(".grain-y").hidden = q;
    document.querySelector(".grain-q").hidden = !q;
  });
})();

/* ---------- county hover on the choropleth ---------------------------------
   The background carries each county's own numbers (data-pi/-pa/-iv), so the map
   can be interrogated: how much invention happens here, how much is registered
   here, and how many people. Delegated, so it works for the fetched background. */
(function () {
  var wrap = document.getElementById("mapwrap");
  if (!wrap) return;
  var tip = document.getElementById("tip");
  if (!tip) return;
  function nf(v) { return (+v || 0).toLocaleString(); }
  wrap.addEventListener("mousemove", function (e) {
    var p = e.target.closest(".cty path[data-n]");
    if (!p) { if (!e.target.closest("circle")) tip.hidden = true; return; }
    tip.innerHTML =
      "<b>" + p.getAttribute("data-n") + "</b>" +
      "<span>Patents by inventor address <b>" + nf(p.getAttribute("data-pi")) + "</b></span>" +
      "<span>Patents by assignee address <b>" + nf(p.getAttribute("data-pa")) + "</b></span>" +
      "<span>Inventors <b>" + nf(p.getAttribute("data-iv")) + "</b></span>";
    tip.hidden = false;
    var b = wrap.getBoundingClientRect();
    var x = e.clientX - b.left, y = e.clientY - b.top;
    tip.style.left = Math.min(x + 14, wrap.clientWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.max(4, y - tip.offsetHeight - 12) + "px";
  });
  wrap.addEventListener("mouseleave", function () { tip.hidden = true; });
})();

/* ===========================================================================
   Overview instrument. One state {sec,layer,dec} drives the big map's fills, the
   legend, the top-counties leaderboard, the decade strip, the section gallery,
   the caption and the county card. Everything reads shades.json, fetched once at
   idle and cached. If that fetch fails (or the SVG has no path[data-f] yet), the
   server-rendered map is left exactly as it is and the controls simply stop
   recolouring -- rings and the caption still track state, nothing throws.
   =========================================================================== */
(function () {
  var nat = document.getElementById("natmap");
  if (!nat) return;                         // firm pages have no #natmap

  var base = document.body.dataset.base || "";
  var state = { sec: nat.dataset.sec || "all",
                layer: nat.dataset.layer || "inv",
                dec: "all",
                extent: "us" };

  var secpick  = document.getElementById("secpick");
  var natlayer = document.getElementById("natlayer");
  var decstrip = document.getElementById("decstrip");
  var secgrid  = document.getElementById("secgrid");
  var lgEl     = document.getElementById("natlg");
  var leadEl   = document.getElementById("natleader");
  var capEl    = document.getElementById("natcap");
  var cardEl   = document.getElementById("ctycard");
  var tip      = document.getElementById("tip");
  var extentSeg = document.getElementById("natextent");   // may land after this script

  /* Per-extent geometry. The US silhouette and the world map live in the same
     #mapbg <svg> (both authored in a 960x560 box), so switching extent swaps
     the inner markup: the LIVE path elements are re-queried each time while the
     Path2Ds -- which depend only on the "d" string -- are cached per extent. */
  var BGHTML = { us: null, world: null };   // cached inner markup, so we never refetch
  var P2D    = { us: null, world: null };   // Path2D[] per extent, document order
  var curBg  = "us";                        // which extent's markup sits in #mapbg now
  var worldWarned = false;
  function idSel() { return state.extent === "world" ? "path[data-cc]" : "path[data-f]"; }

  /* section titles read off the chips, so nothing is hard-coded twice */
  /* Section titles ride on the gallery tiles -- the chips row is retired,
     the gallery IS the section selector. */
  var TITLES = {};
  if (secgrid) secgrid.querySelectorAll("button[data-sec]").forEach(function (b) {
    TITLES[b.dataset.sec] = b.dataset.title || b.dataset.sec;
  });
  var DECLAB = { "1980": "1980s", "1990": "1990s", "2000": "2000s",
                 "2010": "2010s", "2020": "2020s" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  /* mirror of the Python fmtv(): 10k, 1.5k, 900 */
  function fmtv(v) {
    v = +v || 0;
    return v >= 1e6 ? Math.round(v / 1e6) + "M"
         : v >= 1e4 ? Math.round(v / 1000) + "k"
         : v >= 1e3 ? (v / 1000).toFixed(1) + "k"
         : String(Math.round(v));
  }

  /* ---- shades.json, fetched once ---- */
  var shades = null, shadeFail = false, warned = false;
  function loadShades() {
    if (shades || shadeFail) return Promise.resolve(shades);
    return fetch(base + "figures/shades.json").then(function (r) {
      if (!r.ok) throw 0; return r.json();
    }).then(function (j) { shades = j; return j; })
      .catch(function () { shadeFail = true; return null; });
  }
  function key(sec, layer, dec) { return sec + "-" + layer + "-" + dec; }
  /* One instrument, two sets of tables: the US extent reads slices/leader/bins,
     the world extent reads wslices/wleader/wbins. The ramps (the colour scale)
     are deliberately SHARED so an equal rank reads as an equal hue on either
     map -- that is what lets the world view absorb US dominance the way the
     county view absorbed Santa Clara. */
  function slicesTbl() { return shades && (state.extent === "world" ? shades.wslices : shades.slices); }
  function binsTbl()   { return shades && (state.extent === "world" ? shades.wbins   : shades.bins); }
  function leaderTbl() { return shades && (state.extent === "world" ? shades.wleader : shades.leader); }
  /* world is available only once figures ships wslices; until then the extent
     toggle stays visible but a world click degrades back to the US map. */
  function worldReady() {
    if (!shades || !shades.wslices) return false;
    for (var k in shades.wslices) return true;
    return false;
  }
  function sliceHex(sec, layer, dec) {
    var t = slicesTbl();
    return (t && t[key(sec, layer, dec)]) || "";
  }
  /* Theme-aware colour reads: on dark paper the ramps invert into luminance
     (dim = few, bright = hubs), shipped precomputed as ramps_dark. */
  function darkMode() { return document.documentElement.dataset.theme === "dark"; }
  function ramp(sec) {
    if (!shades) return [];
    var set = (darkMode() && shades.ramps_dark) ? shades.ramps_dark : shades.ramps;
    return (set && set[sec]) || [];
  }
  function nodataColor() {
    if (!shades) return darkMode() ? "#1a1a1c" : "#fafaf9";
    return (darkMode() && shades.nodata_dark) ? shades.nodata_dark : (shades.nodata || "#fafaf9");
  }
  function shadeAt(hex, i, rmp) {
    var h = hex.substr(i * 2, 2);
    if (!h || h === "ff") return null;
    var idx = parseInt(h, 16);
    if (idx !== idx) return null;           // NaN guard
    if (idx >= rmp.length) idx = rmp.length - 1;
    return rmp[idx] || null;
  }

  /* ---- geometry: county paths in document order, a Path2D each ---- */
  var paths = [], p2d = [], ground = null;
  var REF_W = 384, REF_H = 224;             // ~192x112 CSS px at 2x backing
  function buildGeom() {
    var mb = document.getElementById("mapbg");
    paths = mb ? Array.prototype.slice.call(mb.querySelectorAll(idSel())) : [];
    /* Path2Ds are independent of the DOM, so cache them per extent -- a
       swap-away-and-back rebuilds only the live element refs, not the geometry. */
    if (!P2D[state.extent] || P2D[state.extent].length !== paths.length) {
      P2D[state.extent] = paths.map(function (el) {
        try { return new Path2D(el.getAttribute("d")); } catch (e) { return null; }
      });
    }
    p2d = P2D[state.extent];
  }
  var groundTheme = null, groundExtent = null;
  function needGround() {
    return !ground || groundExtent !== state.extent ||
           groundTheme !== (document.documentElement.dataset.theme || "light");
  }
  function buildGround() {
    /* keyed by theme AND extent: cached once with the LIGHT no-data colour the
       thumbs kept a pale silhouette after switching to dark -- and cached for
       one extent they kept the US silhouette after switching to the world map. */
    groundTheme = document.documentElement.dataset.theme || "light";
    groundExtent = state.extent;
    ground = document.createElement("canvas");
    ground.width = REF_W; ground.height = REF_H;
    var g = ground.getContext("2d");
    var s = Math.min(REF_W / 960, REF_H / 560);
    g.setTransform(s, 0, 0, s, (REF_W - 960 * s) / 2, (REF_H - 560 * s) / 2);
    g.fillStyle = nodataColor();
    for (var i = 0; i < p2d.length; i++) if (p2d[i]) g.fill(p2d[i]);
  }

  /* ---- big map fills ---- */
  function colorMap() {
    if (!shades || !paths.length) return;
    var hex = sliceHex(state.sec, state.layer, state.dec),
        rmp = ramp(state.sec), nd = nodataColor();
    for (var i = 0; i < paths.length; i++) {
      var c = shadeAt(hex, i, rmp);
      paths[i].style.fill = c || nd;
    }
  }

  /* ---- decade + section thumbnails ---- */
  function drawThumb(canvas, sec, layer, dec) {
    if (!canvas) return;
    if (canvas.width !== REF_W) canvas.width = REF_W;
    if (canvas.height !== REF_H) canvas.height = REF_H;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, REF_W, REF_H);
    if (!shades || !p2d.length) return;
    if (needGround()) buildGround();
    if (ground) ctx.drawImage(ground, 0, 0);
    var hex = sliceHex(sec, layer, dec), rmp = ramp(sec);
    var s = Math.min(REF_W / 960, REF_H / 560);
    ctx.setTransform(s, 0, 0, s, (REF_W - 960 * s) / 2, (REF_H - 560 * s) / 2);
    for (var i = 0; i < p2d.length; i++) {
      if (!p2d[i]) continue;
      var c = shadeAt(hex, i, rmp);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fill(p2d[i]);
    }
  }
  function drawDecStrip() {
    if (!decstrip) return;
    decstrip.querySelectorAll(".decthumb-btn").forEach(function (btn) {
      drawThumb(btn.querySelector("canvas"), state.sec, state.layer, btn.dataset.dec);
    });
  }
  function drawSecGrid() {
    if (!secgrid) return;
    secgrid.querySelectorAll(".secthumb-btn").forEach(function (btn) {
      drawThumb(btn.querySelector("canvas"), btn.dataset.sec, state.layer, state.dec);
    });
  }

  /* ---- legend ---- */
  function updateLegend() {
    if (!lgEl || !shades) return;
    var rmp = ramp(state.sec);
    if (!rmp.length) { lgEl.innerHTML = ""; return; }
    var stops = rmp.map(function (c, i) {
      return c + " " + (i / (rmp.length - 1) * 100).toFixed(1) + "%";
    }).join(",");
    var btbl = binsTbl();
    var bins = (btbl && btbl[key(state.sec, state.layer, state.dec)]) || [];
    var seen = null, ticks = "";
    for (var i = 0; i < bins.length; i++) {
      var lab = fmtv(bins[i][0]);
      if (lab === seen) continue;
      seen = lab;
      ticks += '<span style="left:' + bins[i][1] + '%">' + lab + '</span>';
    }
    lgEl.innerHTML =
      '<span class="rampbar" style="background:linear-gradient(90deg,' + stops + ')"></span>' +
      '<span class="rampticks">' + ticks + '</span>' +
      "";
    var pt = document.getElementById("plttl");
    if (pt) pt.innerHTML = esc("Patents per " + (state.extent === "world" ? "country" : "county")) +
      ' <span class="dot">\u00b7</span> ' + esc(TITLES[state.sec] || "") +
      (state.dec === "all" ? "" : ' <span class="dot">\u00b7</span> ' + esc(DECLAB[state.dec] || state.dec + "s"));
  }

  /* ---- top-counties leaderboard ---- */
  /* ---- the full ranking, fetched just off the critical path ----
     shades.json carries the top ten for all 216 slices so the box paints with
     the map. The complete ranking -- every county or country with a patent in
     that slice -- lives in ranks/<slice>.json (31 KB gzipped at its very
     largest, ~2 KB typical) and is fetched the moment the map is idle, so the
     list fills itself in without the reader having to ask. Inlining all 216
     rankings would have put 21 MB in front of every reader instead.
     Gating the fetch on a scroll event was tried and is wrong: a ten-row box
     does not scroll, so the event never fires and the promise of more is a
     lie the interface cannot keep. */
  var RANKS = {}, rankPend = {};
  function rankKey() {
    return (state.extent === "world" ? "w-" : "") + key(state.sec, state.layer, state.dec);
  }
  function loadRanks(rk) {
    if (RANKS[rk] || rankPend[rk]) return;
    rankPend[rk] = 1;
    fetch(base + "ranks/" + rk + ".json").then(function (r) {
      if (!r.ok) throw 0; return r.json();
    }).then(function (rows) {
      RANKS[rk] = rows;
      if (rankKey() === rk) updateLeader(true);      // still the same slice
    }).catch(function () {
      RANKS[rk] = "fail";                            // never re-ask; keep top ten
    });
  }

  function updateLeader(keepScroll) {
    if (!leadEl || !shades) return;
    var tbl = leaderTbl();
    var rk = rankKey();
    var full = RANKS[rk];
    var rows = (full && full !== "fail" && full) ||
               (tbl && tbl[key(state.sec, state.layer, state.dec)]) || [];
    if (!rows.length) { leadEl.hidden = true; leadEl.innerHTML = ""; return; }
    var box = leadEl.querySelector("ol");
    var keepAt = keepScroll && box ? box.scrollTop : 0;
    var idk = state.extent === "world" ? "data-cc" : "data-f";
    /* A bare "18,962" beside a country name is unreadable: the reader cannot
       tell 18,962 WHAT, nor which decade/technology/address the figure belongs
       to. The heading now carries the whole lens, the way the map caption does
       (DESIGN.md sec.6: rankings state their metric). */
    var lensName = state.sec === "all" ? "All technologies" : (TITLES[state.sec] || "");
    var ctx = (state.dec === "all" ? "All years" : (DECLAB[state.dec] || state.dec + "s"))
            + " \u00b7 " + (state.layer === "inv" ? "Inventors" : "Offices");
    var out = '<h4>' + (state.extent === "world" ? "Top countries" : "Top counties") +
              '</h4><p class="llens">' + esc(lensName) + '</p>' +
              '<p class="lctx">' + esc(ctx) + '</p><ol>';
    for (var i = 0; i < rows.length; i++) {
      out += '<li ' + idk + '="' + esc(rows[i][0]) + '"><span class="lname">' +
             esc(rows[i][1]) + '</span><span class="lval">' +
             (+rows[i][2] || 0).toLocaleString() + '</span></li>';
    }
    leadEl.innerHTML = out + '</ol>';
    leadEl.hidden = false;
    var nb = leadEl.querySelector("ol");
    if (nb && keepAt) nb.scrollTop = keepAt;
    if (!(full && full !== "fail")) {
      /* The timeout is not decoration. A bare requestIdleCallback can starve
         for seconds while the map re-shades 3,144 counties, and clicking
         quickly through sections is exactly when that happens -- the box then
         sits at ten rows and never fills. The deadline makes it fire anyway. */
      var idle = window.requestIdleCallback ||
                 function (f) { return setTimeout(f, 60); };
      idle(function () { loadRanks(rk); }, {timeout: 600});
    }
  }

  /* ---- caption, composed from state ---- */
  function updateCaption() {
    if (!capEl) return;
    var secLab = state.sec === "all" ? "All technologies" : (TITLES[state.sec] || "");
    var decLab = state.dec === "all" ? "all years"
               : (DECLAB[state.dec] || (state.dec + "s"));
    var lyr = state.layer === "inv"
      ? "patents attributed to inventors living there"
      : "patents attributed to the assignee’s address";
    var scope = state.extent === "world" ? " &middot; <b>World</b>" : "";
    var noun = state.extent === "world" ? "country" : "county";
    var tagNote = state.sec === "Y02"
      ? " Y02 is a cross-cutting tag: these patents also appear in their home classes."
      : "";
    capEl.innerHTML = "<b>" + esc(secLab) + "</b> &middot; " + esc(decLab) + scope +
      " &middot; <b>" + lyr + "</b>. Hover or click a " + noun + "." + esc(tagNote);
  }

  /* ---- selection rings ---- */
  function updateRings() {
    if (secpick) secpick.querySelectorAll("button[data-sec]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.sec === state.sec);
    });
    if (natlayer) natlayer.querySelectorAll("button[data-nl]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.nl === state.layer);
    });
    if (decstrip) decstrip.querySelectorAll("button[data-dec]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.dec === state.dec);
    });
    if (secgrid) secgrid.querySelectorAll("button[data-sec]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.sec === state.sec);
    });
    if (extentSeg) extentSeg.querySelectorAll("button[data-ex]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.ex === state.extent);
    });
    nat.dataset.sec = state.sec;
    nat.dataset.layer = state.layer;
  }

  /* ---- apply a change; strips only redraw when their inputs moved ---- */
  function apply(changed) {
    updateRings();
    updateCaption();
    colorMap();
    updateLegend();
    updateLeader();
    if (!changed || changed.sec || changed.layer) drawDecStrip();
    if (!changed || changed.layer || changed.dec) drawSecGrid();
  }
  function setState(patch) {
    var changed = {}, dirty = false;
    for (var k in patch) if (patch[k] !== state[k]) { state[k] = patch[k]; changed[k] = true; dirty = true; }
    if (dirty) apply(changed);
  }
  /* the theme toggle lives outside this closure; give it a full repaint */
  window.__natRender = function () { apply(null); };

  /* ---- controls (these replace the old attribute-flip handlers) ---- */
  if (secpick) secpick.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sec]"); if (!b) return;
    setState({ sec: b.dataset.sec });
  });
  if (natlayer) natlayer.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-nl]"); if (!b) return;
    setState({ layer: b.dataset.nl });
  });
  if (decstrip) decstrip.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-dec]"); if (!b) return;
    setState({ dec: b.dataset.dec });
  });
  if (secgrid) secgrid.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sec]"); if (!b) return;
    setState({ sec: b.dataset.sec });
    var fig = nat.closest(".plate") || nat;
    if (fig.scrollIntoView) fig.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---- extent: US <-> world, sharing the whole instrument ----
     The two maps live in the same #mapbg <svg>; switching swaps the inner
     markup (world fetched once from BG.world and cached, US restored from the
     markup captured on the way out, never refetched) and repaints from the
     world tables using the shared ramps. */
  function swapBackground(which, cb) {
    var el = document.getElementById("mapbg");
    if (!el) { cb(); return; }
    if (curBg && BGHTML[curBg] == null) BGHTML[curBg] = el.innerHTML;   // stash the outgoing markup
    if (BGHTML[which] != null) { el.innerHTML = BGHTML[which]; curBg = which; cb(); return; }
    if (!window.BG || !window.BG[which]) { cb(); return; }              // nothing to fetch: leave as is
    fetch(window.BG[which]).then(function (r) { return r.text(); }).then(function (t) {
      /* same replace-svg-envelope trick loadBackground uses: keep the inner g+paths */
      BGHTML[which] = t.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      /* THE RACE: the reader can toggle back before this fetch lands. A stale
         resolution must only warm the cache -- installing it would replace the
         live map and then paint the other extent's slices onto the wrong
         paths, which rendered as the "completely bizarre" map. Install only
         if this extent is still the one on stage. */
      if (state.extent !== which) return;
      el.innerHTML = BGHTML[which]; curBg = which; cb();
    }).catch(function () { if (state.extent === which) cb(); });
  }
  function setExtent(which) {
    if (which !== "us" && which !== "world") return;
    if (which === state.extent) return;
    if (which === "world" && !worldReady()) {
      /* degrade: figures has not shipped world slices -- keep the toggle visible
         but stay on the US map rather than paint a blank world. Logged once. */
      if (!worldWarned) {
        worldWarned = true;
        try { console.info("atlas: world slices unavailable; staying on the US map"); } catch (e) {}
      }
      updateRings();          // snap the segment back to US
      return;
    }
    closeCard();
    state.extent = which;
    ground = null;            // the no-data silhouette is per-extent
    swapBackground(which, function () {
      buildGeom();            // re-query the live paths (and cache the Path2Ds) for this extent
      apply(null);            // fills, legend, leader, caption, thumbs, gallery, rings
    });
    updateRings();            // reflect the choice at once, before any fetch lands
  }
  if (extentSeg) extentSeg.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-ex]"); if (!b) return;
    var which = b.dataset.ex;
    loadShades().then(function () { setExtent(which); });   // world gate needs the tables loaded
  });

  /* ---- county card ---- */
  var cardCache = {};
  function markSel(el) {
    /* The card names a county; the map should show WHERE it is. One selection
       at a time; re-appended so its stroke rides above the neighbours that
       would otherwise cover half of it. */
    var mb = document.getElementById("mapbg");
    if (mb) mb.querySelectorAll("path.is-sel").forEach(function (o) {
      o.classList.remove("is-sel");
    });
    if (el && el.tagName === "path" && el.parentNode) {
      el.classList.add("is-sel");
      el.parentNode.appendChild(el);
    }
  }
  function closeCard() {
    if (!cardEl) return;
    cardEl.hidden = true; cardEl.innerHTML = "";
    nat.removeAttribute("data-card");
    markSel(null);
  }
  function renderCard(data, fb) {
    var nm = (data && data.n) || fb.n || "This county";
    var pi = data ? data.pi : fb.pi, pa = data ? data.pa : fb.pa,
        iv = data ? data.iv : fb.iv;
    /* The card's numbers are ALL-TIME, ALL-TECHNOLOGY -- but the reader
       arrived through a lens (Y02, a decade). Two duties: say what the card's
       own numbers are, and give the lens figure for THIS place from the
       ranking already fetched for the leaderboard. Without this, "Top firms
       inventing here" under the climate lens silently read as climate firms. */
    var lensLine = "", rankNote = "";
    var rk_ = RANKS[rankKey()], hit = null, idv = fb.f, hitPos = -1;
    if (rk_ && rk_ !== "fail") for (var q = 0; q < rk_.length; q++) {
      if (rk_[q][0] === idv) { hit = rk_[q]; hitPos = q; break; }
    }
    if (hit) rankNote = ' <span class="ctyrank">#' + (hitPos + 1) + "</span>";
    if (state.sec !== "all" || state.dec !== "all") {
      var lensName = (state.sec === "all" ? "All technologies" : (TITLES[state.sec] || "")) +
        " \u00b7 " + (state.dec === "all" ? "All years" : (DECLAB[state.dec] || state.dec + "s"));
      lensLine = '<p class="ctylens">' + esc(lensName) + ": <i>" +
        (hit ? (+hit[2]).toLocaleString() + "</i> patents"
             : "0</i> patents") + '</p>';
    }
    /* the sidebar answers the click: scroll its list to this place and mark it */
    if (leadEl && hitPos >= 0) {
      var box = leadEl.querySelector("ol");
      if (box) {
        var li = box.querySelector('li[data-f="' + idv + '"],li[data-cc="' + idv + '"]');
        box.querySelectorAll("li.is-here").forEach(function (o) { o.classList.remove("is-here"); });
        if (li) {
          li.classList.add("is-here");
          /* smooth is for neighbours; a 1,600-row jump should just BE there */
          li.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }
    }
    var out = '<button class="ctyx" type="button" aria-label="Close">×</button>' +
      '<div class="ctyhead"><h4>' + esc(nm) + rankNote + '</h4>' + lensLine +
      '<div class="ctycounts"><p class="ctyall">All technologies \u00b7 All years</p>' +
        '<span><span>Patents, inventors here</span><i>' + (+pi || 0).toLocaleString() + '</i></span>' +
        '<span><span>Patents, offices here</span><i>' + (+pa || 0).toLocaleString() + '</i></span>' +
        '<span><span>Inventors</span><i>' + (+iv || 0).toLocaleString() + '</i></span>' +
      '</div></div>';
    if (data && data.firms && data.firms.length) {
      out += '<h5>Top firms inventing here</h5><ul class="ctyfirms">';
      for (var i = 0; i < data.firms.length; i++) {
        var fr = data.firms[i];
        // links match the largest-firms table (raw "<bvdid>/", relative to
        // networks/) and the on-disk page directories -- NOT "../<bvdid>/", which
        // is the firm-page form one level deeper.
        out += '<li><a href="' + base + fr[0] + '/">' + esc(fr[1]) +
               '</a><span>' + (+fr[2] || 0).toLocaleString() + '</span></li>';
      }
      out += '</ul>';
    }
    if (data && data.tech && data.tech.length) {
      out += '<h5>What they work on</h5><ul class="ctytech">';
      for (var j = 0; j < data.tech.length; j++) {
        var tr = data.tech[j];
        out += '<li><span class="tcode">' + esc(tr[0]) + '</span><span class="ttitle">' +
               esc(tr[1]) + '</span><span class="tval">' + (+tr[2] || 0).toLocaleString() + '</span></li>';
      }
      out += '</ul>';
    }
    cardEl.innerHTML = out;
    var free = (window.innerWidth - nat.getBoundingClientRect().width) / 2;
    cardEl.classList.toggle("gutter", free >= 250);
    cardEl.hidden = false;
  }
  function openCounty(el) {
    if (!cardEl) return;
    var isW = el.hasAttribute("data-cc");   // a world country path carries data-cc; a county, data-f
    var id = el.getAttribute(isW ? "data-cc" : "data-f");
    var fb = { n: el.getAttribute("data-n"), pi: el.getAttribute("data-pi"),
               pa: el.getAttribute("data-pa"), iv: el.getAttribute("data-iv"),
               f: id };
    if (tip) tip.hidden = true;
    nat.setAttribute("data-card", "on");    // suppresses the hover tip until close
    markSel(el.tagName === "path" ? el : null);
    if (!id) { renderCard(null, fb); return; }
    /* counties/ and countries/ share the card renderer; the cache keys stay
       distinct so a US FIPS and an ISO2 code can never collide. */
    var ck = (isW ? "w:" : "c:") + id;
    if (cardCache[ck] !== undefined) { renderCard(cardCache[ck], fb); return; }
    fetch(base + (isW ? "countries/" : "counties/") + id + ".json").then(function (r) {
      if (!r.ok) throw 0; return r.json();
    }).then(function (j) { cardCache[ck] = j; renderCard(j, fb); })
      .catch(function () { cardCache[ck] = null; renderCard(null, fb); });
  }
  nat.addEventListener("click", function (e) {
    if (e.target.closest("#ctycard")) return;      // card's own controls
    if (e.target.closest("#natleader")) return;    // leaderboard has its own handler
    var p = e.target.closest("path[data-n]");
    if (p) openCounty(p);
  });
  if (cardEl) cardEl.addEventListener("click", function (e) {
    if (e.target.closest(".ctyx")) closeCard();
  });
  if (leadEl) leadEl.addEventListener("click", function (e) {
    var li = e.target.closest("li[data-f],li[data-cc]"); if (!li) return;
    var isW = li.hasAttribute("data-cc");
    var idv = isW ? li.getAttribute("data-cc") : li.getAttribute("data-f");
    var mb = document.getElementById("mapbg");
    var p = mb && mb.querySelector('path[' + (isW ? "data-cc" : "data-f") + '="' + idv + '"]');
    if (p) openCounty(p);
    else openCounty(li);   // no geometry yet: still show whatever the file holds
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && cardEl && !cardEl.hidden) closeCard();
  });
  document.addEventListener("click", function (e) {
    if (!cardEl || cardEl.hidden) return;
    if (e.target.closest("#ctycard")) return;
    if (e.target.closest("#natmap path[data-n]")) return;   // reopening on another county
    if (e.target.closest("#natleader")) return;
    closeCard();
  });

  /* ---- boot: wait for the fetched background, then load shades and paint ---- */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    buildGeom();
    if (!paths.length && !warned) {
      warned = true;
      try { console.info("atlas: no path[data-f] in the map; fills left as server-rendered"); } catch (e) {}
    }
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 400); };
    idle(function () {
      loadShades().then(function (j) {
        if (!j && !warned) {
          warned = true;
          try { console.info("atlas: shades.json unavailable; map fills left as-is"); } catch (e) {}
        }
        apply(null);
      });
    });
    apply(null);   // rings + caption immediately, even before shades arrive
  }
  function ready() {
    var bg = document.getElementById("mapbg");
    return bg && bg.querySelector("path");
  }
  if (ready()) {
    boot();
  } else {
    var target = document.getElementById("mapbg") || nat;
    var obs = new MutationObserver(function () {
      if (ready()) { obs.disconnect(); boot(); }
    });
    obs.observe(target, { childList: true, subtree: true });
    setTimeout(function () {
      try { obs.disconnect(); } catch (e) {}
      if (!booted) { booted = true; apply(null); }   // degrade: controls still track state
    }, 8000);
  }
})();

/* Overview tables: Largest firms <-> Technologies. Pre-rendered, only shown. */
(function () {
  var bar = document.querySelector(".tabbar");
  if (!bar) return;
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-view]"); if (!b) return;
    bar.querySelectorAll("button[data-view]").forEach(function (x) {
      x.setAttribute("aria-selected", x === b ? "true" : "false");
    });
    bar.querySelectorAll(".tabnote").forEach(function (x) {
      x.hidden = x.dataset.forView !== b.dataset.view;
    });
    document.querySelectorAll(".oview").forEach(function (v) {
      v.classList.toggle("is-on", v.id === "view-" + b.dataset.view);
    });
  });
})();

/* "/" focuses the search anywhere it exists -- the standard reflex, no chrome. */
document.addEventListener("keydown", function (e) {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
  var t = e.target.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || e.target.isContentEditable) return;
  var q = document.getElementById("q") || document.querySelector(".searchbox input");
  if (q) { e.preventDefault(); q.focus(); }
});

/* Theme toggle: flip the attribute, remember it, and let the map engine
   repaint (it reads the attribute on every colour lookup, so one render()
   pass re-lenses the big map, legend, thumbnails and gallery). */
(function () {
  var b = document.getElementById("themetoggle");
  if (!b) return;
  b.addEventListener("click", function () {
    var el = document.documentElement;
    var next = el.dataset.theme === "dark" ? "light" : "dark";
    el.dataset.theme = next;
    try { localStorage.setItem("atlas-theme", next); } catch (e) {}
    if (window.__natRender) window.__natRender();
  });
})();

/* Firm geography: the Top-locations table and the map circles are the same
   facts twice; hovering either lights the other. Keyed by the place label
   both carry (data-c). */
(function () {
  var fg = document.querySelector(".map-fg");
  if (!fg) return;
  function circleFor(name) {
    return document.querySelector('.map-fg circle[data-c="' + (name || "").replace(/"/g, '\\"') + '"]');
  }
  document.addEventListener("mouseover", function (e) {
    var tr = e.target.closest("tr[data-c]");
    if (tr) { var c = circleFor(tr.dataset.c); if (c) c.classList.add("on"); }
  });
  document.addEventListener("mouseout", function (e) {
    var tr = e.target.closest("tr[data-c]");
    if (tr) { var c = circleFor(tr.dataset.c); if (c) c.classList.remove("on"); }
  });
  document.addEventListener("mouseover", function (e) {
    var c = e.target.closest && e.target.closest(".map-fg circle[data-c]");
    if (!c) return;
    var tr = document.querySelector('tr[data-c="' + c.dataset.c.replace(/"/g, '\\"') + '"]');
    if (tr) tr.classList.add("is-lit");
  });
  document.addEventListener("mouseout", function (e) {
    var c = e.target.closest && e.target.closest(".map-fg circle[data-c]");
    if (!c) return;
    var tr = document.querySelector('tr[data-c="' + c.dataset.c.replace(/"/g, '\\"') + '"]');
    if (tr) tr.classList.remove("is-lit");
  });
})();

/* Nearest-in-technology panel: metric toggle + Show 20. Pre-rendered lists,
   only visibility moves (DESIGN.md sec.2: repaint in place, instantly). */
(function () {
  var seg = document.getElementById("simmetric");
  if (!seg) return;
  seg.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sm]"); if (!b) return;
    seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
    document.querySelectorAll(".simlist").forEach(function (l) {
      l.hidden = l.dataset.sm !== b.dataset.sm;
    });
  });
  document.addEventListener("click", function (e) {
    var u = e.target.closest("button.unfold"); if (!u) return;
    var open = u.getAttribute("aria-expanded") === "true";
    document.querySelectorAll(".simlist li.more").forEach(function (li) {
      li.classList.toggle("unfolded", !open);
    });
    u.setAttribute("aria-expanded", open ? "false" : "true");
    u.textContent = open ? "Show 20" : "Show 10";
  });
})();

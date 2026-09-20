/* ============================================================
   util.js - small helpers shared by every module
   ============================================================ */
(function (root) {
  'use strict';

  var U = {};

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  U.key = function (x, y) { return x + ',' + y; };
  U.now = function () { return Date.now(); };

  /* deterministic RNG so the island silhouette is stable between frames */
  U.mulberry = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return Math.floor(U.rand(a, b + 1)); };
  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  /* weighted pick: items = [{w:number, ...}] */
  U.weighted = function (items, weightOf) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += Math.max(0, weightOf(items[i]));
    if (total <= 0) return null;
    var r = Math.random() * total;
    for (i = 0; i < items.length; i++) {
      r -= Math.max(0, weightOf(items[i]));
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  var SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  /* 1234567 -> "1.23M" */
  U.fmt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    var neg = n < 0; n = Math.abs(n);
    if (n < 1000) {
      var r = n < 10 && n % 1 !== 0 ? Math.round(n * 10) / 10 : Math.round(n);
      return (neg ? '-' : '') + r;
    }
    var tier = Math.floor(Math.log10(n) / 3);
    tier = U.clamp(tier, 0, SUFFIX.length - 1);
    var scaled = n / Math.pow(1000, tier);
    var str = scaled >= 100 ? scaled.toFixed(0) : (scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2));
    return (neg ? '-' : '') + str.replace(/\.0+$/, '') + SUFFIX[tier];
  };

  U.fmtMoney = function (n) { return '$' + U.fmt(n); };

  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600),
        m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + s + 's';
    return s + 's';
  };

  U.pct = function (n) { return Math.round(n * 100) + '%'; };

  /* ---------- tiny DOM helpers ---------- */
  U.el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  U.$ = function (sel) { return document.querySelector(sel); };
  U.esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };

  /* ---------- colour helpers ---------- */
  U.shade = function (hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = U.clamp(((n >> 16) & 255) + amt, 0, 255);
    var g = U.clamp(((n >> 8) & 255) + amt, 0, 255);
    var b = U.clamp((n & 255) + amt, 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  /* ---------- storage ---------- */
  U.store = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
    },
    del: function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    }
  };

  root.U = U;
})(window);

/**
 * applicantCounter.js
 *
 * Feature 1 (F1) Live Applicant Counter for the 2026 projects page.
 *
 * Module encapsulates its state in a single IIFE so no globals leak. Reads the
 * Apps Script web app URL from <meta name="tensor-lab-api"> or from
 * window.__TENSOR_LAB_API__ as a fallback. Polls every 30s, pauses when the
 * tab is hidden, and degrades silently if the endpoint fails.
 */
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 30 * 1000;
  var CROWD_THRESHOLD = 15;
  var numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  var state = {
    endpoint: null,
    timer: null,
    inFlight: false,
    lastCounts: null
  };

  function readEndpoint() {
    var meta = document.querySelector('meta[name="tensor-lab-api"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    if (window.__TENSOR_LAB_API__) return window.__TENSOR_LAB_API__;
    return null;
  }

  function formatBadge(count) {
    if (!count || count <= 0) return 'Be the first';
    if (count === 1) return '1 applicant';
    return numberFmt.format(count) + ' applicants';
  }

  function applyCounts(counts) {
    state.lastCounts = counts;
    var badges = document.querySelectorAll('[data-applicant-counter]');
    badges.forEach(function (el) {
      var id = el.getAttribute('data-applicant-counter');
      var count = counts[id] || 0;
      el.textContent = formatBadge(count);
      el.dataset.count = String(count);
      el.classList.toggle('counter-crowded', count >= CROWD_THRESHOLD);
      el.classList.remove('counter-hidden');
    });
  }

  function applyStatuses(statuses) {
    if (!statuses) return;
    document.dispatchEvent(new CustomEvent('tensorlab:project-statuses', { detail: statuses }));
  }

  function hideAll() {
    var badges = document.querySelectorAll('[data-applicant-counter]');
    badges.forEach(function (el) { el.classList.add('counter-hidden'); });
  }

  function fetchCounts() {
    if (!state.endpoint || state.inFlight) return;
    state.inFlight = true;
    var url = state.endpoint + (state.endpoint.indexOf('?') === -1 ? '?' : '&') + 'action=counts';
    fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad_status_' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.ok || !payload.counts) throw new Error('bad_payload');
        applyCounts(payload.counts);
        applyStatuses(payload.statuses);
      })
      .catch(function () { hideAll(); })
      .then(function () { state.inFlight = false; });
  }

  function startPolling() {
    stopPolling();
    fetchCounts();
    state.timer = setInterval(fetchCounts, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function handleVisibility() {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  }

  function init() {
    state.endpoint = readEndpoint();
    if (!state.endpoint) {
      hideAll();
      return;
    }
    document.addEventListener('visibilitychange', handleVisibility);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startPolling);
    } else {
      startPolling();
    }
  }

  init();
})();

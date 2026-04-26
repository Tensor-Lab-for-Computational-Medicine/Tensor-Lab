/**
 * featured-projects.js
 *
 * Hydrates a small 3-card preview of the 2026 project catalog on the homepage.
 * Reads the same JSON the full projects-2026 page uses, so there's a single
 * source of truth for project data.
 */
(function () {
  'use strict';

  var DATA_URL = 'data/projects_2026.json';
  var PREVIEW_COUNT = 3;
  // Featured project slugs. Picked for variety of specialty + institution.
  // Falls back to the first N open projects in the catalog if a slug is missing.
  var FEATURED = [
    'llm-ed-triage-simulation',
    'whole-genome-tokenization-cardiac-risk',
    'eeg-brain-tumor-classification'
  ];

  function truncate(text, max) {
    if (!text) return '';
    text = String(text).trim();
    if (text.length <= max) return text;
    var slice = text.slice(0, max);
    var lastSpace = slice.lastIndexOf(' ');
    return (lastSpace > 60 ? slice.slice(0, lastSpace) : slice).replace(/[.,;:]+$/, '') + '…';
  }

  function primarySpecialty(s) {
    return String(s || '').split(',')[0].trim();
  }

  function shortInstitution(inst) {
    if (!inst) return '';
    // Strip department suffixes after a comma for tight card chrome.
    return String(inst).split(',')[0].trim();
  }

  function buildCard(project) {
    var card = document.createElement('a');
    card.className = 'featured-card';
    card.href = 'projects-2026.html#' + encodeURIComponent(project.project_id);

    var filled = project.availability === 'filled';
    if (filled) card.classList.add('featured-card--filled');

    card.innerHTML = [
      '<header class="featured-card-head">',
      '  <span class="featured-card-specialty"></span>',
      '  <span class="featured-card-status" data-availability="' + (filled ? 'filled' : 'open') + '">',
      (filled ? 'Filled' : 'Open'),
      '  </span>',
      '</header>',
      '<h3 class="featured-card-title"></h3>',
      '<p class="featured-card-pitch"></p>',
      '<footer class="featured-card-foot">',
      '  <span class="featured-card-institution"></span>',
      '  <span class="featured-card-arrow" aria-hidden="true">→</span>',
      '</footer>'
    ].join('');

    card.querySelector('.featured-card-specialty').textContent = primarySpecialty(project.specialty);
    card.querySelector('.featured-card-institution').textContent = shortInstitution(project.institution);
    card.querySelector('.featured-card-title').textContent = project.title || '';
    card.querySelector('.featured-card-pitch').textContent = truncate(project.clinical_problem, 180);
    return card;
  }

  function pickFeatured(projects) {
    var byId = {};
    projects.forEach(function (p) { byId[p.project_id] = p; });

    var picked = [];
    FEATURED.forEach(function (id) {
      if (byId[id]) picked.push(byId[id]);
    });
    // Backfill from the open projects that weren't already picked.
    if (picked.length < PREVIEW_COUNT) {
      projects.forEach(function (p) {
        if (picked.length >= PREVIEW_COUNT) return;
        if (picked.indexOf(p) === -1 && p.availability !== 'filled') picked.push(p);
      });
    }
    return picked.slice(0, PREVIEW_COUNT);
  }

  function render(projects) {
    var host = document.getElementById('featured-projects-preview');
    if (!host) return;

    var featured = pickFeatured(projects);
    if (!featured.length) {
      host.innerHTML = '<p class="featured-empty">Project list is temporarily unavailable. Please refresh.</p>';
      return;
    }

    host.innerHTML = '';
    featured.forEach(function (p) { host.appendChild(buildCard(p)); });
  }

  function init() {
    var host = document.getElementById('featured-projects-preview');
    if (!host) return;
    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) { render((data && data.projects) || []); })
      .catch(function () {
        host.innerHTML = '<p class="featured-empty">Project list is temporarily unavailable. Please refresh.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

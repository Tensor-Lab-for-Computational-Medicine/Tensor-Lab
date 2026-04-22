/**
 * projects-2026.js
 *
 * Hydrates the 2026 project catalog from data/projects_2026.json into a compact,
 * searchable grid. Each card is scannable by default (specialty, institution,
 * title, problem preview, mentorship, counter, status). Clicking "View full
 * details" opens a slide-in drawer modal with the full brief so the grid stays
 * visually uniform.
 *
 * Features:
 *   - Text search across title, problem, approach, deliverable, skills, people
 *   - Multi-facet filter chips: specialty, institution, availability
 *   - Slide-in drawer modal for full project details (keyboard + backdrop close)
 *   - Deep link: #<project-id> opens that project's drawer + pulses the card
 *   - Applicant counter contract preserved (data-applicant-counter)
 *
 * No framework, no globals. ES5 safe.
 */
(function () {
  'use strict';

  var DATA_URL = 'data/projects_2026.json';
  var CLINICAL_PREVIEW_CHARS = 220;

  var state = {
    projects: [],
    search: '',
    specialty: 'all',
    institution: 'all',
    availability: 'all',
    activeProjectId: null,
    lastFocused: null
  };

  // ------------------------------ utilities ---------------------------------

  function truncate(text, max) {
    if (!text) return '';
    if (text.length <= max) return text;
    var slice = text.slice(0, max);
    var lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > max - 40) slice = slice.slice(0, lastSpace);
    return slice.replace(/[.,;:\s]+$/, '') + '…';
  }

  function primarySpecialty(specialty) {
    return (specialty || '').split(',')[0].trim();
  }

  // Institution normalization for filter chips and card labels. Only current
  // partner institutions and a few historical sources remain; the "To be
  // confirmed" branch keeps overlong affiliation descriptions out of the chips.
  function shortInstitution(institution) {
    if (!institution) return '';
    if (/^To be confirmed/i.test(institution)) return 'To be confirmed';
    if (/^University of California, San Francisco/i.test(institution) || /^UCSF/i.test(institution)) return 'UCSF';
    if (/^University of Maryland School of Medicine/i.test(institution)) return 'UMSOM';
    if (/^National Cancer Institute/i.test(institution)) return 'NCI';
    return institution.replace(/,.*$/, '').trim();
  }

  function uniqueSorted(items) {
    var seen = {};
    var out = [];
    items.forEach(function (v) { if (v && !seen[v]) { seen[v] = true; out.push(v); } });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }

  function buildSearchIndex(p) {
    var pieces = [
      p.title, p.specialty, p.institution, p.faculty_pi, p.med_mentor,
      p.clinical_problem, p.technical_approach, p.deliverable,
      p.data_type, p.access_note, p.progress_note, p.mentor_note
    ];
    (p.preferred_skills || []).forEach(function (s) { pieces.push(s); });
    return pieces.filter(Boolean).join(' ').toLowerCase();
  }

  function matchesState(p) {
    if (state.specialty !== 'all' && primarySpecialty(p.specialty) !== state.specialty) return false;
    if (state.institution !== 'all' && shortInstitution(p.institution) !== state.institution) return false;
    if (state.availability !== 'all') {
      var avail = p.availability || 'open';
      if (state.availability !== avail) return false;
    }
    if (state.search) {
      var q = state.search.trim().toLowerCase();
      if (q && p._search.indexOf(q) === -1) return false;
    }
    return true;
  }

  // ------------------------------ card render ------------------------------

  function setText(root, selector, value) {
    var el = root.querySelector(selector);
    if (el) el.textContent = value || '';
  }

  function renderAvailability(node, availability) {
    var chip = node.querySelector('.pc2-availability');
    if (!chip) return;
    if (availability === 'filled') {
      chip.textContent = 'Filled';
      chip.setAttribute('data-availability', 'filled');
      node.classList.add('card-filled');
    } else {
      chip.textContent = 'Open';
      chip.setAttribute('data-availability', 'open');
    }
  }

  function renderCard(project, template) {
    var frag = template.content.cloneNode(true);
    var article = frag.querySelector('.project-card-2026');
    article.dataset.specialty = primarySpecialty(project.specialty);
    article.dataset.institution = shortInstitution(project.institution);
    article.dataset.availability = project.availability || 'open';
    article.dataset.projectId = project.project_id;

    setText(frag, '.pc2-specialty', project.specialty);
    setText(frag, '.pc2-institution', shortInstitution(project.institution));
    setText(frag, '.pc2-title', project.title);
    setText(frag, '.pc2-clinical-preview', truncate(project.clinical_problem, CLINICAL_PREVIEW_CHARS));
    setText(frag, '.pc2-pi', project.faculty_pi || 'To be confirmed');
    setText(frag, '.pc2-mentor', project.med_mentor || 'To be confirmed');
    renderAvailability(article, project.availability || 'open');

    var counter = frag.querySelector('[data-applicant-counter]');
    if (counter) counter.setAttribute('data-applicant-counter', project.project_id);

    var btn = frag.querySelector('.pc2-expand-btn');
    if (btn) {
      btn.addEventListener('click', function () { openModal(project.project_id); });
    }

    return frag;
  }

  // ------------------------------ filter bar -------------------------------

  function buildChipBar(containerId, values, facetKey) {
    var bar = document.getElementById(containerId);
    if (!bar) return;
    bar.innerHTML = '';

    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'filter-chip active';
    all.dataset.value = 'all';
    all.textContent = 'All';
    bar.appendChild(all);

    values.forEach(function (v) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.dataset.value = v;
      btn.textContent = v;
      bar.appendChild(btn);
    });

    bar.addEventListener('click', function (ev) {
      var chip = ev.target.closest('.filter-chip');
      if (!chip) return;
      state[facetKey] = chip.dataset.value;
      Array.prototype.forEach.call(bar.querySelectorAll('.filter-chip'), function (c) {
        c.classList.toggle('active', c === chip);
      });
      applyFilters();
    });
  }

  function wireAvailabilityBar() {
    var bar = document.getElementById('availability-filter');
    if (!bar) return;
    bar.addEventListener('click', function (ev) {
      var chip = ev.target.closest('.filter-chip');
      if (!chip) return;
      state.availability = chip.dataset.value;
      Array.prototype.forEach.call(bar.querySelectorAll('.filter-chip'), function (c) {
        c.classList.toggle('active', c === chip);
      });
      applyFilters();
    });
  }

  function wireSearch() {
    var input = document.getElementById('catalog-search-input');
    if (!input) return;
    var debounceTimer = null;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        state.search = input.value || '';
        applyFilters();
      }, 120);
    });
  }

  function wireReset() {
    var btn = document.getElementById('catalog-reset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      state.search = '';
      state.specialty = 'all';
      state.institution = 'all';
      state.availability = 'all';
      var input = document.getElementById('catalog-search-input');
      if (input) input.value = '';
      ['specialty-filter', 'institution-filter', 'availability-filter'].forEach(function (id) {
        var bar = document.getElementById(id);
        if (!bar) return;
        Array.prototype.forEach.call(bar.querySelectorAll('.filter-chip'), function (c) {
          c.classList.toggle('active', c.dataset.value === 'all');
        });
      });
      applyFilters();
    });
  }

  // Optional toggle button to hide/show the filter panel on narrow screens
  function wireFilterToggle() {
    var toggle = document.getElementById('catalog-filter-toggle');
    var panel = document.getElementById('catalog-filter-panel');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', function () {
      var open = panel.getAttribute('data-open') === 'true';
      panel.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }

  // ---------------------------- apply + feedback ---------------------------

  function applyFilters() {
    var grid = document.getElementById('projects-grid');
    var countEl = document.getElementById('catalog-count');
    var emptyEl = document.getElementById('catalog-empty');
    var resetBtn = document.getElementById('catalog-reset');
    if (!grid) return;

    var visible = 0;
    Array.prototype.forEach.call(grid.querySelectorAll('.project-card-2026'), function (card) {
      var project = state.projects.find(function (p) { return p.project_id === card.dataset.projectId; });
      var show = project ? matchesState(project) : false;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    var total = state.projects.length;
    if (countEl) {
      countEl.textContent = visible === total
        ? 'Showing all ' + total + ' projects'
        : 'Showing ' + visible + ' of ' + total + ' projects';
    }
    if (emptyEl) emptyEl.hidden = visible !== 0;

    var dirty = state.search !== '' || state.specialty !== 'all'
      || state.institution !== 'all' || state.availability !== 'all';
    if (resetBtn) resetBtn.hidden = !dirty;
  }

  // ------------------------------ modal ------------------------------------

  function findProject(id) {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].project_id === id) return state.projects[i];
    }
    return null;
  }

  function fillSkills(ul, skills) {
    ul.innerHTML = '';
    (skills || []).forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    });
  }

  function openModal(projectId) {
    var modal = document.getElementById('project-modal');
    var project = findProject(projectId);
    if (!modal || !project) return;

    state.lastFocused = document.activeElement;
    state.activeProjectId = projectId;

    setText(modal, '.pm-specialty', project.specialty);
    setText(modal, '.pm-institution', shortInstitution(project.institution));
    setText(modal, '.pm-title', project.title);
    setText(modal, '.pm-pi', project.faculty_pi || 'To be confirmed');
    setText(modal, '.pm-mentor', project.med_mentor || 'To be confirmed');
    setText(modal, '.pm-clinical', project.clinical_problem);
    setText(modal, '.pm-technical', project.technical_approach);
    setText(modal, '.pm-deliverable', project.deliverable);
    setText(modal, '.pm-data', project.data_type);

    var accessEl = modal.querySelector('.pm-access');
    if (accessEl) {
      if (project.access_note) { accessEl.textContent = project.access_note; accessEl.style.display = ''; }
      else { accessEl.style.display = 'none'; }
    }

    var progressSection = modal.querySelector('.pm-progress');
    if (progressSection) {
      if (project.progress_note) {
        progressSection.style.display = '';
        setText(progressSection, '.pm-progress-text', project.progress_note);
      } else {
        progressSection.style.display = 'none';
      }
    }

    var note = modal.querySelector('.pm-note');
    if (note) {
      if (project.mentor_note) {
        note.style.display = '';
        setText(note, '.pm-note-text', project.mentor_note);
      } else {
        note.style.display = 'none';
      }
    }

    var skillsUl = modal.querySelector('.pm-skills');
    if (skillsUl) fillSkills(skillsUl, project.preferred_skills);

    var availChip = modal.querySelector('.pm-availability');
    if (availChip) {
      var a = project.availability || 'open';
      availChip.textContent = a === 'filled' ? 'Filled' : 'Open';
      availChip.setAttribute('data-availability', a);
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // update expand button state on the source card
    var srcBtn = document.querySelector(
      '.project-card-2026[data-project-id="' + projectId.replace(/"/g, '\\"') + '"] .pc2-expand-btn');
    if (srcBtn) srcBtn.setAttribute('aria-expanded', 'true');

    // reflect selection in URL hash for shareable deep links
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + projectId);
    }

    // focus panel for keyboard users
    var panel = modal.querySelector('.project-modal-panel');
    if (panel) panel.focus();
  }

  function closeModal() {
    var modal = document.getElementById('project-modal');
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (state.activeProjectId) {
      var srcBtn = document.querySelector(
        '.project-card-2026[data-project-id="' + state.activeProjectId.replace(/"/g, '\\"') + '"] .pc2-expand-btn');
      if (srcBtn) srcBtn.setAttribute('aria-expanded', 'false');
    }
    state.activeProjectId = null;

    // clear hash so reopen flow is deterministic
    if (window.history && window.history.replaceState && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
      state.lastFocused.focus();
    }
  }

  function wireModal() {
    var modal = document.getElementById('project-modal');
    if (!modal) return;
    modal.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-modal-close]')) { closeModal(); return; }
      // Apply button should close modal before navigating so hash #apply resolves cleanly
      if (ev.target.closest('[data-modal-apply]')) {
        closeModal();
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  // ---------------------------- deep linking -------------------------------

  function openFromHash() {
    var id = (window.location.hash || '').replace(/^#/, '');
    if (!id) return;
    try { id = decodeURIComponent(id); } catch (e) { /* raw */ }
    if (id === 'apply' || id === 'projects') return;
    if (!findProject(id)) return;

    var grid = document.getElementById('projects-grid');
    var selector = '[data-project-id="' + id.replace(/"/g, '\\"') + '"]';
    var target = grid && grid.querySelector(selector);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('project-card-2026--highlight');
      setTimeout(function () { target.classList.remove('project-card-2026--highlight'); }, 2400);
    }
    openModal(id);
  }

  // --------------------------------- init ----------------------------------

  function init() {
    var grid = document.getElementById('projects-grid');
    var template = document.getElementById('project-card-template');
    if (!grid || !template) return;

    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var projects = (data && data.projects) || [];
        projects.forEach(function (p) { p._search = buildSearchIndex(p); });
        state.projects = projects;

        projects.forEach(function (p) { grid.appendChild(renderCard(p, template)); });

        buildChipBar('specialty-filter',
          uniqueSorted(projects.map(function (p) { return primarySpecialty(p.specialty); })),
          'specialty');
        buildChipBar('institution-filter',
          uniqueSorted(projects.map(function (p) { return shortInstitution(p.institution); })),
          'institution');
        wireAvailabilityBar();
        wireSearch();
        wireReset();
        wireFilterToggle();
        wireModal();
        applyFilters();

        openFromHash();
      })
      .catch(function () {
        grid.innerHTML = '<p style="color:var(--ink-light);">Project list is temporarily unavailable. Please refresh.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

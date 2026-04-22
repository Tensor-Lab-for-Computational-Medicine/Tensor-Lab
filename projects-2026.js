/**
 * projects-2026.js
 *
 * Hydrates the 2026 project marketplace from data/projects_2026.json. Keeps
 * the applicant counter contract (data-applicant-counter attribute) wired up
 * for applicantCounter.js to populate. No framework, no globals.
 */
(function () {
  'use strict';

  var DATA_URL = 'data/projects_2026.json';

  function setText(node, selector, value) {
    var el = node.querySelector(selector);
    if (el) el.textContent = value || '';
  }

  function setOrHide(node, sectionSelector, textSelector, value) {
    var section = node.querySelector(sectionSelector);
    if (!section) return;
    if (!value) {
      section.style.display = 'none';
      return;
    }
    var p = textSelector ? section.querySelector(textSelector) : section;
    if (p) p.textContent = value;
  }

  function renderSkills(node, skills) {
    var ul = node.querySelector('.pc2-skills');
    if (!ul) return;
    ul.innerHTML = '';
    (skills || []).forEach(function (skill) {
      var li = document.createElement('li');
      li.textContent = skill;
      ul.appendChild(li);
    });
  }

  function renderAvailability(node, availability) {
    var chip = node.querySelector('.pc2-availability');
    if (!chip) return;
    if (availability === 'filled') {
      chip.textContent = 'Filled';
      chip.setAttribute('data-availability', 'filled');
      node.classList.add('card-filled');
    } else {
      chip.textContent = 'Open for applications';
      chip.setAttribute('data-availability', 'open');
    }
  }

  function renderAccessNote(node, project) {
    var accessEl = node.querySelector('.pc2-access');
    var dataEl = node.querySelector('.pc2-data');
    if (dataEl) dataEl.textContent = project.data_type || '';
    if (accessEl) {
      if (project.access_note) {
        accessEl.textContent = project.access_note;
        accessEl.style.display = '';
      } else {
        accessEl.style.display = 'none';
      }
    }
  }

  function renderMentorNote(node, note) {
    var aside = node.querySelector('.pc2-note');
    if (!aside) return;
    if (!note) {
      aside.style.display = 'none';
      return;
    }
    var text = aside.querySelector('.pc2-note-text');
    if (text) text.textContent = note;
  }

  function renderCard(project, template) {
    var frag = template.content.cloneNode(true);
    var article = frag.querySelector('.project-card-2026');
    article.dataset.specialty = project.specialty || '';
    article.dataset.projectId = project.project_id;

    setText(frag, '.pc2-specialty', project.specialty);
    setText(frag, '.pc2-institution', project.institution);
    setText(frag, '.pc2-title', project.title);
    setText(frag, '.pc2-pi', project.faculty_pi || 'To be confirmed');
    setText(frag, '.pc2-mentor', project.med_mentor || 'To be confirmed');
    setText(frag, '.pc2-clinical', project.clinical_problem);
    setText(frag, '.pc2-technical', project.technical_approach);
    setText(frag, '.pc2-deliverable', project.deliverable);

    renderAccessNote(article, project);
    setOrHide(frag, '.pc2-progress', '.pc2-progress-text', project.progress_note);
    renderSkills(frag, project.preferred_skills);
    renderMentorNote(article, project.mentor_note);
    renderAvailability(article, project.availability || 'open');

    var counter = frag.querySelector('[data-applicant-counter]');
    if (counter) counter.setAttribute('data-applicant-counter', project.project_id);

    return frag;
  }

  function renderSpecialtyFilter(projects, grid) {
    var bar = document.getElementById('specialty-filter');
    if (!bar) return;
    var specialties = {};
    projects.forEach(function (p) {
      var key = (p.specialty || '').split(',')[0].trim();
      if (key) specialties[key] = true;
    });
    var keys = Object.keys(specialties).sort();

    bar.innerHTML = '';
    var all = document.createElement('button');
    all.className = 'filter-btn active';
    all.textContent = 'All';
    all.addEventListener('click', function () { applyFilter('all', bar, grid); });
    bar.appendChild(all);

    keys.forEach(function (k) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.textContent = k;
      btn.addEventListener('click', function () { applyFilter(k, bar, grid); });
      bar.appendChild(btn);
    });
  }

  function applyFilter(key, bar, grid) {
    Array.prototype.forEach.call(bar.querySelectorAll('.filter-btn'), function (b) {
      b.classList.toggle('active', (key === 'all' && b.textContent === 'All') || b.textContent === key);
    });
    Array.prototype.forEach.call(grid.querySelectorAll('.project-card-2026'), function (card) {
      var specialty = card.dataset.specialty || '';
      var primary = specialty.split(',')[0].trim();
      card.style.display = (key === 'all' || primary === key) ? '' : 'none';
    });
  }

  function init() {
    var grid = document.getElementById('projects-grid');
    var template = document.getElementById('project-card-template');
    if (!grid || !template) return;

    fetch(DATA_URL, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var projects = (data && data.projects) || [];
        projects.forEach(function (p) { grid.appendChild(renderCard(p, template)); });
        renderSpecialtyFilter(projects, grid);
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

/* exam_js/main.js — page bootstrap.
   Routes (location.hash):  #answer (default, share this with students)  ·  #set  ·  #check
   Each view is built the first time it is opened and then kept alive, so switching tabs never loses work. */

import { initTheme } from './theme.js';
import { mountAnswerer } from './answerer.js';
import { mountSetter } from './setter.js';
import { mountChecker } from './checker.js';

const views = {
  answer: { root: document.getElementById('view-answer'), mount: mountAnswerer, done: false },
  set: { root: document.getElementById('view-set'), mount: mountSetter, done: false },
  check: { root: document.getElementById('view-check'), mount: mountChecker, done: false },
};
const links = [...document.querySelectorAll('[data-route]')];

function route() {
  const name = (location.hash || '#answer').slice(1);
  const cur = views[name] ? name : 'answer';
  for (const [id, v] of Object.entries(views)) {
    v.root.hidden = id !== cur;
    if (id === cur && !v.done) { v.done = true; v.mount(v.root); }
  }
  for (const a of links) {
    const on = a.dataset.route === cur;
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  document.title = { answer: 'Answer a paper', set: 'Set a paper', check: 'Check papers' }[cur] + ' · Exam tool';
}

initTheme(document.getElementById('theme-toggle'));
window.addEventListener('hashchange', route);
route();

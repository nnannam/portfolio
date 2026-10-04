const navigation = document.querySelector('.navigation');
const links = [...navigation.querySelectorAll('a')];
const isCasePage = document.body.classList.contains('case-page');
const sections = links.map(link => {
  const href = link.getAttribute('href');
  return href.startsWith('#') ? document.querySelector(href) : null;
}).filter(Boolean);
const indicator = document.createElement('span');
indicator.className = 'navigation-indicator';
indicator.setAttribute('aria-hidden', 'true');
navigation.prepend(indicator);
let hoveredLink = null;
let focusedLink = null;

function positionIndicator() {
  const activeLink = links.find(link => link.classList.contains('is-active')) || links[0];
  const target = hoveredLink || focusedLink || activeLink;
  indicator.style.transform = `translateX(${target.offsetLeft}px)`;
  indicator.style.width = `${target.offsetWidth}px`;
  indicator.style.height = `${target.offsetHeight}px`;
  indicator.style.top = `${target.offsetTop}px`;
  indicator.classList.toggle('is-preview', target !== activeLink);
}

function updateNavigation() {
  const marker = window.scrollY + window.innerHeight * 0.4;
  let active = isCasePage ? null : sections[0];
  for (const section of sections) if (section.offsetTop <= marker) active = section;
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) active = sections.at(-1);
  for (const link of links) {
    const selected = active ? link.hash === '#' + active.id : link === links[0];
    link.classList.toggle('is-active', selected);
    if (selected) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  positionIndicator();
}

for (const link of links) {
  link.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hoveredLink = link;
    positionIndicator();
  });
  link.addEventListener('focus', () => {
    focusedLink = link.matches(':focus-visible') ? link : null;
    positionIndicator();
  });
  link.addEventListener('blur', () => {
    focusedLink = null;
    positionIndicator();
  });
}
function clearHover() {
  hoveredLink = null;
  positionIndicator();
}
navigation.addEventListener('pointerleave', clearHover);
navigation.addEventListener('pointercancel', clearHover);
window.addEventListener('scroll', updateNavigation, {passive:true});
window.addEventListener('resize', positionIndicator);
new ResizeObserver(positionIndicator).observe(navigation);
updateNavigation();
document.fonts.ready.then(positionIndicator);
requestAnimationFrame(() => requestAnimationFrame(() => navigation.classList.add('has-sliding-indicator')));

const contactStatus = document.querySelector('.contact-status');
let statusTimer;
function announceContact(message) {
  clearTimeout(statusTimer);
  contactStatus.textContent = message;
  statusTimer = setTimeout(() => { contactStatus.textContent = ''; }, 2600);
}
// External destinations will be connected once the links are supplied.
for (const button of document.querySelectorAll('[data-contact]')) {
  button.addEventListener('click', () => announceContact('Ссылку подключим позже'));
}
const copyTimers = new WeakMap();
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      clearTimeout(copyTimers.get(button));
      button.classList.add('is-copied');
      button.querySelector('.copy-tooltip').textContent = 'Скопировано';
      button.setAttribute('aria-label', 'Скопировано');
      announceContact('Скопировано');
      copyTimers.set(button, setTimeout(() => {
        button.classList.remove('is-copied');
        button.querySelector('.copy-tooltip').textContent = 'Копировать';
        button.setAttribute('aria-label', button.dataset.label);
      }, 1800));
    } catch {
      announceContact('Не удалось скопировать. Выделите и скопируйте текст вручную.');
    }
  });
}

// Gravity-driven stickers: random release positions, collisions, no target slots.
const board = document.querySelector('.sticker-board');
const reduceStickerMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (board) {
  const elements = [board.querySelector('.design-star'), ...board.querySelectorAll('.tool')];
  let bodies = [], frame = 0, started = false, previousTime = 0, elapsed = 0;
  const random = (a, b) => a + Math.random() * (b - a);
  function paint(body) {
    body.el.style.transform = `translate(${body.x}px, ${body.y}px) rotate(${body.angle}rad)`;
    body.el.style.opacity = body.visible ? '1' : '0';
  }
  function polygon(body) {
    let local;
    if (body.el.classList.contains('design-star')) {
      local = [[.5,.035],[.975,.39],[.79,.965],[.21,.965],[.025,.39]];
    } else {
      local = [[.12,0],[.88,0],[1,.28],[1,.72],[.88,1],[.12,1],[0,.72],[0,.28]];
    }
    const c = Math.cos(body.angle), sn = Math.sin(body.angle);
    return local.map(([u,v]) => {
      const x = (u-.5)*body.w, y = (v-.5)*body.h;
      return { x: body.x+body.w/2+x*c-y*sn, y: body.y+body.h/2+x*sn+y*c };
    });
  }
  function contain(body) {
    let points = polygon(body);
    const left = Math.min(...points.map(p=>p.x)), right = Math.max(...points.map(p=>p.x));
    if (left < 8) { body.x += 8-left; body.vx = Math.abs(body.vx)*.3; }
    if (right > board.clientWidth-8) { body.x -= right-(board.clientWidth-8); body.vx = -Math.abs(body.vx)*.3; }
    const bottom = Math.max(...points.map(p=>p.y));
    if (bottom >= board.clientHeight-10) {
      body.y -= bottom-(board.clientHeight-10);
      body.vy = Math.abs(body.vy)>70 ? -Math.abs(body.vy)*.23 : 0;
      body.vx *= .8;
      body.spin *= .65;
      // A pill tips onto its broad side instead of balancing on a corner.
      if (!body.el.classList.contains('design-star')) body.angle *= .94;
    }
  }
  function collisions() {
    for (let i=0;i<bodies.length;i++) for (let j=i+1;j<bodies.length;j++) {
      const a=bodies[i], b=bodies[j];
      if (!a.visible || !b.visible) continue;
      const pa=polygon(a), pb=polygon(b);
      let depth=Infinity, normal=null, separated=false;
      for (const poly of [pa,pb]) {
        for (let k=0;k<poly.length;k++) {
          const p=poly[k], q=poly[(k+1)%poly.length];
          const length=Math.hypot(q.x-p.x,q.y-p.y);
          const axis={x:-(q.y-p.y)/length,y:(q.x-p.x)/length};
          const ap=pa.map(p=>p.x*axis.x+p.y*axis.y), bp=pb.map(p=>p.x*axis.x+p.y*axis.y);
          const overlap=Math.min(Math.max(...ap),Math.max(...bp))-Math.max(Math.min(...ap),Math.min(...bp));
          if (overlap<=0) { separated=true; break; }
          if (overlap<depth) { depth=overlap; normal=axis; }
        }
        if (separated) break;
      }
      if (separated) continue;
      if ((b.x+b.w/2-a.x-a.w/2)*normal.x+(b.y+b.h/2-a.y-a.h/2)*normal.y<0) { normal.x*=-1; normal.y*=-1; }
      const share=b.mass/(a.mass+b.mass);
      a.x-=normal.x*(depth+.02)*share; a.y-=normal.y*(depth+.02)*share;
      b.x+=normal.x*(depth+.02)*(1-share); b.y+=normal.y*(depth+.02)*(1-share);
      const speed=(b.vx-a.vx)*normal.x+(b.vy-a.vy)*normal.y;
      if (speed<0) {
        const impulse=-1.1*speed;
        a.vx-=impulse*normal.x*share; a.vy-=impulse*normal.y*share;
        b.vx+=impulse*normal.x*(1-share); b.vy+=impulse*normal.y*(1-share);
      }
      a.spin*=.7; b.spin*=.7;
      a.vx*=.97; b.vx*=.97;
    }
  }
  function simulate(dt) {
    for (const body of bodies) {
      if (elapsed < body.delay) continue;
      body.visible = true;
      body.vy += 1500 * dt;
      body.x += body.vx * dt; body.y += body.vy * dt;
      body.angle += body.spin * dt;
      body.spin *= .995;
      contain(body);
    }
    for (let pass = 0; pass < 5; pass++) {
      collisions();
      bodies.filter(b => b.visible).forEach(contain);
    }
  }
  function tick(time) {
    const dt = Math.min((time - previousTime) / 1000 || 1 / 60, 1 / 30);
    previousTime = time; elapsed += dt;
    simulate(dt / 2); simulate(dt / 2);
    bodies.forEach(paint);
    if (elapsed < 3 || bodies.some(b => Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.spin) * 50 > 5)) frame = requestAnimationFrame(tick);
    else frame = 0;
  }
  function start() {
    if (started) return;
    started = true;
    // Measure before removing the original layout. The original stays as a no-JS fallback.
    const sizes = elements.map(el => ({ w: el.offsetWidth, h: el.offsetHeight }));
    board.classList.add('free-stickers');
    elements.forEach(el => board.append(el));
    board.querySelector('.tool-stickers')?.remove();
    bodies = elements.map((el, i) => {
      const { w, h } = sizes[i];
      el.style.width = `${w}px`; el.style.height = `${h}px`;
      return { el, w, h, mass: i === 0 ? 3 : 1,
        x: random(10, Math.max(11, board.clientWidth - w - 10)),
        y: -h - random(30, 150), vx: random(-110, 110), vy: random(20, 70),
        angle: random(-.3, .3), spin: random(-1.2, 1.2), delay: i * .16,
        visible: false };
    });
    bodies.forEach(paint);
    if (reduceStickerMotion.matches) {
      for (let i = 0; i < 480; i++) { elapsed += 1 / 60; simulate(1 / 60); }
      bodies.forEach(paint);
    } else frame = requestAnimationFrame(tick);
  }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
  }, { threshold: .25 });
  observer.observe(board);
  new ResizeObserver(() => {
    if (!started) return;
    bodies.forEach(body => { contain(body); paint(body); });
    if (!frame && !reduceStickerMotion.matches) { elapsed = 3; previousTime = 0; frame = requestAnimationFrame(tick); }
  }).observe(board);
  reduceStickerMotion.addEventListener('change', event => {
    if (!event.matches || !started) return;
    cancelAnimationFrame(frame); frame = 0;
    for (let i = 0; i < 480; i++) { elapsed += 1 / 60; simulate(1 / 60); }
    bodies.forEach(paint);
  });
}

// Keep the arrow at its last card position while it fades out.
const projectCursorMedia = matchMedia('(hover: hover) and (pointer: fine)');
const projectCursor = document.createElement('div');
projectCursor.className = 'project-cursor';
projectCursor.setAttribute('aria-hidden', 'true');
document.body.append(projectCursor);
function hideProjectCursor() { projectCursor.classList.remove('is-visible'); }
function updateProjectCursorMode() {
  document.documentElement.classList.toggle('custom-project-cursor', projectCursorMedia.matches);
  if (!projectCursorMedia.matches) hideProjectCursor();
}
for (const card of document.querySelectorAll('.project')) {
  function moveProjectCursor(event) {
    if (!projectCursorMedia.matches || event.pointerType === 'touch') return;
    projectCursor.style.transform = `translate(${event.clientX - 32}px, ${event.clientY - 32}px)`;
    projectCursor.classList.add('is-visible');
  }
  card.addEventListener('pointerenter', moveProjectCursor);
  card.addEventListener('pointermove', moveProjectCursor);
  card.addEventListener('pointerleave', hideProjectCursor);
  card.addEventListener('pointercancel', hideProjectCursor);
}
window.addEventListener('blur', hideProjectCursor);
window.addEventListener('scroll', hideProjectCursor, {passive:true});
document.addEventListener('visibilitychange', () => { if (document.hidden) hideProjectCursor(); });
projectCursorMedia.addEventListener('change', updateProjectCursorMode);
updateProjectCursorMode();

// Dismiss the mobile guidance across all project cards after the first visit.
const projectHintKey = 'portfolio-project-opened';
let projectOpened = false;
try { projectOpened = localStorage.getItem(projectHintKey) === '1'; } catch {}
const hintCards = [...document.querySelectorAll('a.project[href]')];
const mobileHints = matchMedia('(max-width:850px)');
if (!projectOpened) {
  const hints = hintCards.map(card => {
    const hint = document.createElement('span');
    hint.className = 'project-tap-hint';
    hint.textContent = 'Нажмите в любом месте карточки, чтобы посмотреть проект ↗';
    hint.setAttribute('aria-hidden', 'true');
    card.append(hint);
    return hint;
  });
  const hintObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && mobileHints.matches && !projectOpened) {
        entry.target.querySelector('.project-tap-hint').classList.add('is-visible');
      }
    }
  }, {threshold: 0.2});
  hintCards.forEach(card => {
    hintObserver.observe(card);
    card.addEventListener('click', () => {
      projectOpened = true;
      try { localStorage.setItem(projectHintKey, '1'); } catch {}
      hints.forEach(hint => hint.remove());
      hintObserver.disconnect();
    });
  });
}

/* First-party analytics. No identifiers or events are created before consent. */
(function () {
  'use strict';

  var DAY = 86400000;
  var CONSENT_TTL = 180 * DAY;
  var VISITOR_TTL = 90 * DAY;
  var SESSION_TTL = 30 * 60000;
  var MAX_ACTIVE = 30 * 60000;
  var IDLE_AFTER = 60000;
  var KEYS = {
    consent: 'aioeh.analytics.consent.v1',
    visitor: 'aioeh.analytics.visitor.v1',
    session: 'aioeh.analytics.session.v1'
  };
  var script = document.currentScript;
  var endpoint = '';
  try {
    var configured = new URL(script ? script.getAttribute('data-endpoint') || '' : '');
    if (configured.protocol === 'https:' && !configured.username && !configured.password &&
        !configured.search && !configured.hash &&
        (configured.hostname === location.hostname || configured.hostname === 'events.oehnps.co.uk')) {
      endpoint = configured.href;
    }
  } catch (_) { /* Missing or invalid configuration disables collection. */ }

  var path = location.pathname === '/index.html' ? '/' : location.pathname;
  var eligible = (path === '/' || path.indexOf('/blog/') === 0) &&
    !/\.(?:xml|json|txt|css|js|png|jpe?g|gif|webp|svg|ico|pdf)$/i.test(path) &&
    !/(?:^|\/)(?:stats|privacy|admin|assets)(?:\/|$)/i.test(path) && path.length <= 512;
  var choice = readConsent();
  var state = null;
  var timer = null;
  var pending = new Map();
  var banner = null;
  var returnFocus = null;
  var initialized = false;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Per-page memory still works. */ }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (_) { /* Storage can be disabled. */ }
  }
  function readConsent() {
    var saved = read(KEYS.consent);
    if (saved && (saved.choice === 'accepted' || saved.choice === 'rejected') &&
        Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now() &&
        saved.expiresAt <= Date.now() + CONSENT_TTL + 60000) return saved;
    remove(KEYS.consent);
    return null;
  }
  function privacySignal() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      navigator.doNotTrack === 'yes' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1';
  }
  function permitted() {
    return !!(choice && choice.choice === 'accepted' && choice.expiresAt > Date.now() && !privacySignal());
  }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return null;
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function validId(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
  function safeCampaign(value) {
    return typeof value === 'string' && /^[\p{L}\p{N} _.-]{1,100}$/u.test(value) ? value : '';
  }
  function referrerOrigin(value) {
    try {
      var referrer = new URL(value);
      return /^https?:$/.test(referrer.protocol) && referrer.origin.length <= 255 ? referrer.origin : '';
    } catch (_) { return ''; }
  }
  function scrollDepth() {
    var root = document.documentElement;
    var available = Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight;
    return available <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((window.scrollY || root.scrollTop || 0) / available * 100)));
  }
  function clearIdentifiers() {
    remove(KEYS.visitor);
    remove(KEYS.session);
  }
  function stop() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    pending.forEach(function (item) {
      if (item.timer) window.clearTimeout(item.timer);
      if (item.controller) item.controller.abort();
    });
    pending.clear();
    state = null;
  }
  function closeBanner() {
    if (banner) banner.remove();
    banner = null;
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
    returnFocus = null;
  }
  function choose(value) {
    if (value === 'accepted' && privacySignal()) return;
    choice = { choice: value, expiresAt: Date.now() + CONSENT_TTL };
    write(KEYS.consent, choice);
    closeBanner();
    if (value === 'accepted') start();
    else { stop(); clearIdentifiers(); }
  }
  function showBanner(explicit) {
    if (!document.body) return;
    closeBanner();
    if (explicit) returnFocus = document.activeElement;
    banner = document.createElement('section');
    banner.className = 'analytics-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-labelledby', 'analytics-consent-title');
    var heading = document.createElement('h2');
    heading.id = 'analytics-consent-title';
    heading.textContent = '익명 방문 통계 설정';
    var description = document.createElement('p');
    description.textContent = privacySignal()
      ? '브라우저의 추적 거부 설정(GPC 또는 DNT)에 따라 통계를 수집하지 않습니다.'
      : '동의하면 조회 수, 유입 경로, 읽은 시간과 스크롤을 통계로 모읍니다. 이름·이메일은 받지 않으며, 무작위 방문자 번호를 사용합니다. 언제든 하단의 통계 설정에서 변경할 수 있습니다.';
    var detail = document.createElement('a');
    detail.href = '/privacy/';
    detail.textContent = '통계 수집 안내';
    detail.className = 'analytics-consent__details';
    var actions = document.createElement('div');
    actions.className = 'analytics-consent__actions';
    var reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = privacySignal() ? '닫기' : '거부';
    reject.addEventListener('click', function () { choose('rejected'); });
    var accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = '동의';
    accept.disabled = privacySignal();
    accept.addEventListener('click', function () { choose('accepted'); });
    actions.append(reject, accept);
    banner.append(heading, description, detail, actions);
    banner.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeBanner();
    });
    document.body.append(banner);
    if (explicit) reject.focus();
  }
  function touchSession(now) {
    if (!state || now - state.lastSessionWrite < 15000) return;
    state.lastSessionWrite = now;
    var stored = read(KEYS.session);
    // Do not resurrect an expired session or overwrite a newer session from another tab.
    if (stored && stored.id === state.sessionId && now - stored.lastActiveAt < SESSION_TTL) {
      stored.lastActiveAt = now;
      write(KEYS.session, stored);
    }
  }
  function accountTime() {
    if (!state) return;
    if (!permitted()) {
      stop();
      clearIdentifiers();
      return;
    }
    var now = Date.now();
    // Intersect the most recent five seconds with the input's active window.
    // A timer resumed after device sleep must not backfill the missing interval.
    var eligibleMs = Math.max(0, Math.min(now, state.lastInput + IDLE_AFTER) - Math.max(state.lastTick, now - 5000));
    var focused = typeof document.hasFocus !== 'function' || document.hasFocus();
    if (document.visibilityState === 'visible' && focused && eligibleMs > 0) {
      state.activeMs = Math.min(MAX_ACTIVE, state.activeMs + eligibleMs);
      touchSession(now);
    }
    state.lastTick = now;
    state.scrollDepth = Math.max(state.scrollDepth, scrollDepth());
  }
  function dispatch(payload) {
    if (!permitted() || !endpoint || !state || pending.size >= 20 || typeof window.fetch !== 'function') return;
    var item = { body: JSON.stringify(payload), attempts: 0, timer: null, controller: null };
    pending.set(payload.eventId, item);
    function attempt() {
      if (!permitted() || !state || !pending.has(payload.eventId)) {
        pending.delete(payload.eventId);
        return;
      }
      item.attempts += 1;
      item.controller = typeof AbortController === 'function' ? new AbortController() : null;
      window.fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: item.body,
        signal: item.controller ? item.controller.signal : undefined
      }).then(function (response) {
        if (response.ok || (response.status < 500 && response.status !== 408 && response.status !== 429)) {
          pending.delete(payload.eventId);
        } else retry();
      }).catch(function () { retry(); });
    }
    function retry() {
      if (!permitted() || !pending.has(payload.eventId) || item.attempts >= 3) {
        pending.delete(payload.eventId);
        return;
      }
      item.timer = window.setTimeout(attempt, item.attempts === 1 ? 2000 : 10000);
    }
    attempt();
  }
  function send(event, extra) {
    if (!state || !permitted()) return;
    var eventId = uuid();
    if (!eventId) return;
    var payload = {
      v: 1,
      event: event,
      eventId: eventId,
      viewId: state.viewId,
      sessionId: state.sessionId,
      visitorId: state.visitorId,
      path: path,
      title: document.title.slice(0, 200),
      referrer: state.referrer,
      utmSource: state.utmSource,
      utmMedium: state.utmMedium,
      utmCampaign: state.utmCampaign,
      activeMs: Math.round(state.activeMs),
      scrollDepth: state.scrollDepth,
      isReturning: state.isReturning,
      sessionStart: event === 'view' && state.sessionStart
    };
    if (extra) {
      payload.linkHost = extra.linkHost;
      payload.linkType = extra.linkType;
    }
    dispatch(payload);
  }
  function engagement(force) {
    accountTime();
    if (!state) return;
    if (force || state.activeMs !== state.lastSentActive || state.scrollDepth !== state.lastSentDepth) {
      state.lastSentActive = state.activeMs;
      state.lastSentDepth = state.scrollDepth;
      send('engagement');
    }
    state.lastEngagement = Date.now();
  }
  function beginTimer() {
    if (timer !== null || !state) return;
    state.lastTick = Date.now();
    timer = window.setInterval(function () {
      accountTime();
      if (state && Date.now() - state.lastEngagement >= 30000) engagement(false);
    }, 1000);
  }
  function start() {
    if (state || !eligible || !endpoint || !permitted()) return;
    var now = Date.now();
    var visitor = read(KEYS.visitor);
    var existed = !!(visitor && validId(visitor.id) && Number.isFinite(visitor.expiresAt) &&
      visitor.expiresAt > now && visitor.expiresAt <= now + VISITOR_TTL + 60000);
    if (!existed) {
      visitor = { id: uuid(), expiresAt: now + VISITOR_TTL };
      if (!visitor.id) return;
      write(KEYS.visitor, visitor);
    }
    var params = new URLSearchParams(location.search);
    var session = read(KEYS.session);
    var newSession = !(session && validId(session.id) && session.visitorId === visitor.id &&
      Number.isFinite(session.lastActiveAt) && session.lastActiveAt <= now && now - session.lastActiveAt < SESSION_TTL);
    if (newSession) {
      session = {
        id: uuid(), visitorId: visitor.id, lastActiveAt: now, isReturning: existed,
        referrer: referrerOrigin(document.referrer),
        utmSource: safeCampaign(params.get('utm_source')),
        utmMedium: safeCampaign(params.get('utm_medium')),
        utmCampaign: safeCampaign(params.get('utm_campaign'))
      };
      if (!session.id) return;
    } else session.lastActiveAt = now;
    // Keep the session's initial acquisition through internal page navigation.
    // Re-sanitize stored values before they can reach any request.
    session.referrer = referrerOrigin(session.referrer);
    session.utmSource = safeCampaign(session.utmSource);
    session.utmMedium = safeCampaign(session.utmMedium);
    session.utmCampaign = safeCampaign(session.utmCampaign);
    write(KEYS.session, session);
    var viewId = uuid();
    if (!viewId) return;
    state = {
      visitorId: visitor.id, sessionId: session.id, viewId: viewId,
      isReturning: session.isReturning === true, sessionStart: newSession,
      activeMs: 0, scrollDepth: scrollDepth(), lastInput: now, lastTick: now,
      lastEngagement: now, lastSessionWrite: now, lastSentActive: 0, lastSentDepth: 0,
      referrer: session.referrer,
      utmSource: session.utmSource,
      utmMedium: session.utmMedium,
      utmCampaign: session.utmCampaign
    };
    send('view');
    beginTimer();
  }
  function activity(event) {
    if (!state || event.isTrusted !== true) return;
    accountTime();
    if (!state) return;
    state.lastInput = Date.now();
    touchSession(state.lastInput);
  }
  function click(event) {
    if (!state || !permitted() || event.isTrusted !== true) return;
    var link = event.target && typeof event.target.closest === 'function' ? event.target.closest('a[href]') : null;
    if (!link || (banner && banner.contains(link))) return;
    try {
      var url = new URL(link.href, location.href);
      if (!/^https?:$/.test(url.protocol)) return;
      var type = url.hostname === 'msds.oehnps.co.uk' ? 'msds' :
        (link.hasAttribute('download') || /\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|zip|7z|rar|gz|txt)$/i.test(url.pathname)) ? 'download' :
          url.origin !== location.origin ? 'outbound' : '';
      if (!type) return;
      accountTime();
      send('click', { linkHost: url.hostname, linkType: type });
    } catch (_) { /* Invalid URLs are ignored, never sent verbatim. */ }
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    document.querySelectorAll('[data-analytics-preferences]').forEach(function (button) {
      button.addEventListener('click', function () { showBanner(true); });
    });
    if (!permitted()) clearIdentifiers();
    if (permitted()) start();
    else if (!choice && !privacySignal() && eligible && endpoint) showBanner(false);
    ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'].forEach(function (name) {
      window.addEventListener(name, activity, { passive: true });
    });
    document.addEventListener('click', click, { capture: true, passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!state) return;
      if (document.visibilityState === 'hidden') engagement(true);
      else { state.lastTick = Date.now(); state.lastInput = Date.now(); }
    });
    window.addEventListener('pagehide', function () {
      engagement(true);
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    });
    window.addEventListener('pageshow', function (event) {
      if (event.persisted && state) {
        state.lastInput = Date.now();
        beginTimer();
      }
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== KEYS.consent && event.key !== null) return;
      choice = readConsent();
      if (!permitted()) { stop(); clearIdentifiers(); }
      else start();
      if (banner) {
        if (choice) closeBanner();
        else showBanner(false);
      }
    });
  }
  window.AIOEHAnalytics = Object.freeze({
    preferences: function () { showBanner(true); },
    revoke: function () { choose('rejected'); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());

/* OEH & Partners — private, consent-based blog analytics. No third-party assets. */
'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const count = (value) => new Intl.NumberFormat('ko-KR', {maximumFractionDigits:0}).format(number(value));
  const percent = (value) => `${(number(value) * 100).toFixed(1)}%`;
  const duration = (value) => { const seconds = Math.round(number(value)); return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초` : `${seconds}초`; };
  const dayMS = 86400000;
  const koreanToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMS).toISOString().slice(0, 10);
  const dateLabel = (date) => `${date.slice(0,4)}.${date.slice(5,7)}.${date.slice(8,10)}`;
  const localTime = (value, includeYear = false) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', ...(includeYear ? {year:'numeric'} : {}), month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false}).format(date); };
  const sourceName = (value) => ({direct:'직접 유입', '(direct)':'직접 유입'}[value] || value || '알 수 없음');
  const deviceName = (value) => ({desktop:'데스크톱', mobile:'모바일', tablet:'태블릿', other:'기타'}[value] || value || '알 수 없음');
  const countryName = (value) => { if (!value || value === 'XX') return '알 수 없음'; try { return new Intl.DisplayNames(['ko'], {type:'region'}).of(value.toUpperCase()) || value; } catch { return value; } };
  const definitions = {
    views:'수집된 페이지 열람 횟수입니다. 페이지 기록을 서버가 처음 받은 날짜로 집계하며, 같은 방문자의 재열람도 포함합니다.',
    visitors:'통계 수집에 동의한 익명 방문 ID 수입니다. 브라우저·기기·저장소가 달라지면 다른 방문자로 집계될 수 있습니다.',
    sessions:'30분 동안 활동이 없으면 다음 페이지 이동부터 새로운 방문으로 구분합니다. 선택한 기간과 필터에 포함되는 세션을 셉니다.',
    avgActiveSeconds:'화면에 표시되고 포커스가 있으며 최근 60초 안에 사용자 활동이 있던 시간의 합계를 조회수로 나눈 값입니다. 페이지당 최대 30분까지 측정합니다.',
    readCompletionRate:'페이지의 90% 이상을 스크롤하고 활성 읽기 시간이 30초 이상인 조회의 비율입니다. 이해 여부를 뜻하지는 않습니다.',
    returnRate:'새 세션을 시작할 때 이전 익명 ID가 남아 있던 방문자의 비율입니다. ID는 생성 후 최대 90일 유지되며 동의 철회·저장소 초기화 시 구분이 초기화됩니다.',
    engagedRate:'활성 읽기 시간이 10초 이상인 조회의 비율입니다.',
    bounceRate:'필터에 포함된 조회가 한 번이고 총 활성 시간이 10초 미만인 세션의 비율입니다.',
    exitRate:'선택한 날짜 범위 안에서 세션의 마지막으로 관측된 페이지 조회의 비율입니다. 경로·유입·기기 필터를 적용하기 전에 마지막 페이지를 정합니다. 진행 중이거나 날짜를 넘긴 세션은 실제 최종 종료와 다를 수 있습니다.'
  };
  const kpiSpecs = [
    {key:'views',label:'조회수',format:count},
    {key:'visitors',label:'방문자',format:count},
    {key:'sessions',label:'방문 세션',format:count},
    {key:'avgActiveSeconds',label:'평균 읽기 시간',format:duration},
    {key:'readCompletionRate',label:'완독률',format:percent,rate:true},
    {key:'returnRate',label:'재방문자 비율',format:percent,rate:true}
  ];
  const state = {report:null,metric:'views',path:'',sort:'views',sortDirection:-1,request:0,controller:null,knownSources:new Set(),demo:new URLSearchParams(location.search).get('demo') === '1'};

  function preset(value) {
    const today = koreanToday();
    const to = value === 'yesterday' ? shiftDate(today, -1) : today;
    $('#to').value = to;
    $('#from').value = value === 'yesterday' ? to : shiftDate(to, -(Number(value) - 1));
    $$('.preset-group button').forEach(button => { const selected = button.dataset.days === String(value); button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }

  function requestedRange() {
    const from = $('#from').value, to = $('#to').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new Error('시작일과 종료일을 확인해 주세요. 종료일은 시작일 이후여야 합니다.');
    const days = Math.round((Date.parse(to) - Date.parse(from)) / dayMS) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 366) throw new Error('한 번에 최대 366일을 조회할 수 있습니다. 기간을 줄여 주세요.');
    if (to > koreanToday()) throw new Error('종료일은 오늘 또는 이전 날짜로 선택해 주세요.');
    return {from,to,days};
  }

  function setStatus(text, kind = '') {
    $('#status').className = `live-status ${kind}`;
    $('#status').innerHTML = `<i></i>${escapeHTML(text)}`;
  }

  async function loadReport() {
    let range;
    try { range = requestedRange(); } catch (error) { ++state.request; state.controller?.abort(); $('#refresh').disabled=false; $('#dashboard').setAttribute('aria-busy','false'); showError(error.message); return; }
    const request = ++state.request;
    state.controller?.abort();
    state.controller = new AbortController();
    $('#refresh').disabled = true;
    $('#export').disabled = true;
    $('#error').hidden = true;
    $('#dashboard').setAttribute('aria-busy', 'true');
    setStatus(state.demo ? '예시 데이터를 구성하는 중' : '통계를 불러오는 중', 'loading');
    const timeout = setTimeout(() => state.controller?.abort(), 30000);
    try {
      let report;
      if (state.demo) report = makeDemoReport(range);
      else {
        const params = new URLSearchParams({from:range.from,to:range.to});
        if (state.path) params.set('path', state.path);
        if ($('#source').value) params.set('source', $('#source').value);
        if ($('#device').value) params.set('device', $('#device').value);
        const response = await fetch(`/api/report?${params}`, {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}, signal:state.controller.signal});
        if (response.status === 401 || response.status === 403) throw new Error('관리자 로그인이 만료되었거나 접근 권한이 없습니다. 페이지를 새로 열어 Cloudflare Access 로그인을 완료해 주세요.');
        if (!response.ok) {
          let detail = '';
          try { detail = (await response.json()).error || ''; } catch {}
          if (response.status === 400) throw new Error(`조회 조건을 확인해 주세요.${detail ? ` (${String(detail).slice(0, 180)})` : ''}`);
          if (response.status === 503) throw new Error('통계 서비스의 저장소 또는 보안 설정이 아직 준비되지 않았습니다. 관리자 설정 후 다시 시도해 주세요.');
          throw new Error(`통계 서버 응답 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`);
        }
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('관리자 로그인 화면으로 이동했습니다. 이 페이지를 새로 열어 로그인해 주세요.');
        report = await response.json();
      }
      if (request !== state.request) return;
      if (!report || !report.summary || !report.range || !Array.isArray(report.series)) throw new Error('통계 응답 형식을 확인할 수 없습니다. 관리자에게 서버 설정 확인을 요청해 주세요.');
      state.report = report;
      renderReport();
      $('#dashboard').hidden = false;
      $('#export').disabled = false;
      setStatus(`${state.demo ? '예시 데이터' : '수집 데이터'} · ${localTime(report.generatedAt)} 기준`);
    } catch (error) {
      if (request !== state.request) return;
      showError(error.name === 'AbortError' ? '응답 시간이 길어져 조회를 중단했습니다. 잠시 후 다시 시도해 주세요.' : error.message || '네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      clearTimeout(timeout);
      if (request === state.request) { $('#refresh').disabled = false; $('#dashboard').setAttribute('aria-busy','false'); }
    }
  }

  function showError(message) {
    $('#error').hidden = false;
    $('#error-message').textContent = message;
    $('#dashboard').hidden = true;
    $('#empty').hidden = true;
    $('#export').disabled = true;
    setStatus('조회 실패 · 아래 안내를 확인해 주세요', 'failed');
  }

  function comparison(current, previous, rate) {
    current = number(current); previous = number(previous);
    if (current === previous) return '<span>— 변화 없음</span>';
    if (!previous && !rate) return '<span>이전 기록 없음</span>';
    const change = rate ? (current - previous) * 100 : (current - previous) / previous * 100;
    return `<span class="${change > 0 ? 'positive' : 'negative'}">${change > 0 ? '↗ +' : '↘ '}${change.toFixed(1)}${rate ? '%p' : '%'}</span><span class="change-label">직전 기간</span>`;
  }

  function renderReport() {
    const report = state.report, summary = report.summary, previous = report.previousSummary || {};
    $('#kpis').innerHTML = kpiSpecs.map(spec => `<article class="kpi"><h2 class="kpi-title">${spec.label}<span class="definition-tip" tabindex="0" title="${escapeHTML(definitions[spec.key])}" aria-label="${escapeHTML(`${spec.label}: ${definitions[spec.key]}`)}">?</span></h2><p class="kpi-value">${spec.format(summary[spec.key])}</p><div class="kpi-change">${comparison(summary[spec.key],previous[spec.key],spec.rate)}</div></article>`).join('');
    const range = report.range;
    $('#range-caption').textContent = `${dateLabel(range.from)} — ${dateLabel(range.to)} · ${count(range.days)}일`;
    $('#comparison-note').textContent = range.previousFrom && range.previousTo ? `비교 ${dateLabel(range.previousFrom)} — ${dateLabel(range.previousTo)}` : '동일 길이의 직전 기간과 비교';
    if(report.meta?.comparisonMayBePartial) $('#comparison-note').textContent += ' · 수집 시작 전·보관 기간 밖의 비교 기록은 누락될 수 있음';
    $('#empty').hidden = number(summary.views) > 0;
    (report.channels || []).forEach(row => state.knownSources.add(row.source));
    const selectedSource = $('#source').value;
    $('#source').innerHTML = '<option value="">모든 유입</option>' + [...state.knownSources].sort().map(source => `<option value="${escapeHTML(source)}"${source === selectedSource ? ' selected' : ''}>${escapeHTML(sourceName(source))}</option>`).join('');
    $('#path-filter').hidden = !state.path;
    $('#path-filter span').textContent = state.path;
    $('#path-filter').title = state.path;
    $('#reset').hidden = !state.path && !selectedSource && !$('#device').value;
    renderChart(); renderPosts();
    renderBars('channels',report.channels,'source',sourceName,'source');
    renderBars('referrers',report.referrers,'host',sourceName);
    renderBars('devices',report.devices,'device',deviceName,'device');
    renderBars('countries',report.countries,'country',countryName);
    renderBars('browsers',report.browsers,'browser',value => value || '알 수 없음');
    $('#conversions').innerHTML = [
      ['외부 링크 클릭',count(summary.outboundClicks),'회'],['MSDS 이동',count(summary.msdsClicks),'회'],['파일 다운로드 클릭',count(summary.downloads),'회'],['10초 이상 읽은 비율',percent(summary.engagedRate),'']
    ].map(([label,value,unit]) => `<div class="conversion-item"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`).join('');
    $('#campaigns').innerHTML = (report.campaigns || []).length ? report.campaigns.map(row => `<tr><td>${escapeHTML(row.campaign || '(이름 없음)')}</td><td>${escapeHTML(row.source || '—')}</td><td>${escapeHTML(row.medium || '—')}</td><td class="number">${count(row.views)}</td><td class="number">${count(row.visitors)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">UTM 캠페인으로 들어온 방문이 아직 없습니다.</td></tr>';
    renderHeatmap(); renderJourneys();
    const names = {...Object.fromEntries(kpiSpecs.map(spec => [spec.key,spec.label])), engagedRate:'10초 이상 읽은 비율',bounceRate:'짧은 단일 방문 비율',exitRate:'종료 비율'};
    $('#definitions').innerHTML = Object.entries(definitions).map(([key,text]) => `<dt>${names[key]}</dt><dd>${escapeHTML(text)}</dd>`).join('') + '<dt>기간과 필터</dt><dd>날짜는 한국 시간으로 계산합니다. 이전 기간은 바로 앞의 동일 일수이며 수집 시작 전이나 보관 기간 밖의 기록은 비교에서 누락될 수 있습니다. 방문자·세션·짧은 단일 방문 비율은 선택한 날짜와 필터에 포함되는 조회를 기준으로 계산합니다. 종료 페이지는 경로·유입·기기 필터를 적용하기 전에 정합니다.</dd><dt>클릭과 다음 행동</dt><dd>외부 링크 클릭·다운로드·MSDS 이동은 클릭이 서버에 도착한 날짜로 집계합니다. 경로·유입·기기 필터는 클릭이 연결된 페이지의 정보를 사용합니다. 이전 날짜에 열었던 페이지에서 클릭할 수 있으므로, 조회수는 0이고 클릭은 있는 기간도 가능합니다.</dd><dt>읽기 여정</dt><dd>최근 최대 50개 세션을 표시하며, 세션마다 최대 20개 페이지가 포함됩니다. 전체 행동 기록이 아니며 개인 신원을 나타내지 않습니다.</dd><dt>직접 유입</dt><dd>주소 직접 입력, 북마크, 또는 유입 정보가 전달되지 않은 앱·메신저 방문 등을 포함할 수 있습니다. 검색어 자체는 수집하지 않습니다.</dd>';
    $('#retention-note').textContent = `데이터 보관 기간은 최대 ${count(report.meta?.retentionDays || 395)}일입니다. 개인정보, IP 주소, 이메일은 이 대시보드에 표시하지 않습니다.`;
  }

  function renderChart() {
    const report = state.report, series = report.series || [], metric = state.metric;
    const spec = kpiSpecs.find(item => item.key === metric);
    $('#chart-total').textContent = spec.format(report.summary[metric]);
    $('#chart-caption').textContent = {views:'선택 기간의 페이지 조회',visitors:'선택 기간의 고유 익명 방문자',avgActiveSeconds:'조회당 평균 활성 읽기 시간'}[metric];
    $$('.chart-tabs button').forEach(button => { const selected = button.dataset.metric === metric; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected)); });
    const width = 1040, height = 225, left = 44, right = 16, top = 12, bottom = 30;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const rawMax = Math.max(0,...series.map(row => number(row[metric])));
    const step = rawMax ? Math.pow(10, Math.floor(Math.log10(rawMax))) : 1;
    const max = rawMax ? Math.ceil(rawMax / step) * step : 4;
    const x = index => left + (series.length <= 1 ? plotWidth / 2 : index / (series.length - 1) * plotWidth);
    const y = value => top + plotHeight - number(value) / max * plotHeight;
    const points = series.map((row,index) => [x(index),y(row[metric])]);
    const line = points.map(([px,py],index) => `${index ? 'L':'M'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
    const area = points.length ? `${line} L${points.at(-1)[0]},${top+plotHeight} L${points[0][0]},${top+plotHeight} Z` : '';
    const grid = Array.from({length:5},(_,index) => { const value = max / 4 * index, py = y(value); return `<line class="chart-grid" x1="${left}" y1="${py}" x2="${width-right}" y2="${py}"/><text class="chart-axis" x="${left-11}" y="${py+4}" text-anchor="end">${escapeHTML(metric === 'avgActiveSeconds' ? `${Math.round(value)}s` : count(value))}</text>`; }).join('');
    const dateIndices = [...new Set(Array.from({length:Math.min(series.length,6)},(_,i) => Math.round(i / Math.max(1,Math.min(series.length,6)-1) * (series.length-1))))];
    const dates = dateIndices.map(index => `<text class="chart-axis" x="${x(index)}" y="${height-4}" text-anchor="middle">${escapeHTML(series[index].date.slice(5).replace('-','.'))}</text>`).join('');
    const hits = series.map((row,index) => `<g class="chart-hit" tabindex="0" role="img" data-index="${index}" aria-label="${escapeHTML(`${dateLabel(row.date)} ${spec.label} ${spec.format(row[metric])}`)}"><title>${escapeHTML(`${dateLabel(row.date)} · ${spec.format(row[metric])}`)}</title><rect x="${x(index)-Math.max(5,plotWidth/Math.max(1,series.length-1)/2)}" y="${top}" width="${Math.max(10,plotWidth/Math.max(1,series.length-1))}" height="${plotHeight}" fill="transparent"/><line class="chart-focus" x1="${x(index)}" x2="${x(index)}" y1="${top}" y2="${top+plotHeight}"/><circle class="chart-point" cx="${x(index)}" cy="${y(row[metric])}" r="4"/></g>`).join('');
    $('#trend-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHTML(`${spec.label} 일별 추이. 아래 일별 수치 표에서도 확인할 수 있습니다.`)}"><defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#176b61" stop-opacity=".13"/><stop offset="100%" stop-color="#176b61" stop-opacity=".01"/></linearGradient><clipPath id="chart-bounds"><rect x="${left-5}" y="0" width="${plotWidth+10}" height="${height}"/></clipPath></defs>${grid}${area ? `<path d="${area}" fill="url(#trend-fill)"/><path class="chart-line" d="${line}"/>`:''}${points.length===1 ? `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="4" fill="#176b61"/>`:''}${dates}<g clip-path="url(#chart-bounds)">${hits}</g></svg>`;
    $$('.chart-hit').forEach(hit => {
      const show = () => {
        const row = series[Number(hit.dataset.index)], box = hit.getBoundingClientRect(), cardBox = $('.trend-card').getBoundingClientRect();
        const tooltip = $('#chart-tooltip');
        tooltip.innerHTML = `<small>${escapeHTML(dateLabel(row.date))}</small>${spec.label} <strong>${escapeHTML(spec.format(row[metric]))}</strong>`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(Math.max(16,box.left-cardBox.left+box.width/2-60),cardBox.width-170)}px`;
        tooltip.style.top = `${Math.max(88,box.top-cardBox.top-52)}px`;
      };
      hit.addEventListener('mouseenter',show); hit.addEventListener('focus',show);
      hit.addEventListener('mouseleave',() => $('#chart-tooltip').hidden = true); hit.addEventListener('blur',() => $('#chart-tooltip').hidden = true);
    });
    $('#series-table').innerHTML = '<thead><tr><th>날짜</th><th class="number">조회수</th><th class="number">방문자</th><th class="number">세션</th><th class="number">평균 읽기</th><th class="number">완독률</th></tr></thead><tbody>' + series.map(row => `<tr><td>${escapeHTML(row.date)}</td><td class="number">${count(row.views)}</td><td class="number">${count(row.visitors)}</td><td class="number">${count(row.sessions)}</td><td class="number">${duration(row.avgActiveSeconds)}</td><td class="number">${percent(row.readCompletionRate)}</td></tr>`).join('') + '</tbody>';
  }

  function renderPosts() {
    const query = $('#post-search').value.trim().toLocaleLowerCase('ko-KR');
    const rows = (state.report.pages || []).filter(row => `${row.title} ${row.path}`.toLocaleLowerCase('ko-KR').includes(query)).sort((a,b) => (number(a[state.sort])-number(b[state.sort]))*state.sortDirection);
    $('#posts-body').innerHTML = rows.length ? rows.map((row,index) => `<tr><td><div class="post-title"><span class="post-rank">${String(index+1).padStart(2,'0')}</span><button type="button" data-path="${escapeHTML(row.path)}">${escapeHTML(row.title || row.path)}<span class="post-path">${escapeHTML(row.path)}</span></button></div></td><td>${count(row.views)}</td><td>${count(row.visitors)}</td><td>${duration(row.avgActiveSeconds)}</td><td><span class="completion-value"><span class="mini-track"><i data-fill="${Math.min(100,number(row.readCompletionRate)*100)}"></i></span>${percent(row.readCompletionRate)}</span></td><td>${percent(row.exitRate)}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-cell">${query ? '검색 조건에 맞는 글이 없습니다.' : '이 기간에 읽힌 페이지가 아직 없습니다.'}</td></tr>`;
    $$('#posts-body [data-fill]').forEach(element => element.style.width=`${number(element.dataset.fill)}%`);
    $('#post-count').textContent = `${count(rows.length)}개 페이지${query ? ' 검색됨' : ''}`;
    $$('.post-table [data-sort]').forEach(button => { const current = button.dataset.sort === state.sort; button.querySelector('span').textContent = current ? (state.sortDirection < 0 ? '↓':'↑') : ''; button.closest('th').setAttribute('aria-sort',current ? (state.sortDirection < 0 ? 'descending':'ascending') : 'none'); });
    $$('#posts-body [data-path]').forEach(button => button.addEventListener('click',() => { state.path = button.dataset.path; loadReport(); $('#overview').scrollIntoView({behavior:'smooth'}); }));
  }

  function renderBars(id, data, key, label, filterType) {
    const rows = [...(data || [])].sort((a,b) => number(b.views)-number(a.views)).slice(0,8);
    const total = (data || []).reduce((sum,row) => sum+number(row.views),0);
    if (!rows.length) { $(`#${id}`).innerHTML = '<p class="empty-section">아직 수집된 데이터가 없습니다.</p>'; return; }
    $(`#${id}`).innerHTML = rows.map(row => `<div class="bar-row"><div class="bar-label">${filterType ? `<button type="button" data-filter-value="${escapeHTML(row[key])}" data-filter-type="${filterType}" title="${escapeHTML(`${label(row[key])}만 보기`)}">${escapeHTML(label(row[key]))}</button>` : `<span title="${escapeHTML(label(row[key]))}">${escapeHTML(label(row[key]))}</span>`}<div class="bar-track"><div class="bar-fill" data-fill="${total ? number(row.views)/total*100 : 0}"></div></div></div><span class="bar-value">${count(row.views)}</span><span class="bar-percent">${total ? (number(row.views)/total*100).toFixed(1) : '0.0'}%</span></div>`).join('');
    $$(`#${id} [data-fill]`).forEach(element => element.style.width=`${number(element.dataset.fill)}%`);
    $$(`#${id} [data-filter-value]`).forEach(button => button.addEventListener('click',() => { $(`#${button.dataset.filterType}`).value = button.dataset.filterValue; loadReport(); $('#overview').scrollIntoView({behavior:'smooth'}); }));
  }

  function renderHeatmap() {
    const entries = new Map((state.report.heatmap || []).map(row => [`${row.weekday}-${row.hour}`,number(row.views)]));
    const max = Math.max(1,...entries.values());
    const names = ['일','월','화','수','목','금','토'];
    let html = '<div class="heatmap" role="group" aria-label="요일별 시간대 조회수"><span></span>' + Array.from({length:24},(_,hour) => `<span class="heatmap-hour">${hour % 3 === 0 ? `${String(hour).padStart(2,'0')}시` : ''}</span>`).join('');
    [1,2,3,4,5,6,0].forEach(day => {
      html += `<span class="heatmap-day">${names[day]}</span>`;
      for (let hour=0; hour<24; hour++) { const views = entries.get(`${day}-${hour}`) || 0, level = views === 0 ? 0 : Math.min(4, Math.ceil(views/max*4)), label = `${names[day]}요일 ${hour}시–${hour+1}시 · ${count(views)}회`; html += `<button type="button" class="heatmap-cell heat-level-${level}" tabindex="${day===1 && hour===0 ? '0':'-1'}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"></button>`; }
    });
    $('#heatmap').innerHTML = html + '</div>';
    const cells=$$('.heatmap-cell'), hint=$('.heatmap-card .footnote');
    const defaultHint='칸에 마우스를 올리거나 방향키로 이동하면 정확한 조회수를 확인할 수 있습니다.';
    hint.textContent=defaultHint;
    cells.forEach((cell,index) => {
      const show=() => { hint.textContent=`${cell.getAttribute('aria-label')} · 한국 시간`; };
      cell.addEventListener('mouseenter',show); cell.addEventListener('focus',show);
      cell.addEventListener('mouseleave',() => { if(!cells.includes(document.activeElement)) hint.textContent=defaultHint; });
      cell.addEventListener('blur',() => { hint.textContent=defaultHint; });
      cell.addEventListener('keydown',event => {
        const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-24,ArrowDown:24,Home:-(index%24),End:23-(index%24)};
        if(!(event.key in offsets)) return;
        event.preventDefault();
        const target=Math.max(0,Math.min(cells.length-1,index+offsets[event.key]));
        cell.tabIndex=-1; cells[target].tabIndex=0; cells[target].focus();
      });
    });
  }

  function renderJourneys() {
    const journeys = state.report.journeys || [];
    $('#journey-list').innerHTML = journeys.length ? journeys.map(row => `<article class="journey-row"><div class="journey-person"><span class="visitor-id">${escapeHTML(String(row.visitor || '익명').slice(0,12))}</span>${row.isReturning ? '<span class="return-label">재방문</span>':''}<div class="journey-meta">${escapeHTML(localTime(row.startedAt))}</div></div><div class="journey-path" aria-label="방문한 페이지 순서">${(row.paths || []).map((page,index) => `${index ? '<span class="journey-arrow" aria-hidden="true">→</span>':''}<div class="journey-step" title="${escapeHTML(page.path)}"><strong>${escapeHTML(page.title || page.path)}</strong><span>${duration(page.activeSeconds)} · 스크롤 ${Math.round(number(page.scrollDepth))}%</span></div>`).join('')}</div><div class="journey-total">${duration(row.activeSeconds)}<small>${count(row.views)}페이지</small></div></article>`).join('') : '<p class="empty-section">수집된 읽기 여정이 아직 없습니다.</p>';
  }

  function csvCell(value) {
    let text = value == null ? '' : String(value);
    // Spreadsheet applications execute formula-looking text even inside quoted CSV cells.
    if (typeof value !== 'number' && (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
    return `"${text.replace(/"/g,'""')}"`;
  }

  function downloadCSV() {
    if (!state.report) return;
    const r = state.report, rows = [];
    const section = (name,headers,data) => { if(rows.length) rows.push([]); rows.push([name]); rows.push(headers); rows.push(...data); };
    section('조회 조건',['데이터 유형','시작일','종료일','시간대','페이지 필터','유입 필터','기기 필터','생성 시각'],[[state.demo ? '예시 데이터 — 실제 통계 아님':'실제 수집 통계',r.range.from,r.range.to,'Asia/Seoul',state.path,$('#source').value,$('#device').value,r.generatedAt]]);
    section('전체 지표',['지표','선택 기간','직전 기간'],Object.entries(r.summary).map(([key,value]) => [kpiSpecs.find(spec => spec.key===key)?.label || ({engagedRate:'10초 이상 읽은 비율',returningVisitors:'재방문자',bounceRate:'짧은 단일 방문 비율',outboundClicks:'외부 링크 클릭',downloads:'파일 다운로드 클릭',msdsClicks:'MSDS 이동'}[key] || key),value,r.previousSummary?.[key] || 0]));
    section('일별 추이',['날짜','조회수','방문자','세션','평균 활성 읽기(초)','완독률(0~1)'],r.series.map(row => [row.date,row.views,row.visitors,row.sessions,row.avgActiveSeconds,row.readCompletionRate]));
    section('콘텐츠',['제목','경로','조회수','방문자','평균 활성 읽기(초)','완독률(0~1)','10초 이상 읽은 비율(0~1)','종료 횟수','종료 비율(0~1)'],(r.pages || []).map(row => [row.title,row.path,row.views,row.visitors,row.avgActiveSeconds,row.readCompletionRate,row.engagedRate,row.exits,row.exitRate]));
    section('유입 소스',['소스','조회수','방문자','세션'],(r.channels || []).map(row => [row.source,row.views,row.visitors,row.sessions]));
    section('유입 사이트',['호스트','조회수','방문자'],(r.referrers || []).map(row => [row.host,row.views,row.visitors]));
    section('캠페인',['소스','매체','캠페인','조회수','방문자'],(r.campaigns || []).map(row => [row.source,row.medium,row.campaign,row.views,row.visitors]));
    for (const [name,key,field] of [['기기','devices','device'],['국가','countries','country'],['브라우저','browsers','browser']]) section(name,[name,'조회수','방문자'],(r[key] || []).map(row => [row[field],row.views,row.visitors]));
    section('요일과 시간',['요일(일=0)','시간(KST)','조회수'],(r.heatmap || []).map(row => [row.weekday,row.hour,row.views]));
    section('다음 행동',['링크 호스트','유형','클릭수'],(r.clicks || []).map(row => [row.linkHost,row.linkType,row.clicks]));
    section('최근 익명 읽기 여정',['익명 방문 ID','세션 ID','시작 시각','조회수','활성 읽기(초)','재방문','방문 경로'],(r.journeys || []).map(row => [row.visitor,row.session,row.startedAt,row.views,row.activeSeconds,row.isReturning ? '예':'아니오',(row.paths || []).map(page => page.path).join(' → ')]));
    const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const link = document.createElement('a'); link.href=url; link.download=`oeh-blog-${state.demo ? 'DEMO-':''}${r.range.from}-${r.range.to}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  function makeDemoReport(range) {
    // Deterministic, explicitly opt-in visual fixture. Never used when a live request fails.
    const selectedSource = $('#source').value, selectedDevice = $('#device').value;
    const factor = (state.path ? .31 : 1) * (selectedSource ? .34 : 1) * (selectedDevice ? .57 : 1);
    const series = Array.from({length:range.days},(_,index) => { const date=shiftDate(range.from,index), seed=Math.floor(Date.parse(date)/dayMS), wave=Math.sin(seed*1.73)*18+Math.cos(seed*.43)*24, views=Math.max(1,Math.round((85+wave+(seed%7)*8)*factor)); return {date,views,visitors:Math.round(views*.71),sessions:Math.round(views*.82),avgActiveSeconds:61+(seed%39),readCompletionRate:.39+(seed%20)/100}; });
    const views=series.reduce((sum,row) => sum+row.views,0), visitors=Math.round(views*.61), sessions=Math.round(views*.78);
    const avg=series.reduce((sum,row) => sum+row.avgActiveSeconds*row.views,0)/views;
    const summary={views,visitors,sessions,avgActiveSeconds:avg,readCompletionRate:.587,engagedRate:.786,returningVisitors:Math.round(visitors*.246),returnRate:.246,bounceRate:.129,outboundClicks:Math.round(views*.047),downloads:Math.round(views*.012),msdsClicks:Math.round(views*.031)};
    const previousSummary=Object.fromEntries(Object.entries(summary).map(([key,value]) => [key,['views','visitors','sessions','returningVisitors','outboundClicks','downloads','msdsClicks'].includes(key) ? Math.round(value*.816) : value*.91]));
    const titles=['MSDS, 숫자 너머의 의미를 읽는 법','작업환경을 바꾸는 작은 관찰','산업위생에서 데이터가 말해주는 것','연구 노트를 공개하는 이유','블로그 · 새로운 관점과 기록','OEH & Partners'];
    const paths=['/blog/posts/reading-msds/','/blog/posts/small-observations/','/blog/posts/data-in-hygiene/','/blog/posts/research-notes/','/blog/','/'];
    const shares=[.31,.24,.18,.12,.1,.05];
    const pages=state.path ? [{path:state.path,title:titles[paths.indexOf(state.path)] || '선택한 글',views,visitors,avgActiveSeconds:avg,readCompletionRate:.587,engagedRate:.786,exits:Math.round(views*.43),exitRate:.43}] : titles.map((title,index) => ({path:paths[index],title,views:Math.round(views*shares[index]),visitors:Math.round(visitors*shares[index]*1.08),avgActiveSeconds:[132,96,84,65,31,19][index],readCompletionRate:[.74,.63,.56,.51,.34,.21][index],engagedRate:[.88,.81,.77,.71,.59,.42][index],exits:Math.round(views*shares[index]*.43),exitRate:[.32,.38,.45,.49,.28,.17][index]}));
    const split=(key,values,parts) => values.map((value,index) => ({[key]:value,views:Math.round(views*parts[index]),visitors:Math.round(visitors*parts[index]),sessions:Math.round(sessions*parts[index])}));
    const channels=selectedSource ? [{source:selectedSource,views,visitors,sessions}] : split('source',['search.naver.com','google.com','direct','newsletter','linkedin.com'],[.34,.27,.22,.1,.07]);
    const referrers=split('host',['search.naver.com','google.com','direct','linkedin.com','t.co'],[.35,.28,.25,.08,.04]);
    const devices=selectedDevice ? [{device:selectedDevice,views,visitors}] : split('device',['mobile','desktop','tablet'],[.57,.39,.04]);
    const heatmap=Array.from({length:168},(_,index) => { const weekday=Math.floor(index/24),hour=index%24; return {weekday,hour,views:Math.round(views/92*(hour>=8 && hour<=20 ? 1+Math.sin(hour*.7+weekday)*.6 : .09)*(weekday===0 || weekday===6 ? .48:1))}; });
    const journeys=Array.from({length:6},(_,index) => { const pageCount=index%3+1, chosen=pages.slice(index%Math.min(pages.length,3),index%Math.min(pages.length,3)+pageCount); return {session:`d30f5a${String(index+1).padStart(6,'0')}`,visitor:`e7a9c2${String(index+31).padStart(6,'0')}`,startedAt:`${range.to}T${String(7-index).padStart(2,'0')}:24:00Z`,views:chosen.length,activeSeconds:chosen.reduce((sum,page) => sum+page.avgActiveSeconds,0),isReturning:index%3===0,paths:chosen.map((page,i) => ({path:page.path,title:page.title,activeSeconds:page.avgActiveSeconds,scrollDepth:[100,91,63][i%3]}))}; });
    return {range:{...range,timeZone:'Asia/Seoul',previousTo:shiftDate(range.from,-1),previousFrom:shiftDate(range.from,-range.days)},filters:{path:state.path,source:selectedSource,device:selectedDevice},generatedAt:new Date().toISOString(),summary,previousSummary,series,pages,channels,referrers,campaigns:[{source:'newsletter',medium:'email',campaign:'research-letter-october',views:Math.round(views*.08),visitors:Math.round(visitors*.08)},{source:'linkedin',medium:'social',campaign:'msds-guide',views:Math.round(views*.04),visitors:Math.round(visitors*.04)}],countries:split('country',['KR','US','GB','JP'],[.89,.05,.04,.02]),devices,browsers:split('browser',['Chrome','Safari','Samsung Internet','Edge'],[.62,.23,.09,.06]),heatmap,journeys,clicks:[{linkHost:'msds.oehnps.co.uk',linkType:'msds',clicks:summary.msdsClicks}],meta:{retentionDays:395,anonymous:true,consentRequired:true,demo:true}};
  }

  $('#filters').addEventListener('submit',event => { event.preventDefault(); loadReport(); });
  $$('.preset-group button').forEach(button => button.addEventListener('click',() => { preset(button.dataset.days); loadReport(); }));
  ['from','to'].forEach(id => $(`#${id}`).addEventListener('change',() => $$('.preset-group button').forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed','false'); })));
  ['source','device'].forEach(id => $(`#${id}`).addEventListener('change',loadReport));
  $('#refresh').addEventListener('click',loadReport); $('#retry').addEventListener('click',loadReport);
  $('#export').addEventListener('click',downloadCSV);
  $('#path-filter button').addEventListener('click',() => { state.path=''; loadReport(); });
  $('#reset').addEventListener('click',() => { state.path=''; $('#source').value=''; $('#device').value=''; loadReport(); });
  $('#post-search').addEventListener('input',() => { if(state.report) renderPosts(); });
  $$('.post-table [data-sort]').forEach(button => button.addEventListener('click',() => { if(!state.report) return; state.sortDirection=state.sort===button.dataset.sort ? -state.sortDirection:-1; state.sort=button.dataset.sort; renderPosts(); }));
  $$('.chart-tabs button').forEach(button => button.addEventListener('click',() => { state.metric=button.dataset.metric; if(state.report) renderChart(); }));
  $$('.sidebar nav a').forEach(link => link.addEventListener('click',() => { $$('.sidebar nav a').forEach(item => item.classList.toggle('active',item===link)); }));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { const visible=entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top); if(visible[0]) $$('.sidebar nav a').forEach(link => { const active=link.hash===`#${visible[0].target.id}`; link.classList.toggle('active',active); if(active) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); }); },{rootMargin:'-5% 0px -60% 0px',threshold:0});
    ['overview','content','acquisition','audience','journeys'].forEach(id => observer.observe($(`#${id}`)));
  }
  $('#from').max=koreanToday(); $('#to').max=koreanToday();
  if(state.demo) { document.body.classList.add('demo-mode'); $('#demo-banner').hidden=false; }
  $('#kpis').innerHTML=kpiSpecs.map(spec => `<article class="kpi"><h2 class="kpi-title">${spec.label}</h2><p class="kpi-value loading-shimmer">—</p><div class="kpi-change">직전 기간 비교</div></article>`).join('');
  preset('30'); loadReport();
})();

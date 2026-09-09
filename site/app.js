(() => {
  const cfg = window.NFL_FM_CONFIG || {};
  const client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const el = id => document.getElementById(id);
  let session = JSON.parse(localStorage.getItem('nflfm_session') || 'null');
  let state = null;
  let pool = null;

  const POS = ['QB','RB','WR','PASS','RUSH','DEF','ST'];
  const labels = {QB:'Quarterback',RB:'Running Back',WR:'Wide Receiver',PASS:'Passing Offense',RUSH:'Rushing Offense',DEF:'Defense',ST:'Special Teams / Kicker'};
  const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pct = n => `${Number(n||0).toFixed(1)}`;

  async function call(action, payload={}) {
    const body = {...payload, action, token: session?.token || null};
    const {data,error} = await client.functions.invoke('api',{body});
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || 'Unbekannter Fehler');
    return data;
  }

  function showAuth(){ el('authView').hidden=false; el('gameView').hidden=true; }
  function showGame(){ el('authView').hidden=true; el('gameView').hidden=false; }
  function persist(){ localStorage.setItem('nflfm_session', JSON.stringify(session)); }

  async function boot(){
    if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('PASTE_')) { el('seasonStatus').textContent='Konfiguration fehlt'; return; }
    try {
      if(session?.token){ await loadState(); showGame(); } else showAuth();
    } catch(e){ console.error(e); localStorage.removeItem('nflfm_session'); session=null; showAuth(); }
  }

  async function loadState(){
    const d = await call('state');
    state=d.state; pool=d.pool;
    render();
  }

  function currentLineup(){
    return state?.my_lineup || {QB:null,RB:null,WR:null,PASS:null,RUSH:null,DEF:null,ST:null,captain:null};
  }

  function render(){
    const s=state;
    el('seasonStatus').textContent=`NFL ${s.season} · Woche ${s.week}`;
    el('leagueTitle').textContent=s.league.name;
    el('leagueCode').textContent=s.league.code;
    el('managerCount').textContent=`${s.managers.length}/4`;
    el('weekNumber').textContent=s.week;
    const locked=s.is_locked;
    el('lockText').textContent=locked?'🔒 Spieltag gesperrt':'✅ Aufstellung offen';
    el('lockText').className='locktext '+(locked?'warn':'ok');
    el('lockSub').textContent=locked?`Gestartet am ${new Date(s.first_game_at).toLocaleString('de-DE')}:00`:`Erstes Spiel: ${new Date(s.first_game_at).toLocaleString('de-DE')}`;
    el('lineupVisibility').textContent=locked?'Alle vier Aufstellungen sind jetzt sichtbar.':'Die Aufstellungen der anderen werden bis zum ersten Kickoff verborgen.';
    el('dataUpdated').textContent=s.data_last_synced_at ? `Daten: ${new Date(s.data_last_synced_at).toLocaleString('de-DE')}` : 'Daten werden geladen';
    el('playerPoolInfo').textContent=`${pool.players.length} Spieler mit aktuellem NFL-Team · ${pool.teams.length} Teams`;
    renderForm(); renderLeaderboard(); renderOtherLineups();
    el('saveLineupBtn').disabled=locked;
    if(locked && s.my_lineup?.auto_copied) el('saveState').textContent='Vorwoche wurde automatisch übernommen';
  }

  function selectOptions(pos, selected){
    const players = pool.players.filter(p => p.position===pos).sort((a,b)=>a.name.localeCompare(b.name));
    return `<option value="">Bitte auswählen</option>` + players.map(p=>`<option value="${escapeHtml(p.player_id)}" ${p.player_id===selected?'selected':''}>${escapeHtml(p.name)} · ${escapeHtml(p.team||'FA')}</option>`).join('');
  }
  function teamOptions(selected){
    return `<option value="">Bitte auswählen</option>` + pool.teams.map(t=>`<option value="${t.code}" ${t.code===selected?'selected':''}>${escapeHtml(t.name)} (${t.code})</option>`).join('');
  }
  function usedCount(key, value){ return state.usage?.[key]?.[value] || 0; }

  function renderForm(){
    const l=currentLineup();
    const rows=[
      ['QB','player','QB'],['RB','player','RB'],['WR','player','WR'],
      ['PASS','team','PASS'],['RUSH','team','RUSH'],['DEF','team','DEF'],['ST','team','ST']
    ];
    el('lineupForm').innerHTML = rows.map(([key,type,pos]) => {
      const opts=type==='player'?selectOptions(pos,l[key]):teamOptions(l[key]);
      const value=l[key]; const count=value?usedCount(key,value):0;
      return `<div class="row"><label>${labels[key]}</label><select class="choice lineup-choice" data-key="${key}" ${state.is_locked?'disabled':''}>${opts}</select><span class="tiny">${count}/5</span></div>`;
    }).join('') + `
      <div class="row"><label>Kapitän</label><select id="captainChoice" class="choice" ${state.is_locked?'disabled':''}>
        <option value="">Bitte auswählen</option>
        ${['QB','RB','WR'].map(k=>l[k]?`<option value="${k}" ${l.captain===k?'selected':''}>${labels[k]}</option>`:'').join('')}
      </select><span class="tiny">×2 Punkte</span></div>`;
  }

  async function saveLineup(){
    const lineup={}; document.querySelectorAll('.lineup-choice').forEach(s=>lineup[s.dataset.key]=s.value||null); lineup.captain=el('captainChoice').value||null;
    el('saveLineupBtn').disabled=true; el('saveState').textContent='Speichere…';
    try { await call('save_lineup',{lineup}); await loadState(); el('saveState').textContent='Gespeichert'; } catch(e){ alert(e.message); el('saveLineupBtn').disabled=false; el('saveState').textContent=''; }
  }

  function renderLeaderboard(){
    const rows=[...state.leaderboard].sort((a,b)=>b.total_points-a.total_points);
    el('leaderboard').innerHTML=rows.map((r,i)=>`<div class="row"><label>${i+1}. ${escapeHtml(r.name)}</label><span>${pct(r.total_points)} Punkte</span><span class="tiny">W${pct(r.week_points)}</span></div>`).join('');
  }

  function renderOtherLineups(){
    const list=state.visible_lineups || [];
    if(!state.is_locked){ el('otherLineups').innerHTML='<div class="note">🔒 Versteckt bis zum ersten Spiel des Spieltags.</div>'; return; }
    el('otherLineups').innerHTML=list.map(m=>`<div class="manager"><div class="muted">${escapeHtml(m.name)} · Woche ${state.week}</div><div class="score">${pct(m.points)} Pkt.</div><div class="tiny">QB: ${escapeHtml(m.display.QB)} · RB: ${escapeHtml(m.display.RB)} · WR: ${escapeHtml(m.display.WR)}<br>PASS: ${escapeHtml(m.display.PASS)} · RUSH: ${escapeHtml(m.display.RUSH)} · DEF: ${escapeHtml(m.display.DEF)} · ST: ${escapeHtml(m.display.ST)}<br>Kapitän: ${escapeHtml(m.display.captain)}</div></div>`).join('');
  }

  el('createBtn').addEventListener('click',async()=>{
    try{
      const d=await call('create_league',{league_name:el('createLeagueName').value.trim(),manager_name:el('createManagerName').value.trim(),pin:el('createPin').value.trim()});
      session={token:d.token}; persist(); await loadState(); showGame();
      alert(`Liga erstellt!\n\nLiga-Code: ${d.code}\n\nDiesen Code bitte an die drei Mitspieler weitergeben.`);
    }catch(e){alert(e.message)}
  });
  el('loginBtn').addEventListener('click',async()=>{
    try{
      const d=await call('login',{code:el('loginCode').value.trim().toUpperCase(),manager_name:el('loginName').value.trim(),pin:el('loginPin').value.trim()});
      session={token:d.token}; persist(); await loadState(); showGame();
    }catch(e){alert(e.message)}
  });
  el('joinBtn').addEventListener('click',async()=>{
    try{
      const d=await call('join_league',{code:el('joinCode').value.trim().toUpperCase(),manager_name:el('joinName').value.trim(),pin:el('joinPin').value.trim()});
      session={token:d.token}; persist(); await loadState(); showGame();
    }catch(e){alert(e.message)}
  });
  el('saveLineupBtn').addEventListener('click',saveLineup);
  el('refreshBtn').addEventListener('click',()=>loadState().catch(e=>alert(e.message)));
  el('logoutBtn').addEventListener('click',()=>{localStorage.removeItem('nflfm_session');session=null;showAuth()});
  boot();
  setInterval(()=>{ if(session) loadState().catch(()=>{}); }, 60000);
})();

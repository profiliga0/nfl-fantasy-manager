import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const SERVICE_ROLE_KEY = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const TEAM_NAMES: Record<string,string> = {
  ARI:'Arizona Cardinals', ATL:'Atlanta Falcons', BAL:'Baltimore Ravens', BUF:'Buffalo Bills', CAR:'Carolina Panthers', CHI:'Chicago Bears', CIN:'Cincinnati Bengals', CLE:'Cleveland Browns', DAL:'Dallas Cowboys', DEN:'Denver Broncos', DET:'Detroit Lions', GB:'Green Bay Packers', HOU:'Houston Texans', IND:'Indianapolis Colts', JAX:'Jacksonville Jaguars', KC:'Kansas City Chiefs', LAC:'Los Angeles Chargers', LAR:'Los Angeles Rams', LV:'Las Vegas Raiders', MIA:'Miami Dolphins', MIN:'Minnesota Vikings', NE:'New England Patriots', NO:'New Orleans Saints', NYG:'New York Giants', NYJ:'New York Jets', PHI:'Philadelphia Eagles', PIT:'Pittsburgh Steelers', SF:'San Francisco 49ers', SEA:'Seattle Seahawks', TB:'Tampa Bay Buccaneers', TEN:'Tennessee Titans', WAS:'Washington Commanders'
};
const TEAM_CODES = Object.keys(TEAM_NAMES);
const PLAYER_SLOTS = ['QB','RB','WR'];
const TEAM_SLOTS = ['PASS','RUSH','DEF','ST'];
const ALL_SLOTS = ['QB','RB','WR','PASS','RUSH','DEF','ST'];

function json(data: unknown, status=200){ return new Response(JSON.stringify(data), {status, headers}); }
function err(message: string, status=400){ return json({ok:false,error:message}, status); }
function now(){ return new Date(); }
function b64(bytes: Uint8Array){ let s=''; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function randomToken(){ const bytes=new Uint8Array(32); crypto.getRandomValues(bytes); return b64(bytes); }
async function sha256(text: string){ const buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return b64(new Uint8Array(buf)); }
async function hashPin(pin:string,salt:string){ return sha256(`${salt}:${pin}`); }
function cleanName(x:any){ return String(x||'').trim().replace(/\s+/g,' ').slice(0,40); }
function cleanCode(x:any){ return String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8); }
function validPin(x:any){ return /^\d{4,12}$/.test(String(x||'')); }

async function sleeper(path:string, fallbackPath?:string){
  const urls=[`https://api.sleeper.app${path}`, fallbackPath ? `https://api.sleeper.com${fallbackPath}` : null].filter(Boolean) as string[];
  let last='';
  for(const u of urls){
    try{ const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(30000)}); if(r.ok)return await r.json(); last=`${r.status} ${r.statusText}`; }catch(e){ last=String(e); }
  }
  throw new Error(`Sleeper nicht erreichbar: ${last}`);
}

async function getSession(token:string){
  if(!token) throw new Error('Sitzung fehlt.');
  const th=await sha256(token);
  const {data,error}=await db.from('sessions').select('token_hash,manager_id,expires_at').eq('token_hash',th).maybeSingle();
  if(error||!data) throw new Error('Sitzung ungültig.');
  if(new Date(data.expires_at) <= now()) throw new Error('Sitzung abgelaufen.');
  const {data:m,error:me}=await db.from('managers').select('*').eq('id',data.manager_id).single();
  if(me||!m) throw new Error('Spieler nicht gefunden.');
  return m;
}

async function currentNflState(){ return await sleeper('/v1/state/nfl'); }
async function firstGameAt(season:number,week:number){
  const {data,error}=await db.from('schedules').select('starts_at').eq('season',season).eq('week',week).order('starts_at',{ascending:true}).limit(1);
  if(error) throw error;
  return data?.[0]?.starts_at || null;
}
async function seasonContext(){
  const s=await currentNflState();
  return {season:Number(s.season),week:Number(s.week),season_type:s.season_type,display_week:Number(s.display_week||s.week)};
}

function emptyLineup(){ return {QB:null,RB:null,WR:null,PASS:null,RUSH:null,DEF:null,ST:null,captain:null}; }
function normalizeLineup(x:any){ const l=emptyLineup(); for(const k of ALL_SLOTS) l[k]=x?.[k]||null; l.captain=x?.captain||null; return l; }
function isComplete(l:any){ return ALL_SLOTS.every(k=>!!l[k]) && ['QB','RB','WR'].includes(l.captain); }

async function materializeLocks(leagueId:string, season:number, week:number, firstAt:string|null){
  if(!firstAt || new Date(firstAt)>now()) return;
  const {data:managers,error:me}=await db.from('managers').select('id,name').eq('league_id',leagueId).order('created_at',{ascending:true});
  if(me) throw me;
  for(const m of managers||[]){
    const {data:existing,error:ee}=await db.from('lineups').select('*').eq('league_id',leagueId).eq('manager_id',m.id).eq('season',season).eq('week',week).maybeSingle();
    if(ee) throw ee;
    if(existing){ if(!existing.locked_at) await db.from('lineups').update({locked_at:firstAt}).eq('id',existing.id); continue; }
    let source:any=null;
    if(week>1){
      const {data:prev}=await db.from('lineups').select('*').eq('league_id',leagueId).eq('manager_id',m.id).eq('season',season).lt('week',week).order('week',{ascending:false}).limit(1).maybeSingle();
      source=prev;
    }
    const l=source ? normalizeLineup(source) : emptyLineup();
    await db.from('lineups').upsert({league_id:leagueId,manager_id:m.id,season,week,qb:l.QB,rb:l.RB,wr:l.WR,pass_team:l.PASS,rush_team:l.RUSH,defense_team:l.DEF,st_team:l.ST,captain:l.captain,submitted_at:null,auto_copied:!!source,locked_at:firstAt},{onConflict:'league_id,manager_id,season,week'});
  }
}

async function ensureData(){
  const {count}=await db.from('players').select('*',{count:'exact',head:true});
  if((count||0)<100) throw new Error('Spielerdaten sind noch nicht synchronisiert. Bitte zuerst die Sync-Funktion ausführen.');
}

function statNum(o:any,key:string){ const n=Number(o?.[key]??0); return Number.isFinite(n)?n:0; }
function individualPoints(st:any){
  return statNum(st,'pass_yd')/25 + statNum(st,'rush_yd')/10 + statNum(st,'rec_yd')/10 + 6*(statNum(st,'pass_td')+statNum(st,'rush_td')+statNum(st,'rec_td')) + 2*(statNum(st,'pass_2pt')+statNum(st,'rush_2pt')+statNum(st,'rec_2pt')) - 2*(statNum(st,'fum_lost')+statNum(st,'pass_int'));
}
function passingPoints(t:any){ return statNum(t,'pass_yards')/25 + 6*statNum(t,'pass_tds') + 2*statNum(t,'pass_2pt') - 2*statNum(t,'pass_fumbles'); }
function rushingPoints(t:any){ return statNum(t,'rush_yards')/10 + 6*statNum(t,'rush_tds') + 2*statNum(t,'rush_2pt') - 2*statNum(t,'rush_fumbles'); }
function defensePoints(t:any){
  const pa=statNum(t,'def_points_allowed'); const base=pa===0?10:(pa<=9?6:(pa<=20?3:0));
  return base + 2*(statNum(t,'def_interceptions')+statNum(t,'def_fumbles')) + statNum(t,'sacks') + 2*statNum(t,'safeties') + 6*statNum(t,'def_tds');
}
function stPoints(t:any){ return 2*statNum(t,'pats') + 3*statNum(t,'fg_0_49') + 5*statNum(t,'fg_50_plus') + 6*statNum(t,'return_tds'); }

async function getUsage(leagueId:string,managerId:string,season:number){
  const {data,error}=await db.from('lineups').select('qb,rb,wr,pass_team,rush_team,defense_team,st_team').eq('league_id',leagueId).eq('manager_id',managerId).eq('season',season);
  if(error) throw error;
  const u:any={QB:{},RB:{},WR:{},PASS:{},RUSH:{},DEF:{},ST:{}};
  for(const r of data||[]){
    for(const [k,col] of Object.entries({QB:'qb',RB:'rb',WR:'wr',PASS:'pass_team',RUSH:'rush_team',DEF:'defense_team',ST:'st_team'})){
      const v=(r as any)[col]; if(v) u[k][v]=(u[k][v]||0)+1;
    }
  }
  return u;
}
async function lookupNames(lineup:any){
  const playerIds=[lineup.qb,lineup.rb,lineup.wr].filter(Boolean);
  const names:any={};
  if(playerIds.length){
    const {data}=await db.from('players').select('player_id,name,team').in('player_id',playerIds);
    for(const p of data||[]) names[p.player_id]=`${p.name}${p.team?` (${p.team})`:''}`;
  }
  return {
    QB:names[lineup.qb]||'—',RB:names[lineup.rb]||'—',WR:names[lineup.wr]||'—',
    PASS:TEAM_NAMES[lineup.pass_team]||lineup.pass_team||'—',RUSH:TEAM_NAMES[lineup.rush_team]||lineup.rush_team||'—',DEF:TEAM_NAMES[lineup.defense_team]||lineup.defense_team||'—',ST:TEAM_NAMES[lineup.st_team]||lineup.st_team||'—',
    captain: lineup.captain ? labelsFromSlot(lineup.captain) : '—'
  };
}
function labelsFromSlot(k:string){ return ({QB:'Quarterback',RB:'Running Back',WR:'Wide Receiver'} as any)[k]||k; }

async function scoreLineup(lineup:any,season:number,week:number){
  if(!lineup) return {points:0,details:{}};
  const {data:ps}=await db.from('weekly_player_stats').select('player_id,fantasy_points').eq('season',season).eq('week',week).in('player_id',[lineup.qb,lineup.rb,lineup.wr].filter(Boolean));
  const pm:any={}; for(const p of ps||[])pm[p.player_id]=Number(p.fantasy_points||0);
  const {data:ts}=await db.from('weekly_team_stats').select('*').eq('season',season).in('team',[lineup.pass_team,lineup.rush_team,lineup.defense_team,lineup.st_team].filter(Boolean));
  const tm:any={}; for(const t of ts||[])tm[t.team]=t;
  const parts:any={QB:pm[lineup.qb]||0,RB:pm[lineup.rb]||0,WR:pm[lineup.wr]||0,PASS:tm[lineup.pass_team]?passingPoints(tm[lineup.pass_team]):0,RUSH:tm[lineup.rush_team]?rushingPoints(tm[lineup.rush_team]):0,DEF:tm[lineup.defense_team]?defensePoints(tm[lineup.defense_team]):0,ST:tm[lineup.st_team]?stPoints(tm[lineup.st_team]):0};
  let total=Object.values(parts).reduce((a:any,b:any)=>a+Number(b||0),0);
  if(lineup.captain && parts[lineup.captain]!=null){ total += Number(parts[lineup.captain]||0); parts[`${lineup.captain}_captain_bonus`]=Number(parts[lineup.captain]||0); }
  return {points:total,details:parts};
}

async function getLeagueState(manager:any){
  await ensureData();
  const leagueId=manager.league_id;
  const {data:league,error:le}=await db.from('leagues').select('*').eq('id',leagueId).single(); if(le)throw le;
  const ctx=await seasonContext();
  const week=ctx.week;
  const firstAt=await firstGameAt(ctx.season,week);
  const locked=!!firstAt && new Date(firstAt)<=now();
  await materializeLocks(leagueId,ctx.season,week,firstAt);

  const {data:managers}=await db.from('managers').select('id,name').eq('league_id',leagueId).order('created_at',{ascending:true});
  const {data:mine}=await db.from('lineups').select('*').eq('league_id',leagueId).eq('manager_id',manager.id).eq('season',ctx.season).eq('week',week).maybeSingle();
  const myLineup=mine?{QB:mine.qb,RB:mine.rb,WR:mine.wr,PASS:mine.pass_team,RUSH:mine.rush_team,DEF:mine.defense_team,ST:mine.st_team,captain:mine.captain,auto_copied:mine.auto_copied,submitted_at:mine.submitted_at}:emptyLineup();
  const usage=await getUsage(leagueId,manager.id,ctx.season);

  const totals:any={};
  for(const m of managers||[]){
    const {data:ls}=await db.from('lineups').select('*').eq('league_id',leagueId).eq('manager_id',m.id).eq('season',ctx.season).lte('week',week);
    let total=0,weekPoints=0;
    for(const l of ls||[]){ const sc=await scoreLineup(l,ctx.season,l.week); total+=sc.points; if(l.week===week) weekPoints=sc.points; }
    totals[m.id]={name:m.name,total_points:total,week_points:weekPoints};
  }
  const leaderboard=Object.values(totals);

  let visibleLineups:any[]=[];
  if(locked){
    const {data:ls}=await db.from('lineups').select('*').eq('league_id',leagueId).eq('season',ctx.season).eq('week',week);
    for(const l of ls||[]){
      const mgr=(managers||[]).find(x=>x.id===l.manager_id); const sc=await scoreLineup(l,ctx.season,week); const display=await lookupNames(l);
      visibleLineups.push({name:mgr?.name||'—',points:sc.points,display,auto_copied:l.auto_copied});
    }
  }
  const {data:lastSync}=await db.from('app_meta').select('value,updated_at').eq('key','last_sync').maybeSingle();
  const {data:players}=await db.from('players').select('player_id,name,position,team,active,fantasy_positions').in('position',['QB','RB','WR']).not('team','is',null).limit(5000);
  const playerList=(players||[]).map(p=>({player_id:p.player_id,name:p.name,position:p.position,team:p.team,active:p.active}));
  const teams=TEAM_CODES.map(code=>({code,name:TEAM_NAMES[code]}));
  return {league:{id:league.id,name:league.name,code:league.code},season:ctx.season,week,first_game_at:firstAt,is_locked:locked,managers,me:{id:manager.id,name:manager.name},my_lineup:myLineup,usage,leaderboard,visible_lineups:visibleLineups,pool:{players:playerList,teams},data_last_synced_at:lastSync?.updated_at||null};
}

async function createLeague(body:any){
  const leagueName=cleanName(body.league_name)||'NFL Fantasy Liga'; const managerName=cleanName(body.manager_name); const pin=String(body.pin||'');
  if(!managerName) throw new Error('Bitte einen Namen eingeben.'); if(!validPin(pin)) throw new Error('PIN muss 4 bis 12 Ziffern haben.');
  const ctx=await seasonContext();
  let code='';
  for(let i=0;i<20;i++){ code=b64(crypto.getRandomValues(new Uint8Array(6))).replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6); if(code.length<6) continue; const {data}=await db.from('leagues').select('id').eq('code',code).maybeSingle(); if(!data) break; }
  const {data:league,error}=await db.from('leagues').insert({code,name:leagueName,season:ctx.season,max_players:4}).select('*').single(); if(error)throw error;
  const salt=randomToken(); const pinHash=await hashPin(pin,salt);
  const {data:m,error:me}=await db.from('managers').insert({league_id:league.id,name:managerName,pin_hash:pinHash,pin_salt:salt}).select('*').single(); if(me)throw me;
  const token=randomToken(); const th=await sha256(token);
  await db.from('sessions').insert({token_hash:th,manager_id:m.id,expires_at:new Date(Date.now()+180*864e5).toISOString()});
  return {token,code:league.code};
}

async function joinLeague(body:any){
  const code=cleanCode(body.code), managerName=cleanName(body.manager_name), pin=String(body.pin||'');
  if(!code||!managerName||!validPin(pin)) throw new Error('Bitte Liga-Code, Namen und 4–12-stellige PIN eingeben.');
  const {data:league,error:le}=await db.from('leagues').select('*').eq('code',code).maybeSingle(); if(le)throw le; if(!league)throw new Error('Liga-Code nicht gefunden.');
  const {count}=await db.from('managers').select('*',{count:'exact',head:true}).eq('league_id',league.id); if((count||0)>=4)throw new Error('Diese Liga ist bereits voll.');
  const {data:exists}=await db.from('managers').select('id').eq('league_id',league.id).eq('name',managerName).maybeSingle(); if(exists)throw new Error('Diesen Namen gibt es in der Liga bereits.');
  const salt=randomToken(); const pinHash=await hashPin(pin,salt);
  const {data:m,error:me}=await db.from('managers').insert({league_id:league.id,name:managerName,pin_hash:pinHash,pin_salt:salt}).select('*').single(); if(me)throw me;
  const token=randomToken(); const th=await sha256(token);
  await db.from('sessions').insert({token_hash:th,manager_id:m.id,expires_at:new Date(Date.now()+180*864e5).toISOString()});
  return {token};
}

async function login(body:any){
  const code=cleanCode(body.code),name=cleanName(body.manager_name),pin=String(body.pin||'');
  const {data:league}=await db.from('leagues').select('*').eq('code',code).maybeSingle(); if(!league)throw new Error('Liga-Code nicht gefunden.');
  const {data:m}=await db.from('managers').select('*').eq('league_id',league.id).eq('name',name).maybeSingle(); if(!m)throw new Error('Spielername oder PIN falsch.');
  const ok=await hashPin(pin,m.pin_salt)===m.pin_hash; if(!ok)throw new Error('Spielername oder PIN falsch.');
  const token=randomToken(); await db.from('sessions').insert({token_hash:await sha256(token),manager_id:m.id,expires_at:new Date(Date.now()+180*864e5).toISOString()}); return {token};
}

async function saveLineup(manager:any,body:any){
  const ctx=await seasonContext(); const firstAt=await firstGameAt(ctx.season,ctx.week); if(firstAt && new Date(firstAt)<=now())throw new Error('Der Spieltag ist bereits gestartet. Die Aufstellung ist gesperrt.');
  const l=normalizeLineup(body.lineup);
  if(!isComplete(l))throw new Error('Bitte alle 7 Positionen auswählen und einen Kapitän bestimmen.');
  if(!PLAYER_SLOTS.every(k=>l[k]))throw new Error('QB, RB und WR müssen belegt sein.');
  const {data:ps}=await db.from('players').select('player_id,position,team').in('player_id',[l.QB,l.RB,l.WR]);
  for(const slot of PLAYER_SLOTS){ const p=(ps||[]).find(x=>x.player_id===l[slot]); if(!p || p.position!==slot)throw new Error(`${slot} Auswahl ist ungültig oder nicht mehr aktuell.`); }
  for(const k of TEAM_SLOTS){ if(!TEAM_CODES.includes(l[k]))throw new Error(`${k} Team ist ungültig.`); }
  if(new Set([l.PASS,l.RUSH,l.DEF,l.ST]).size!==4)throw new Error('Passing Offense, Rushing Offense, Defense und Special Teams müssen vier verschiedene Teams sein.');
  const usage=await getUsage(manager.league_id,manager.id,ctx.season);
  for(const k of ALL_SLOTS){ const v=l[k]; const old=(await db.from('lineups').select('*').eq('league_id',manager.league_id).eq('manager_id',manager.id).eq('season',ctx.season).eq('week',ctx.week).maybeSingle()).data; const oldVal=old?({QB:old.qb,RB:old.rb,WR:old.wr,PASS:old.pass_team,RUSH:old.rush_team,DEF:old.defense_team,ST:old.st_team} as any)[k]:null; const projected=(usage as any)[k]?.[v]||0; const alreadyCounted=oldVal===v?1:0; if(projected-alreadyCounted>=5) throw new Error(`${labelsFromSlot(k)} / ${TEAM_NAMES[v]||v} wurde bereits 5-mal eingesetzt.`); }
  const {data:existing}=await db.from('lineups').select('id').eq('league_id',manager.league_id).eq('manager_id',manager.id).eq('season',ctx.season).eq('week',ctx.week).maybeSingle();
  const row={league_id:manager.league_id,manager_id:manager.id,season:ctx.season,week:ctx.week,qb:l.QB,rb:l.RB,wr:l.WR,pass_team:l.PASS,rush_team:l.RUSH,defense_team:l.DEF,st_team:l.ST,captain:l.captain,submitted_at:now().toISOString(),auto_copied:false,locked_at:null};
  if(existing) await db.from('lineups').update(row).eq('id',existing.id); else await db.from('lineups').insert(row);
  return {saved:true};
}



const TEAM_CODES_SYNC=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'];
function statNumSync(o:any,k:string){const v=Number(o?.[k]??0);return Number.isFinite(v)?v:0;}
function teamStatSync(){return {pass_yards:0,pass_tds:0,pass_2pt:0,pass_fumbles:0,rush_yards:0,rush_tds:0,rush_2pt:0,rush_fumbles:0,rec_yards:0,rec_tds:0,def_points_allowed:0,def_interceptions:0,def_fumbles:0,sacks:0,safeties:0,def_tds:0,pats:0,fg_0_49:0,fg_50_plus:0,return_tds:0};}
function indivPointsSync(st:any){return statNumSync(st,'pass_yd')/25+statNumSync(st,'rush_yd')/10+statNumSync(st,'rec_yd')/10+6*(statNumSync(st,'pass_td')+statNumSync(st,'rush_td')+statNumSync(st,'rec_td'))+2*(statNumSync(st,'pass_2pt')+statNumSync(st,'rush_2pt')+statNumSync(st,'rec_2pt'))-2*(statNumSync(st,'fum_lost')+statNumSync(st,'pass_int'));}
async function syncFetch(urls:string[]){let last='';for(const u of urls){try{const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(60000)});if(r.ok)return await r.json();last=`${r.status} ${r.statusText}`}catch(e){last=String(e)}}throw new Error(last||'Sleeper API Fehler');}
async function syncPlayersNow(){
  const data=await syncFetch(['https://api.sleeper.app/v1/players/nfl']); const rows:any[]=[];
  for(const [id,p] of Object.entries(data||{})){const x:any=p;const pos=String(x.position||'');if(!['QB','RB','WR','TE','K','DEF'].includes(pos)||!x.team)continue;rows.push({player_id:id,name:[x.first_name,x.last_name].filter(Boolean).join(' ')||x.full_name||id,first_name:x.first_name||null,last_name:x.last_name||null,position:pos,team:x.team,active:Boolean(x.active),fantasy_positions:x.fantasy_positions||[],updated_at:new Date().toISOString()});}
  for(let i=0;i<rows.length;i+=500){const {error}=await db.from('players').upsert(rows.slice(i,i+500),{onConflict:'player_id'});if(error)throw error;}
  const t=TEAM_CODES_SYNC.map(code=>({code,name:code,updated_at:new Date().toISOString()})); await db.from('teams').upsert(t,{onConflict:'code'}); return rows.length;
}
function normalizeKickoff(value:any){
  if(value==null) return null;
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function syncWeekNow(season:number,week:number){
  // Use ESPN's published NFL scoreboard for the canonical kickoff timestamp.
  // Sleeper remains the source for player/stat data. Keeping starts_at as a
  // timestamptz in UTC means the UI can safely convert to Europe/Berlin and
  // automatically handle CET/CEST daylight-saving changes.
  const espn=await syncFetch([`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`]);
  const schedRows=(Array.isArray(espn?.events)?espn.events:[]).map((g:any)=>{
    const c=g?.competitions?.[0];
    const competitors=Array.isArray(c?.competitors)?c.competitors:[];
    const home=competitors.find((x:any)=>x.homeAway==='home')?.team?.abbreviation;
    const away=competitors.find((x:any)=>x.homeAway==='away')?.team?.abbreviation;
    const startsAt=normalizeKickoff(g?.date || c?.date);
    if(!g?.id || !home || !away || !startsAt) return null;
    return {season,week,game_id:String(g.id),starts_at:startsAt,home,away,status:c?.status?.type?.state || g?.status?.type?.state || null};
  }).filter(Boolean);
  if(!schedRows.length) throw new Error(`Kein vollständiger Spielplan für NFL ${season}, Woche ${week} gefunden.`);
  const {error}=await db.from('schedules').upsert(schedRows,{onConflict:'season,game_id'});
  if(error)throw error;
  const stats=await syncFetch([`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular`]);
  const pRows:any[]=[];const team:any={};
  for(const [pid,row] of Object.entries(stats||{})){const x:any=row;const st=x.stats||x;const teamCode=x.team||st.team||null;if(!teamCode)continue;pRows.push({season,week,player_id:String(pid),team:teamCode,raw_stats:st,fantasy_points:indivPointsSync(st),updated_at:new Date().toISOString()});if(!team[teamCode])team[teamCode]=teamStatSync();const t=team[teamCode];
    t.pass_yards+=statNumSync(st,'pass_yd');t.pass_tds+=statNumSync(st,'pass_td');t.pass_2pt+=statNumSync(st,'pass_2pt');t.pass_fumbles+=statNumSync(st,'fum_lost');
    t.rush_yards+=statNumSync(st,'rush_yd');t.rush_tds+=statNumSync(st,'rush_td');t.rush_2pt+=statNumSync(st,'rush_2pt');t.rush_fumbles+=statNumSync(st,'fum_lost');
    t.rec_yards+=statNumSync(st,'rec_yd');t.rec_tds+=statNumSync(st,'rec_td');t.pats+=statNumSync(st,'xpm');t.fg_0_49+=statNumSync(st,'fgm_0_19')+statNumSync(st,'fgm_20_29')+statNumSync(st,'fgm_30_39')+statNumSync(st,'fgm_40_49');t.fg_50_plus+=statNumSync(st,'fgm_50p');t.return_tds+=statNumSync(st,'kr_td')+statNumSync(st,'pr_td')+statNumSync(st,'fum_td');t.def_interceptions+=statNumSync(st,'def_int')+statNumSync(st,'interception');t.def_fumbles+=statNumSync(st,'def_fum')+statNumSync(st,'fum_rec');t.sacks+=statNumSync(st,'def_sack')+statNumSync(st,'sack');t.safeties+=statNumSync(st,'safe');t.def_tds+=statNumSync(st,'def_td');t.def_points_allowed=Math.max(t.def_points_allowed,statNumSync(st,'pts_allow'));
  }
  for(let i=0;i<pRows.length;i+=500){const {error}=await db.from('weekly_player_stats').upsert(pRows.slice(i,i+500),{onConflict:'season,week,player_id'});if(error)throw error;}
  const teamRows=TEAM_CODES_SYNC.filter(c=>team[c]).map(code=>({season,week,team:code,...team[code],updated_at:new Date().toISOString()}));if(teamRows.length){const {error}=await db.from('weekly_team_stats').upsert(teamRows,{onConflict:'season,week,team'});if(error)throw error;}
  return {games:schedRows.length,players:pRows.length,teams:teamRows.length};
}
async function runSync(job:string){const s=await syncFetch(['https://api.sleeper.app/v1/state/nfl']);const season=Number(s.season),week=Number(s.week);const out:any={season,week};if(job==='players'||job==='all')out.players=await syncPlayersNow();if(job==='weekly'||job==='all'){out.current=await syncWeekNow(season,week);if(week>1)out.previous=await syncWeekNow(season,week-1);}await db.from('app_meta').upsert({key:'last_sync',value:out,updated_at:new Date().toISOString()},{onConflict:'key'});return out;}

Deno.serve(async (req) => {
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  try{
    const body=await req.json(); const action=String(body.action||'');
    if(action==='create_league') return json({ok:true,...await createLeague(body)});
    if(action==='join_league') return json({ok:true,...await joinLeague(body)});
    if(action==='login') return json({ok:true,...await login(body)});
    if(action==='sync'){ const secret=Deno.env.get('SYNC_SECRET')||''; if(!secret || (req.headers.get('x-sync-secret')||'')!==secret) return err('Nicht autorisiert.',401); return json({ok:true,result:await runSync(String(body.job||'weekly'))}); }
    const manager=await getSession(String(body.token||''));
    if(action==='state') return json({ok:true,state:await getLeagueState(manager)});
    if(action==='save_lineup') return json({ok:true,...await saveLineup(manager,body)});
    return err('Unbekannte Aktion.',404);
  }catch(e){ console.error(e); return err(e instanceof Error?e.message:String(e),400); }
});

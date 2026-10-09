// ═══════════════════════════════════════════════════════════════
// LAVISTA CRM — 📞 TELECALLING MODULE
// Uses globals from index.html: sb, CU, USERS, escHtml
// Tables: tc_team, tc_leads, tc_call_logs  (see sql/telecaller.sql)
// ═══════════════════════════════════════════════════════════════

// Kis kis ko Telecalling tab dikhega (admin ko hamesha dikhta hai)
function tcHasAccess(u){ return !!u && (u.isAdmin || u.dept === "Sales"); }

const TC_OUT = {
  interested:     {t:"Interested",       s:"Budget match, details bheje",  fu:true,  rem:true},
  callback:       {t:"Callback",         s:"Busy tha, baad me call",       fu:true,  rem:false},
  rnr:            {t:"Not picked (RNR)", s:"Ring hua, uthaya nahi",        fu:true,  rem:false},
  site_visit:     {t:"Site visit fixed", s:"Visit ka date-time daalo",     fu:true,  rem:true},
  booked:         {t:"Booking done",     s:"Deal close 🎉",                fu:false, rem:true},
  not_interested: {t:"Not interested",   s:"Reason likho",                 fu:false, rem:true},
  wrong_number:   {t:"Wrong number",     s:"Invalid / galat lead",         fu:false, rem:false},
};
const TC_STATUS = {
  new:["New","#60a5fa","#1e3a5f"], interested:["Interested","#4ade80","#14532d"], callback:["Callback","#fbbf24","#3a2c0a"],
  rnr:["RNR","#fb923c","#431407"], site_visit:["Site visit","#c084fc","#2e1065"], booked:["Booked","#34d399","#064e3b"],
  not_interested:["Not interested","#f87171","#2d1a1a"], wrong_number:["Wrong no.","#f87171","#2d1a1a"], cold:["Cold","#9ca3af","#1f2937"],
  duplicate:["Duplicate","#9ca3af","#1f2937"], note:["Note","#9ca3af","#1f2937"],
};
const TC_CLOSED = ["not_interested","wrong_number","cold","booked"];
const TC_SOURCES = ["Meta Ad","Website","99acres","MagicBricks","Referral","Walk-in","Manual"];

const TC = { leads:[], logsToday:[], team:[], sub:"due", sel:null, pick:null, q:"",
             adFilter:{tc:"",status:"",source:""}, from:null, to:null };

// ── helpers ──
function tcStartOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function tcTomorrow(){const x=tcStartOfDay(new Date());x.setDate(x.getDate()+1);return x;}
function tcFmt(t){ if(!t) return "—"; const d=new Date(t);
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}); }
function tcIsoLocal(d){ return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,16); }
function tcDateKey(d){ return tcIsoLocal(d).slice(0,10); }
function tcOpen(l){ return !TC_CLOSED.includes(l.status); }
function tcDue(l){ return tcOpen(l) && l.next_followup_at && new Date(l.next_followup_at) < tcTomorrow(); }
function tcOver(l){ return tcDue(l) && new Date(l.next_followup_at) < new Date(); }
function tcUntouched(l){ return l.status==="new" && !l.last_called_at && (Date.now()-new Date(l.created_at)) > 30*60*1000; }
function tcPill(s){ const [t,c,b]=TC_STATUS[s]||[s,"#9ca3af","#1f2937"]; return `<span class="tc-pill" style="color:${c};background:${b}">${escHtml(t)}</span>`; }
function tcDigits(p){ return String(p||"").replace(/\D/g,"").slice(-10); }
function tcToast(m,err){ let t=document.getElementById("tcToast");
  if(!t){t=document.createElement("div");t.id="tcToast";document.body.appendChild(t);}
  t.textContent=m; t.className="tc-toast"+(err?" err":""); t.style.display="block";
  clearTimeout(t._h); t._h=setTimeout(()=>t.style.display="none",2600); }
function tcConnected(o){ return !["rnr","wrong_number","duplicate","note"].includes(o); }

// ── styles (CRM ke dark theme jaisa) ──
(function(){
  const s=document.createElement("style");
  s.textContent=`
.tc-pill{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;white-space:nowrap}
.tc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}
.tc-stat{background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:12px 14px}
.tc-stat b{display:block;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.tc-stat span{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.tc-stat.red b{color:#f87171}
.tc-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px;align-items:start}
@media(max-width:800px){.tc-grid{grid-template-columns:1fr}}
.tc-panel{background:#111118;border:1px solid #1e1e2e;border-radius:14px;min-width:0}
.tc-ph{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #1e1e2e}
.tc-ph h3{font-size:15px;font-weight:700}
.tc-chips{display:flex;gap:6px;flex-wrap:wrap}
.tc-chip{background:#1a1a2e;border:1px solid #2d2d44;border-radius:99px;padding:4px 11px;color:#9ca3af;font-size:12px;cursor:pointer}
.tc-chip.on{border-color:#7c3aed;color:#c4b5fd;background:#7c3aed22}
.tc-search{width:100%;background:#1a1a2e;border:1px solid #2d2d44;border-radius:8px;padding:8px 12px;color:#fff;font-size:13px;outline:none}
.tc-lead{padding:11px 14px;border-bottom:1px solid #1e1e2e;cursor:pointer;border-left:3px solid transparent;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px}
.tc-lead:hover{background:#1a1a2e}
.tc-lead.sel{background:#7c3aed14;border-left-color:#7c3aed}
.tc-lead .nm{font-weight:600;font-size:14px}
.tc-lead .mt{grid-column:1/-1;font-size:12px;color:#6b7280;display:flex;flex-wrap:wrap;gap:4px 12px}
.tc-due{font-variant-numeric:tabular-nums}
.tc-due.over{color:#f87171;font-weight:600}
.tc-empty{padding:30px 14px;text-align:center;color:#4b5563;font-size:13px}
.tc-det{padding:16px;display:grid;gap:14px}
.tc-who h2{font-size:20px;font-weight:800}
.tc-phone{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-variant-numeric:tabular-nums;color:#d1d5db}
.tc-btn{display:inline-block;text-decoration:none;background:#1a1a2e;border:1px solid #2d2d44;border-radius:8px;padding:7px 13px;color:#e5e7eb;font-size:13px;font-weight:600;cursor:pointer}
.tc-btn.call{background:linear-gradient(135deg,#16a34a,#15803d);border-color:#16a34a;color:#fff}
.tc-btn.wa{background:#0f2a1c;border-color:#16a34a66;color:#4ade80}
.tc-btn.pri{background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;color:#fff;padding:10px 22px;font-size:14px}
.tc-btn:disabled{opacity:.5;cursor:wait}
.tc-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.tc-facts div{background:#1a1a2e;border-radius:8px;padding:8px 10px;font-size:13px;min-width:0;word-break:break-word}
.tc-facts span{display:block;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.tc-outs{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px}
.tc-out{text-align:left;background:#1a1a2e;border:1px solid #2d2d44;border-radius:8px;padding:8px 10px;color:#e5e7eb;font-size:13px;cursor:pointer}
.tc-out small{display:block;color:#6b7280;font-size:11px}
.tc-out.on{border-color:#7c3aed;background:#7c3aed22}
.tc-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.tc-in{width:100%;background:#1a1a2e;border:1px solid #2d2d44;border-radius:8px;padding:9px 12px;color:#fff;font-size:13px;outline:none;color-scheme:dark}
.tc-in:focus{border-color:#7c3aed}
.tc-warn{background:#1c1400;border:1px solid #eab30844;border-radius:8px;padding:8px 12px;color:#fcd34d;font-size:12px}
.tc-err{color:#f87171;font-size:12px}
.tc-tl{list-style:none;display:grid;gap:8px}
.tc-tl li{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;font-size:12px;color:#d1d5db}
.tc-tl time{color:#6b7280;font-variant-numeric:tabular-nums}
.tc-tbl{overflow-x:auto}
.tc-tbl table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.tc-tbl th,.tc-tbl td{text-align:left;padding:9px 12px;border-bottom:1px solid #1e1e2e;white-space:nowrap}
.tc-tbl th{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.tc-tbl td.n,.tc-tbl th.n{text-align:right}
.tc-tbl tr.click{cursor:pointer}.tc-tbl tr.click:hover td{background:#1a1a2e}
.tc-bar{display:inline-block;height:6px;border-radius:3px;background:#7c3aed;vertical-align:middle;margin-right:6px}
.tc-team{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px}
.tc-team label{display:flex;gap:6px;align-items:center;background:#1a1a2e;border:1px solid #2d2d44;border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer}
.tc-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#16a34a;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:999;display:none;box-shadow:0 10px 30px #0008}
.tc-toast.err{background:#b91c1c}
.tc-mb{margin-bottom:16px}
`;
  document.head.appendChild(s);
})();

// ═══ ENTRY ═══
async function loadTelecaller(){
  const c=document.getElementById("mainContent");
  if(!tcHasAccess(CU)){ c.innerHTML='<div class="no-data">Ye section sirf Sales / Telecalling team ke liye hai.</div>'; return; }
  try{
    await tcFetch();
  }catch(e){
    console.error(e);
    c.innerHTML=`<div class="alert-banner">⚠️ Telecalling data load nahi hua. Check karo ki <b>sql/telecaller.sql</b> Supabase me run hua hai. (${escHtml(e.message||e)})</div>`;
    return;
  }
  CU.isAdmin ? tcRenderAdmin() : tcRenderCaller();
}

async function tcFetch(){
  const today=tcStartOfDay(new Date()).toISOString();
  let lq=sb.from("tc_leads").select("*").order("next_followup_at",{ascending:true,nullsFirst:false}).limit(3000);
  let gq=sb.from("tc_call_logs").select("lead_id,telecaller_id,outcome,called_at").gte("called_at",today).limit(5000);
  if(!CU.isAdmin){ lq=lq.eq("assigned_to",CU.id); gq=gq.eq("telecaller_id",CU.id); }
  const [L,G,T]=await Promise.all([lq,gq,sb.from("tc_team").select("*").order("name")]);
  if(L.error) throw L.error; if(G.error) throw G.error; if(T.error) throw T.error;
  TC.leads=L.data||[]; TC.logsToday=G.data||[]; TC.team=T.data||[];
}

function tcStatsFor(id, logs){
  const ls=logs.filter(g=>!id||g.telecaller_id===id).filter(g=>!["duplicate","note"].includes(g.outcome));
  return { calls:ls.length, conn:ls.filter(g=>tcConnected(g.outcome)).length,
           hot:ls.filter(g=>g.outcome==="interested").length, visit:ls.filter(g=>g.outcome==="site_visit").length,
           booked:ls.filter(g=>g.outcome==="booked").length };
}

// ═══ TELECALLER VIEW ═══
function tcRenderCaller(){
  const c=document.getElementById("mainContent");
  const s=tcStatsFor(CU.id,TC.logsToday);
  const due=TC.leads.filter(tcDue).length, od=TC.leads.filter(tcOver).length;
  c.innerHTML=`
    <div class="tc-stats">
      ${[["Calls aaj",s.calls],["Connected",s.conn],["Interested",s.hot],["Site visits",s.visit],["Follow-ups baaki",due],["Overdue",od,od>0]]
        .map(([k,v,r])=>`<div class="tc-stat${r?" red":""}"><b>${v}</b><span>${k}</span></div>`).join("")}
    </div>
    <div class="tc-grid">
      <div class="tc-panel">
        <div class="tc-ph"><h3>📋 Meri list</h3><button class="refresh-btn" onclick="loadTelecaller()">↻ Refresh</button></div>
        <div style="padding:10px 14px;display:grid;gap:8px;border-bottom:1px solid #1e1e2e">
          <div class="tc-chips" id="tcChips"></div>
          <input class="tc-search" id="tcQ" placeholder="Naam ya number se search..." value="${escHtml(TC.q)}" oninput="TC.q=this.value;tcRenderList()">
        </div>
        <div id="tcList"></div>
      </div>
      <div class="tc-panel" id="tcDetail"></div>
    </div>`;
  if(!TC.sel || !TC.leads.find(l=>l.id===TC.sel)){
    const first=tcFiltered()[0]; TC.sel=first?first.id:null;
  }
  tcRenderList(); tcRenderDetail();
}

function tcFiltered(){
  let m=TC.leads;
  if(TC.sub==="due") m=m.filter(tcDue);
  else if(TC.sub==="new") m=m.filter(l=>l.status==="new");
  else if(TC.sub==="hot") m=m.filter(l=>["interested","site_visit"].includes(l.status));
  else if(TC.sub==="closed") m=m.filter(l=>!tcOpen(l));
  const q=TC.q.trim().toLowerCase();
  if(q) m=m.filter(l=>(l.name||"").toLowerCase().includes(q)||String(l.phone||"").includes(q)||(l.project||"").toLowerCase().includes(q));
  return m.slice().sort((a,b)=>(a.next_followup_at?new Date(a.next_followup_at):Infinity)-(b.next_followup_at?new Date(b.next_followup_at):Infinity));
}

function tcRenderList(){
  const L=TC.leads;
  const chips=[["due","Due aaj",L.filter(tcDue).length],["new","New",L.filter(l=>l.status==="new").length],
    ["hot","Interested",L.filter(l=>["interested","site_visit"].includes(l.status)).length],["all","Sab",L.length],["closed","Closed",L.filter(l=>!tcOpen(l)).length]];
  const ch=document.getElementById("tcChips");
  if(ch) ch.innerHTML=chips.map(([k,t,n])=>`<button class="tc-chip${TC.sub===k?" on":""}" onclick="TC.sub='${k}';tcRenderList()">${t} · ${n}</button>`).join("");
  const m=tcFiltered();
  document.getElementById("tcList").innerHTML=m.length?m.map(l=>`
    <div class="tc-lead${l.id===TC.sel?" sel":""}" onclick="tcSelect(${l.id})">
      <span class="nm">${escHtml(l.name)}</span>${tcPill(l.status)}
      <div class="mt"><span>${escHtml(l.project||"—")}</span><span>${escHtml(l.source||"")}</span>
        ${CU.isAdmin?`<span>👤 ${escHtml(l.assigned_name||"Unassigned")}</span>`:""}
        <span class="tc-due${tcOver(l)?" over":""}">${tcOpen(l)&&l.next_followup_at?(tcOver(l)?"⚠ Overdue · ":"Next · ")+tcFmt(l.next_followup_at):"Closed"}</span></div>
    </div>`).join(""):`<div class="tc-empty">Is list me koi lead nahi. 👍</div>`;
}

function tcSelect(id){
  TC.sel=id; TC.pick=null;
  if(document.getElementById("tcList")) tcRenderList();
  tcRenderDetail();
  if(window.innerWidth<800||CU.isAdmin) document.getElementById("tcDetail")?.scrollIntoView({behavior:"smooth",block:"start"});
}

async function tcRenderDetail(){
  const box=document.getElementById("tcDetail"); if(!box) return;
  const l=TC.leads.find(x=>x.id===TC.sel);
  if(!l){ box.innerHTML=`<div class="tc-empty">Left side se lead choose karo.</div>`; box.hidden=CU.isAdmin; return; }
  box.hidden=false;
  const d10=tcDigits(l.phone);
  const def=new Date(tcTomorrow()); def.setHours(11,0,0,0);
  const o=TC.pick?TC_OUT[TC.pick]:null;
  const waTxt=encodeURIComponent(`Namaste ${l.name} ji, Lavista Estate se baat kar rahe hain${l.project?` — ${l.project} ke baare me`:""}. Aapko details bhej rahe hain 🙏`);
  box.innerHTML=`
    <div class="tc-ph"><h3>📞 Call update</h3>
      <span style="display:flex;gap:8px;align-items:center">${tcPill(l.status)}${CU.isAdmin?`<button class="refresh-btn" onclick="TC.sel=null;tcRenderDetail()">✕ Close</button>`:""}</span></div>
    <div class="tc-det">
      <div class="tc-who"><h2>${escHtml(l.name)}</h2>
        <div class="tc-phone"><span style="font-size:15px">${escHtml(l.phone)}</span>
          <a class="tc-btn call" href="tel:+91${d10}">📞 Call</a>
          <a class="tc-btn wa" href="https://wa.me/91${d10}?text=${waTxt}" target="_blank" rel="noopener">💬 WhatsApp</a></div></div>
      <div class="tc-facts">
        <div><span>Project</span>${escHtml(l.project||"—")}</div><div><span>Budget</span>${escHtml(l.budget||"—")}</div>
        <div><span>Source</span>${escHtml(l.source||"—")}</div><div><span>Telecaller</span>${escHtml(l.assigned_name||"—")}</div>
        <div><span>RNR</span>${l.rnr_count} / 3</div><div><span>Lead aaya</span>${tcFmt(l.created_at)}</div>
        ${l.notes?`<div style="grid-column:1/-1"><span>Form details</span>${escHtml(l.notes)}</div>`:""}
      </div>
      ${l.rnr_count===2?`<div class="tc-warn">⚠️ 2 baar RNR ho chuka hai. Ek aur RNR pe ye lead automatically <b>Cold</b> ho jayega.</div>`:""}
      <div><label class="form-label">Call ka result</label>
        <div class="tc-outs">${Object.entries(TC_OUT).map(([k,v])=>`<button class="tc-out${TC.pick===k?" on":""}" onclick="tcPick('${k}')">${v.t}<small>${v.s}</small></button>`).join("")}</div></div>
      <div class="tc-row">
        <div><label class="form-label" for="tcFu">${TC.pick==="site_visit"?"Site visit date & time":"Next follow-up"}</label>
          <input class="tc-in" type="datetime-local" id="tcFu" value="${tcIsoLocal(def)}" ${o&&!o.fu?"disabled":""}></div>
        <div><label class="form-label" for="tcBud">Budget</label><input class="tc-in" id="tcBud" value="${escHtml(l.budget||"")}" placeholder="₹ e.g. 80L–1Cr"></div>
        <div><label class="form-label" for="tcProj">Project</label><input class="tc-in" id="tcProj" value="${escHtml(l.project||"")}"></div>
      </div>
      <div><label class="form-label" for="tcRem">Remark${o&&o.rem?" (zaroori)":""}</label>
        <textarea id="tcRem" style="min-height:70px" placeholder="Jaise: 3BHK chahiye, Sunday family ke saath visit karenge"></textarea></div>
      <div class="tc-err" id="tcErr" hidden></div>
      <div><button class="tc-btn pri" id="tcSave" onclick="tcSave()">💾 Save update</button></div>
      <div><label class="form-label">History</label><ul class="tc-tl" id="tcHist"><li><span style="color:#4b5563">Loading...</span></li></ul></div>
    </div>`;
  const {data,error}=await sb.from("tc_call_logs").select("*").eq("lead_id",l.id).order("called_at",{ascending:false}).limit(50);
  const h=document.getElementById("tcHist"); if(!h||TC.sel!==l.id) return;
  if(error){ h.innerHTML=`<li><span class="tc-err">History load nahi hui</span></li>`; return; }
  h.innerHTML=(data||[]).length?data.map(g=>`<li><time>${tcFmt(g.called_at)}</time><span><b>${escHtml((TC_STATUS[g.outcome]||[g.outcome])[0])}</b> · ${escHtml(g.telecaller_name||"")}${g.remark?` — ${escHtml(g.remark)}`:""}${g.next_followup_at&&!["duplicate","note"].includes(g.outcome)?` <span style="color:#6b7280">(next: ${tcFmt(g.next_followup_at)})</span>`:""}</span></li>`).join("")
    :`<li><span style="color:#4b5563">Abhi tak koi call nahi hui.</span></li>`;
}

function tcPick(k){
  const keep={rem:document.getElementById("tcRem")?.value||"",fu:document.getElementById("tcFu")?.value,bud:document.getElementById("tcBud")?.value,proj:document.getElementById("tcProj")?.value};
  TC.pick=k;
  tcRenderDetail().then(()=>{});
  // restore typed values (render is sync up to the history fetch)
  const r=document.getElementById("tcRem"); if(r) r.value=keep.rem;
  const f=document.getElementById("tcFu"); if(f&&!f.disabled&&keep.fu) f.value=keep.fu;
  const b=document.getElementById("tcBud"); if(b&&keep.bud!==undefined) b.value=keep.bud;
  const p=document.getElementById("tcProj"); if(p&&keep.proj!==undefined) p.value=keep.proj;
}

async function tcSave(){
  const l=TC.leads.find(x=>x.id===TC.sel); if(!l) return;
  const err=document.getElementById("tcErr"); const fail=m=>{err.textContent=m;err.hidden=false;};
  if(!TC.pick) return fail("Pehle call ka result choose karo.");
  const o=TC_OUT[TC.pick], rem=document.getElementById("tcRem").value.trim();
  if(o.rem && !rem) return fail(`"${o.t}" ke liye remark zaroori hai.`);
  let fu=null;
  if(o.fu){ const v=document.getElementById("tcFu").value; if(!v) return fail("Next follow-up date-time daalo."); fu=new Date(v);
    if(fu<new Date(Date.now()-5*60*1000)) return fail("Follow-up time past me nahi ho sakta."); }

  let status=TC.pick, rnr=l.rnr_count, logRemark=rem;
  if(TC.pick==="rnr"){ rnr+=1; if(rnr>=3){ status="cold"; fu=null; logRemark=(rem?rem+" · ":"")+"3 RNR → auto Cold"; } }
  else rnr=0;

  const btn=document.getElementById("tcSave"); btn.disabled=true; btn.textContent="Saving...";
  const now=new Date().toISOString();
  const log=await sb.from("tc_call_logs").insert({lead_id:l.id,telecaller_id:CU.id,telecaller_name:CU.name,outcome:TC.pick==="rnr"&&status==="cold"?"rnr":TC.pick,
    remark:logRemark||null,next_followup_at:fu?fu.toISOString():null,called_at:now});
  if(log.error){ btn.disabled=false; btn.textContent="💾 Save update"; return fail("Save nahi hua: "+log.error.message); }
  const upd={status,rnr_count:rnr,next_followup_at:fu?fu.toISOString():null,last_called_at:now,updated_at:now,
    budget:document.getElementById("tcBud").value.trim()||null,project:document.getElementById("tcProj").value.trim()||null};
  if(rem) upd.last_remark=rem;
  const up=await sb.from("tc_leads").update(upd).eq("id",l.id);
  if(up.error){ btn.disabled=false; btn.textContent="💾 Save update"; return fail("Lead update nahi hua: "+up.error.message); }

  Object.assign(l,upd);
  const done=TC.pick;
  TC.logsToday.push({lead_id:l.id,telecaller_id:CU.id,outcome:done,called_at:now});
  TC.pick=null;
  tcToast(status==="cold"?"3 RNR — lead Cold me gaya":done==="site_visit"?"Site visit save ✓":done==="booked"?"Booking 🎉 save ho gaya":"Update save ho gaya ✓");
  if(status==="site_visit") tcVisitAlert(l,fu);

  if(CU.isAdmin){ tcRenderAdmin(); return; }
  // next due lead auto-open
  const next=tcFiltered().find(x=>x.id!==l.id && tcDue(x));
  if(TC.sub==="due" && next) TC.sel=next.id;
  tcRenderCaller();
}

function tcVisitAlert(l,when){
  const msg=encodeURIComponent(`🏠 Site visit fixed\nClient: ${l.name} (${l.phone})\nProject: ${l.project||"-"}\nBudget: ${l.budget||"-"}\nTime: ${tcFmt(when)}\nBy: ${CU.name}`);
  const box=document.getElementById("tcDetail")||document.getElementById("mainContent");
  const div=document.createElement("div");
  div.className="tc-warn"; div.style.margin="0 16px 16px";
  div.innerHTML=`🏠 Site visit fixed! Sales team ko batao: <a class="tc-btn wa" style="margin-left:6px" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">💬 WhatsApp pe bhejo</a>`;
  setTimeout(()=>{ (document.getElementById("tcDetail")||box).prepend(div); },50);
}

// ═══ ADMIN VIEW ═══
function tcRenderAdmin(){
  const c=document.getElementById("mainContent");
  const tot=tcStatsFor(null,TC.logsToday);
  const od=TC.leads.filter(tcOver).length, un=TC.leads.filter(tcUntouched);
  const people=[...TC.team.map(t=>({id:t.user_id,name:t.name,active:t.active}))];
  // jinko lead assigned hai par team table me nahi
  TC.leads.forEach(l=>{ if(l.assigned_to&&!people.find(p=>p.id===l.assigned_to)) people.push({id:l.assigned_to,name:l.assigned_name||l.assigned_to,active:false}); });
  const visits=TC.leads.filter(l=>l.status==="site_visit"&&l.next_followup_at&&new Date(l.next_followup_at)>=tcStartOfDay(new Date()))
    .sort((a,b)=>new Date(a.next_followup_at)-new Date(b.next_followup_at)).slice(0,10);
  if(!TC.from){ TC.from=tcDateKey(new Date()); TC.to=TC.from; }

  c.innerHTML=`
    <div class="tc-stats">
      ${[["Calls aaj",tot.calls],["Connect %",tot.calls?Math.round(tot.conn/tot.calls*100)+"%":"—"],["Interested",tot.hot],["Site visits",tot.visit],["Bookings",tot.booked],["Overdue",od,od>0],["Untouched 30m+",un.length,un.length>0]]
        .map(([k,v,r])=>`<div class="tc-stat${r?" red":""}"><b>${v}</b><span>${k}</span></div>`).join("")}
    </div>

    <div class="tc-panel tc-mb" id="tcDetail" hidden></div>

    ${un.length?`<div class="alert-banner">⚠️ ${un.length} naye lead 30 min se zyada time se untouched hain: ${un.slice(0,5).map(l=>`<b style="cursor:pointer;text-decoration:underline" onclick="tcSelect(${l.id})">${escHtml(l.name)}</b> (${escHtml(l.assigned_name||"unassigned")})`).join(", ")}${un.length>5?" ...":""}</div>`:""}

    <div class="tc-panel tc-mb">
      <div class="tc-ph"><h3>📊 Telecaller performance</h3>
        <span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input type="date" class="date-input" id="tcFrom" value="${TC.from}"> <span style="color:#6b7280">to</span>
          <input type="date" class="date-input" id="tcTo" value="${TC.to}">
          <button class="filter-btn" onclick="tcLoadPerf()">Show</button>
          <button class="refresh-btn" onclick="loadTelecaller()">↻ Refresh</button>
        </span></div>
      <div class="tc-tbl" id="tcPerf"><div class="tc-empty">Loading...</div></div>
    </div>

    ${visits.length?`<div class="tc-panel tc-mb"><div class="tc-ph"><h3>🏠 Upcoming site visits</h3></div><div class="tc-tbl"><table>
      <tr><th>Time</th><th>Client</th><th>Phone</th><th>Project</th><th>Budget</th><th>Telecaller</th></tr>
      ${visits.map(l=>`<tr class="click" onclick="tcSelect(${l.id})"><td>${tcFmt(l.next_followup_at)}</td><td>${escHtml(l.name)}</td><td>${escHtml(l.phone)}</td><td>${escHtml(l.project||"—")}</td><td>${escHtml(l.budget||"—")}</td><td>${escHtml(l.assigned_name||"—")}</td></tr>`).join("")}
    </table></div></div>`:""}

    <div class="tc-panel tc-mb">
      <div class="tc-ph"><h3>🗂️ Saare leads</h3>
        <span style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="tcFTc" onchange="TC.adFilter.tc=this.value;tcRenderAllLeads()"><option value="">All telecallers</option><option value="__none">Unassigned</option>${people.map(p=>`<option value="${escHtml(p.id)}"${TC.adFilter.tc===p.id?" selected":""}>${escHtml(p.name)}</option>`).join("")}</select>
          <select id="tcFSt" onchange="TC.adFilter.status=this.value;tcRenderAllLeads()"><option value="">All status</option><option value="__over"${TC.adFilter.status==="__over"?" selected":""}>⚠ Overdue</option>${Object.keys(TC_STATUS).filter(k=>!["duplicate","note"].includes(k)).map(k=>`<option value="${k}"${TC.adFilter.status===k?" selected":""}>${TC_STATUS[k][0]}</option>`).join("")}</select>
          <select id="tcFSrc" onchange="TC.adFilter.source=this.value;tcRenderAllLeads()"><option value="">All sources</option>${TC_SOURCES.map(s=>`<option${TC.adFilter.source===s?" selected":""}>${s}</option>`).join("")}</select>
          <input class="tc-search" style="width:180px" placeholder="Search naam / number" value="${escHtml(TC.q)}" oninput="TC.q=this.value;tcRenderAllLeads()">
          <button class="refresh-btn" onclick="tcExportCsv()">⬇ CSV</button>
        </span></div>
      <div class="tc-tbl" id="tcAll"></div>
    </div>

    <div class="grid2">
      <div class="tc-panel">
        <div class="tc-ph"><h3>➕ Naya lead add karo</h3></div>
        <div style="padding:14px;display:grid;gap:10px">
          <div class="tc-row">
            <input class="tc-in" id="tcNName" placeholder="Naam *">
            <input class="tc-in" id="tcNPhone" placeholder="Mobile *" inputmode="tel">
          </div>
          <div class="tc-row">
            <select class="tc-in" id="tcNSrc">${TC_SOURCES.map(s=>`<option${s==="Manual"?" selected":""}>${s}</option>`).join("")}</select>
            <input class="tc-in" id="tcNProj" placeholder="Project">
            <input class="tc-in" id="tcNBud" placeholder="Budget">
          </div>
          <select class="tc-in" id="tcNTc"><option value="">Auto assign (round-robin)</option>${people.filter(p=>p.active).map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`).join("")}</select>
          <div class="tc-err" id="tcNErr" hidden></div>
          <div><button class="tc-btn pri" onclick="tcAddLead()">Add lead</button></div>
        </div>
      </div>
      <div class="tc-panel">
        <div class="tc-ph"><h3>📥 CSV se bulk upload</h3></div>
        <div style="padding:14px;display:grid;gap:10px;font-size:13px;color:#9ca3af">
          <div>Columns (pehli line header): <code style="color:#c4b5fd">name, phone, source, project, budget</code>. Duplicate numbers apne aap purane lead me merge ho jayenge.</div>
          <input type="file" accept=".csv,text/csv" id="tcCsv" class="tc-in">
          <div class="tc-err" id="tcCsvErr" hidden></div>
          <div><button class="tc-btn pri" onclick="tcUploadCsv()">Upload</button></div>
        </div>
      </div>
    </div>

    <div class="tc-panel" style="margin-top:16px">
      <div class="tc-ph"><h3>👥 Telecalling team (auto-assign isi me hota hai)</h3></div>
      <div class="tc-team">
        ${TC.team.map(t=>`<label><input type="checkbox" ${t.active?"checked":""} onchange="tcToggleTeam('${escHtml(t.user_id)}',this.checked)"> ${escHtml(t.name)}</label>`).join("")}
        <select id="tcAddMember" class="tc-in" style="width:auto"><option value="">+ Member add karo</option>${USERS.filter(u=>!u.isAdmin&&!TC.team.find(t=>t.user_id===u.id)).map(u=>`<option value="${u.id}">${escHtml(u.name)} · ${escHtml(u.role)}</option>`).join("")}</select>
        <button class="refresh-btn" onclick="tcAddMember()">Add</button>
      </div>
    </div>`;
  tcRenderAllLeads(); tcLoadPerf();
  if(TC.sel && TC.leads.find(l=>l.id===TC.sel)) tcRenderDetail();
}

async function tcLoadPerf(){
  const f=document.getElementById("tcFrom")?.value||TC.from, t=document.getElementById("tcTo")?.value||TC.to;
  TC.from=f; TC.to=t;
  const start=new Date(f+"T00:00:00"), end=new Date(t+"T00:00:00"); end.setDate(end.getDate()+1);
  const box=document.getElementById("tcPerf");
  const {data,error}=await sb.from("tc_call_logs").select("telecaller_id,telecaller_name,outcome,called_at").gte("called_at",start.toISOString()).lt("called_at",end.toISOString()).limit(20000);
  if(error){ box.innerHTML=`<div class="tc-empty">Load nahi hua: ${escHtml(error.message)}</div>`; return; }
  const logs=(data||[]).filter(g=>g.telecaller_id!=="system");
  const ids=[...new Set([...TC.team.filter(x=>x.active).map(x=>x.user_id),...logs.map(g=>g.telecaller_id)])];
  const nameOf=id=>(TC.team.find(x=>x.user_id===id)||{}).name||(logs.find(g=>g.telecaller_id===id)||{}).telecaller_name||id;
  const rows=ids.map(id=>{const s=tcStatsFor(id,logs),ls=TC.leads.filter(l=>l.assigned_to===id);
    return {id,name:nameOf(id),...s,pend:ls.filter(tcDue).length,over:ls.filter(tcOver).length,total:ls.filter(tcOpen).length};})
    .sort((a,b)=>b.calls-a.calls);
  const mx=Math.max(1,...rows.map(r=>r.calls));
  box.innerHTML=rows.length?`<table>
    <tr><th>Telecaller</th><th>Calls</th><th class="n">Connected</th><th class="n">Connect %</th><th class="n">Interested</th><th class="n">Visits</th><th class="n">Bookings</th><th class="n">Open leads</th><th class="n">Due aaj</th><th class="n">Overdue</th></tr>
    ${rows.map(r=>`<tr><td><b>${escHtml(r.name)}</b></td><td><span class="tc-bar" style="width:${Math.round(r.calls/mx*90)}px"></span>${r.calls}</td><td class="n">${r.conn}</td><td class="n">${r.calls?Math.round(r.conn/r.calls*100)+"%":"—"}</td><td class="n">${r.hot}</td><td class="n">${r.visit}</td><td class="n">${r.booked}</td><td class="n">${r.total}</td><td class="n">${r.pend}</td><td class="n" style="color:${r.over?"#f87171":"inherit"}">${r.over}</td></tr>`).join("")}
  </table>`:`<div class="tc-empty">Is date range me koi call nahi.</div>`;
}

function tcAdminFiltered(){
  const F=TC.adFilter, q=TC.q.trim().toLowerCase();
  return TC.leads.filter(l=>
    (!F.tc || (F.tc==="__none"?!l.assigned_to:l.assigned_to===F.tc)) &&
    (!F.status || (F.status==="__over"?tcOver(l):l.status===F.status)) &&
    (!F.source || l.source===F.source) &&
    (!q || (l.name||"").toLowerCase().includes(q) || String(l.phone||"").includes(q) || (l.project||"").toLowerCase().includes(q))
  ).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
}

function tcRenderAllLeads(){
  const box=document.getElementById("tcAll"); if(!box) return;
  const m=tcAdminFiltered(), shown=m.slice(0,300);
  const opts=TC.team.map(t=>`<option value="${escHtml(t.user_id)}">${escHtml(t.name)}</option>`).join("");
  box.innerHTML=m.length?`<table>
    <tr><th>Lead</th><th>Phone</th><th>Project</th><th>Source</th><th>Status</th><th>Next follow-up</th><th>Last remark</th><th>Telecaller</th></tr>
    ${shown.map(l=>`<tr class="click">
      <td onclick="tcSelect(${l.id})"><b>${escHtml(l.name)}</b></td><td onclick="tcSelect(${l.id})">${escHtml(l.phone)}</td>
      <td onclick="tcSelect(${l.id})">${escHtml(l.project||"—")}</td><td onclick="tcSelect(${l.id})">${escHtml(l.source||"")}</td>
      <td onclick="tcSelect(${l.id})">${tcPill(l.status)}</td>
      <td onclick="tcSelect(${l.id})" class="tc-due${tcOver(l)?" over":""}">${tcOpen(l)?tcFmt(l.next_followup_at):"—"}</td>
      <td onclick="tcSelect(${l.id})" style="max-width:240px;overflow:hidden;text-overflow:ellipsis">${escHtml(l.last_remark||"")}</td>
      <td><select onchange="tcReassign(${l.id},this.value)" style="padding:4px 8px"><option value="">${l.assigned_to?"—":"Unassigned"}</option>${opts.replace(`value="${escHtml(l.assigned_to||"")}"`,`value="${escHtml(l.assigned_to||"")}" selected`)}</select></td>
    </tr>`).join("")}
  </table>${m.length>300?`<div class="tc-empty">${m.length} me se pehle 300 dikh rahe hain — filter ya CSV use karo.</div>`:""}`
  :`<div class="tc-empty">Koi lead match nahi hua.</div>`;
}

async function tcReassign(id,uid){
  if(!uid) return;
  const t=TC.team.find(x=>x.user_id===uid); const l=TC.leads.find(x=>x.id===id);
  const {error}=await sb.from("tc_leads").update({assigned_to:uid,assigned_name:t?t.name:uid,updated_at:new Date().toISOString()}).eq("id",id);
  if(error) return tcToast("Reassign nahi hua: "+error.message,true);
  await sb.from("tc_call_logs").insert({lead_id:id,telecaller_id:CU.id,telecaller_name:CU.name,outcome:"note",remark:`Lead reassign: ${l?.assigned_name||"—"} → ${t?t.name:uid}`});
  if(l){ l.assigned_to=uid; l.assigned_name=t?t.name:uid; }
  tcToast(`Lead ${t?t.name:uid} ko assign ho gaya ✓`); tcLoadPerf();
}

async function tcAddLead(){
  const v=id=>document.getElementById(id).value.trim();
  const err=document.getElementById("tcNErr"); err.hidden=true;
  const name=v("tcNName"), phone=v("tcNPhone");
  if(!name||tcDigits(phone).length<10){ err.textContent="Naam aur 10-digit mobile number zaroori hai."; err.hidden=false; return; }
  const tcId=v("tcNTc"); const t=TC.team.find(x=>x.user_id===tcId);
  const row={name,phone,source:v("tcNSrc"),project:v("tcNProj")||null,budget:v("tcNBud")||null,created_by:CU.id};
  if(tcId){ row.assigned_to=tcId; row.assigned_name=t?t.name:tcId; }
  const {data,error}=await sb.from("tc_leads").insert(row).select();
  if(error){ err.textContent="Add nahi hua: "+error.message; err.hidden=false; return; }
  tcToast(data&&data.length?`Lead add ✓ → ${data[0].assigned_name||"Unassigned"}`:"Ye number pehle se hai — purane lead me merge ho gaya");
  await loadTelecaller();
}

function tcParseCsv(text){
  const rows=[]; let row=[],cur="",q=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
    else if(ch==='"') q=true; else if(ch===","){row.push(cur);cur="";}
    else if(ch==="\n"||ch==="\r"){ if(ch==="\r"&&text[i+1]==="\n") i++; row.push(cur);cur=""; if(row.some(x=>x.trim())) rows.push(row); row=[]; }
    else cur+=ch; }
  row.push(cur); if(row.some(x=>x.trim())) rows.push(row);
  return rows;
}

async function tcUploadCsv(){
  const err=document.getElementById("tcCsvErr"); err.hidden=true;
  const f=document.getElementById("tcCsv").files[0];
  if(!f){ err.textContent="Pehle CSV file choose karo."; err.hidden=false; return; }
  const rows=tcParseCsv(await f.text()); if(rows.length<2){ err.textContent="File me header ke baad koi row nahi mili."; err.hidden=false; return; }
  const H=rows[0].map(h=>h.trim().toLowerCase());
  const ix=k=>H.findIndex(h=>h===k||h.includes(k));
  const iN=ix("name"), iP=ix("phone")>-1?ix("phone"):ix("mobile");
  if(iN<0||iP<0){ err.textContent="Header me 'name' aur 'phone' column zaroori hai."; err.hidden=false; return; }
  const iS=ix("source"), iPr=ix("project"), iB=ix("budget");
  const data=rows.slice(1).map(r=>({name:(r[iN]||"").trim(),phone:(r[iP]||"").trim(),source:iS>-1&&r[iS]?r[iS].trim():"Manual",
    project:iPr>-1?(r[iPr]||"").trim()||null:null,budget:iB>-1?(r[iB]||"").trim()||null:null,created_by:CU.id}))
    .filter(r=>r.name&&tcDigits(r.phone).length===10);
  if(!data.length){ err.textContent="Koi valid row nahi mili (naam + 10-digit number chahiye)."; err.hidden=false; return; }
  let ok=0;
  for(const r of data){ const {data:d,error}=await sb.from("tc_leads").insert(r).select(); if(!error&&d&&d.length) ok++; }
  tcToast(`${ok} naye lead add · ${data.length-ok} duplicate/merge · ${rows.length-1-data.length} invalid skip`);
  await loadTelecaller();
}

function tcExportCsv(){
  const m=tcAdminFiltered();
  const cols=["id","name","phone","source","project","budget","status","assigned_name","next_followup_at","last_called_at","last_remark","rnr_count","created_at"];
  const esc=v=>{const s=v==null?"":String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
  const csv=[cols.join(","),...m.map(l=>cols.map(c=>esc(l[c])).join(","))].join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv"}));
  a.download=`telecaller-leads-${tcDateKey(new Date())}.csv`; document.body.appendChild(a); a.click(); a.remove();
}

async function tcToggleTeam(uid,on){
  const {error}=await sb.from("tc_team").update({active:on}).eq("user_id",uid);
  if(error) return tcToast("Update nahi hua: "+error.message,true);
  const t=TC.team.find(x=>x.user_id===uid); if(t) t.active=on;
  tcToast(on?"Auto-assign ON ✓":"Auto-assign OFF — naye lead nahi milenge");
}

async function tcAddMember(){
  const uid=document.getElementById("tcAddMember").value; if(!uid) return;
  const u=USERS.find(x=>x.id===uid);
  const {error}=await sb.from("tc_team").insert({user_id:uid,name:u?u.name:uid});
  if(error) return tcToast("Add nahi hua: "+error.message,true);
  tcToast(`${u?u.name:uid} team me add ✓`); await loadTelecaller();
}

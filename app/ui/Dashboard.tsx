"use client";
import { useEffect, useMemo, useState } from "react";

type Incident = {id:number; title:string; description:string; emergency_type:string; severity:string; status:string; location:string; people_affected:number; created_at:string; assigned_resource_id:number|null; resource_name?:string|null; reporter_name?:string};
type Resource = {id:number; name:string; resource_type:string; capacity:number; available_units:number; location:string; status:string};
type Allocation = {id:number;incident_id:number;incident_title:string;emergency_type:string;severity:string;incident_status:string;incident_location:string;resource_name:string;resource_type:string;allocated_by_name:string;allocated_at:string;released_at:string|null;notes:string};
type RedisActivity = {
  eventType?: string;
  incidentId?: number | string;
  title?: string;
  resourceName?: string;
  status?: string;
  message?: string;
  createdAt?: string;
};
type RedisOverview = {
  configured: boolean;
  connected: boolean;
  resourceCount: number;
  recentActivity: RedisActivity[];
  message: string;
};
type User = {id:number;name:string;role:string}|null;
const types = ["Medical","Fire","Police","Rescue","Disaster"];
const severities = ["Critical","High","Medium","Low"];
export default function Dashboard({initialUser}:{initialUser:User}) {
  const [user,setUser] = useState<User>(initialUser);
  const [incidents,setIncidents] = useState<Incident[]>([]);
  const [resources,setResources] = useState<Resource[]>([]);
  const [allocations,setAllocations] = useState<Allocation[]>([]);
  const [redisOverview,setRedisOverview] = useState<RedisOverview>({
    configured:false, connected:false, resourceCount:0, recentActivity:[],
    message:"Redis is not configured."
  });
  const [search,setSearch] = useState("");
  const [statusFilter,setStatusFilter] = useState("All");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [form,setForm] = useState({title:"",description:"",emergency_type:"Medical",severity:"High",location:"",people_affected:"1"});
  async function refresh() {
    const [i,r,a,redis] = await Promise.all([
      fetch("/api/incidents"),
      fetch("/api/resources"),
      fetch("/api/allocations"),
      fetch("/api/redis/status")
    ]);
    if(i.ok) setIncidents(await i.json());
    if(r.ok) setResources(await r.json());
    if(a.ok) setAllocations(await a.json());
    if(redis.ok) setRedisOverview(await redis.json());
  }
  useEffect(()=>{ if(user) refresh(); },[user]);
  const filtered = useMemo(()=>incidents.filter(i=>(statusFilter==="All"||i.status===statusFilter)&&`${i.title} ${i.location} ${i.emergency_type} ${i.description}`.toLowerCase().includes(search.toLowerCase())),[incidents,statusFilter,search]);
  const stats = [
    ["Active incidents", incidents.filter(i=>i.status!=="Resolved").length],
    ["Critical priority", incidents.filter(i=>i.severity==="Critical"&&i.status!=="Resolved").length],
    ["Available units", resources.reduce((s,r)=>s+(r.status==="Available"?r.available_units:0),0)],
    ["Resolved", incidents.filter(i=>i.status==="Resolved").length]
  ];
  async function createIncident(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const res=await fetch("/api/incidents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,people_affected:Number(form.people_affected)})});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||"Could not create incident");
      setMessage("Incident registered successfully."); setForm({title:"",description:"",emergency_type:"Medical",severity:"High",location:"",people_affected:"1"}); await refresh();
    } catch(err:any){setMessage(err.message)} finally{setBusy(false)}
  }
  async function assign(id:number) {
    setMessage(""); const res=await fetch("/api/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({incidentId:id})});
    const data=await res.json(); setMessage(res.ok?`Allocated ${data.resource.name} to incident #${id}.`:data.error); await refresh();
  }
  async function updateStatus(id:number,status:string) {
    const res=await fetch(`/api/incidents/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    const data=await res.json(); setMessage(res.ok?(data.message||"Incident status updated."):data.error); await refresh();
  }
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setUser(null);setIncidents([]);setResources([])}
  if(!user) return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">S</div><p className="eyebrow">EMERGENCY RESPONSE PLATFORM</p><h1>SMART allocation system</h1><p className="muted">Coordinate incidents, prioritize response, and allocate available resources.</p><a className="primary-link" href="/login">Sign in to dashboard</a><a className="text-link" href="/register">Create a staff account</a><p className="tiny">For academic demonstration only. Not for real emergency dispatch.</p></section></main>;
  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">S</span><div><strong>SMART</strong><small>Emergency Ops</small></div></div><div className="side-label">WORKSPACE</div><a className="nav active" href="#overview">▦ &nbsp; Overview</a><a className="nav" href="#incidents">◉ &nbsp; Incidents</a><a className="nav" href="#resources">✚ &nbsp; Resources</a><a className="nav" href="#allocation-history">↗ &nbsp; Allocation history</a><div className="side-bottom"><div className="avatar">{user.name.slice(0,1).toUpperCase()}</div><div className="user-meta"><strong>{user.name}</strong><small>{user.role}</small></div><button className="logout" onClick={logout} title="Sign out">↗</button></div></aside>
    <section className="main-area"><header className="topbar"><div><p className="eyebrow">OPERATIONS CENTER / LIVE OVERVIEW</p><h1>Emergency dashboard</h1><p className="muted">Monitor incoming incidents and coordinate response resources.</p></div><div className="live-pill"><span/> SYSTEM ONLINE</div></header>
      {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage("")}>×</button></div>}
      <section id="overview" className="stats-grid">{stats.map(([label,value],i)=><article className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon icon-${i}`}>{["◉","⚠","✚","✓"][i]}</span></div><strong>{value}</strong><small>{["Across all reports","Requires urgent attention","Across all resource types","Successfully completed"][i]}</small></article>)}</section>
      <div className="content-grid"><section className="panel" id="incidents"><div className="panel-head"><div><h2>Incident queue</h2><p>Review and prioritize incoming reports</p></div><span className="count">{filtered.length} records</span></div><div className="filters"><input placeholder="Search incidents or location..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option><option>Reported</option><option>Assigned</option><option>In Progress</option><option>Resolved</option></select></div><div className="table-wrap"><table><thead><tr><th>INCIDENT / REPORTED BY</th><th>PRIORITY</th><th>STATUS</th><th>LOCATION</th><th>RESPONSE</th></tr></thead><tbody>{filtered.map(i=><tr key={i.id}><td><strong>#{i.id} · {i.title}</strong><small>{i.emergency_type} · {i.people_affected} affected · Reported by {i.reporter_name||"Staff"}</small></td><td><span className={`severity ${i.severity.toLowerCase()}`}>{i.severity}</span></td><td><select className="status-select" value={i.status} onChange={e=>updateStatus(i.id,e.target.value)}><option>Reported</option><option>Assigned</option><option>In Progress</option><option>Resolved</option></select></td><td>{i.location}</td><td>{i.assigned_resource_id?<span className="assigned">{i.resource_name||"Allocated"}</span>:<button className="small-btn" onClick={()=>assign(i.id)} disabled={i.status==="Resolved"}>Auto-assign ↗</button>}</td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty">No incidents match your filters.</div>}</div></section>
      <section className="panel create-panel"><div className="panel-head"><div><h2>Report incident</h2><p>Register a new emergency request</p></div><span className="form-icon">＋</span></div><form onSubmit={createIncident} className="incident-form"><label>Incident title<input required minLength={3} maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Road accident"/></label><label>Location<input required minLength={2} maxLength={180} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Area, street or landmark"/></label><div className="two-fields"><label>Type<select value={form.emergency_type} onChange={e=>setForm({...form,emergency_type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select></label><label>Severity<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}>{severities.map(t=><option key={t}>{t}</option>)}</select></label></div><label>People affected<input type="number" required min="1" max="100000" value={form.people_affected} onChange={e=>setForm({...form,people_affected:e.target.value})}/></label><label>Details<textarea rows={3} maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe what happened and any immediate risks"/></label><button className="primary-btn" disabled={busy}>{busy?"Submitting…":"Register incident"} <span>→</span></button></form></section></div>
      <section className="panel resources-panel" id="resources"><div className="panel-head"><div><h2>Response resources</h2><p>Current availability and deployment capacity</p></div><span className="count">{resources.length} resources</span></div><div className="resource-grid">{resources.map(r=><article className="resource-card" key={r.id}><div className="resource-head"><span className="resource-symbol">{r.resource_type==="Ambulance"?"✚":r.resource_type==="Fire Engine"?"♨":r.resource_type==="Police Unit"?"◇":"◈"}</span><span className={`resource-status ${r.status.toLowerCase().replace(" ","-")}`}>{r.status}</span></div><h3>{r.name}</h3><p>{r.resource_type} · {r.location}</p><div className="capacity"><div><span>Available capacity</span><strong>{r.available_units} / {r.capacity}</strong></div><div className="bar"><span style={{width:`${r.capacity?Math.min(100,r.available_units/r.capacity*100):0}%`}}/></div></div></article>)}</div></section>
      <section className="panel resources-panel" id="allocation-history"><div className="panel-head"><div><h2>Allocation history</h2><p>Joined incident, resource and staff records from MySQL</p></div><span className="count">{allocations.length} records</span></div><div className="table-wrap"><table><thead><tr><th>INCIDENT</th><th>RESOURCE</th><th>ALLOCATED BY</th><th>LOCATION</th><th>ALLOCATED AT</th><th>RESOURCE STATUS</th></tr></thead><tbody>{allocations.map(a=><tr key={a.id}><td><strong>#{a.incident_id} · {a.incident_title}</strong><small>{a.emergency_type} · {a.severity}</small></td><td><strong>{a.resource_name}</strong><small>{a.resource_type}</small></td><td>{a.allocated_by_name}</td><td>{a.incident_location}</td><td>{new Date(a.allocated_at).toLocaleString()}</td><td><span className={`resource-status ${a.released_at ? "available" : "deployed"}`}>{a.released_at ? "Returned" : "Deployed"}</span></td></tr>)}</tbody></table>{allocations.length===0&&<div className="empty">No allocations recorded yet. Allocate a resource to an incident to see its history.</div>}</div></section>
      <section className="panel resources-panel" id="redis-monitor">
        <div className="panel-head">
          <div>
            <h2>Redis NoSQL monitor</h2>
            <p>Resource availability cache and recent emergency activity stored in Redis</p>
          </div>
          <span className="count">
            {redisOverview.connected ? "REDIS CONNECTED" : redisOverview.configured ? "REDIS OFFLINE" : "NOT CONFIGURED"}
          </span>
        </div>
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}>
          <article className="stat-card">
            <div className="stat-top"><span>Redis connection</span><span className="stat-icon icon-2">●</span></div>
            <strong style={{fontSize:"1.25rem"}}>{redisOverview.connected ? "Online" : "Offline"}</strong>
            <small>{redisOverview.message}</small>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Cached resources</span><span className="stat-icon icon-0">▦</span></div>
            <strong>{redisOverview.resourceCount}</strong>
            <small>Resource hashes indexed in Redis</small>
          </article>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>EVENT</th><th>INCIDENT</th><th>DETAIL</th><th>RECORDED AT</th></tr></thead>
            <tbody>
              {redisOverview.recentActivity.map((event,index)=>(
                <tr key={`${event.eventType||"event"}-${event.incidentId||"none"}-${event.createdAt||index}`}>
                  <td><strong>{(event.eventType||"ACTIVITY").replaceAll("_"," ")}</strong></td>
                  <td>{event.incidentId ? `#${event.incidentId}` : "—"} {event.title||""}</td>
                  <td>{event.message||event.resourceName||event.status||"Incident activity recorded"}</td>
                  <td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {redisOverview.recentActivity.length===0&&(
            <div className="empty">
              {redisOverview.configured
                ? "No Redis activity yet. Register an incident or allocate a resource to generate NoSQL records."
                : "Add your Redis Cloud connection URL to .env.local to enable the NoSQL monitor."}
            </div>
          )}
        </div>
      </section>
      <footer>SMART Emergency System Allocation · MySQL relational database + Redis NoSQL cache</footer>
    </section>
  </main>;
}
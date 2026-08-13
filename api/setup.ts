import type { VercelRequest, VercelResponse } from "@vercel/node";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Endurance Bridge Setup</title>
  <style>
    :root{color-scheme:light;--ink:#17211b;--muted:#66736b;--line:#dce4df;--accent:#176b4d;--soft:#f3f7f4}
    *{box-sizing:border-box}body{margin:0;background:#f8faf8;color:var(--ink);font:16px/1.5 system-ui,-apple-system,sans-serif}
    main{max-width:820px;margin:56px auto;padding:0 22px}header{margin-bottom:32px}h1{font-size:42px;line-height:1.05;margin:0 0 12px}h2{font-size:20px;margin:0 0 12px}.lead{color:var(--muted);max-width:650px}
    .card{background:white;border:1px solid var(--line);border-radius:18px;padding:24px;margin:16px 0;box-shadow:0 8px 26px rgba(28,58,42,.05)}
    label{display:block;font-weight:650;margin-bottom:8px}input{width:100%;border:1px solid #bfcac3;border-radius:10px;padding:12px;font:inherit}
    button{border:0;border-radius:10px;background:var(--accent);color:white;padding:11px 16px;font:650 15px system-ui;cursor:pointer}button.secondary{background:#e8efe9;color:var(--ink)}button:disabled{opacity:.55;cursor:not-allowed}
    .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.status{color:var(--muted)}.ok{color:var(--accent);font-weight:650}.error{color:#a62929}
    pre{white-space:pre-wrap;word-break:break-word;background:var(--soft);border-radius:10px;padding:14px;font-size:13px;overflow:auto}.hidden{display:none}code{font-family:ui-monospace,SFMono-Regular,monospace}
  </style>
</head>
<body><main>
  <header><h1>Endurance Bridge</h1><p class="lead">Connect one private endurance account to a read-only remote MCP server. Your bridge key stays in this browser session and is never placed in the URL.</p></header>
  <section class="card"><h2>1. Unlock setup</h2><label for="key">BRIDGE_API_KEY</label><div class="row"><input id="key" type="password" autocomplete="off" placeholder="Paste your personal bridge key"><button id="unlock">Unlock</button></div><p id="message" class="status"></p></section>
  <section id="providers" class="card hidden"><h2>2. Connect a provider</h2><div class="row"><strong>Garmin</strong><span id="garminStatus" class="status">Not connected</span><button id="garmin">Connect Garmin</button></div><p class="status">Strava and TrainingPeaks adapters are planned. The MCP data model already supports them.</p></section>
  <section id="clients" class="card hidden"><h2>3. Add the MCP</h2><p>Set <code>ENDURANCE_BRIDGE_API_KEY</code> in the client environment, then add the remote endpoint.</p><strong>Codex</strong><pre id="codex"></pre><strong>Claude Code</strong><pre id="claude"></pre></section>
  <script>
    const keyInput=document.querySelector('#key'),message=document.querySelector('#message'),providers=document.querySelector('#providers'),clients=document.querySelector('#clients'),garminStatus=document.querySelector('#garminStatus'),garminButton=document.querySelector('#garmin');
    keyInput.value=sessionStorage.getItem('bridgeKey')||'';
    async function api(path,options={}){const key=sessionStorage.getItem('bridgeKey');const response=await fetch(path,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+key}});if(!response.ok)throw new Error(response.status===401?'Invalid bridge key':'Request failed');return response.json()}
    async function refresh(){try{const status=await api('/api/v1/setup/status');message.textContent='Setup unlocked';message.className='ok';providers.classList.remove('hidden');clients.classList.remove('hidden');const g=status.providers.garmin;garminStatus.textContent=g.connected?'Connected · '+g.permissions.join(', '):'Not connected';garminStatus.className=g.connected?'ok':'status';garminButton.textContent=g.connected?'Reconnect Garmin':'Connect Garmin';const endpoint=status.mcpEndpoint||location.origin+'/api/mcp';document.querySelector('#codex').textContent='codex mcp add endurance-bridge --url '+endpoint+' --bearer-token-env-var ENDURANCE_BRIDGE_API_KEY';document.querySelector('#claude').textContent='claude mcp add-json endurance-bridge \'{"type":"http","url":"'+endpoint+'","headers":{"Authorization":"Bearer $'+'{ENDURANCE_BRIDGE_API_KEY}"}}\' --scope user'}catch(error){message.textContent=error.message;message.className='error';providers.classList.add('hidden');clients.classList.add('hidden')}}
    document.querySelector('#unlock').onclick=()=>{sessionStorage.setItem('bridgeKey',keyInput.value.trim());refresh()};
    garminButton.onclick=async()=>{garminButton.disabled=true;try{const result=await api('/api/v1/setup/garmin/start',{method:'POST'});location.href=result.authorizationUrl}catch(error){message.textContent=error.message;message.className='error';garminButton.disabled=false}};
    if(keyInput.value)refresh();
  </script>
</main></body></html>`;

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method not allowed");
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).send(HTML);
}

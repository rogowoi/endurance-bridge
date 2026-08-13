import type { VercelRequest, VercelResponse } from "@vercel/node";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Endurance Bridge</title>
  <style>
    :root{color-scheme:light;--ink:#14231b;--muted:#68756d;--line:#dbe5de;--accent:#16704d;--accent2:#0e5037;--soft:#f1f7f3;--danger:#a12d2d}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#f7faf8 0%,#eef6f1 100%);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;min-height:100vh}
    main{max-width:920px;margin:0 auto;padding:64px 24px 80px}header{margin-bottom:34px}.eyebrow{color:var(--accent);font-weight:750;letter-spacing:.08em;text-transform:uppercase;font-size:12px}h1{font-size:clamp(38px,7vw,66px);line-height:1;letter-spacing:-.04em;margin:10px 0 18px;max-width:750px}h2{font-size:23px;letter-spacing:-.02em;margin:0 0 8px}.lead{font-size:19px;color:var(--muted);max-width:680px;margin:0}.card{background:#fff;border:1px solid var(--line);border-radius:22px;padding:26px;margin:16px 0;box-shadow:0 14px 38px rgba(31,70,48,.07)}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:26px 0}.step{padding:16px;border-radius:16px;background:var(--soft);color:var(--muted)}.step strong{display:block;color:var(--ink);margin-bottom:4px}.step.done{background:#e5f4eb;color:#3e6b55}.step.done strong{color:var(--accent)}
    label{display:block;font-weight:700;margin:16px 0 7px}input{width:100%;max-width:560px;border:1px solid #b8c8be;border-radius:12px;padding:13px 14px;font:inherit;background:#fff}input:focus{outline:3px solid #cde8da;border-color:var(--accent)}button{border:0;border-radius:12px;background:var(--accent);color:#fff;padding:12px 17px;font:700 15px system-ui;cursor:pointer}button:hover{background:var(--accent2)}button.secondary{background:#e8f0eb;color:var(--ink)}button.secondary:hover{background:#dce9e1}button:disabled{opacity:.55;cursor:not-allowed}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.muted{color:var(--muted)}.ok{color:var(--accent);font-weight:700}.error{color:var(--danger);font-weight:650}.hidden{display:none!important}
    .client{border-top:1px solid var(--line);padding-top:18px;margin-top:18px}.client:first-of-type{border-top:0;margin-top:8px}.client h3{margin:0 0 8px;font-size:17px}.command{display:flex;align-items:stretch;gap:8px}.command pre{flex:1;white-space:pre-wrap;word-break:break-word;background:var(--soft);border-radius:12px;padding:14px;margin:0;font:13px/1.5 ui-monospace,SFMono-Regular,monospace}.command button{align-self:stretch}.pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:var(--soft);font-size:13px;color:var(--muted)}details{margin-top:22px;color:var(--muted)}summary{cursor:pointer}.invite-output{margin-top:12px;padding:13px;border-radius:12px;background:var(--soft);word-break:break-all}.footer{margin-top:34px;color:var(--muted);font-size:14px}
    @media(max-width:700px){main{padding-top:38px}.grid{grid-template-columns:1fr}.command{display:block}.command button{margin-top:8px;width:100%}}
  </style>
</head>
<body><main>
  <header><div class="eyebrow">Endurance Bridge</div><h1>Your Garmin, available in your AI tools.</h1><p class="lead">Connect once, then ask Codex or Claude about activities, training plans, workouts, and routes.</p></header>

  <section id="loading" class="card"><p class="muted">Checking your connection…</p></section>

  <section id="welcome" class="card hidden">
    <h2>You need an invitation</h2><p class="muted">Endurance Bridge is currently available to invited friends. Ask the owner for a personal invite link.</p>
    <details><summary>Owner sign in</summary><label for="ownerKey">Owner key</label><div class="row"><input id="ownerKey" type="password" autocomplete="off" placeholder="Paste your owner key"><button id="ownerLogin">Continue</button></div><p id="ownerMessage"></p></details>
  </section>

  <section id="join" class="card hidden">
    <span class="pill">You’re invited</span><h2 style="margin-top:12px">Create your private connection</h2><p class="muted">Your Garmin data stays separate from everyone else’s.</p>
    <label for="displayName">What should we call you?</label><div class="row"><input id="displayName" autocomplete="name" maxlength="80" placeholder="Your name"><button id="joinButton">Get started</button></div><p id="joinMessage"></p>
  </section>

  <section id="dashboard" class="hidden">
    <div class="grid"><div id="stepAccount" class="step done"><strong>1. Account ready</strong><span id="accountName"></span></div><div id="stepGarmin" class="step"><strong>2. Connect Garmin</strong><span id="garminStepText">Not connected</span></div><div id="stepClient" class="step"><strong>3. Add your AI tool</strong><span id="clientStepText">One command</span></div></div>

    <section class="card"><h2 id="garminTitle">Connect Garmin</h2><p id="garminDescription" class="muted">Sign in to Garmin and approve access. We never receive your Garmin password.</p><div class="row"><button id="garminButton">Connect Garmin</button><span id="garminStatus"></span></div></section>

    <section id="clients" class="card hidden"><h2>Add Endurance Bridge</h2><p class="muted">Choose your tool and copy the command. Your private key is included only in your local setup.</p>
      <div id="needKey"><button id="keyButton">Create my connection key</button><p class="muted">Creating a new key replaces your previous one.</p></div>
      <div id="commands" class="hidden">
        <div class="client"><h3>Codex</h3><div class="command"><pre id="codexCommand"></pre><button data-copy="codexCommand">Copy</button></div></div>
        <div class="client"><h3>Claude Code</h3><div class="command"><pre id="claudeCommand"></pre><button data-copy="claudeCommand">Copy</button></div></div>
        <p class="ok">After running the command, restart your AI tool and ask: “What is on my Garmin training schedule this week?”</p>
      </div>
    </section>

    <section id="ownerPanel" class="card hidden"><h2>Invite a friend</h2><p class="muted">Each link works once and expires after seven days.</p><button id="inviteButton">Create invite link</button><div id="inviteOutput" class="invite-output hidden"></div></section>
  </section>

  <p class="footer">Private by design · Separate account and encrypted Garmin token for every person</p>

  <script>
    const byId=(id)=>document.getElementById(id);const invite=new URLSearchParams(location.search).get('invite');
    async function api(path,options={}){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Something went wrong');return body}
    function show(id){byId(id).classList.remove('hidden')}function hide(id){byId(id).classList.add('hidden')}
    function setKey(key){sessionStorage.setItem('enduranceApiKey',key)}
    function renderCommands(endpoint){const key=sessionStorage.getItem('enduranceApiKey');if(!key){show('needKey');hide('commands');return}hide('needKey');show('commands');byId('codexCommand').textContent="export ENDURANCE_BRIDGE_API_KEY='"+key+"'\\ncodex mcp add endurance-bridge --url "+endpoint+" --bearer-token-env-var ENDURANCE_BRIDGE_API_KEY";const config=JSON.stringify({type:'http',url:endpoint,headers:{Authorization:'Bearer \${ENDURANCE_BRIDGE_API_KEY}'}});byId('claudeCommand').textContent="export ENDURANCE_BRIDGE_API_KEY='"+key+"'\\nclaude mcp add-json endurance-bridge '"+config+"' --scope user"}
    async function load(){try{const account=await api('/api/v1/account');hide('loading');hide('welcome');hide('join');show('dashboard');byId('accountName').textContent=account.user.displayName;if(account.user.isOwner)show('ownerPanel');if(account.garmin.connected){byId('stepGarmin').classList.add('done');byId('garminStepText').textContent='Connected';byId('garminTitle').textContent='Garmin connected';byId('garminDescription').textContent='Your activities, workouts, schedules, and courses are ready.';byId('garminButton').textContent='Reconnect';byId('garminStatus').textContent='Ready';byId('garminStatus').className='ok';show('clients');renderCommands(account.mcpEndpoint)}else{byId('garminStatus').textContent='Not connected';byId('garminStatus').className='muted'}}catch{hide('loading');if(invite)show('join');else show('welcome')}}
    byId('ownerLogin').onclick=async()=>{try{await api('/api/v1/auth',{method:'POST',body:JSON.stringify({action:'owner',key:byId('ownerKey').value})});location.reload()}catch(error){byId('ownerMessage').textContent=error.message;byId('ownerMessage').className='error'}};
    byId('joinButton').onclick=async()=>{try{const result=await api('/api/v1/auth',{method:'POST',body:JSON.stringify({action:'join',invite,displayName:byId('displayName').value})});setKey(result.apiKey);history.replaceState({},'',location.pathname);await load()}catch(error){byId('joinMessage').textContent=error.message;byId('joinMessage').className='error'}};
    byId('garminButton').onclick=async()=>{byId('garminButton').disabled=true;try{const result=await api('/api/v1/setup/garmin/start',{method:'POST'});location.href=result.authorizationUrl}catch(error){byId('garminStatus').textContent=error.message;byId('garminStatus').className='error';byId('garminButton').disabled=false}};
    byId('keyButton').onclick=async()=>{try{const result=await api('/api/v1/account/key',{method:'POST'});setKey(result.apiKey);const account=await api('/api/v1/account');renderCommands(account.mcpEndpoint)}catch(error){alert(error.message)}};
    byId('inviteButton').onclick=async()=>{try{const result=await api('/api/v1/admin/invites',{method:'POST'});byId('inviteOutput').textContent=result.inviteUrl;show('inviteOutput');await navigator.clipboard.writeText(result.inviteUrl);byId('inviteButton').textContent='Invite link copied'}catch(error){byId('inviteOutput').textContent=error.message;show('inviteOutput')}};
    document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{await navigator.clipboard.writeText(byId(button.dataset.copy).textContent);button.textContent='Copied'});
    load();
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

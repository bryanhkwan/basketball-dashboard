// ============ COLLABORATE MESSENGER MODULE ============
// Full iMessage-style chat. DMs + group chats. Player picks as messages.
// Dependencies: auth.js, teambuilder.js (tbPlayerKey, tbPlayerLeague, tbAllComputed),
//               favorites.js (favsHeart, favsState, favsFetch)

var SHARES_API   = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
var CHAT_API     = 'https://hidden-salad-773b.bryanhkwan.workers.dev';

// ── State ─────────────────────────────────────────────────────────────────────
var chatState = {
  conversations: [],
  activeConvId: null,
  messages: {},
  users: [],
  loaded: false,
  polling: null,
  hasMore: {},
  replyTo: null,
  attachPlayer: null,
  attachPicks: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _chatEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _chatTime(iso) {
  if (!iso) return '';
  var d = new Date(iso), now = new Date();
  var diffMs = now - d, s = Math.floor(diffMs/1000);
  if (s < 60)  return 'just now';
  var m = Math.floor(s/60);
  if (m < 60)  return m + 'm ago';
  var h = Math.floor(m/60);
  if (h < 24)  return h + 'h ago';
  var days = Math.floor(h/24);
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function _chatFullTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function _chatConvName(conv, myUsername) {
  if (conv.type === 'group') return conv.name || 'Group';
  var other = (conv.members||[]).find(function(m){return m.username!==myUsername;});
  return other ? other.username : '(unknown)';
}
function _chatGetRow(playerKey) {
  if (typeof tbAllComputed === 'undefined' || !tbAllComputed) return null;
  var pools = Object.values(tbAllComputed);
  for (var i=0;i<pools.length;i++) {
    var found = pools[i].find(function(r){
      var k=typeof tbPlayerKey==='function'?tbPlayerKey(r):((r.Player||'')+'||'+(r.Team||''));
      return k===playerKey;
    });
    if (found) return found;
  }
  return null;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function chatFetch(path, opts) {
  if (typeof authIsGuest==='function' && authIsGuest()) return null;
  var token=typeof authGetToken==='function'?authGetToken():null;
  var headers={'Content-Type':'application/json'};
  if (token) headers['Authorization']='Bearer '+token;
  var res=await fetch(CHAT_API+path,Object.assign({credentials:'include',headers:headers},opts||{}));
  if (res.status===401) return null;
  if (!res.ok){var err=await res.json().catch(function(){return{};});throw new Error(err.error||('Error '+res.status));}
  return res.json().catch(function(){return null;});
}

// ── Load conversations ────────────────────────────────────────────────────────
async function chatLoad() {
  if (typeof authIsGuest==='function' && authIsGuest()) return;
  try {
    var data=await chatFetch('/chat/conversations');
    if (!data) return;
    chatState.conversations=data.conversations||[];
    chatState.loaded=true;
    chatUpdateBadge();
    chatRenderList();
  } catch(e){console.warn('[Chat] load error:',e);}
}

// ── Load messages ─────────────────────────────────────────────────────────────
async function chatLoadMessages(convId,before) {
  try {
    var qs=before?('?before='+encodeURIComponent(before)+'&limit=50'):'?limit=50';
    var data=await chatFetch('/chat/conversations/'+convId+'/messages'+qs);
    if (!data) return;
    if (before) chatState.messages[convId]=(data.messages||[]).concat(chatState.messages[convId]||[]);
    else chatState.messages[convId]=data.messages||[];
    chatState.hasMore[convId]=!!data.has_more;
    return data;
  } catch(e){console.warn('[Chat] loadMessages error:',e);}
}

// ── Poll active conversation ───────────────────────────────────────────────────
async function chatPollActive() {
  if (!chatState.activeConvId) return;
  var convId=chatState.activeConvId;
  var existing=chatState.messages[convId]||[];
  try {
    var data=await chatFetch('/chat/conversations/'+convId+'/messages?limit=50');
    if (!data||!data.messages) return;
    var newMsgs=data.messages;
    var existingIds=new Set(existing.map(function(m){return m.id;}));
    var added=newMsgs.filter(function(m){return !existingIds.has(m.id);});
    newMsgs.forEach(function(nm){
      var idx=existing.findIndex(function(m){return m.id===nm.id;});
      if (idx!==-1&&existing[idx].is_unsent!==nm.is_unsent) existing[idx].is_unsent=nm.is_unsent;
    });
    if (added.length){
      chatState.messages[convId]=existing.concat(added);
      chatRenderMessages(convId);
      chatScrollBottom();
    }
    await _chatRefreshConvList();
  } catch(e){}
}

async function _chatRefreshConvList() {
  try {
    var data=await chatFetch('/chat/conversations');
    if (!data) return;
    chatState.conversations=data.conversations||[];
    chatUpdateBadge();
    chatRenderList();
  } catch(e){}
}

function chatStartPolling(){chatStopPolling();chatState.polling=setInterval(chatPollActive,8000);}
function chatStopPolling(){if(chatState.polling){clearInterval(chatState.polling);chatState.polling=null;}}

// ── Open conversation ─────────────────────────────────────────────────────────
async function chatOpenConv(convId) {
  chatState.activeConvId=convId;
  chatRenderList();
  var empty=document.getElementById('chatEmpty');
  var header=document.getElementById('chatHeader');
  var msgs=document.getElementById('chatMessages');
  var composer=document.getElementById('chatComposer');
  if (empty)   empty.style.display='none';
  if (header)  header.style.display='';
  if (msgs)    msgs.style.display='';
  if (composer) composer.style.display='';
  chatRenderHeader(convId);
  if (!chatState.messages[convId]){
    if (msgs) msgs.innerHTML='<div class="chatMsgsLoading">Loading\u2026</div>';
    await chatLoadMessages(convId);
  }
  chatRenderMessages(convId);
  chatScrollBottom();
  chatMarkRead(convId);
  chatStartPolling();
}

// ── Render conversation list ──────────────────────────────────────────────────
function chatRenderList() {
  var listEl=document.getElementById('chatConvList');
  if (!listEl) return;
  var myName=typeof authGetUser==='function'?authGetUser():'';
  var q=((document.getElementById('chatConvSearch')||{}).value||'').toLowerCase();
  var convs=chatState.conversations.slice();
  if (q) convs=convs.filter(function(c){return _chatConvName(c,myName).toLowerCase().indexOf(q)!==-1;});
  if (!convs.length){
    listEl.innerHTML='<div class="chatConvEmpty">'+(q?'No matches':'No conversations yet.<br>Hit <b>\u270f\ufe0f</b> to start one.')+'</div>';
    return;
  }
  listEl.innerHTML=convs.map(function(c){
    var isActive=c.id===chatState.activeConvId;
    var name=_chatConvName(c,myName);
    var unread=c.unread_count>0;
    var lm=c.last_message;
    var preview='';
    if (lm){
      if (lm.is_unsent) preview='<i>Message unsent</i>';
      else if (lm.msg_type==='pick') preview='\uD83C\uDFC0 '+_chatEsc(lm.player_name||'Player pick');
      else if (lm.msg_type==='picks') preview='\uD83D\uDCCB Player package';
      else preview=_chatEsc((lm.content||'').slice(0,60));
    }
    var avatarChar=name.charAt(0).toUpperCase();
    var isGroup=c.type==='group';
    return '<div class="chatConvItem'+(isActive?' active':'')+(unread?' unread':'')+'" data-conv-id="'+c.id+'">'
      +'<div class="chatConvAvatar'+(isGroup?' chatConvAvatar--group':'')+'">'+(isGroup?'\uD83D\uDC65':avatarChar)+'</div>'
      +'<div class="chatConvInfo">'
        +'<div class="chatConvTop"><span class="chatConvName">'+_chatEsc(name)+'</span><span class="chatConvTime">'+(lm?_chatTime(lm.created_at):'')+'</span></div>'
        +'<div class="chatConvPreview">'+(preview||'<i>No messages yet</i>')+'</div>'
      +'</div>'
      +(unread?'<div class="chatConvUnreadDot">'+Math.min(c.unread_count,99)+'</div>':'')
    +'</div>';
  }).join('');
  listEl.querySelectorAll('.chatConvItem').forEach(function(el){
    el.onclick=function(){chatOpenConv(parseInt(el.getAttribute('data-conv-id')));};
  });
}

// ── Render conversation header ────────────────────────────────────────────────
function chatRenderHeader(convId) {
  var header=document.getElementById('chatHeader');
  if (!header) return;
  var myName=typeof authGetUser==='function'?authGetUser():'';
  var conv=chatState.conversations.find(function(c){return c.id===convId;});
  if (!conv){header.innerHTML='';return;}
  var name=_chatConvName(conv,myName);
  var members=(conv.members||[]).map(function(m){return m.username;}).filter(function(u){return u!==myName;});
  var subtitle=conv.type==='group'?(members.length+1)+' members':'@'+(members[0]||name);
  header.innerHTML=
    '<div class="chatHeaderLeft">'
      +'<div class="chatHeaderAvatar'+(conv.type==='group'?' chatConvAvatar--group':'')+'">'+(conv.type==='group'?'\uD83D\uDC65':name.charAt(0).toUpperCase())+'</div>'
      +'<div><div class="chatHeaderName">'+_chatEsc(name)+'</div><div class="chatHeaderSub">'+_chatEsc(subtitle)+'</div></div>'
    +'</div>'
    +'<div class="chatHeaderActions">'
      +(conv.type==='group'?'<button class="secondary chatHeaderBtn" id="chatManageGroupBtn">Manage</button>':'')
      +'<button class="secondary chatHeaderBtn chatHeaderLeaveBtn">Leave</button>'
    +'</div>';
  var leaveBtn=header.querySelector('.chatHeaderLeaveBtn');
  if (leaveBtn) leaveBtn.onclick=function(){if (!confirm('Leave this conversation?')) return;chatLeaveConv(convId);};
  var manageBtn=document.getElementById('chatManageGroupBtn');
  if (manageBtn) manageBtn.onclick=function(){chatOpenManageGroup(convId);};
}

// ── Render messages ───────────────────────────────────────────────────────────
function chatRenderMessages(convId) {
  var container=document.getElementById('chatMessages');
  if (!container) return;
  var myName=typeof authGetUser==='function'?authGetUser():'';
  var msgs=chatState.messages[convId]||[];
  var conv=chatState.conversations.find(function(c){return c.id===convId;});
  var isGroup=conv&&conv.type==='group';
  var hasMore=chatState.hasMore[convId];
  var html=hasMore?'<div class="chatLoadMore"><button id="chatLoadMoreBtn" class="secondary">Load earlier messages</button></div>':'';
  var prevDate='';
  msgs.forEach(function(msg){
    var isMe=msg.from_username===myName;
    var msgDate=msg.created_at?new Date(msg.created_at).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}):'';
    if (msgDate&&msgDate!==prevDate){html+='<div class="chatDateDivider"><span>'+_chatEsc(msgDate)+'</span></div>';prevDate=msgDate;}
    if (msg.is_unsent){html+='<div class="chatMsgRow chatMsgRow--'+(isMe?'me':'them')+'"><div class="chatMsgUnsent">Message unsent</div></div>';return;}
    var bubbleContent='';
    if (msg.reply_to&&!msg.reply_to.is_unsent){
      var rt=msg.reply_to;
      var rtText=rt.msg_type==='pick'?('\uD83C\uDFC0 '+(rt.player_name||'Pick')):(rt.msg_type==='picks'?'\uD83D\uDCCB Player package':((rt.content||'').slice(0,80)));
      bubbleContent+='<div class="chatReplyQuote"><span class="chatRQName">'+_chatEsc(rt.from_username)+'</span>'+_chatEsc(rtText)+'</div>';
    }
    if (msg.content) bubbleContent+='<div class="chatMsgText">'+_chatEsc(msg.content).replace(/\n/g,'<br>')+'</div>';
    if (msg.msg_type==='pick'&&msg.player_name) bubbleContent+=_chatRenderPickCard(msg,isMe);
    if (msg.msg_type==='picks'&&msg.picks_json){try{var picks=JSON.parse(msg.picks_json);bubbleContent+=_chatRenderPicksCard(picks,isMe);}catch(e){}}
    var showName=!isMe&&isGroup;
    var avatarHtml=!isMe?'<div class="chatMsgAvatar">'+_chatEsc(msg.from_username.charAt(0).toUpperCase())+'</div>':'';
    html+='<div class="chatMsgRow chatMsgRow--'+(isMe?'me':'them')+'" data-msg-id="'+msg.id+'">'
      +avatarHtml
      +'<div class="chatMsgWrap">'
        +(showName?'<div class="chatMsgSender">'+_chatEsc(msg.from_username)+'</div>':'')
        +'<div class="chatBubble chatBubble--'+(isMe?'me':'them')+'" title="'+_chatEsc(_chatFullTime(msg.created_at))+'">'
          +bubbleContent
        +'</div>'
        +'<div class="chatMsgActions">'
          +'<button class="chatMsgActionBtn chatReplyBtn" data-msg-id="'+msg.id+'" title="Reply">\u21a9</button>'
          +(isMe?'<button class="chatMsgActionBtn chatUnsendBtn" data-msg-id="'+msg.id+'" title="Unsend">\u2715</button>':'')
        +'</div>'
        +'<div class="chatMsgTime">'+_chatTime(msg.created_at)+'</div>'
      +'</div>'
    +'</div>';
  });
  container.innerHTML=html||'<div class="chatNoMsgs">No messages yet. Say hi! \uD83D\uDC4B</div>';
  var loadMoreBtn=document.getElementById('chatLoadMoreBtn');
  if (loadMoreBtn){
    loadMoreBtn.onclick=async function(){
      var oldest=msgs[0];if(!oldest)return;
      loadMoreBtn.textContent='Loading\u2026';loadMoreBtn.disabled=true;
      var scrollBefore=container.scrollHeight;
      await chatLoadMessages(convId,oldest.created_at);
      chatRenderMessages(convId);
      container.scrollTop=container.scrollHeight-scrollBefore;
    };
  }
  container.querySelectorAll('.chatReplyBtn').forEach(function(btn){
    btn.onclick=function(){
      var msgId=parseInt(btn.getAttribute('data-msg-id'));
      var msg2=(chatState.messages[convId]||[]).find(function(m){return m.id===msgId;});
      if (msg2) chatSetReply(msg2);
    };
  });
  container.querySelectorAll('.chatUnsendBtn').forEach(function(btn){
    btn.onclick=function(){
      var msgId=parseInt(btn.getAttribute('data-msg-id'));
      if (!confirm('Unsend this message?')) return;
      chatUnsend(msgId,convId);
    };
  });
  container.querySelectorAll('[data-view-pick]').forEach(function(btn){
    btn.onclick=function(){var r=_chatGetRow(btn.getAttribute('data-view-pick'));if(r&&typeof openProfile==='function')openProfile(r);};
  });
  container.querySelectorAll('[data-save-pick]').forEach(function(btn){
    btn.onclick=function(){
      var key=btn.getAttribute('data-save-pick');
      var r=_chatGetRow(key);
      var pname=btn.getAttribute('data-pname');var team=btn.getAttribute('data-team');var lg=btn.getAttribute('data-league');var pos=btn.getAttribute('data-pos');
      if (r&&typeof favsHeart==='function'){favsHeart(r);btn.textContent='\u2713 Saved';btn.disabled=true;}
      else if (typeof favsFetch==='function'){
        favsFetch('',{method:'POST',body:JSON.stringify({player_key:key,player_name:pname,team:team,league:lg,pos:pos})})
          .then(function(res){
            if(res&&!res.error){
              if(typeof favsState!=='undefined')favsState.favorites.unshift(Object.assign({id:String(res.id||Date.now()),folder:'',created_at:res.created_at||new Date().toISOString()},{player_key:key,player_name:pname,team:team,league:lg,pos:pos}));
              if(typeof favsRenderPage==='function')favsRenderPage();
              btn.textContent='\u2713 Saved';btn.disabled=true;
            }
          });
      }
    };
  });
}

function _chatRenderPickCard(msg,isMe){
  var r=_chatGetRow(msg.player_key);
  var badge=(msg.league||'MBB')==='WBB'?'<span class="favsLeagueBadge favsLeagueBadge--wbb">WBB</span>':'<span class="favsLeagueBadge favsLeagueBadge--mbb">MBB</span>';
  var ppg=r?(+(r.PPG||0)).toFixed(1):'—';var rpg=r?(+(r.RPG||0)).toFixed(1):'—';var apg=r?(+(r.APG||0)).toFixed(1):'—';
  return '<div class="chatPickCard">'
    +'<div class="chatPickTop">'+badge+'<span class="chatPickName">'+_chatEsc(msg.player_name||'—')+'</span>'+(msg.team?'<span class="chatPickTeam">'+_chatEsc(msg.team)+(msg.pos?' \u00b7 '+_chatEsc(msg.pos):'')+' </span>':'')+'</div>'
    +'<div class="chatPickStats"><span>'+ppg+' PPG</span><span>'+rpg+' RPG</span><span>'+apg+' APG</span></div>'
    +'<div class="chatPickBtns">'+(r?'<button class="secondary chatPickBtn" data-view-pick="'+_chatEsc(msg.player_key)+'">View Profile</button>':'')
      +(!isMe?'<button class="secondary chatPickBtn" data-save-pick="'+_chatEsc(msg.player_key)+'" data-pname="'+_chatEsc(msg.player_name||'')+'" data-team="'+_chatEsc(msg.team||'')+'" data-league="'+_chatEsc(msg.league||'')+'" data-pos="'+_chatEsc(msg.pos||'')+'">\u2764\ufe0f Save</button>':'')
    +'</div></div>';
}

function _chatRenderPicksCard(picks,isMe){
  if(!picks||!picks.length)return'';
  var preview=picks.slice(0,3).map(function(p){return _chatEsc(p.player_name);}).join(', ')+(picks.length>3?'\u2026':'');
  var rows=picks.map(function(p){
    var r=_chatGetRow(p.player_key);
    var badge=((p.league||'MBB')==='WBB'?'<span class="favsLeagueBadge favsLeagueBadge--wbb" style="font-size:9px">WBB</span>':'<span class="favsLeagueBadge favsLeagueBadge--mbb" style="font-size:9px">MBB</span>');
    return '<div class="chatPicksRow">'+badge+'<span class="chatPicksName">'+_chatEsc(p.player_name)+'</span>'+(p.team?'<span class="chatPickTeam">'+_chatEsc(p.team)+'</span>':'')+(p.message?'<div class="chatPickNote">'+_chatEsc(p.message)+'</div>':'')
      +(!isMe?'<button class="secondary chatPickBtn" style="font-size:10px;padding:2px 8px;margin-left:auto" data-save-pick="'+_chatEsc(p.player_key)+'" data-pname="'+_chatEsc(p.player_name||'')+'" data-team="'+_chatEsc(p.team||'')+'" data-league="'+_chatEsc(p.league||'')+'" data-pos="'+_chatEsc(p.pos||'')+'">\u2764\ufe0f</button>':'')
      +(r?'<button class="secondary chatPickBtn" style="font-size:10px;padding:2px 8px" data-view-pick="'+_chatEsc(p.player_key)+'">&#8599;</button>':'')
    +'</div>';
  }).join('');
  return'<div class="chatPicksCard"><div class="chatPicksHeader">\uD83D\uDCCB Player Package \u00b7 '+picks.length+' players</div><div class="chatPicksPreview">'+preview+'</div><div class="chatPicksList">'+rows+'</div></div>';
}

function chatScrollBottom(){var msgs=document.getElementById('chatMessages');if(msgs)msgs.scrollTop=msgs.scrollHeight;}

// ── Mark read ─────────────────────────────────────────────────────────────────
async function chatMarkRead(convId){
  try{
    await chatFetch('/chat/conversations/'+convId+'/read',{method:'PATCH',body:'{}'});
    var conv=chatState.conversations.find(function(c){return c.id===convId;});
    if(conv)conv.unread_count=0;
    chatUpdateBadge();chatRenderList();
  }catch(e){}
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function chatUpdateBadge(){
  var total=chatState.conversations.reduce(function(s,c){return s+(c.unread_count||0);},0);
  var badge=document.getElementById('sharesNavBadge');
  if(!badge)return;
  badge.style.display=total?'inline-flex':'none';
  badge.textContent=total>99?'99+':String(total);
}

// ── Reply UI ──────────────────────────────────────────────────────────────────
function chatSetReply(msg){
  chatState.replyTo=msg;
  var bar=document.getElementById('chatReplyBar');if(!bar)return;
  var preview=msg.is_unsent?'Message unsent':(msg.msg_type==='pick'?('\uD83C\uDFC0 '+(msg.player_name||'Pick')):(msg.content||'').slice(0,80));
  bar.style.display='';
  bar.innerHTML='<div class="chatReplyBarInner"><span class="chatRQName">'+_chatEsc(msg.from_username)+'</span>'+_chatEsc(preview)+'</div><button class="chatReplyBarClose" id="chatReplyClose">\u2715</button>';
  document.getElementById('chatReplyClose').onclick=function(){chatClearReply();};
  var inp=document.getElementById('chatInput');if(inp)inp.focus();
}
function chatClearReply(){
  chatState.replyTo=null;
  var bar=document.getElementById('chatReplyBar');
  if(bar){bar.style.display='none';bar.innerHTML='';}
}

// ── Attach player ─────────────────────────────────────────────────────────────
function chatSetAttachPlayer(r){
  chatState.attachPlayer=r;chatState.attachPicks=null;
  var bar=document.getElementById('chatAttachBar');if(!bar)return;
  bar.style.display='';
  bar.innerHTML='<div class="chatAttachBarInner">\uD83C\uDFC0 <b>'+_chatEsc(r.Player||'')+'</b>'+(r.Team?' \u00b7 '+_chatEsc(r.Team):'')+'</div><button class="chatReplyBarClose" id="chatAttachClose">\u2715</button>';
  document.getElementById('chatAttachClose').onclick=function(){chatClearAttach();};
}
function chatSetAttachPicks(favs){
  chatState.attachPicks=favs;chatState.attachPlayer=null;
  var bar=document.getElementById('chatAttachBar');if(!bar)return;
  var names=favs.slice(0,3).map(function(f){return f.player_name;}).join(', ')+(favs.length>3?'\u2026':'');
  bar.style.display='';
  bar.innerHTML='<div class="chatAttachBarInner">\uD83D\uDCCB <b>'+favs.length+' players</b>: '+_chatEsc(names)+'</div><button class="chatReplyBarClose" id="chatAttachClose">\u2715</button>';
  document.getElementById('chatAttachClose').onclick=function(){chatClearAttach();};
}
function chatClearAttach(){
  chatState.attachPlayer=null;chatState.attachPicks=null;
  var bar=document.getElementById('chatAttachBar');
  if(bar){bar.style.display='none';bar.innerHTML='';}
}

// ── Send message ──────────────────────────────────────────────────────────────
async function chatSendMessage(convId){
  if(!convId)return;
  var inp=document.getElementById('chatInput');
  var sendBtn=document.getElementById('chatSendBtn');
  var content=inp?inp.value.trim():'';
  var r=chatState.attachPlayer;
  var picks=chatState.attachPicks;
  if(!content&&!r&&!picks)return;
  if(sendBtn)sendBtn.disabled=true;
  try{
    var payload={content:content,reply_to_id:chatState.replyTo?chatState.replyTo.id:null};
    if(picks){
      payload.msg_type='picks';
      payload.picks_json=JSON.stringify(picks.map(function(fav){return{player_key:fav.player_key,player_name:fav.player_name,team:fav.team||'',league:fav.league||'MBB',pos:fav.pos||'',message:fav._note||''};}));
    }else if(r){
      payload.msg_type='pick';
      payload.player_key=typeof tbPlayerKey==='function'?tbPlayerKey(r):((r.Player||'')+'||'+(r.Team||''));
      payload.player_name=r.Player||'';payload.team=r.Team||'';
      payload.league=typeof tbPlayerLeague==='function'?tbPlayerLeague(r):(r._league||'MBB');
      payload.pos=r.Pos||r.Position||'';
    }else{payload.msg_type='text';}
    var result=await chatFetch('/chat/conversations/'+convId+'/messages',{method:'POST',body:JSON.stringify(payload)});
    if(result&&result.id){
      var myName=typeof authGetUser==='function'?authGetUser():'';
      var newMsg=Object.assign({id:result.id,from_user_id:0,from_username:myName,is_unsent:0,created_at:result.created_at||new Date().toISOString(),reply_to:chatState.replyTo||null},payload);
      chatState.messages[convId]=(chatState.messages[convId]||[]).concat([newMsg]);
      if(inp)inp.value='';
      inp.style.height='auto';
      chatClearReply();chatClearAttach();
      chatRenderMessages(convId);chatScrollBottom();
      await _chatRefreshConvList();
    }
  }catch(e){console.warn('[Chat] send error:',e);}
  if(sendBtn)sendBtn.disabled=false;
}

// ── Unsend ────────────────────────────────────────────────────────────────────
async function chatUnsend(msgId,convId){
  try{
    await chatFetch('/chat/messages/'+msgId,{method:'DELETE'});
    var msgs=chatState.messages[convId]||[];
    var msg=msgs.find(function(m){return m.id===msgId;});
    if(msg){msg.is_unsent=1;msg.content='';msg.player_name='';msg.picks_json='';}
    chatRenderMessages(convId);
    await _chatRefreshConvList();
  }catch(e){console.warn('[Chat] unsend error:',e);}
}

// ── Leave conversation ────────────────────────────────────────────────────────
async function chatLeaveConv(convId){
  try{
    await chatFetch('/chat/conversations/'+convId,{method:'DELETE'});
    chatState.conversations=chatState.conversations.filter(function(c){return c.id!==convId;});
    delete chatState.messages[convId];
    if(chatState.activeConvId===convId){
      chatState.activeConvId=null;chatStopPolling();
      var empty=document.getElementById('chatEmpty');
      var header=document.getElementById('chatHeader');
      var msgs=document.getElementById('chatMessages');
      var composer=document.getElementById('chatComposer');
      if(empty)empty.style.display='';
      if(header)header.style.display='none';
      if(msgs){msgs.style.display='none';msgs.innerHTML='';}
      if(composer)composer.style.display='none';
    }
    chatUpdateBadge();chatRenderList();
  }catch(e){console.warn('[Chat] leave error:',e);}
}

// ── Create conversation ───────────────────────────────────────────────────────
async function chatCreateConv(type,usernamesOrName){
  var payload={type:type};
  if(type==='dm')payload.usernames=[usernamesOrName];
  else{payload.name=usernamesOrName.name;payload.usernames=usernamesOrName.usernames||[];}
  var result=await chatFetch('/chat/conversations',{method:'POST',body:JSON.stringify(payload)});
  if(!result||!result.id)throw new Error('Failed to create conversation');
  await _chatRefreshConvList();
  return result.id;
}

// ── Load users ────────────────────────────────────────────────────────────────
async function chatLoadUsers(){
  if(chatState.users.length)return;
  try{var data=await chatFetch('/users');if(!data)return;chatState.users=(data.users||[]).map(function(u){return u.username;});}catch(e){}
}

// ── New Chat Modal ────────────────────────────────────────────────────────────
function chatOpenNewModal(){
  var back=document.getElementById('chatNewModalBack');if(!back)return;
  chatLoadUsers();
  var typeEl=document.getElementById('chatNewType');var dmArea=document.getElementById('chatNewDmArea');var grpArea=document.getElementById('chatNewGrpArea');var errEl=document.getElementById('chatNewErr');
  if(typeEl)typeEl.value='dm';if(dmArea)dmArea.style.display='';if(grpArea)grpArea.style.display='none';if(errEl)errEl.textContent='';
  var dmInput=document.getElementById('chatNewDmUser');if(dmInput)dmInput.value='';
  var grpName=document.getElementById('chatNewGrpName');if(grpName)grpName.value='';
  var grpMbrs=document.getElementById('chatNewGrpMembers');if(grpMbrs)grpMbrs.value='';
  back.style.display='flex';
  setTimeout(function(){if(dmInput)dmInput.focus();},60);
}
function chatCloseNewModal(){var back=document.getElementById('chatNewModalBack');if(back)back.style.display='none';}
async function _chatDoCreate(){
  var typeEl=document.getElementById('chatNewType');var errEl=document.getElementById('chatNewErr');var btn=document.getElementById('chatNewCreateBtn');
  var type=typeEl?typeEl.value:'dm';if(errEl)errEl.textContent='';if(btn){btn.disabled=true;btn.textContent='Creating\u2026';}
  try{
    var convId;
    if(type==='dm'){
      var dmInput=document.getElementById('chatNewDmUser');var uname=(dmInput?dmInput.value:'').trim();
      if(!uname){if(errEl)errEl.textContent='Enter a username.';return;}
      convId=await chatCreateConv('dm',uname);
    }else{
      var grpName=document.getElementById('chatNewGrpName');var grpMbrs=document.getElementById('chatNewGrpMembers');
      var name=(grpName?grpName.value:'').trim();
      var members=(grpMbrs?grpMbrs.value:'').split(/[\s,]+/).map(function(u){return u.trim();}).filter(Boolean);
      if(!name){if(errEl)errEl.textContent='Enter a group name.';return;}
      if(!members.length){if(errEl)errEl.textContent='Add at least one member.';return;}
      convId=await chatCreateConv('group',{name:name,usernames:members});
    }
    chatCloseNewModal();chatOpenConv(convId);
  }catch(e){if(errEl)errEl.textContent=e.message||'Failed.';}
  if(btn){btn.disabled=false;btn.textContent='Start';}
}

// ── Manage Group Modal ────────────────────────────────────────────────────────
function chatOpenManageGroup(convId){
  var conv=chatState.conversations.find(function(c){return c.id===convId;});if(!conv)return;
  var back=document.getElementById('chatManageModalBack');if(!back)return;
  back.setAttribute('data-conv-id',convId);
  var nameEl=document.getElementById('chatManageGrpName');if(nameEl)nameEl.value=conv.name||'';
  var memberEl=document.getElementById('chatManageMemberList');
  if(memberEl)memberEl.innerHTML=conv.members.map(function(m){return'<div class="chatManageMember"><span>@'+_chatEsc(m.username)+'</span></div>';}).join('');
  var addEl=document.getElementById('chatManageAddUser');if(addEl)addEl.value='';
  var errEl=document.getElementById('chatManageErr');if(errEl)errEl.textContent='';
  back.style.display='flex';
}
function chatCloseManageGroup(){var back=document.getElementById('chatManageModalBack');if(back)back.style.display='none';}

// ── Player Picker Modal ───────────────────────────────────────────────────────
function chatOpenPlayerPicker(){
  var back=document.getElementById('chatPickerBack');if(!back)return;
  var inp=document.getElementById('chatPickerSearch');if(inp)inp.value='';
  var list=document.getElementById('chatPickerList');if(list)list.innerHTML='<div class="chatPickerHint">Type a player name to search\u2026</div>';
  back.style.display='flex';
  setTimeout(function(){if(inp)inp.focus();},60);
}
function chatClosePlayerPicker(){var back=document.getElementById('chatPickerBack');if(back)back.style.display='none';}
function chatPickerSearch(q){
  var list=document.getElementById('chatPickerList');if(!list)return;
  q=(q||'').toLowerCase().trim();
  if(!q){list.innerHTML='<div class="chatPickerHint">Type a player name to search\u2026</div>';return;}
  if(typeof tbAllComputed==='undefined')return;
  var results=[];
  Object.values(tbAllComputed).forEach(function(pool){
    pool.forEach(function(r){if((r.Player||'').toLowerCase().indexOf(q)!==-1||(r.Team||'').toLowerCase().indexOf(q)!==-1)results.push(r);});
  });
  results=results.slice(0,30);
  if(!results.length){list.innerHTML='<div class="chatPickerHint">No results.</div>';return;}
  list.innerHTML=results.map(function(r){
    var key=typeof tbPlayerKey==='function'?tbPlayerKey(r):((r.Player||'')+'||'+(r.Team||''));
    var lg=typeof tbPlayerLeague==='function'?tbPlayerLeague(r):(r._league||'MBB');
    var badge=lg==='WBB'?'<span class="favsLeagueBadge favsLeagueBadge--wbb" style="font-size:9px">WBB</span>':'<span class="favsLeagueBadge favsLeagueBadge--mbb" style="font-size:9px">MBB</span>';
    return'<div class="chatPickerRow" data-pk="'+_chatEsc(key)+'">'+badge+'<span class="chatPickerName">'+_chatEsc(r.Player||'')+'</span><span class="chatPickerTeam">'+_chatEsc(r.Team||'')+'</span></div>';
  }).join('');
  list.querySelectorAll('.chatPickerRow').forEach(function(row){
    row.onclick=function(){
      var pk=row.getAttribute('data-pk');var r2=null;
      Object.values(tbAllComputed).some(function(pool){r2=pool.find(function(x){var k2=typeof tbPlayerKey==='function'?tbPlayerKey(x):((x.Player||'')+'||'+(x.Team||''));return k2===pk;});return!!r2;});
      if(r2){chatSetAttachPlayer(r2);chatClosePlayerPicker();}
    };
  });
}

// ── Send pick from profile modal (backwards compat) ───────────────────────────
var _chatSendPickPlayer=null;
function sharesOpenSendModal(r){
  if(typeof authIsGuest==='function'&&authIsGuest()){alert('Please log in to send picks.');return;}
  _chatSendPickPlayer=r;
  chatLoadUsers();
  var back=document.getElementById('chatSendPickBack');if(!back)return;
  var nameEl=document.getElementById('chatSendPickName');if(nameEl)nameEl.textContent=(r.Player||'')+(r.Team?'  \u00b7  '+r.Team:'');
  var toEl=document.getElementById('chatSendPickTo');var msgEl=document.getElementById('chatSendPickMsg');var errEl=document.getElementById('chatSendPickErr');var btn=document.getElementById('chatSendPickBtn');
  if(toEl)toEl.value='';if(msgEl)msgEl.value='';if(errEl)errEl.textContent='';if(btn){btn.disabled=false;btn.textContent='Send';}
  back.style.display='flex';
  setTimeout(function(){if(toEl)toEl.focus();},60);
}
function sharesCloseSendModal(){var back=document.getElementById('chatSendPickBack');if(back)back.style.display='none';_chatSendPickPlayer=null;}
async function _chatDoSendPick(){
  if(!_chatSendPickPlayer)return;
  var toEl=document.getElementById('chatSendPickTo');var msgEl=document.getElementById('chatSendPickMsg');var errEl=document.getElementById('chatSendPickErr');var btn=document.getElementById('chatSendPickBtn');
  var to=(toEl?toEl.value:'').trim();
  if(!to){if(errEl)errEl.textContent='Enter a username.';return;}
  if(btn){btn.disabled=true;btn.textContent='Sending\u2026';}if(errEl)errEl.textContent='';
  try{
    var convId=await chatCreateConv('dm',to);
    var r=_chatSendPickPlayer;
    var key=typeof tbPlayerKey==='function'?tbPlayerKey(r):((r.Player||'')+'||'+(r.Team||''));
    var league=typeof tbPlayerLeague==='function'?tbPlayerLeague(r):(r._league||'MBB');
    var msg=(msgEl?msgEl.value:'').trim();
    await chatFetch('/chat/conversations/'+convId+'/messages',{method:'POST',body:JSON.stringify({msg_type:'pick',content:msg,player_key:key,player_name:r.Player||'',team:r.Team||'',league:league,pos:r.Pos||r.Position||''})});
    await _chatRefreshConvList();
    sharesCloseSendModal();
    var colBtn=document.querySelector('[data-page="pageCollaborate"]');
    if(colBtn)colBtn.click();
    setTimeout(function(){chatOpenConv(convId);},300);
  }catch(e){if(errEl)errEl.textContent=e.message||'Failed.';if(btn){btn.disabled=false;btn.textContent='Send';}}
}

// ── Bulk send from Favorites (backwards compat) ───────────────────────────────
var _chatBulkFavs=null;
function sharesOpenBulkModal(folderName,favs){
  if(typeof authIsGuest==='function'&&authIsGuest()){alert('Please log in to send picks.');return;}
  _chatBulkFavs=favs||[];
  chatLoadUsers();
  var back=document.getElementById('chatBulkPickBack');if(!back)return;
  var titleEl=document.getElementById('chatBulkPickTitle');if(titleEl)titleEl.textContent='\uD83D\uDCC1 '+folderName+' \u2014 '+_chatBulkFavs.length+' player'+(_chatBulkFavs.length!==1?'s':'');
  var toEl=document.getElementById('chatBulkPickTo');var msgEl=document.getElementById('chatBulkPickMsg');var errEl=document.getElementById('chatBulkPickErr');var btn=document.getElementById('chatBulkPickBtn');var listEl=document.getElementById('chatBulkPickList');
  if(toEl)toEl.value='';if(msgEl)msgEl.value='';if(errEl)errEl.textContent='';if(btn){btn.disabled=false;btn.textContent='Send All';}
  if(listEl)listEl.innerHTML=_chatBulkFavs.map(function(fav,i){return'<div class="bulkSharePlayer"><div class="bulkSharePlayerName">'+_chatEsc(fav.player_name||'')+(fav.team?'<span class="shareCardTeam"> \u00b7 '+_chatEsc(fav.team)+'</span>':'')+'</div><textarea class="bulkSharePlayerNote" data-idx="'+i+'" placeholder="Note (optional)\u2026" rows="2"></textarea></div>';}).join('');
  back.style.display='flex';
  setTimeout(function(){if(toEl)toEl.focus();},60);
}
function sharesCloseBulkModal(){var back=document.getElementById('chatBulkPickBack');if(back)back.style.display='none';_chatBulkFavs=null;}
async function _chatDoBulkSend(){
  var toEl=document.getElementById('chatBulkPickTo');var msgEl=document.getElementById('chatBulkPickMsg');var errEl=document.getElementById('chatBulkPickErr');var btn=document.getElementById('chatBulkPickBtn');
  var to=(toEl?toEl.value:'').trim();
  if(!to){if(errEl)errEl.textContent='Enter a username.';return;}
  if(btn){btn.disabled=true;btn.textContent='Sending\u2026';}if(errEl)errEl.textContent='';
  try{
    var notes=[];document.querySelectorAll('.bulkSharePlayerNote').forEach(function(ta){notes.push(ta.value.trim());});
    var picks=(_chatBulkFavs||[]).map(function(fav,i){return Object.assign({},fav,{_note:notes[i]||'',message:notes[i]||''});});
    var convId=await chatCreateConv('dm',to);
    var msg=(msgEl?msgEl.value:'').trim();
    await chatFetch('/chat/conversations/'+convId+'/messages',{method:'POST',body:JSON.stringify({msg_type:'picks',content:msg,picks_json:JSON.stringify(picks.map(function(p){return{player_key:p.player_key,player_name:p.player_name,team:p.team||'',league:p.league||'MBB',pos:p.pos||'',message:p._note||''};}))})});
    await _chatRefreshConvList();
    sharesCloseBulkModal();
    var colBtn=document.querySelector('[data-page="pageCollaborate"]');
    if(colBtn)colBtn.click();
    setTimeout(function(){chatOpenConv(convId);},300);
  }catch(e){if(errEl)errEl.textContent=e.message||'Failed.';if(btn){btn.disabled=false;btn.textContent='Send All';}}
}

// ── initSharesPage ────────────────────────────────────────────────────────────
function initSharesPage(){
  var newBtn=document.getElementById('chatNewBtn');var newBack=document.getElementById('chatNewModalBack');var newCreate=document.getElementById('chatNewCreateBtn');var newCancel=document.getElementById('chatNewCancelBtn');var newType=document.getElementById('chatNewType');
  if(newBtn)newBtn.onclick=chatOpenNewModal;
  if(newCreate)newCreate.onclick=_chatDoCreate;
  if(newCancel)newCancel.onclick=chatCloseNewModal;
  if(newBack)newBack.onclick=function(e){if(e.target===newBack)chatCloseNewModal();};
  if(newType)newType.onchange=function(){
    var dm=document.getElementById('chatNewDmArea');var grp=document.getElementById('chatNewGrpArea');
    if(dm)dm.style.display=newType.value==='dm'?'':'none';if(grp)grp.style.display=newType.value==='group'?'':'none';
  };
  var mgBack=document.getElementById('chatManageModalBack');var mgCancel=document.getElementById('chatManageCancelBtn');var mgSave=document.getElementById('chatManageSaveBtn');var mgAdd=document.getElementById('chatManageAddBtn');
  if(mgCancel)mgCancel.onclick=chatCloseManageGroup;
  if(mgBack)mgBack.onclick=function(e){if(e.target===mgBack)chatCloseManageGroup();};
  if(mgSave)mgSave.onclick=async function(){
    var convId=parseInt(mgBack.getAttribute('data-conv-id'));var nameEl=document.getElementById('chatManageGrpName');var name=(nameEl?nameEl.value:'').trim();if(!name)return;
    try{await chatFetch('/chat/conversations/'+convId,{method:'PATCH',body:JSON.stringify({name:name})});var conv=chatState.conversations.find(function(c){return c.id===convId;});if(conv)conv.name=name;chatRenderList();chatRenderHeader(convId);chatCloseManageGroup();}catch(e){console.warn('[Chat] rename error:',e);}
  };
  if(mgAdd)mgAdd.onclick=async function(){
    var convId=parseInt(mgBack.getAttribute('data-conv-id'));var addEl=document.getElementById('chatManageAddUser');var uname=(addEl?addEl.value:'').trim();if(!uname)return;
    var errEl=document.getElementById('chatManageErr');
    try{await chatFetch('/chat/conversations/'+convId+'/members',{method:'POST',body:JSON.stringify({username:uname})});if(addEl)addEl.value='';await _chatRefreshConvList();chatOpenManageGroup(convId);}catch(e){if(errEl)errEl.textContent=e.message;}
  };
  var convSearch=document.getElementById('chatConvSearch');if(convSearch)convSearch.addEventListener('input',chatRenderList);
  var inp=document.getElementById('chatInput');var sendBtn=document.getElementById('chatSendBtn');var attachBtn=document.getElementById('chatAttachBtn');
  if(inp){
    inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();chatSendMessage(chatState.activeConvId);}});
    inp.addEventListener('input',function(){inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,120)+'px';});
  }
  if(sendBtn)sendBtn.onclick=function(){chatSendMessage(chatState.activeConvId);};
  if(attachBtn)attachBtn.onclick=chatOpenPlayerPicker;
  var pickerBack=document.getElementById('chatPickerBack');var pickerSearch=document.getElementById('chatPickerSearch');var pickerClose=document.getElementById('chatPickerClose');
  if(pickerClose)pickerClose.onclick=chatClosePlayerPicker;
  if(pickerBack)pickerBack.onclick=function(e){if(e.target===pickerBack)chatClosePlayerPicker();};
  if(pickerSearch){
    var pickerTimer=null;
    pickerSearch.addEventListener('input',function(){clearTimeout(pickerTimer);pickerTimer=setTimeout(function(){chatPickerSearch(pickerSearch.value);},200);});
  }
  var spBack=document.getElementById('chatSendPickBack');var spCancel=document.getElementById('chatSendPickCancel');var spSend=document.getElementById('chatSendPickBtn');
  if(spCancel)spCancel.onclick=sharesCloseSendModal;if(spSend)spSend.onclick=_chatDoSendPick;if(spBack)spBack.onclick=function(e){if(e.target===spBack)sharesCloseSendModal();};
  var bpBack=document.getElementById('chatBulkPickBack');var bpCancel=document.getElementById('chatBulkPickCancel');var bpSend=document.getElementById('chatBulkPickBtn');
  if(bpCancel)bpCancel.onclick=sharesCloseBulkModal;if(bpSend)bpSend.onclick=_chatDoBulkSend;if(bpBack)bpBack.onclick=function(e){if(e.target===bpBack)sharesCloseBulkModal();};
  document.querySelectorAll('.pageNavBtn:not([data-page="pageCollaborate"])').forEach(function(btn){btn.addEventListener('click',chatStopPolling);});
  var colNavBtn=document.querySelector('[data-page="pageCollaborate"]');
  if(colNavBtn){
    colNavBtn.addEventListener('click',function(){
      chatLoad().then(function(){if(chatState.activeConvId)chatStartPolling();});
    });
  }
  document.addEventListener('visibilitychange',function(){if(document.hidden)chatStopPolling();else if(chatState.activeConvId)chatStartPolling();});
  chatRenderList();
}

function sharesLoad(){return chatLoad();}
function sharesUpdateBadge(){return chatUpdateBadge();}

window.SharesManager={sharesLoad,sharesOpenSendModal,sharesCloseSendModal,sharesOpenBulkModal,sharesCloseBulkModal,sharesUpdateBadge,chatLoad,chatUpdateBadge,initSharesPage};

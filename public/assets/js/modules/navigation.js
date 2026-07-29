var viewMeta={
  command:['Command Center','Unified market intelligence across gamma, flow, heatmap, and Trinity.'],
  gamma:['Gamma Center','Gamma structure, positioning levels, expiry profiles, and regime signals.'],
  heatmap:['Heatmap Matrix','Expiration-by-strike pressure with institutional GEX context.'],
  trinity:['Trinity View','Linked SPX, SPY, and QQQ positioning with independent expiry control.'],
  flow:['Options Flow','Filter notable options activity by asset, structure, premium, and direction.'],
  chart:['Chart Lab','Interactive price action with gamma levels and positioning intelligence.'],
  openInterest:['Open Interest','Daily positioning map and morning scenario brief.'],
  alerts:['Alerts','Build precise rules for levels, flow events, and Trinity alignment.']
};

function renderView(view){
  if(typeof renderDataTrustBar==='function')renderDataTrustBar();
  if(view==='command'){
    renderStats();
    renderChart('mainChart');
    renderFlow('flowMini',true);
    renderTri('triMini');
    renderHeat('hmMini');
  }else if(view==='gamma'){
    renderStats();
    renderChart('gammaChart');
    renderStrike();
    ensureGammaProfileExpand();
  }else if(view==='heatmap'){
    renderHeat('hmFull');
  }else if(view==='trinity'){
    renderTri('triFull');
  }else if(view==='flow'){
    renderFlow('flowRows',false);
  }else if(view==='chart'){
    renderChart('labChart');
  }else if(view==='openInterest'){
    renderOpenInterest();
  }else if(view==='alerts'){
    renderAlerts();
  }
  state.renderedViews=state.renderedViews||{};
  state.renderedViews[view]=Number(state.renderRevision||0);
}

var viewRenderFrame=0;
function scheduleViewRender(view){
  if(viewRenderFrame)cancelAnimationFrame(viewRenderFrame);
  viewRenderFrame=requestAnimationFrame(function(){
    viewRenderFrame=0;
    renderView(view||state.view);
    if(typeof refreshExpand==='function')refreshExpand();
  });
}

function setView(view,options){
  var viewStarted=performance.now();
  options=options||{};
  if(!viewMeta[view])view='command';
  var workspace=document.querySelector('.workspace');
  state.viewScroll=state.viewScroll||{};
  if(workspace&&state.view)state.viewScroll[state.view]=workspace.scrollTop;
  state.view=view;
  app.classList.toggle('oi-mode',view==='openInterest');
  if(window.modal&&modal.classList.contains('open')&&typeof closeExpand==='function')closeExpand();
  document.querySelectorAll('.view').forEach(function(section){
    var active=section.id===view;
    section.classList.toggle('active',active);
    section.setAttribute('aria-hidden',active?'false':'true');
  });
  document.querySelectorAll('.nav button[data-view]').forEach(function(button){
    var active=button.getAttribute('data-view')===view;
    button.classList.toggle('active',active);
    button.setAttribute('aria-current',active?'page':'false');
    button.setAttribute('aria-pressed',active?'true':'false');
  });
  var meta=viewMeta[view];
  heading.textContent=meta[0];
  sub.textContent=meta[1];
  document.title=meta[0]+' | Risk Story';
  var refresh=document.getElementById('refreshMarket');
  if(refresh)refresh.textContent=view==='openInterest'?'Sync Morning Brief':'Sync Feed';
  state.renderedViews=state.renderedViews||{};
  var needsRender=state.renderedViews[view]!==Number(state.renderRevision||0);
  if(needsRender)renderView(view);
  if(view==='trinity'&&typeof ensureTrinityData==='function')ensureTrinityData(false);
  state.lastViewCached=!needsRender;
  state.lastViewRenderMs=Math.round((performance.now()-viewStarted)*10)/10;
  app.dataset.navCached=String(state.lastViewCached);
  app.dataset.navMs=String(state.lastViewRenderMs);
  requestAnimationFrame(function(){
    if(workspace)workspace.scrollTop=options.top===true?0:Number(state.viewScroll[view]||0);
  });
}

function boot(){
  state.renderRevision=Number(state.renderRevision||0)+1;
  state.renderedViews={};
  app.className='app '+(state.lang||'ar');
  document.documentElement.dir=(state.lang||'ar')==='ar'?'rtl':'ltr';
  document.querySelectorAll('button').forEach(function(button){
    if(!button.getAttribute('type'))button.setAttribute('type','button');
  });
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-hidden','true');
  modal.setAttribute('aria-labelledby','modalTitle');
  toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');
  var refresh=document.querySelector('.btn.good');
  if(refresh)refresh.id='refreshMarket';
  setView(state.view||'command',{top:true});
}

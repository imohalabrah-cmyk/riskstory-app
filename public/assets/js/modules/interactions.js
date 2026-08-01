var toastTimer=0,marketLoadStartedAt=0;
function showToast(message){
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){toast.classList.remove('show')},2400);
}

function redrawWorkspace(){
  scheduleViewRender(state.view);
}

function chartMaxPan(){return Math.max(0,Number(state.chartMaxPan||0))}
function clampChartPan(value){return Math.max(0,Math.min(chartMaxPan(),Number(value)||0))}

function activeDrawingKey(){
  var symbol=normalizeTickerInput(ticker.value||state.symbol||'SPY')||'SPY';
  return symbol+'|'+(state.chartFrame||'10m');
}

function activeChartDrawings(){
  state.chartDrawings=state.chartDrawings||{};
  var key=activeDrawingKey();
  state.chartDrawings[key]=state.chartDrawings[key]||[];
  return state.chartDrawings[key];
}

function updateDrawingControls(){
  var hasDrawings=activeChartDrawings().length>0;
  document.querySelectorAll('[data-chart-action="undo"],[data-chart-action="clear"]').forEach(function(button){
    button.disabled=!hasDrawings;
  });
}
window.updateDrawingControls=updateDrawingControls;

function renderActiveCharts(){
  if(state.view==='command')renderChart('mainChart');
  else if(state.view==='gamma')renderChart('gammaChart');
  else if(state.view==='chart')renderChart('labChart');
  if(modal.classList.contains('open')&&state.expandedId&&/Chart$/.test(state.expandedId))refreshExpand();
  updateDrawingControls();
}

function loadChartCandles(symbol,silent){
  var source=window.riskStoryDataSource||riskStoryDataSource;
  symbol=normalizeTickerInput(symbol||ticker.value||state.symbol||'SPY')||'SPY';
  var frame=state.chartFrame||'10m';
  state.candleSeq=(state.candleSeq||0)+1;
  var seq=state.candleSeq;
  if(!silent)showToast('Loading '+symbol+' '+frame+' candles...');
  return source.loadCandles(symbol,frame).then(function(read){
    if(seq!==state.candleSeq)return read;
    renderActiveCharts();
    if(!silent)showToast(symbol+' candles updated - '+(read.provider||'provider'));
    return read;
  }).catch(function(error){
    if(seq!==state.candleSeq)return null;
    state.candleStatus={market:'unavailable',provider:'unavailable',updatedAt:new Date().toISOString(),message:error&&error.message?error.message:'Candle request failed'};
    renderActiveCharts();
    if(!silent)showToast('Candles unavailable: '+(error&&error.message?error.message:'request failed'));
    return null;
  });
}

function normalizeTickerInput(value){
  var raw=(value||'').trim(),compact=raw.replace(/\s/g,'');
  var map={'\u0633\u0628\u0627\u0643\u0633':'SPX','\u0633\u0628\u0627\u064a':'SPY','\u0627\u0633\u0628\u0627\u064a':'SPY','\u0643\u064a\u0648\u0632':'QQQ','\u0643\u064a\u0648':'QQQ'};
  return map[compact]||raw.toUpperCase().replace(/[^A-Z0-9.]/g,'');
}

function setMarketBusy(busy){
  app.classList.toggle('is-loading',busy);
  var button=document.querySelector('.btn.good');
  if(button){
    button.disabled=busy;
    button.setAttribute('aria-busy',busy?'true':'false');
    button.textContent=busy?'Updating...':'Sync Feed';
  }
}

function applyTickerChange(options){
  options=options||{};
  var symbol=normalizeTickerInput(ticker.value||'SPY')||'SPY';
  state.loadSeq=(state.loadSeq||0)+1;
  var seq=state.loadSeq;
  ticker.value=symbol;
  state.symbol=symbol;
  state.selectedLevel=null;
  state.chartFollowLatest=true;
  state.renderRevision=Number(state.renderRevision||0)+1;
  marketLoadStartedAt=Date.now();
  setMarketBusy(true);
  renderView(state.view);
  showToast('Updating '+symbol+' market intelligence...');
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var heatRange=state.heatRange||'All Expirations';
  var existingHeat=source.getSnapshot(symbol,heatRange);
  var heatRequest=options.forceHeatmap||!existingHeat||!existingHeat.exposure
    ? source.loadMarketRead(symbol,heatRange)
    : Promise.resolve({provider:existingHeat.provider,range:heatRange,cached:true});
  Promise.allSettled([source.loadMarketRead(symbol,state.commandRange||'0DTE'),heatRequest,loadChartCandles(symbol,true),source.loadFlowRead(symbol,state.commandRange||'0DTE')]).then(function(results){
    if(seq!==state.loadSeq||ticker.value!==symbol)return;
    if(results[3].status==='rejected'){
      state.flowStatus={market:'unavailable',provider:'flow-adapter',updatedAt:new Date().toISOString(),message:results[3].reason&&results[3].reason.message?results[3].reason.message:'Flow request failed.'};
    }
    state.renderRevision=Number(state.renderRevision||0)+1;
    renderView(state.view);
    if(typeof renderDataTrustBar==='function')renderDataTrustBar();
    if(modal.classList.contains('open'))refreshExpand();
    setMarketBusy(false);
    var market=results[0].status==='fulfilled'?results[0].value:null;
    showToast(symbol+' ready - '+(market&&market.provider?market.provider:source.provider||'data adapter'));
  });
}

function setActiveButton(button,selector){
  var parent=button.parentElement;
  if(parent)parent.querySelectorAll(selector||'.chip').forEach(function(item){item.classList.remove('active')});
  button.classList.add('active');
}

function syncGammaModeButtons(){
  document.querySelectorAll('[data-gamma-mode]').forEach(function(button){button.classList.toggle('active',button.getAttribute('data-gamma-mode')===state.gammaMode)});
}

function ensureGammaProfileExpand(){
  var profile=document.getElementById('strikeProfile');
  var panel=profile&&profile.closest('.panel');
  var head=panel&&panel.querySelector('.head');
  if(!head)return;
  head.querySelectorAll('.chips .chip').forEach(function(button,index){
    button.setAttribute('data-gamma-mode',['net','callput','table'][index]||'net');
    if(index===0)button.textContent='Net GEX';
  });
  syncGammaModeButtons();
  if(head.querySelector('[data-expand="strikeProfile"]'))return;
  var button=document.createElement('button');
  button.className='expand';button.type='button';button.title='Expand gamma profile';
  button.setAttribute('data-expand','strikeProfile');button.setAttribute('aria-label','Expand gamma profile');button.innerHTML='&#x26F6;';
  head.insertBefore(button,head.querySelector('.chips'));
}

function applyHeatModeButton(button){
  state.heatMode=button.getAttribute('data-heat-mode')||'GEX';
  var group=button.closest('.heatTabs');
  if(group)group.querySelectorAll('[data-heat-mode]').forEach(function(item){item.classList.toggle('active',item===button)});
  renderView(state.view);
  refreshExpand();
  showToast('Heatmap mode: '+state.heatMode);
}

function applyHeatThemeButton(button){
  state.heatTheme=button.getAttribute('data-heat-theme')||'pro';
  var group=button.closest('.heatThemes');
  if(group)group.querySelectorAll('[data-heat-theme]').forEach(function(item){item.classList.toggle('active',item===button)});
  renderView(state.view);
  refreshExpand();
  showToast('Heatmap theme: '+button.textContent.trim());
}

function applyHeatRangeButton(button){
  var label=button.textContent.trim().toLowerCase();
  state.heatAll=label.indexOf('expand')>=0||label.indexOf('all')>=0;
  state.heatStrikeRange=state.heatAll?'all':'near';
  var openMini=label==='expand'&&!!button.closest('#command');
  renderView(state.view);
  var chips=button.closest('.chips');
  if(chips)chips.querySelectorAll('.chip').forEach(function(item){item.classList.toggle('active',item===button)});
  if(openMini)openExpand('hmMini');
  else refreshExpand();
  showToast(state.heatAll?'Showing expanded heatmap':'Showing near heatmap');
}

function rerenderHeatExperience(message){
  renderView(state.view);
  refreshExpand();
  if(message)showToast(message);
}

function availableHeatExpirations(){
  var symbol=(ticker.value||state.symbol||'SPY').toUpperCase();
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var snapshot=source.getSnapshot(symbol,state.heatRange||'All Expirations');
  return heatProfiles(snapshot).map(function(profile){return String(profile.expiration)});
}

function applyHeatPreset(button){
  var preset=button.getAttribute('data-heat-preset')||'custom';
  var expirations=availableHeatExpirations();
  if(!expirations.length){showToast('No provider expirations are available yet');return}
  var selected=[];
  if(preset==='all'){
    selected=expirations.slice();
  }else if(preset==='zero'){
    selected=[expirations.find(function(expiration){return heatDte(expiration)===0})||expirations[0]];
  }else if(preset==='next'){
    selected=expirations.slice(0,2);
  }else if(preset==='weekly'){
    selected=expirations.filter(function(expiration){var days=heatDte(expiration);return days!==''&&days<=7});
    if(!selected.length)selected=expirations.slice();
  }else if(preset==='monthly'){
    selected=expirations.filter(function(expiration){
      var date=new Date(expiration+'T12:00:00');
      return date.getDay()===5&&date.getDate()>=15&&date.getDate()<=21;
    });
    if(!selected.length)selected=expirations.slice();
  }else{
    selected=(state.heatSelectedExpirations||[]).filter(function(expiration){return expirations.indexOf(expiration)>=0});
    if(!selected.length)selected=expirations.slice();
  }
  state.heatDatePreset=preset;
  state.heatSelectedExpirations=selected;
  state.heatMobileExpiry=selected[0]||'';
  rerenderHeatExperience('Heatmap dates: '+selected.map(heatExpirationLabel).join(', '));
}

function toggleHeatExpiry(button){
  var expiration=button.getAttribute('data-heat-expiry');
  var expirations=availableHeatExpirations();
  var selected=state.heatDatePreset==='all'?expirations.slice():(state.heatSelectedExpirations||[]).slice();
  var index=selected.indexOf(expiration);
  if(index>=0){
    if(selected.length===1){showToast('Keep at least one expiration selected');return}
    selected.splice(index,1);
  }else{
    selected.push(expiration);
  }
  state.heatSelectedExpirations=selected;
  state.heatDatePreset=selected.length===expirations.length?'all':'custom';
  if(selected.indexOf(state.heatMobileExpiry)<0)state.heatMobileExpiry=selected[0]||'';
  rerenderHeatExperience(selected.length+' of '+expirations.length+' expirations shown');
}

function updateHeatZoom(action){
  if(action==='in')state.zoom=Math.min(1.5,Number(state.zoom||1)+.1);
  if(action==='out')state.zoom=Math.max(.75,Number(state.zoom||1)-.1);
  if(action==='reset')state.zoom=1;
  rerenderHeatExperience('Heatmap zoom: '+Math.round(state.zoom*100)+'%');
}

var heatTooltipNode=null,heatTooltipCell=null;
function ensureHeatTooltip(){
  if(heatTooltipNode&&document.body.contains(heatTooltipNode))return heatTooltipNode;
  heatTooltipNode=document.createElement('div');
  heatTooltipNode.className='heatInsightTooltip';
  heatTooltipNode.setAttribute('role','status');
  document.body.appendChild(heatTooltipNode);
  return heatTooltipNode;
}

function positionHeatTooltip(cell,event){
  var tooltip=ensureHeatTooltip();
  var rect=cell.getBoundingClientRect();
  var left=event&&Number.isFinite(event.clientX)?event.clientX+16:rect.right+12;
  var top=event&&Number.isFinite(event.clientY)?event.clientY+16:rect.top;
  var width=tooltip.offsetWidth||310,height=tooltip.offsetHeight||210;
  if(left+width>window.innerWidth-12)left=Math.max(12,(event&&Number.isFinite(event.clientX)?event.clientX:rect.left)-width-16);
  if(top+height>window.innerHeight-12)top=Math.max(12,window.innerHeight-height-12);
  tooltip.style.left=Math.round(left)+'px';
  tooltip.style.top=Math.round(top)+'px';
}

function showHeatTooltip(cell,event){
  var tooltip=ensureHeatTooltip();
  heatTooltipCell=cell;
  var callBlock=cell.dataset.callLabel?'<div class="heatInsightSplit"><span><small>'+heatEscape(cell.dataset.callLabel)+'</small><b>'+heatEscape(cell.dataset.callValue)+'</b></span><span><small>'+heatEscape(cell.dataset.putLabel)+'</small><b>'+heatEscape(cell.dataset.putValue)+'</b></span></div>':'';
  tooltip.innerHTML='<header><span>'+heatEscape(cell.dataset.symbol)+' / $'+heatEscape(cell.dataset.strike)+'</span><b>'+heatEscape(cell.dataset.expiry)+'</b></header>'+
    '<div class="heatInsightValue"><span>'+heatEscape(cell.dataset.metric)+'</span><strong>'+heatEscape(cell.dataset.value)+'</strong></div>'+
    callBlock+
    '<div class="heatInsightStats"><span><small>Strength</small><b>'+heatEscape(cell.dataset.strength)+'%</b></span><span><small>Rank</small><b>#'+heatEscape(cell.dataset.rank)+'</b></span><span><small>From spot</small><b>'+heatEscape(cell.dataset.distance)+'</b></span></div>'+
    '<div class="heatInsightRole"><small>Role</small><b>'+heatEscape(cell.dataset.role)+'</b><p>'+heatEscape(cell.dataset.scenario)+'</p></div>';
  tooltip.classList.add('show');
  positionHeatTooltip(cell,event);
}

function hideHeatTooltip(){
  if(heatTooltipNode)heatTooltipNode.classList.remove('show');
  heatTooltipCell=null;
}

function openExpand(id){
  var source=document.getElementById(id);
  if(!source)return;
  state.expandedId=id;
  state.modalReturnFocus=document.activeElement;
  modalTitle.textContent=id.indexOf('hm')===0?'Heatmap Matrix':id.indexOf('tri')===0?'Trinity View':id==='strikeProfile'?'Gamma Profile':'Chart With Levels';
  modalBody.innerHTML='';
  var clone=source.closest('.panel')?source.closest('.panel').cloneNode(true):source.cloneNode(true);
  clone.querySelectorAll('.expand').forEach(function(button){button.remove()});
  var expandedChartId=null;
  var expandedHeatId=null;
  var expandedTriId=null;
  if(/Chart$/.test(id)){
    var clonedStage=clone.id===id?clone:clone.querySelector('#'+id);
    if(clonedStage){expandedChartId=id+'Expanded';clonedStage.id=expandedChartId;clonedStage.innerHTML=''}
  }
  if(id.indexOf('hm')===0){
    var clonedHeat=clone.id===id?clone:clone.querySelector('#'+id);
    if(clonedHeat){expandedHeatId=id+'Expanded';clonedHeat.id=expandedHeatId;clonedHeat.innerHTML=''}
  }
  if(id.indexOf('tri')===0){
    var clonedTri=clone.id===id?clone:clone.querySelector('#'+id);
    if(clonedTri){expandedTriId=id+'Expanded';clonedTri.id=expandedTriId;clonedTri.innerHTML=''}
  }
  modalBody.appendChild(clone);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(function(){
    if(expandedChartId)renderChart(expandedChartId);
    if(expandedHeatId)renderHeat(expandedHeatId);
    if(expandedTriId)renderTri(expandedTriId);
    if(window.refreshUiIcons)window.refreshUiIcons(modalBody);
    closeModal.focus();
  });
}

function closeExpand(){
  if(state.expandedId&&/Chart$/.test(state.expandedId)&&window.destroyRiskStoryChart)window.destroyRiskStoryChart(state.expandedId+'Expanded');
  state.expandedId=null;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
  modalBody.innerHTML='';
  if(state.modalReturnFocus&&state.modalReturnFocus.focus)state.modalReturnFocus.focus();
}

function refreshExpand(){
  if(!modal.classList.contains('open')||!state.expandedId)return;
  var scrollBox=modalBody.querySelector('.tvChartViewport,.chartViewport,.heatTableViewport,.heatwrap,.triProList,.tablewrap');
  var top=scrollBox?scrollBox.scrollTop:0,left=scrollBox?scrollBox.scrollLeft:0;
  var id=state.expandedId;
  openExpand(id);
  requestAnimationFrame(function(){
    var next=modalBody.querySelector('.chartViewport,.heatTableViewport,.heatwrap,.triProList,.tablewrap');
    if(next){next.scrollTop=top;next.scrollLeft=left}
  });
}

function updateChartControl(action){
  if(action==='zoomIn')state.chartZoom=Math.min(2.6,(state.chartZoom||1)+.25);
  if(action==='zoomOut')state.chartZoom=Math.max(.65,(state.chartZoom||1)-.25);
  if(action==='left'){state.chartFollowLatest=false;state.chartPan=clampChartPan((state.chartPan||0)-4)}
  if(action==='right'){state.chartFollowLatest=false;state.chartPan=clampChartPan((state.chartPan||0)+4)}
  if(action==='reset'){state.chartZoom=1;state.chartFollowLatest=true}
  renderActiveCharts();
}

function updateSelectedLevel(level){
  state.selectedLevel={price:level.getAttribute('data-level-price'),kind:level.getAttribute('data-level-kind'),strength:Number(level.getAttribute('data-level-strength')),detail:level.getAttribute('data-level-detail'),type:(level.getAttribute('data-level-kind')||'').toLowerCase().indexOf('wall')>=0?'wall':(level.getAttribute('data-level-kind')||'').toLowerCase().indexOf('magnet')>=0?'magnet':(level.getAttribute('data-level-kind')||'').toLowerCase().indexOf('flip')>=0?'flip':(level.getAttribute('data-level-kind')||'').toLowerCase().indexOf('node')>=0?'node':'level'};
  renderActiveCharts();
  var reaction=getLevelReaction(state.selectedLevel,getRiskStoryRead(ticker.value||'SPY',state.commandRange||'0DTE'));
  showToast(reaction.reaction+' - '+state.selectedLevel.price+' - Confidence '+reaction.confidence+'%');
}

loginForm.addEventListener('submit',function(event){
  event.preventDefault();
  var usernameInput=document.getElementById('username');
  var passwordInput=document.getElementById('password');
  if(usernameInput.value.trim()==='mohammed'&&passwordInput.value==='riskstory'){
    login.classList.add('hidden');app.classList.remove('hidden');loginError.classList.add('hidden');boot();applyTickerChange();
  }else loginError.classList.remove('hidden');
});

ticker.addEventListener('keydown',function(event){if(event.key==='Enter'){event.preventDefault();applyTickerChange()}});
ticker.addEventListener('blur',function(){var symbol=normalizeTickerInput(ticker.value||'SPY');if(symbol&&symbol!==state.symbol)applyTickerChange()});
asset.addEventListener('change',function(){state.flowAsset=asset.value==='all'?'all':asset.value;if(flowAsset)flowAsset.value=state.flowAsset;if(state.view==='command')renderFlow('flowMini',true);if(state.view==='flow')renderFlow('flowRows',false)});

document.addEventListener('change',function(event){
  if(event.target&&event.target.id==='oiDate'){
    state.oiDate=event.target.value||'';
    state.oiData=null;
    loadOpenInterest(state.oiDate,true).catch(function(){});
    return;
  }
  var select=event.target.closest('[data-tri-range-select]');
  if(select){var triSymbol=select.getAttribute('data-tri-range-select');state.trinityRanges=state.trinityRanges||{};state.trinityRanges[triSymbol]=select.value;renderTri(state.view==='trinity'?'triFull':'triMini');showToast('Loading '+triSymbol+' '+select.value+' chain...');loadTrinitySymbol(triSymbol,select.value).then(function(){refreshExpand();showToast(triSymbol+' '+select.value+' ready')})}
});

document.querySelectorAll('[data-heat-exp]').forEach(function(button){
  button.setAttribute('data-heat-exp','all');
  button.textContent='All Expirations';
  button.title='Show every provider expiration';
});

document.addEventListener('click',function(event){
  var target=event.target;
  var navButton=target.closest('.nav button[data-view]');
  if(navButton){setView(navButton.getAttribute('data-view'),{top:true});return}
  var jump=target.closest('[data-view-jump]');
  if(jump){setView(jump.getAttribute('data-view-jump'),{top:true});return}
  if(target.closest('#openTri')){setView('trinity',{top:true});return}
  if(target.closest('#logout')){app.classList.add('hidden');login.classList.remove('hidden');return}
  if(target.closest('#closeModal')){closeExpand();return}
  var expand=target.closest('[data-expand]');
  if(expand){event.preventDefault();openExpand(expand.getAttribute('data-expand'));return}
  var market=target.closest('.btn.good');
  if(market){if(state.view==='openInterest'){syncOpenInterestDashboard();return}applyTickerChange({forceHeatmap:true});return}
  if(target.closest('#oiSync')){syncOpenInterestDashboard();return}
  var statusToggle=target.closest('[data-status-toggle]');
  if(statusToggle){
    state.statusOpen=!state.statusOpen;
    var statusHost=statusToggle.closest('.dataTrustBar');
    statusToggle.setAttribute('aria-expanded',state.statusOpen?'true':'false');
    var statusMenu=statusHost&&statusHost.querySelector('.systemStatusMenu');
    if(statusMenu)statusMenu.classList.toggle('open',state.statusOpen);
    return;
  }
  var heatSettings=target.closest('[data-heat-settings]');
  if(heatSettings){
    state.heatSettingsOpen=!state.heatSettingsOpen;
    heatSettings.classList.toggle('active',state.heatSettingsOpen);
    heatSettings.setAttribute('aria-expanded',state.heatSettingsOpen?'true':'false');
    var settingsHost=heatSettings.closest('.proHeatmap');
    var settingsMenu=settingsHost&&settingsHost.querySelector('.matrixSettingsMenu');
    if(settingsMenu)settingsMenu.classList.toggle('open',state.heatSettingsOpen);
    return;
  }
  var heatMode=target.closest('[data-heat-mode]');
  if(heatMode){applyHeatModeButton(heatMode);return}
  var heatTheme=target.closest('[data-heat-theme]');
  if(heatTheme){applyHeatThemeButton(heatTheme);return}
  var heatPreset=target.closest('[data-heat-preset]');
  if(heatPreset){applyHeatPreset(heatPreset);return}
  var heatExpiryChoice=target.closest('[data-heat-expiry]');
  if(heatExpiryChoice){toggleHeatExpiry(heatExpiryChoice);return}
  var heatLayout=target.closest('[data-heat-layout]');
  if(heatLayout){state.heatLayout=heatLayout.getAttribute('data-heat-layout')||'compare';rerenderHeatExperience('Heatmap layout: '+heatLayout.textContent.trim());return}
  var heatStrikeRange=target.closest('[data-heat-strike-range]');
  if(heatStrikeRange){state.heatStrikeRange=heatStrikeRange.getAttribute('data-heat-strike-range')||'near';state.heatAll=state.heatStrikeRange==='all';rerenderHeatExperience('Strike range: '+heatStrikeRange.textContent.trim());return}
  var heatScale=target.closest('[data-heat-scale]');
  if(heatScale){state.heatScale=heatScale.getAttribute('data-heat-scale')||'percentile';rerenderHeatExperience('Color scale: '+heatScale.textContent.trim());return}
  var heatMobileExpiry=target.closest('[data-heat-mobile-expiry]');
  if(heatMobileExpiry){state.heatMobileExpiry=heatMobileExpiry.getAttribute('data-heat-mobile-expiry')||'';rerenderHeatExperience('Expiry: '+heatMobileExpiry.textContent.trim());return}
  var heatZoom=target.closest('[data-heat-zoom]');
  if(heatZoom){updateHeatZoom(heatZoom.getAttribute('data-heat-zoom'));return}
  var heatRange=target.closest('.panel .head .chips .chip');
  var heatRangeLabel=heatRange?heatRange.textContent.trim().toLowerCase():'';
  if(heatRange&&heatRange.closest('.panel')&&heatRange.closest('.panel').querySelector('.proHeatmap')&&(heatRangeLabel==='near'||heatRangeLabel==='expand')){applyHeatRangeButton(heatRange);return}
  var gammaMode=target.closest('[data-gamma-mode]');
  if(gammaMode){state.gammaMode=gammaMode.getAttribute('data-gamma-mode');syncGammaModeButtons();renderStrike();refreshExpand();return}
  var exposureMode=target.closest('[data-exposure-mode]');
  if(exposureMode){state.exposureMode=exposureMode.getAttribute('data-exposure-mode')||'gex';renderStrike();refreshExpand();showToast('Exposure metric: '+exposureMode.textContent.trim());return}
  var expiry=target.closest('[data-expiry]');
  if(expiry){setActiveButton(expiry);state.commandRange=expiry.getAttribute('data-expiry');applyTickerChange();return}
  var commandRange=target.closest('[data-command-range]');
  if(commandRange){setActiveButton(commandRange);state.commandRange=commandRange.getAttribute('data-command-range');applyTickerChange();return}
  var chartControl=target.closest('[data-chart]');
  if(chartControl){updateChartControl(chartControl.getAttribute('data-chart'));return}
  var chartFrame=target.closest('[data-chart-frame]');
  if(chartFrame){setActiveButton(chartFrame);state.chartFrame=chartFrame.getAttribute('data-chart-frame');state.chartFollowLatest=true;loadChartCandles(ticker.value,true);renderActiveCharts();showToast('Chart timeframe: '+state.chartFrame);return}
  var chartAction=target.closest('[data-chart-action]');
  if(chartAction){
    var action=chartAction.getAttribute('data-chart-action');
    if(action==='draw'){state.drawMode=!state.drawMode;chartAction.classList.toggle('active',state.drawMode);showToast(state.drawMode?'Draw mode enabled':'Draw mode disabled')}
    if(action==='undo'){
      var drawings=activeChartDrawings();
      if(drawings.length){
        var removed=drawings.pop();
        renderActiveCharts();
        showToast('Removed user level '+removed);
      }
      updateDrawingControls();
      return;
    }
    if(action==='clear'){
      var currentDrawings=activeChartDrawings();
      var removedCount=currentDrawings.length;
      if(removedCount){
        state.chartDrawings[activeDrawingKey()]=[];
        renderActiveCharts();
        showToast('Cleared '+removedCount+' user '+(removedCount===1?'level':'levels'));
      }
      updateDrawingControls();
      return;
    }
    if(action==='indicators'){state.showIndicators=state.showIndicators===false;chartAction.classList.toggle('active',state.showIndicators!==false);showToast(state.showIndicators!==false?'Indicators visible':'Indicators hidden')}
    if(action==='date')showToast('Choose 0DTE, Daily, Weekly, or Custom from the range controls.');
    renderActiveCharts();return;
  }
  var triRange=target.closest('[data-trinity-range]');
  if(triRange){setActiveButton(triRange);state.trinityRange=triRange.getAttribute('data-trinity-range');['SPX','SPY','QQQ'].forEach(function(symbol){state.trinityRanges=state.trinityRanges||{};state.trinityRanges[symbol]=state.trinityRange});renderTri('triFull');showToast('Loading Trinity '+state.trinityRange+' chains...');ensureTrinityData(true).then(function(){refreshExpand();showToast('Trinity chains updated')});return}
  var triSettings=target.closest('[data-tri-settings]');
  if(triSettings){var card=triSettings.closest('.triPro');if(card)card.classList.toggle('config-open');return}
  var triScroll=target.closest('[data-tri-scroll]');
  if(triScroll){
    var symbol=triScroll.getAttribute('data-tri-target'),direction=triScroll.getAttribute('data-tri-scroll')==='up'?-220:220;
    var lists=state.trinityLinked===false?[document.querySelector('[data-tri-list="'+symbol+'"]')]:Array.from(document.querySelectorAll('[data-tri-list]'));
    lists.filter(Boolean).forEach(function(list){list.scrollBy({top:direction,behavior:'smooth'})});return;
  }
  var triSync=target.closest('[data-tri-sync]');
  if(triSync){state.trinityLinked=state.trinityLinked===false;triSync.classList.toggle('active',state.trinityLinked);triSync.setAttribute('aria-pressed',state.trinityLinked?'true':'false');triSync.innerHTML=uiIcon(state.trinityLinked?'link':'unlink','',14)+'<span>'+(state.trinityLinked?'Linked':'Independent')+'</span>';if(window.refreshUiIcons)window.refreshUiIcons(triSync);return}
  var miniFlow=target.closest('[data-mini]');
  if(miniFlow){setActiveButton(miniFlow);state.mini=miniFlow.getAttribute('data-mini');renderFlow('flowMini',true);return}
  if(target.closest('#applyFlow')){state.flowAsset=flowAsset.value;state.flowType=flowType.value;state.min=Number(minPremium.value||0);renderFlow('flowRows',false);showToast('Flow filters applied');return}
  var heatExpiry=target.closest('[data-heat-exp]');
  if(heatExpiry){
    var expirations=availableHeatExpirations();
    state.heatDatePreset='all';
    state.heatSelectedExpirations=expirations.slice();
    state.heatMobileExpiry=expirations[0]||'';
    rerenderHeatExperience('Showing all '+expirations.length+' provider expirations');
    return
  }
  if(target.closest('#zin')){state.zoom=Math.min(1.5,state.zoom+.1);renderHeat('hmFull');refreshExpand();return}
  if(target.closest('#zout')){state.zoom=Math.max(.75,state.zoom-.1);renderHeat('hmFull');refreshExpand();return}
  var levelFilter=target.closest('[data-level-filter]');
  if(levelFilter){state.levelFilter=levelFilter.getAttribute('data-level-filter');setActiveButton(levelFilter);renderActiveCharts();return}
  var riskLevel=target.closest('.riskLevel');
  if(riskLevel){updateSelectedLevel(riskLevel);return}
  var replay=target.closest('[data-replay]');
  if(replay){var actionReplay=replay.getAttribute('data-replay');state.replayStep=Number(state.replayStep||2);if(actionReplay==='prev')state.replayStep=Math.max(0,state.replayStep-1);else state.replayStep=Math.min(5,state.replayStep+1);renderActiveCharts();return}
  if(target.closest('#lang')){state.lang=state.lang==='ar'?'en':'ar';app.className='app '+state.lang;document.documentElement.dir=state.lang==='ar'?'rtl':'ltr';state.renderRevision=Number(state.renderRevision||0)+1;renderView(state.view);if(typeof renderDataTrustBar==='function')renderDataTrustBar();refreshExpand();showToast('Language view: '+state.lang.toUpperCase());return}
  if(target.closest('#addAlert')){var row=document.createElement('div');row.className='alert';row.innerHTML='<b>'+alertSymbol.value+' - '+alertCondition.value+'</b><span>Trigger: '+alertValue.value+' | Status: armed</span>';alertList.prepend(row);showToast('Alert armed');return}
  if(target===modal)closeExpand();
  if(state.statusOpen&&!target.closest('.dataTrustBar')){state.statusOpen=false;var menu=document.querySelector('.systemStatusMenu');if(menu)menu.classList.remove('open')}
});

document.addEventListener('keydown',function(event){if(event.key==='Escape'&&modal.classList.contains('open'))closeExpand()});
document.addEventListener('keydown',function(event){
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.closest('input,textarea,[contenteditable="true"]')){
    var drawings=activeChartDrawings();
    if(drawings.length){
      event.preventDefault();
      drawings.pop();
      renderActiveCharts();
      showToast('Last user level removed');
    }
  }
});
updateDrawingControls();

document.addEventListener('pointerover',function(event){
  var cell=event.target.closest('[data-heat-tip]');
  if(cell&&cell!==heatTooltipCell)showHeatTooltip(cell,event);
});
document.addEventListener('pointermove',function(event){
  if(heatTooltipCell)positionHeatTooltip(heatTooltipCell,event);
});
document.addEventListener('pointerout',function(event){
  var cell=event.target.closest('[data-heat-tip]');
  if(cell&&(!event.relatedTarget||!cell.contains(event.relatedTarget)))hideHeatTooltip();
});
document.addEventListener('focusin',function(event){
  var cell=event.target.closest('[data-heat-tip]');
  if(cell)showHeatTooltip(cell);
});
document.addEventListener('focusout',function(event){
  var cell=event.target.closest('[data-heat-tip]');
  if(cell)hideHeatTooltip();
});

var chartDrag=null,chartDragFrame=0;
document.addEventListener('pointerdown',function(event){
  var viewport=event.target.closest('.chartViewport');
  if(viewport){chartDrag={viewport:viewport,x:event.clientX,pan:state.chartPan||0};viewport.classList.add('dragging');return}
  var wrap=event.target.closest('.heatTableViewport');
  if(wrap&&event.target.closest('.heatVirtualTrack')&&!event.target.closest('button,input,select,a')){heatDrag={wrap:wrap,x:event.clientX,y:event.clientY,left:wrap.scrollLeft,top:wrap.scrollTop};wrap.classList.add('is-dragging')}
});
document.addEventListener('pointermove',function(event){
  if(chartDrag&&!chartDragFrame){var chartX=event.clientX;chartDragFrame=requestAnimationFrame(function(){chartDragFrame=0;var next=clampChartPan(chartDrag.pan-Math.round((chartX-chartDrag.x)/38));if(next!==state.chartPan){state.chartFollowLatest=false;state.chartPan=next;renderActiveCharts()}})}
  if(heatDrag&&!heatFrame){var heatX=event.clientX,heatY=event.clientY;heatFrame=requestAnimationFrame(function(){heatFrame=0;heatDrag.wrap.scrollLeft=heatDrag.left-(heatX-heatDrag.x);heatDrag.wrap.scrollTop=heatDrag.top-(heatY-heatDrag.y)})}
});
document.addEventListener('pointerup',function(){if(chartDrag)chartDrag.viewport.classList.remove('dragging');chartDrag=null;if(heatDrag)heatDrag.wrap.classList.remove('is-dragging');heatDrag=null});
document.addEventListener('pointercancel',function(){chartDrag=null;heatDrag=null});

var heatDrag=null,heatFrame=0,wheelFrame=0;
document.addEventListener('wheel',function(event){
  var viewport=event.target.closest('.chartViewport');
  if(!viewport||(!event.ctrlKey&&!event.shiftKey&&Math.abs(event.deltaX)<=Math.abs(event.deltaY)))return;
  event.preventDefault();
  if(event.ctrlKey)state.chartZoom=Math.max(.65,Math.min(2.6,(state.chartZoom||1)+(event.deltaY<0?.15:-.15)));
  else {state.chartFollowLatest=false;state.chartPan=clampChartPan((state.chartPan||0)+(event.deltaY>0||event.deltaX>0?2:-2))}
  if(!wheelFrame)wheelFrame=requestAnimationFrame(function(){wheelFrame=0;renderActiveCharts()});
},{passive:false});

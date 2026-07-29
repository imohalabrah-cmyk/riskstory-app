function renderFlow(target,mini){
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var targetBody=document.getElementById(target);
  if(!targetBody)return;
  var panel=targetBody.closest('.panel');
  var flowHead=panel&&panel.querySelector('.head');
  var flowHeading=flowHead&&flowHead.querySelector('h2');
  var flowReadiness=dataSurfaceReadiness('flow');
  if(flowHeading)flowHeading.textContent='Options Flow | تدفق العقود';
  if(flowHead){
    var previous=flowHead.querySelector('.flowDataState');
    if(previous)previous.remove();
    var badge=document.createElement('span');
    badge.className='dataMethodBadge flowDataState '+flowReadiness.mode+' method-'+flowReadiness.method;
    badge.title=flowReadiness.note;
    badge.textContent=readinessModeLabel(flowReadiness.mode)+' / '+flowReadiness.methodLabel;
    flowHead.appendChild(badge);
  }
  var active=(ticker.value||state.symbol||'').toUpperCase();
  var allRows=source.getFlowRows();
  var baseRows=allRows.filter(function(r){
    return(state.flowType==='all'||r.type===state.flowType)&&r.premium>=state.min;
  });
  var exact=active?allRows.filter(function(r){
    return r.ticker===active&&(state.flowType==='all'||r.type===state.flowType);
  }):[];
  var rows=exact.length?exact:baseRows.filter(function(r){
    return state.flowAsset==='all'||r.asset===state.flowAsset;
  });
  if(active){
    rows=exact.length?exact:rows.filter(function(r){return r.ticker===active});
  }
  if(mini&&!exact.length)rows=rows.filter(function(r){return state.mini==='all'||r.asset===state.mini}).slice(0,10);
  if(mini&&exact.length)rows=rows.slice(0,10);
  var body=rows.length?rows.map(function(r){
    var signal=flowConfirmationBadge(r);
    return '<tr><td>'+r.time+'</td><td><b>'+r.ticker+'</b></td><td>'+r.asset+'</td><td><span class="pill '+(r.side==='Call'?'call':'put')+'">'+r.side+'</span></td><td><span class="pill sweep">'+r.type+'</span></td><td>'+r.strike+'</td><td>'+r.expiry+'</td><td class="'+(r.side==='Call'?'green':'red')+'">'+money(r.premium)+'</td><td>'+r.volume.toLocaleString()+'</td>'+(mini?'':'<td>'+r.oi.toLocaleString()+'</td><td>'+r.sentiment+'</td>')+'<td>'+signal+'</td></tr>';
  }).join(''):'<tr class="flowEmptyRow"><td colspan="12"><div class="flowEmpty"><b>No matching options flow for '+(active||'the selected symbol')+'</b><span>'+readinessModeLabel(flowReadiness.mode)+' source: '+flowReadiness.note+'</span></div></td></tr>';
  targetBody.innerHTML=body;
}

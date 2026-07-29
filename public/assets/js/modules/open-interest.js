function oiEscape(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]});
}

function oiNumber(value){
  var number=Number(value||0),absolute=Math.abs(number);
  if(absolute>=1000000)return (number/1000000).toFixed(1)+'M';
  if(absolute>=1000)return (number/1000).toFixed(1)+'K';
  return number.toLocaleString('en-US');
}

function oiPrice(value){
  var number=Number(value||0);
  return number.toLocaleString('en-US',{minimumFractionDigits:number>=1000?0:2,maximumFractionDigits:2});
}

function oiDateLabel(value,withWeekday){
  if(!value)return '--';
  var date=new Date(value+'T12:00:00Z');
  return date.toLocaleDateString('ar-SA',{timeZone:'Asia/Riyadh',weekday:withWeekday?'long':undefined,year:'numeric',month:'long',day:'numeric'});
}

function oiTimeLabel(value){
  if(!value)return '--';
  var date=new Date(value);
  return date.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function oiLevelRows(levels,side){
  levels=Array.isArray(levels)?levels:[];
  var max=Math.max.apply(null,levels.map(function(level){return Number(level.openInterest||0)}).concat([1]));
  return levels.map(function(level){
    var width=Math.max(5,Number(level.openInterest||0)/max*100).toFixed(1);
    return '<div class="oiLevelRow '+side+'"><b>#'+oiEscape(level.rank)+'</b><strong>'+oiPrice(level.strike)+'</strong><div class="oiLevelTrack"><i style="width:'+width+'%"></i></div><span>'+oiNumber(level.openInterest)+'</span></div>';
  }).join('');
}

function oiZoneScore(zone){
  var score=Number(zone&&zone.score||0);
  if(score>0)return Math.max(0,Math.min(100,Math.round(score)));
  return zone&&zone.strength==='major'?86:zone&&zone.strength==='strong'?76:55;
}

function oiStrengthLabel(zone){
  var score=oiZoneScore(zone);
  if(score>=85)return 'استثنائية';
  if(score>=70)return 'قوية';
  if(score>=50)return 'متوسطة';
  return 'مراقبة';
}

function oiScoreBand(zone){
  var score=oiZoneScore(zone);
  return score>=85?'exceptional':score>=70?'strong':score>=50?'moderate':'watch';
}

function oiZoneRange(zone){
  return Number(zone.lowStrike)===Number(zone.highStrike)?oiPrice(zone.lowStrike):oiPrice(zone.lowStrike)+'–'+oiPrice(zone.highStrike);
}

function oiNextZoneTarget(zone,role,summary,allZones){
  if(role==='magnet')return '';
  var sameRole=(Array.isArray(allZones)?allZones:[]).filter(function(item){return item.role===role&&item!==zone});
  var candidates=sameRole.filter(function(item){
    return role==='support'?Number(item.highStrike)<Number(zone.lowStrike):Number(item.lowStrike)>Number(zone.highStrike);
  }).sort(function(a,b){
    return role==='support'?Number(b.highStrike)-Number(a.highStrike):Number(a.lowStrike)-Number(b.lowStrike);
  });
  if(candidates.length)return oiZoneRange(candidates[0]);
  var structural=role==='support'?summary.puts:summary.calls;
  var strikes=(Array.isArray(structural)?structural:[]).map(function(item){return Number(item.strike)}).filter(function(strike){
    return role==='support'?strike<Number(zone.lowStrike):strike>Number(zone.highStrike);
  }).sort(function(a,b){return role==='support'?b-a:a-b});
  return strikes.length?oiPrice(strikes[0]):'';
}

function oiScoreBreakdown(zone){
  var values=zone.scoreBreakdown||{},items=[
    ['السجل 20 جلسة',values.historical],
    ['كثافة المنطقة',values.cluster],
    ['القرب من السعر',values.proximity],
    ['استمرار التمركز',values.persistence],
    ['سيطرة الجانب',values.dominance]
  ];
  return '<div class="oiScoreBreakdown">'+items.map(function(item){
    var value=Math.max(0,Math.min(100,Number(item[1]||0)));
    return '<span><small>'+item[0]+'</small><i><b style="width:'+value+'%"></b></i><em>'+Math.round(value)+'</em></span>';
  }).join('')+'</div>';
}

function oiZoneBubble(zone,role,summary,allZones,id){
  var range=oiZoneRange(zone),next=oiNextZoneTarget(zone,role,summary,allZones);
  var isSupport=role==='support',isMagnet=role==='magnet',score=oiZoneScore(zone);
  var hold=isMagnet
    ? 'الاقتراب من '+range+' قد يبطئ الحركة أو يجذب السعر للتوازن حول التمركز.'
    : isSupport
      ? 'الثبات فوق '+range+' مع تباطؤ البيع يرجّح ارتداداً صاعداً.'
      : 'الفشل في الثبات فوق '+range+' يرجّح ردة فعل هابطة.';
  var broken=isMagnet
    ? 'الابتعاد والثبات خارج المنطقة يقلل أثر الجذب، ويعيد التركيز إلى أقرب دعم أو مقاومة.'
    : isSupport
      ? 'الكسر والثبات أسفل '+oiPrice(zone.lowStrike)+(next?' يفتح الطريق نحو '+next+'.':' يضعف سيناريو الدعم القريب.')
      : 'الاختراق والثبات فوق '+oiPrice(zone.highStrike)+(next?' يفتح الطريق نحو '+next+'.':' يلغي ضغط المقاومة القريبة.');
  var title=isMagnet?'منطقة جذب / تثبيت':isSupport?'دعم Put محتمل':'مقاومة Call محتملة';
  var referenceTime=summary.referencePriceAsOf?oiTimeLabel(summary.referencePriceAsOf):'وقت غير متاح';
  return '<aside class="oiZoneBubble '+role+'" id="'+oiEscape(id)+'" role="tooltip" dir="rtl">'+
    '<header><span>REACTION ZONE ENGINE</span><b>'+oiStrengthLabel(zone)+(zone.isExtended?' · هدف ممتد':'')+'</b></header>'+ 
    '<div class="oiBubbleTitle"><i></i><div><strong>'+oiEscape(summary.symbol)+' · '+title+'</strong><small>'+range+'</small></div><em>'+score+'<small>/100</small></em></div>'+ 
    '<div class="oiBubbleStats"><span><small>إجمالي OI</small><b>'+oiNumber(zone.totalOpenInterest)+'</b></span><span><small>أقوى Strike</small><b>'+oiPrice(zone.strongestStrike)+'</b></span><span><small>المسافة</small><b>'+Number(zone.distancePoints||0).toFixed(2)+' نقطة</b></span><span><small>الاستمرار</small><b>'+Number(zone.persistenceSessions||1)+' جلسة</b></span></div>'+ 
    oiScoreBreakdown(zone)+
    '<p class="hold"><i></i><span><b>سيناريو الثبات</b>'+hold+'</span></p>'+ 
    '<p class="break"><i></i><span><b>سيناريو الكسر</b>'+broken+'</span></p>'+ 
    '<footer>OCC OI · السعر المرجعي '+oiEscape(summary.referencePriceSource||'غير متاح')+' · '+referenceTime+' · يلزم تأكيد حركة السعر.</footer></aside>';
}

function oiZoneRows(zones,role,summary){
  var allZones=Array.isArray(zones)?zones:[];
  var roleZones=allZones.filter(function(zone){return zone.role===role});
  if(!roleZones.length)return '<div class="oiZoneEmpty">لا يوجد تمركز قريب تجاوز حد المراقبة</div>';
  return roleZones.map(function(zone){
    var id='oi-tip-'+String(summary.symbol||'symbol').toLowerCase()+'-'+role+'-'+String(zone.rank||1);
    return '<div class="oiReactionRow '+role+' '+oiScoreBand(zone)+(zone.isExtended?' extended':'')+'" tabindex="0" aria-describedby="'+oiEscape(id)+'">'+
      '<b>#'+oiEscape(zone.rank)+'</b><div><strong>'+oiZoneRange(zone)+'</strong><small>'+(zone.isExtended?'هدف ممتد · ':'')+'أقوى Strike '+oiPrice(zone.strongestStrike)+' · '+oiNumber(zone.peakOpenInterest)+'</small></div>'+
      '<span><b>'+oiZoneScore(zone)+'</b><small>'+oiStrengthLabel(zone)+'</small></span><em>'+oiNumber(zone.totalOpenInterest)+' OI</em><i>'+Number(zone.distancePoints||0).toFixed(2)+' نقطة · '+Number(zone.distancePercent||0).toFixed(2)+'%</i>'+oiZoneBubble(zone,role,summary,allZones,id)+'</div>';
  }).join('');
}

function oiAttractionStrip(summary){
  var zones=Array.isArray(summary.attractionZones)?summary.attractionZones:[];
  if(!zones.length)return '';
  return '<div class="oiMagnetStrip"><span>مناطق جذب وتثبيت</span><div>'+zones.map(function(zone){
    var id='oi-tip-'+String(summary.symbol||'symbol').toLowerCase()+'-magnet-'+String(zone.rank||1);
    return '<button type="button" class="oiMagnetChip '+oiScoreBand(zone)+'" aria-describedby="'+oiEscape(id)+'"><b>'+oiZoneRange(zone)+'</b><small>'+oiZoneScore(zone)+'/100 · '+(zone.side==='call'?'Call أسفل السعر':'Put أعلى السعر')+'</small>'+oiZoneBubble(zone,'magnet',summary,zones,id)+'</button>';
  }).join('')+'</div></div>';
}

function oiReference(summary){
  var price=Number(summary.referencePrice||0);
  if(!(price>0))return '<div class="oiReference unavailable"><span>السعر المرجعي</span><strong>غير متاح</strong><small>تظهر الجدران الهيكلية فقط</small></div>';
  return '<div class="oiReference"><span>السعر المرجعي</span><strong>'+oiPrice(price)+'</strong><small>'+oiEscape(summary.referencePriceSource||'مرجع سعري')+(summary.referencePriceAsOf?' · '+oiTimeLabel(summary.referencePriceAsOf):'')+'</small></div>';
}

function oiCalibration(summary){
  var thresholds=summary.thresholds||{},sessions=Number(thresholds.sessionCount||0),target=Number(thresholds.targetSessions||20);
  var progress=Math.max(4,Math.min(100,target?sessions/target*100:0));
  var source=thresholds.source==='calibrated'?'معايرة تاريخية نشطة':'حد مبدئي حتى اكتمال 20 جلسة';
  return '<div class="oiCalibration"><div><span>معايرة قوة التفاعل</span><b>'+sessions+' / '+target+' جلسة</b></div><i><b style="width:'+progress.toFixed(1)+'%"></b></i><small>'+source+' · حد المراقبة '+oiNumber(thresholds.watch||0)+' عقد</small></div>';
}

function oiCard(summary){
  var callTotal=Number(summary.totalCallOi||0),putTotal=Number(summary.totalPutOi||0);
  var ratio=callTotal+putTotal?Math.round(callTotal/(callTotal+putTotal)*100):50;
  var zones=Array.isArray(summary.reactionZones)?summary.reactionZones:[];
  return '<article class="oiScenarioCard" data-oi-symbol="'+oiEscape(summary.symbol)+'">'+
    '<header class="oiCardHead"><div class="oiIdentity"><strong>'+oiEscape(summary.symbol)+'</strong><div><b>'+oiEscape(summary.displayName)+'</b><span>'+oiEscape(summary.assetType)+'</span></div></div><div class="oiContractMeta"><span>عقد OCC</span><strong>'+oiDateLabel(summary.contractDate,false)+'</strong><em>'+oiEscape(summary.productSymbol)+'</em></div></header>'+
    '<div class="oiContext">'+oiReference(summary)+oiCalibration(summary)+'</div>'+
    '<div class="oiKeyLevels"><div class="put"><span>جدار Put الرئيسي</span><strong>'+oiPrice(summary.lowerZone)+'</strong><small>STRUCTURAL WALL</small></div><div class="pivot"><span>مركز OI القريب</span><strong>'+oiPrice(summary.pivot)+'</strong><small>LOCAL OI CENTER</small></div><div class="call"><span>جدار Call الرئيسي</span><strong>'+oiPrice(summary.upperZone)+'</strong><small>STRUCTURAL WALL</small></div></div>'+
    '<div class="oiBalance"><div><span>Puts '+(100-ratio)+'% · '+oiNumber(putTotal)+'</span><span>Calls '+ratio+'% · '+oiNumber(callTotal)+'</span></div><i><b style="width:'+ratio+'%"></b></i></div>'+
    '<div class="oiReactionMap"><header><div><span>خريطة التفاعل القريبة</span><b>مرّر المؤشر لعرض السيناريو</b></div><small>'+oiEscape(summary.symbol)+' ±'+oiPrice(summary.analysisWindowPoints||10)+' نقطة · درجة من 100</small></header><div class="oiReactionColumns"><section class="support"><h4><i></i>دعم Put محتمل</h4>'+oiZoneRows(zones,'support',summary)+'</section><section class="resistance"><h4><i></i>مقاومة Call محتملة</h4>'+oiZoneRows(zones,'resistance',summary)+'</section></div>'+oiAttractionStrip(summary)+'</div>'+ 
    '<div class="oiLevelColumns"><section><header><div><span class="oiDot put"></span><b>أعلى تمركزات Put</b></div><em>GLOBAL WALLS</em></header>'+oiLevelRows(summary.puts,'put')+'</section><section><header><div><span class="oiDot call"></span><b>أعلى تمركزات Call</b></div><em>GLOBAL WALLS</em></header>'+oiLevelRows(summary.calls,'call')+'</section></div>'+
    '<div class="oiScenario" dir="rtl"><span>دليل السيناريو</span><p>'+oiEscape(summary.scenarioAr)+'</p></div>'+
    '<footer class="oiCardFoot"><span>العقود: OCC Series Search · المنتج '+oiEscape(summary.productSymbol)+'</span><span>السعر المرجعي مستقل ولا يغيّر أرقام OCC · آخر تحقق '+oiTimeLabel(summary.lastVerifiedAt)+'</span></footer></article>';
}

function paintOpenInterest(data){
  var cards=document.getElementById('oiCards'),status=document.getElementById('oiStatus'),dateInput=document.getElementById('oiDate');
  if(!cards||!status)return;
  state.oiData=data;
  state.oiLoading=false;
  if(dateInput){
    dateInput.value=data.summaryDate||state.oiDate||'';
    if(data.availableDates&&data.availableDates.length){dateInput.min=data.availableDates[data.availableDates.length-1];dateInput.max=data.availableDates[0]}
  }
  if(!data.summaries||!data.summaries.length){
    status.innerHTML='<div class="oiStatusItem warning"><span>حالة عقد '+oiEscape(data.summaryDate||state.oiDate||'اليوم')+'</span><b>لم تُحفظ بيانات OCC لهذا التاريخ بعد</b><small>لا يتم استبدالها بأرقام يوم آخر أو بمصدر مختلف.</small></div>';
    cards.innerHTML='<div class="surfaceEmpty"><strong>بيانات العقد غير متاحة</strong><span>شغّل التحديث للتحقق من نشر OCC لبيانات هذا التاريخ.</span></div>';
    return;
  }
  var verified=data.summaries.reduce(function(latest,item){return !latest||item.lastVerifiedAt>latest?item.lastVerifiedAt:latest},'');
  var calibrated=data.summaries.filter(function(item){return item.thresholds&&item.thresholds.source==='calibrated'}).length;
  status.innerHTML='<div class="oiStatusItem"><span>ملخص جلسة العقود</span><b>'+oiDateLabel(data.summaryDate,true)+'</b><small>تاريخ العقد المحدد، وليس تاريخاً مجمعاً</small></div>'+
    '<div class="oiStatusItem"><span>مصدر العقود الوحيد</span><b>OCC Series Search</b><small>Call / Strike / Put كما نشرها OCC</small></div>'+
    '<div class="oiStatusItem"><span>معايرة مناطق التفاعل</span><b>'+calibrated+' من '+data.summaries.length+' مكتملة</b><small>تتحول تلقائياً بعد حفظ 20 جلسة لكل رمز</small></div>'+
    '<div class="oiStatusItem schedule"><span>آخر تحقق · التحديث اليومي</span><b>'+oiTimeLabel(verified)+'</b><small>06:00 صباحاً بتوقيت الرياض</small></div>';
  cards.innerHTML=data.summaries.map(oiCard).join('');
}

function loadOpenInterest(date,force){
  if(state.oiLoading&&!force)return Promise.resolve(state.oiData||null);
  state.oiLoading=true;
  state.oiDate=date||state.oiDate||'';
  var cards=document.getElementById('oiCards');
  if(cards)cards.innerHTML='<div class="oiLoading"><i></i><strong>جاري تحميل بيانات OCC...</strong></div>';
  var query=state.oiDate?'?date='+encodeURIComponent(state.oiDate):'';
  return fetch('/api/open-interest'+query,{cache:'no-store'}).then(function(response){
    if(!response.ok)throw new Error('Open-interest request failed');
    return response.json();
  }).then(paintOpenInterest).catch(function(error){
    state.oiLoading=false;
    if(cards)cards.innerHTML='<div class="surfaceEmpty"><strong>تعذر تحميل بيانات OCC</strong><span>'+oiEscape(error.message||error)+'</span></div>';
    throw error;
  });
}

function renderOpenInterest(){
  var cards=document.getElementById('oiCards');
  if(!cards)return;
  if(state.oiData&&(!state.oiDate||state.oiData.summaryDate===state.oiDate))paintOpenInterest(state.oiData);
  else loadOpenInterest(state.oiDate||'',false);
}

function syncOpenInterestDashboard(){
  var button=document.getElementById('oiSync');
  if(button){button.disabled=true;button.textContent='جاري التحقق من OCC...'}
  showToast('Checking the exact OCC contract data...');
  return fetch('/api/open-interest/sync',{method:'POST',cache:'no-store'}).then(function(response){
    return response.json().then(function(body){if(!response.ok)throw new Error(body.error||'Synchronization failed');return body});
  }).then(function(result){
    state.oiDate=result.summaryDate||'';
    return loadOpenInterest(state.oiDate,true).then(function(){
      if(result.status==='pending')showToast('OCC has not published this contract date yet');
      else showToast('OCC reaction map verified - '+result.saved.length+' symbols');
    });
  }).catch(function(error){
    showToast('OCC update failed: '+(error.message||error));
  }).finally(function(){if(button){button.disabled=false;button.textContent='تحديث من OCC'}});
}

window.renderOpenInterest=renderOpenInterest;
window.loadOpenInterest=loadOpenInterest;
window.syncOpenInterestDashboard=syncOpenInterestDashboard;

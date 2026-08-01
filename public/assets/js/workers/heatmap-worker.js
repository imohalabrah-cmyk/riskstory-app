function modeId(mode){
  var value=String(mode||'GEX').toUpperCase();
  if(value==='VEX')value='VANNA';
  return ['GEX','CALLPUT','DEX','VANNA','CHARM','VOLUME','OI'].indexOf(value)>=0?value:'GEX';
}

function metric(row,mode){
  if(!row)return null;
  mode=modeId(mode);
  if(mode==='DEX')return Number(row.netDex);
  if(mode==='VANNA')return Number(row.netVanna);
  if(mode==='CHARM')return Number(row.netCharm);
  if(mode==='VOLUME')return Number(row.callVolume||0)-Number(row.putVolume||0);
  if(mode==='OI')return Number(row.callOpenInterest||0)-Number(row.putOpenInterest||0);
  return Number(row.netGex);
}

function parts(row,mode){
  mode=modeId(mode);
  if(mode==='CALLPUT')return {call:Number(row&&row.callGex||0),put:Math.abs(Number(row&&row.putGex||0)),callLabel:'Call GEX',putLabel:'Put GEX'};
  if(mode==='VOLUME')return {call:Number(row&&row.callVolume||0),put:Number(row&&row.putVolume||0),callLabel:'Call volume',putLabel:'Put volume'};
  if(mode==='OI')return {call:Number(row&&row.callOpenInterest||0),put:Number(row&&row.putOpenInterest||0),callLabel:'Call OI',putLabel:'Put OI'};
  return null;
}

function aggregate(profiles){
  var fields=['callOpenInterest','putOpenInterest','callVolume','putVolume','callGex','putGex','netGex','callDex','putDex','netDex','callVanna','putVanna','netVanna','callCharm','putCharm','netCharm','combined'];
  var rows={};
  profiles.forEach(function(profile){
    (profile.rows||[]).forEach(function(row){
      var strike=Number(row.strike),key=String(strike);
      if(!Number.isFinite(strike))return;
      if(!rows[key])rows[key]={strike:strike};
      fields.forEach(function(field){rows[key][field]=Number(rows[key][field]||0)+Number(row[field]||0)});
    });
  });
  return {expiration:'Combined '+profiles.length,sourceExpirations:profiles.map(function(profile){return profile.expiration}),rows:Object.keys(rows).map(function(key){return rows[key]})};
}

function filterStrikes(strikes,spot,range,isMini){
  var sorted=strikes.slice().sort(function(left,right){return right-left});
  if(isMini||range==='near')return sorted.slice().sort(function(left,right){return Math.abs(left-spot)-Math.abs(right-spot)}).slice(0,15).sort(function(left,right){return right-left});
  if(range==='all')return sorted;
  var points=Number(range);
  var filtered=sorted.filter(function(strike){return Math.abs(strike-spot)<=points+.0001});
  return filtered.length?filtered:sorted.slice().sort(function(left,right){return Math.abs(left-spot)-Math.abs(right-spot)}).slice(0,15).sort(function(left,right){return right-left});
}

function pickZone(rows,spot,maxNet,direction,polarity){
  var candidates=rows.filter(function(row){
    var inDirection=direction==='support'?row.strike<=spot:row.strike>=spot;
    var hasPolarity=polarity==='positive'?row.total>0:polarity==='negative'?row.total<0:true;
    return inDirection&&hasPolarity;
  });
  if(!candidates.length)return null;
  return candidates.sort(function(left,right){
    var leftScore=.68*Math.abs(left.total)/maxNet+.32/(1+Math.abs(left.strike-spot)/5);
    var rightScore=.68*Math.abs(right.total)/maxNet+.32/(1+Math.abs(right.strike-spot)/5);
    return rightScore-leftScore;
  })[0];
}

function calculate(input){
  var profiles=(input.profiles||[]).slice();
  if(input.combine&&profiles.length>1)profiles=[aggregate(profiles)];
  var maps=profiles.map(function(profile){
    var map={};
    (profile.rows||[]).forEach(function(row){map[String(Number(row.strike))]=row});
    return map;
  });
  var strikeSet={};
  profiles.forEach(function(profile){(profile.rows||[]).forEach(function(row){var strike=Number(row.strike);if(Number.isFinite(strike))strikeSet[String(strike)]=strike})});
  var allStrikes=Object.keys(strikeSet).map(function(key){return strikeSet[key]});
  var strikes=filterStrikes(allStrikes,Number(input.spot||0),String(input.strikeRange||'near'),!!input.isMini);
  var absoluteValues=[];
  strikes.forEach(function(strike){maps.forEach(function(map){var value=metric(map[String(strike)],input.mode);if(Number.isFinite(value))absoluteValues.push(Math.abs(value))})});
  var maxValue=Math.max.apply(null,absoluteValues.concat([1]));
  var ranked=absoluteValues.slice().sort(function(left,right){return right-left});
  var rows=strikes.map(function(strike){
    var total=0;
    var cells=maps.map(function(map){
      var row=map[String(strike)],value=metric(row,input.mode);
      if(!Number.isFinite(value))return {missing:true};
      total+=value;
      var absolute=Math.abs(value);
      var percentile=ranked.length?ranked.filter(function(item){return item<=absolute}).length/ranked.length:0;
      var intensity=input.scale==='actual'?(.08+absolute/maxValue*.84):(.08+percentile*.84);
      return {value:value,parts:parts(row,input.mode),intensity:Math.min(.94,intensity),rank:ranked.filter(function(item){return item>absolute}).length+1,strength:Math.round(absolute/maxValue*100)};
    });
    return {strike:strike,total:total,cells:cells};
  });
  var maxNet=Math.max.apply(null,rows.map(function(row){return Math.abs(row.total)}).concat([1]));
  var strongest=rows.slice().sort(function(left,right){return Math.abs(right.total)-Math.abs(left.total)})[0]||{strike:'--',total:0};
  var support=pickZone(rows,Number(input.spot||0),maxNet,'support','positive');
  var lower=support||pickZone(rows,Number(input.spot||0),maxNet,'support','negative');
  var resistance=pickZone(rows,Number(input.spot||0),maxNet,'resistance','positive');
  var spotStrike=strikes.length?strikes.reduce(function(nearest,strike){return Math.abs(strike-input.spot)<Math.abs(nearest-input.spot)?strike:nearest},strikes[0]):null;
  return {profiles:profiles,rows:rows,allStrikeCount:allStrikes.length,maxValue:maxValue,maxNet:maxNet,strongest:strongest,support:support,lower:lower,resistance:resistance,spotStrike:spotStrike};
}

self.onmessage=function(event){
  var message=event.data||{};
  try{
    self.postMessage({id:message.id,key:message.key,result:calculate(message.input||{})});
  }catch(error){
    self.postMessage({id:message.id,key:message.key,error:error&&error.message?error.message:String(error)});
  }
};

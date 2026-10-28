const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`{
 const check=(x,m)=>{if(!x)throw Error(m)},bad=(fn,status)=>{let error;try{fn()}catch(e){error=e}check(error?.status===status,'Expected '+status+', got '+error?.message)};
 const d=model_({id:'group-test',classes:[{level:'1',shortName:'P',ref:'p'}],venues:[{id:'R1',form:'1P'},{id:'R2',form:''}],teachers:[{id:'s',role:'P',active:true},{id:'t',role:'Teacher',active:true}],loads:{'1':{EL:15}},assignments:[{id:'a',target:'g1',teacher:'t',subject:'EL',level:'1',venue:'R1'}],groups:[{id:'g1',name:'TG',subject:'EL',level:'1',venue:'R1'}]});
 bad(()=>apply_(d,{operation:'addTeacher',teacher:'s',target:'1P',subject:'EL',key:'cell:1P:EL'},c,{}),400);
 apply_(d,{operation:'moveVenueGroup',from:'R1',venue:'R2',key:'meta'},c,{});check(d.venues[1].form==='1P'&&d.groups[0].venue==='R2'&&d.assignments[0].venue==='R2','Group venue did not move atomically');
 const cfg=GSISTeachingRules.migrate(null);check(validateOffload_(cfg,d).tags.length===12,'Default rules');cfg.tags[0].percent=101;bad(()=>validateOffload_(cfg,d),400);cfg.tags[0].percent=30;cfg.tags[0].periods=-1;bad(()=>validateOffload_(cfg,d),400);cfg.tags[0].periods='';cfg.tags.push({...cfg.tags[0],id:'new',name:'duplicate match'});bad(()=>validateOffload_(cfg,d),400);
 bad(()=>dispatch_({action:'saveRoleTruthTable',identity:who,input:{}},{user:{roles:['KP']}}),404);bad(()=>dispatch_({action:'roleTruthTable',identity:who,input:{}},{user:{roles:[]}}),403);
 console.log('PASS server eligibility, atomic grouped venue move, rule validation and Role Truth Table authorization');
}`,ctx);

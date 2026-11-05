const Relief=require('../../shared/relief');
module.exports=()=>({
 teachers:[['ft',''],['ft2',''],['fajt','FAJT'],['part','4/5'],['rt','RT']].map(([id,employment])=>({id,name:id,active:true,employment})),
 classes:[{ref:'c1',level:'1',shortName:'A'}],groups:[],
 loads:Object.fromEntries([1,2,3,4,5,6].map(l=>[l,{EL:10,Assembly:1,FTGP:2,FTT:2}])),
 assignments:['ft','ft2','fajt','part','rt'].map(teacher=>({teacher,target:'1A',subject:'EL'})),
 organisations:{plt:[{id:'pd',name:'PLT',slots:['fajt']}]},duties:[],relief:Relief.defaults()
});

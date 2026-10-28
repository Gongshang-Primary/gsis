/* One vector renderer for Deploy previews and public Layout/PDF. */
window.GSISrenderLayout=function(svg,{positions,rooms,title,date,colors,onSelect,version="",editable=false}){
 svg._gsisLayoutSnapshot=JSON.parse(JSON.stringify({positions,rooms,title,date,colors,version}));
 const ns='http://www.w3.org/2000/svg',make=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;return n},font=7.2,lineHeight=9.4;
 const wrap=(label,width)=>{const lines=[],limit=Math.max(3,Math.floor((width-6)/(font*.62)));for(let rest of String(label).split('\n')){while(rest.length>limit){let cut=rest.lastIndexOf(' ',limit);if(cut<1)cut=limit;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trim()}if(rest)lines.push(rest)}return lines};
 const roomName=r=>r.name==='Classroom'?r.shortName||r.short||'':r.name||'';
 const units=positions.map(mapped=>{const room=rooms.find(r=>(r.geometry||r.id)===mapped.id),[x,y,x1,y1]=mapped.rect,labels=room?[...(roomName(room)?[roomName(room)]:[]),...String(room.form||'').split(/,\s*/).filter(Boolean),...(room.groups||[])]:[],lines=labels.flatMap(s=>wrap(s,x1-x)),dynamic=room&&(room.name==='Classroom'||room.form||(room.groups||[]).length||mapped.form);return {mapped,room,lines,primaryLines:labels.length?wrap(labels[0],x1-x).length:0,dynamic,required:dynamic?Math.max(y1-y,(lines.length+1)*lineHeight+6):y1-y};});
 // Architectural labels use the same cell boundaries as the source drawing.
 const toiletCells=[
  {id:'G-boys',rect:[64.322,425.936,108.872,448.824],lines:['Boys’','Toilet']},
  {id:'G-girls',rect:[108.872,425.936,153.422,448.824],lines:['Girls’','Toilet']},
  {id:'H-boys',rect:[688.021,460.518,732.571,483.907],lines:['Boys’','Toilet']},
  {id:'H-girls',rect:[732.571,460.518,777.121,483.907],lines:['Girls’','Toilet']},
  ...Array.from({length:6},(_,i)=>({id:'K-toilet-'+i,rect:[197.972+i*44.55,883.743,197.972+(i+1)*44.55,895.438],lines:['HDCP','Toilet']}))
 ];
 const stretchUnits=[...units,...toiletCells.map(c=>({mapped:c,required:2*lineHeight+6}))];
 const contains=(r,x,y)=>x>=r[0]-.1&&x<r[2]-.1&&y>=r[1]&&y<=r[3];
 const box=(svg.getAttribute('viewBox')||'0 0 842 1191').split(/[ ,]+/).map(Number),width=box[2],height=box[3],edges=[...new Set([0,height,...stretchUnits.flatMap(u=>[u.mapped.rect[1],u.mapped.rect[3]])])].sort((a,b)=>a-b),bands=[];let nextY=0;
 for(let i=0;i<edges.length-1;i++){const start=edges[i],end=edges[i+1],factor=Math.max(1,...stretchUnits.filter(u=>u.mapped.rect[1]<=start+.001&&u.mapped.rect[3]>=end-.001).map(u=>u.required/(u.mapped.rect[3]-u.mapped.rect[1]))),h=(end-start)*factor;bands.push({start,end,y:nextY,h,factor});nextY+=h;}
 const yMap=y=>{const b=bands.find(b=>y>=b.start&&y<=b.end)||bands[bands.length-1];return b.y+(y-b.start)*b.factor;};
 // Extract vector-font labels before stretching geometry. Rebuild horizontal text
 // runs at a fixed size so neighbouring room labels never become tall glyphs.
 const labels=[];for(const node of [...svg.querySelectorAll('[data-text]')]){const m=(node.getAttribute('transform')||'').match(/^matrix\(([^)]+)\)$/);if(!m)continue;const a=m[1].split(/[ ,]+/).map(Number);if(a.length!==6||a[1]||a[2])continue;const owner=units.find(u=>contains(u.mapped.rect,a[4],a[5])),toilet=toiletCells.find(c=>contains(c.rect,a[4],a[5]));
 // Remove historical allocation glyphs at source, including overhanging fragments.
 if(!toilet&&!(owner&&(owner.dynamic||owner.mapped.form||owner.mapped.name==='Classroom')))labels.push({x:a[4],y:a[5],size:Math.abs(a[0]),text:node.getAttribute('data-text'),owner:owner?.mapped.id||''});node.remove();}
 const runs=[];for(const c of labels){const last=runs[runs.length-1];if(last&&last.owner===c.owner&&Math.abs(last.y-c.y)<.05&&c.x>=last.end-.1&&c.x-last.end<Math.max(c.size,last.size)*1.6){last.text+=c.text;last.end=c.x;last.size=c.size;}else runs.push({x:c.x,end:c.x,y:c.y,size:c.size,text:c.text,owner:c.owner});}
 // Stretch shared horizontal bands once, keeping neighbouring boundaries aligned.
 // Room labels below are redrawn at one fixed size, never scaled down to fit.
 if(nextY>height+.01){let defs=svg.querySelector('defs');if(!defs){defs=make('defs');svg.prepend(defs);}const base=make('g',{id:'gsis-layout-base'});for(const node of [...svg.childNodes])if(node!==defs)base.append(node);defs.append(base);for(const b of bands){const slice=make('svg',{x:0,y:b.y,width,height:b.h,viewBox:'0 '+b.start+' '+width+' '+(b.end-b.start),preserveAspectRatio:'none',overflow:'hidden','aria-hidden':'true'});const use=make('use',{href:'#gsis-layout-base'});use.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','#gsis-layout-base');slice.append(use);svg.append(slice);}svg.setAttribute('viewBox','0 0 '+width+' '+nextY);svg.setAttribute('height',nextY);}
 const firstRoomLine=new Map();for(const line of runs)if(line.owner)firstRoomLine.set(line.owner,Math.min(firstRoomLine.get(line.owner)??Infinity,line.y));
 for(const line of runs)svg.append(make('text',{x:(line.x+line.end+line.size*.5)/2,y:yMap(line.y),'text-anchor':'middle','font-family':'Arial','font-size':line.size,'font-weight':line.owner&&Math.abs(line.y-firstRoomLine.get(line.owner))<.05?'bold':'normal'},line.text));
 svg.append(make('rect',{x:51,y:yMap(54),width:740,height:12,fill:'#ccddf6'}),make('text',{x:54,y:yMap(54)+9,'font-size':font,'font-family':'Arial','font-weight':'bold'},title),make('text',{x:788,y:yMap(54)+9,'text-anchor':'end','font-size':font,'font-family':'Arial'},date));
 svg.append(make('rect',{x:84,y:yMap(801),width:53,height:yMap(812)-yMap(801),fill:'#fff'}),make('text',{x:109,y:yMap(801)+9,'text-anchor':'middle','font-size':font,'font-family':'Arial'},'Basketball Court'));
 for(const c of toiletCells){const [x,y0,x1,y1]=c.rect,top=yMap(y0),bottom=yMap(y1),g=make('g',{'data-toilet-label':c.id}),start=(top+bottom)/2-lineHeight/2+font*.35;c.lines.forEach((line,i)=>g.append(make('text',{x:(x+x1)/2,y:start+i*lineHeight,'text-anchor':'middle','font-family':'Arial','font-size':font},line)));svg.append(g);}
 for(const {mapped,room,lines,primaryLines,dynamic} of units){const [x,y0,x1,y10]=mapped.rect,y=yMap(y0),y1=yMap(y10),w=x1-x,h=y1-y;
  if(!room){if(mapped.form||mapped.name==='Classroom')svg.append(make('rect',{x:x+.5,y:y+.5,width:w-1,height:h-1,fill:'#fff'}));continue;}
  const g=make('g',{'data-unit':room.id,'data-venue':room.id});g.append(make('title',{},room.id+' · '+[roomName(room),room.form,...room.groups||[]].filter(Boolean).join(', ')));if(dynamic){g.append(make('rect',{x:x+.5,y:y+.5,width:w-1,height:h-1,fill:colors[room.level]||'#fff',stroke:'#657789','stroke-width':.4}));
  lines.forEach((line,j)=>g.append(make('text',{x:(x+x1)/2,y:y+font+3+j*lineHeight,'text-anchor':'middle','font-family':'Arial','font-size':font,'font-weight':j<primaryLines?'bold':'normal'},line)));g.append(make('text',{x:(x+x1)/2,y:y1-3,'text-anchor':'middle','font-family':'Arial','font-size':font},room.id));}else if(room.id!==mapped.id){g.append(make('rect',{x:x+1,y:y1-12,width:w-2,height:11,fill:'#fff'}),make('text',{x:(x+x1)/2,y:y1-3,'text-anchor':'middle','font-family':'Arial','font-size':font},room.id));}
  const hit=make('rect',{x,y,width:w,height:h,fill:'none','pointer-events':'all',class:'room-hit',tabindex:onSelect?'0':'-1',role:onSelect?'button':'img','aria-label':room.id+' '+(roomName(room)||room.name||'')});if(onSelect){hit.onclick=()=>onSelect(room.id);hit.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect(room.id)}}}g.append(hit);svg.append(g);
 }
};

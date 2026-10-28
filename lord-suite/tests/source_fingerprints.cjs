const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=function sourceFingerprints(){
  const root=path.resolve(__dirname,'..'),out={};
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())walk(file);
    else out[path.relative(root,file).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }}
  walk(path.join(root,'Source'));return out;
};

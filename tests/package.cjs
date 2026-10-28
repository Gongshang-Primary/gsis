const {execFileSync}=require('child_process');
const settings=require('../package.json');
if(settings.gsisRelease==='0.9.9'){
 execFileSync('python3',['tests/release099-packaging.py'],{stdio:'inherit'});
 console.log('Verified 0.9.9 suite: '+require('./helpers/suite099-package.cjs')(require('node:path').resolve(__dirname,'..')));
}else if(settings.gsisRelease==='0.9.8q'){
 execFileSync('python3',['tests/release098p-packaging.py'],{stdio:'inherit'});
 execFileSync('python3',['tests/release098q-packaging.py'],{stdio:'inherit'});
 console.log('Verified Q candidate: '+require('./helpers/calendar098q-package.cjs')(require('node:path').resolve(__dirname,'..')));
}else if(settings.gsisRelease==='0.9.8p'){
 execFileSync('python3',['scripts/package-098p-suite.py','--preview'],{stdio:'inherit'});
 execFileSync('python3',['scripts/verify-098p-suite.py','../deliverables/GSiS_v0.9.8p_Full_Suite.zip','../deliverables/GSiS_v0.9.8p_Review_Source.zip','--preview'],{stdio:'inherit'});
}else{
const script=settings.gsisPackageKind==='component-patch'?'scripts/verify-component-patch.py':'scripts/verify-full-package.py';
execFileSync('python3',[script],{stdio:'inherit'});
}

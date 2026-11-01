/* Executing gateway identity is separate from the observed upstream build. */
function gsisBuildMetadata(value){
 const label=value?.gsisBuildLabel;
 return typeof label==='string'&&label.length<=32&&/^\d+\.\d+\.\d+[a-z]?$/.test(label)?{gsisBuildLabel:label}:{};
}
function gsisBuildHeaders(value){
 const label=gsisBuildMetadata(value).gsisBuildLabel;
 return {'X-GSiS-Worker-Build-Label':GSIS_BUILD_LABEL,...(label?{'X-GSiS-Build-Label':label}:{})};
}

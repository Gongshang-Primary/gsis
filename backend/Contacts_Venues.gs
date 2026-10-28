function venuesContactsSource_(envelope){
 const input=venuesSourceReadInput_(venuesSourceAuthenticate_(envelope,'contacts'));
 const snapshot=lordContactsSnapshot_({operation:'snapshot'});
 return venuesSourceResult_('contacts',snapshot.key,input,{people:snapshot.people.map(({id,name,active,email,cesEmail,mobile})=>({id,name,active,email,cesEmail,mobile}))});
}

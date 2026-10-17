import {match,pinyin} from 'pinyin-pro';

export type SearchableStudent={name:string;className?:string;subjectShort?:string;no?:string;aliases?:string[]};
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/ü/g,'v').trim();
// Build only when the roster changes. The surname reading applies to the head,
// so given names are not all interpreted as surnames.
export function indexStudent(student:SearchableStudent){
  const names=[student.name,...(student.aliases||[])].filter(Boolean);
  const fields=[...names,student.className||'',student.subjectShort||'',student.no||''];
  for(const name of names)for(const surname of ['head','off'] as const){
    fields.push(pinyin(name,{toneType:'none',surname,type:'array'}).join(''));
    fields.push(pinyin(name,{toneType:'none',surname,pattern:'first',type:'array'}).join(''));
  }
  return {names,fields:fields.map(normalize)};
}
export function matchesStudent(index:ReturnType<typeof indexStudent>,query:string){
  return normalize(query).split(/\s+/).filter(Boolean).every(token=>
    index.fields.some(field=>field.includes(token))||
    /^[a-zv]+$/.test(token)&&index.names.some(name=>match(name,token,{insensitive:true,space:'ignore',continuous:true,v:true})!==null));
}

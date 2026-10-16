import {requireThat,id,integer,hash,freeze} from './validation';
export type Participant={id:string;materialId:string};
export type Allocation={reviewerId:string;authorId:string;materialId:string};
type Edge={to:number;rev:number;capacity:number};
// A balanced bipartite flow: every reviewer and every essay receives exactly k
// slots, every pair has capacity one. No partial schedule is returned on failure.
export async function allocateRound(participants:Participant[],perStudent:number,seed:string,blockedPairs:{reviewerId:string;authorId:string}[]=[]){
 requireThat(Array.isArray(participants)&&participants.length>=2&&participants.length<=300,'participant_count','本轮需有 2–300 名已准备好材料的学生。');
 const count=participants.length,k=integer(perStudent,1,Math.min(5,count-1),'每人互评份数');
 requireThat(typeof seed==='string'&&seed.length>=32&&seed.length<=256,'invalid_seed','互评分配需要服务器生成并保存本轮随机种子。');
 requireThat(participants.every(p=>p&&typeof p==='object'&&!Array.isArray(p)),'invalid_participant','本轮学生与稿件对应关系不完整。');
 const people=participants.map(p=>({id:id(p.id),materialId:id(p.materialId)})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 requireThat(new Set(people.map(p=>p.id)).size===count&&new Set(people.map(p=>p.materialId)).size===count,'duplicate_participant','每名学生和每份稿件在本轮只能出现一次。');
 requireThat(Array.isArray(blockedPairs)&&blockedPairs.length<=count*count,'invalid_exclusions','排除关系超过本轮人数范围。');
 const ids=new Set(people.map(p=>p.id)),blocked=new Set<string>();const pair=(a:string,b:string)=>JSON.stringify([a,b]);
 for(const p of blockedPairs){requireThat(p&&typeof p==='object','invalid_exclusions','排除关系不完整。');requireThat(ids.has(p.reviewerId)&&ids.has(p.authorId),'unknown_exclusion','排除关系中出现了不属于本轮的学生。');blocked.add(pair(p.reviewerId,p.authorId));}
 const digest=await hash({algorithm:'balanced-flow-v1',seed});let state=parseInt(digest.slice(0,8),16)||1;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 function shuffled<T>(list:T[]){const next=[...list];for(let i=next.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}return next;}
 const source=2*count,sink=source+1,graph:Edge[][]=Array.from({length:sink+1},()=>[]),edges:{reviewer:number;author:number;edge:Edge}[]=[];
 function add(from:number,to:number,capacity:number){const edge={to,rev:graph[to].length,capacity},reverse={to:from,rev:graph[from].length,capacity:0};graph[from].push(edge);graph[to].push(reverse);return edge;}
 for(const i of shuffled(people.map((_,i)=>i))){add(source,i,k);add(count+i,sink,k);}
 for(let i=0;i<count;i++)for(const j of shuffled(people.map((_,j)=>j)))if(i!==j&&!blocked.has(pair(people[i].id,people[j].id)))edges.push({reviewer:i,author:j,edge:add(i,count+j,1)});
 let flow=0;
 while(true){const level=Array(graph.length).fill(-1),queue=[source];level[source]=0;for(let q=0;q<queue.length;q++){const v=queue[q];for(const edge of graph[v])if(edge.capacity>0&&level[edge.to]<0){level[edge.to]=level[v]+1;queue.push(edge.to);}}if(level[sink]<0)break;
  const next=Array(graph.length).fill(0);function send(v:number,amount:number):number{if(v===sink)return amount;for(;next[v]<graph[v].length;next[v]++){const e=graph[v][next[v]];if(e.capacity<=0||level[e.to]!==level[v]+1)continue;const sent=send(e.to,Math.min(amount,e.capacity));if(sent){e.capacity-=sent;graph[e.to][e.rev].capacity+=sent;return sent;}}return 0;}
  let sent;while((sent=send(source,k)))flow+=sent;
 }
 requireThat(flow===count*k,'allocation_infeasible','当前稿件、份数与排除关系无法公平分配，请调整后重新预览。',{required:count*k,assignable:flow});
 const assignments:Allocation[]=edges.filter(e=>e.edge.capacity===0).map(e=>({reviewerId:people[e.reviewer].id,authorId:people[e.author].id,materialId:people[e.author].materialId}));
 return freeze({algorithm:'balanced-flow-v1' as const,perStudent:k,assignments,hash:await hash({algorithm:'balanced-flow-v1',people,perStudent:k,seed,blockedPairs:[...blocked].sort(),assignments})});
}

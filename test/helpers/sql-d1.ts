import {DatabaseSync} from 'node:sqlite';

// Exercise the Worker's actual SQL with isolated SQLite. This adapter is for
// protocol tests; Wrangler integration remains necessary for D1 runtime coverage.
export function sqlD1(db:DatabaseSync) {
  function prepare(sql:string,values:any[]=[]):any {
    const runSync=()=>{const result=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};};
    return {
      bind:(...next:any[])=>prepare(sql,next),runSync,
      first:async()=>db.prepare(sql).get(...values) || null,
      all:async()=>({success:true,results:db.prepare(sql).all(...values)}),
      run:async()=>runSync(),
    };
  }
  return {prepare,batch:async(statements:any[])=>{
    db.exec('BEGIN IMMEDIATE');
    try{const results=statements.map(s=>s.runSync());db.exec('COMMIT');return results;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }};
}

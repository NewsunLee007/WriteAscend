import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {activationEnv,envValues,prepareActivation,switchActivation} from '../scripts/daily-activation.mjs';
const pack={WRITING_BRIDGE_SERVICE_TOKEN:'a'.repeat(43),WRITING_BRIDGE_STORAGE_KEY:'b'.repeat(43),WRITING_ALLOWED_CALLBACKS:'https://teacher.test/api/auth/callback',WRITING_PEER_SERVICE_TOKEN:'c'.repeat(43),WRITING_PEER_STORAGE_KEY:'d'.repeat(43),WRITING_PEER_ALLOWED_CALLBACKS:'https://peer.test/api/auth/callback'};
const make=(before:Buffer,p=pack)=>activationEnv(before,p,'https://teacher.test','https://peer.test',{});
test('activation follows Daily dotenv parsing and preserves unrelated configuration bytes',()=>{
  const before=Buffer.from('# 中文\r\nTTS_PROVIDER=edge\r\nWRITING_BRIDGE_SERVICE_TOKEN=""\r\nOPENAI_API_KEY=unchanged');
  const after=make(before);assert(after.toString().startsWith('# 中文\r\nTTS_PROVIDER=edge\r\nOPENAI_API_KEY=unchanged\r\n'));
  for(const [key,value]of Object.entries(pack))assert.equal(envValues(after).get(key),value);
  assert.equal(envValues(Buffer.from('X="first"\nX=second')).get('X'),'first');
});
test('activation rejects existing credentials, inherited overrides, callback drift and reused weak secrets',()=>{
  assert.throws(()=>make(Buffer.from('WRITING_PEER_STORAGE_KEY=existing')));
  assert.throws(()=>activationEnv(Buffer.alloc(0),pack,'https://teacher.test','https://peer.test',{WRITING_ALLOWED_CALLBACKS:''}));
  for(const change of [{WRITING_ALLOWED_CALLBACKS:'https://other.test/api/auth/callback'},{WRITING_PEER_SERVICE_TOKEN:pack.WRITING_BRIDGE_SERVICE_TOKEN},{WRITING_BRIDGE_STORAGE_KEY:'weak'},{EXTRA:'unreviewed'}])assert.throws(()=>make(Buffer.alloc(0),{...pack,...change}));
});
test('online WAL backup, guarded activation and configuration rollback retain subsequent learning records',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'writing-activation-')),daily=path.join(base,'daily'),snapshot=path.join(base,'backup');
  fs.mkdirSync(path.join(daily,'data'),{recursive:true});fs.mkdirSync(path.join(daily,'storage/recitations'),{recursive:true});const before=Buffer.from('TTS_PROVIDER=edge\n');fs.writeFileSync(path.join(daily,'.env'),before);
  const live=['data/daily-line.sqlite','storage/recitations/recitations.sqlite'].map(name=>{const db=new DatabaseSync(path.join(daily,name));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE records (id INTEGER PRIMARY KEY); INSERT INTO records VALUES (1)');return db;});
  try{
    const prepared=await prepareActivation({daily,pack,teacherOrigin:'https://teacher.test',peerOrigin:'https://peer.test',backupDirectory:snapshot,inherited:{}});
    assert.equal(prepared.environmentChanged,false);assert.deepEqual(fs.readFileSync(path.join(daily,'.env')),before);
    const backup=new DatabaseSync(path.join(snapshot,'recitations.sqlite'),{readOnly:true});assert.equal(backup.prepare('SELECT count(*) n FROM records').get()!.n,1);backup.close();
    assert.equal(fs.statSync(path.join(snapshot,'env.after')).mode&0o777,0o600);
    fs.appendFileSync(path.join(daily,'.env'),'CONCURRENT=1\n');assert.throws(()=>switchActivation(snapshot),/changed/);fs.writeFileSync(path.join(daily,'.env'),before);
    assert.equal(switchActivation(snapshot).productionRestart,false);live[1].exec('INSERT INTO records VALUES (2)');
    assert.equal(switchActivation(snapshot,true).databasesChanged,false);assert.deepEqual(fs.readFileSync(path.join(daily,'.env')),before);assert.equal(live[1].prepare('SELECT count(*) n FROM records').get()!.n,2);
    const record=JSON.parse(fs.readFileSync(path.join(snapshot,'record.json'),'utf8'));record.preparedAt='2020-01-01T00:00:00Z';fs.writeFileSync(path.join(snapshot,'record.json'),JSON.stringify(record));assert.throws(()=>switchActivation(snapshot),/15 minutes/);
    fs.appendFileSync(path.join(snapshot,'env.before'),'tampered');assert.throws(()=>switchActivation(snapshot),/checksum/);
  }finally{live.forEach(db=>db.close());fs.rmSync(base,{recursive:true,force:true});}
});

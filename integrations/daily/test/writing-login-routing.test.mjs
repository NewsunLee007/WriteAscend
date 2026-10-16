import test from 'node:test';
import assert from 'node:assert/strict';
import {loginDestination} from '../public/login-routing.mjs';

test('writing bridge keeps the same-origin login return and all PKCE state, without allowing external redirects',()=>{
  const origin='https://daily.example';
  const next='/writing-connect.html?'+new URLSearchParams({client_id:'writeascend',redirect_uri:'https://writeascend.example/api/auth/callback',state:'synthetic-state',code_challenge:'synthetic-challenge',code_challenge_method:'S256'});
  for(const role of ['teacher','admin','student'])assert.equal(loginDestination(new URLSearchParams({next}),origin,role),next);
  for(const invalid of ['https://other.example/writing-connect.html','//other.example/writing-connect.html','/\\other.example/writing-connect.html','/writing-connect.html/extra'])assert.equal(loginDestination(new URLSearchParams({next:invalid}),origin,'teacher'),'/lucky.html');
});

test('writing feedback returns to the same-origin student history without opening external redirects',()=>{for(const role of ['student','teacher','admin'])assert.equal(loginDestination(new URLSearchParams({next:'/writing-feedback.html'}),'https://daily.example',role),'/writing-feedback.html');});

test('independent peer login preserves its same-origin return without external callback redirects',()=>{const origin='https://daily.example',next='/writing-peer-connect.html?'+new URLSearchParams({client_id:'writing-peer',redirect_uri:'https://peer.example/api/auth/callback',state:'synthetic-peer-state',code_challenge:'synthetic-peer-challenge',code_challenge_method:'S256'});for(const role of ['student','teacher','admin'])assert.equal(loginDestination(new URLSearchParams({next}),origin,role),next);for(const next of ['https://peer.example/writing-peer-connect.html','//peer.example/writing-peer-connect.html','/writing-peer-connect.html/extra'])assert.equal(loginDestination(new URLSearchParams({next}),origin,'student'),'/');});

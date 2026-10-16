import test from 'node:test';
import assert from 'node:assert/strict';
import {loginDestination} from '../public/login-routing.mjs';

test('writing bridge keeps the same-origin login return and all PKCE state, without allowing external redirects',()=>{
  const origin='https://daily.example';
  const next='/writing-connect.html?'+new URLSearchParams({client_id:'writeascend',redirect_uri:'https://writeascend.example/api/auth/callback',state:'synthetic-state',code_challenge:'synthetic-challenge',code_challenge_method:'S256'});
  for(const role of ['teacher','admin','student'])assert.equal(loginDestination(new URLSearchParams({next}),origin,role),next);
  for(const invalid of ['https://other.example/writing-connect.html','//other.example/writing-connect.html','/\\other.example/writing-connect.html','/writing-connect.html/extra'])assert.equal(loginDestination(new URLSearchParams({next:invalid}),origin,'teacher'),'/lucky.html');
});

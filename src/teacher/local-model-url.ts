export function localBase(value:string){
 const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('请使用不含密钥或查询参数的本地服务地址。');
 const h=url.hostname;if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(h)&&!/^10\./.test(h)&&!/^192\.168\./.test(h)&&!/^172\.(?:1[6-9]|2\d|3[01])\./.test(h))throw Error('HTTP 仅支持本机或局域网；远程服务请使用 HTTPS。');
 url.pathname=url.pathname.replace(/\/(?:chat\/completions|models)\/?$/,'').replace(/\/+$/,'');return url.href.replace(/\/$/,'');
}

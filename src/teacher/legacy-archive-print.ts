import legacyCss from '../report/legacy-paper.css?raw';
import feedbackCss from '../report/writing-feedback.css?raw';

export function printLegacyReport(element:HTMLElement,padding:unknown){
 const frame=document.createElement('iframe');frame.setAttribute('aria-label','旧报告打印预览');frame.dataset.legacyPrint='true';
 Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',left:'-10000px',top:'0',border:'0'});document.body.append(frame);
 const doc=frame.contentDocument;if(!doc){frame.remove();throw Error('浏览器未能打开打印预览。');}
 const pad=Number.isFinite(Number(padding))?Math.max(0,Math.min(35,Number(padding))):16;
 const report=element.cloneNode(true) as HTMLElement;
 const footer=report.querySelector<HTMLElement>('.feedback-footer');footer?.remove();
 const css='*{box-sizing:border-box}body{margin:0;background:#fff;color:#17233c;font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif}.a4-wrapper{width:100%!important;margin:0!important;padding:0!important;min-height:0!important;box-shadow:none!important}.legacy-print-table{width:100%;border-collapse:collapse}.legacy-print-table>tbody>tr>td,.legacy-print-table>tfoot>tr>td{padding:0}.legacy-print-table tfoot{display:table-footer-group}.legacy-print-table .feedback-footer{position:static;margin:0!important;padding:2mm 0!important;font-size:6pt;line-height:1.3;color:#536278;border-top:1px solid #d9e1eb;flex-direction:row;gap:12px}@page{size:A4 portrait;margin:'+pad+'mm}';
 doc.open();doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>旧版作文批改报告</title><style>'+legacyCss+'\n'+feedbackCss+'\n'+css+'</style></head><body><table class="legacy-print-table"><tfoot><tr><td>'+(footer?.outerHTML||'')+'</td></tr></tfoot><tbody><tr><td>'+report.outerHTML+'</td></tr></tbody></table></body></html>');doc.close();
 const remove=()=>frame.remove();frame.contentWindow?.addEventListener('afterprint',remove,{once:true});
 requestAnimationFrame(()=>requestAnimationFrame(()=>{frame.contentWindow?.focus();frame.contentWindow?.print();}));setTimeout(remove,180000);
 return remove;
}

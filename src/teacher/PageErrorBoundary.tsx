import React from 'react';
// A tab can outlive a deployment. Missing lazy chunks must not erase the UI.
export default class PageErrorBoundary extends React.Component<{children:React.ReactNode;inline?:boolean},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){if(!this.state.failed)return this.props.children;return <section className={'wa-module-error'+(this.props.inline?' is-inline':'')} role="alert"><span>WriteAscend · NewsunEnglish</span><h2>页面暂时未能加载</h2><p>页面可能刚刚更新，或连接暂时中断。请重新加载后继续。已保存的任务和报告可重新打开；未保存的内容请先保留。</p><button onClick={()=>window.location.reload()}>重新加载页面</button></section>;}
}

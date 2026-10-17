import React,{createContext,useContext,useEffect,useRef} from 'react';
export type LeaveGuard=()=>boolean|Promise<boolean>;
type Navigation={canLeave:()=>Promise<boolean>;confirm:(message:string)=>Promise<boolean>;register:(guard:LeaveGuard)=>()=>void};
export const WorkspaceNavigation=createContext<Navigation>({canLeave:async()=>true,confirm:async()=>false,register:()=>()=>{}});
export const useWorkspaceNavigation=()=>useContext(WorkspaceNavigation);
export function useWorkspaceLeaveGuard(guard:LeaveGuard){
 const navigation=useWorkspaceNavigation(),latest=useRef(guard);latest.current=guard;
 useEffect(()=>navigation.register(()=>latest.current()),[navigation]);
}

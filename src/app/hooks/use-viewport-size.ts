"use client";
import {useEffect,useState,type RefObject} from "react";
export function useViewportSize(viewport:RefObject<HTMLElement|null>,active:boolean){
 const [size,setSize]=useState({width:0,height:0});
 useEffect(()=>{
  if(!active||!viewport.current)return;
  const el=viewport.current;
  const update=()=>setSize(previous=>{
   const width=el.clientWidth,height=el.clientHeight;
   return previous.width===width&&previous.height===height?previous:{width,height};
  });
  update();
  const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(update);
  observer?.observe(el);
  window.addEventListener("resize",update);
  return()=>{observer?.disconnect();window.removeEventListener("resize",update)};
 },[viewport,active]);
 return size;
}

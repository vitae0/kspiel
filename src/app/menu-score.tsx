"use client";

import {useCallback,useEffect,useRef,useState} from "react";

// Original, synthesized military overture. No third-party audio or looping downloads.
const MELODY=[62,65,69,74,72,69,67,65,62,65,69,72,74,72,69,0,
  65,69,72,77,76,72,69,67,65,69,74,72,69,67,62,0];
const BASS=[38,38,41,41,43,43,45,45];
const BEAT=60/96;

type PlayingScore={context:AudioContext;timer:number;master:GainNode};

function frequency(midi:number){return 440*Math.pow(2,(midi-69)/12)}

function horn(ctx:AudioContext,out:AudioNode,midi:number,at:number,length:number,volume:number){
  const amp=ctx.createGain();
  const filter=ctx.createBiquadFilter();
  filter.type="lowpass";filter.frequency.setValueAtTime(1450,at);
  filter.frequency.exponentialRampToValueAtTime(850,at+length);
  amp.gain.setValueAtTime(.0001,at);
  amp.gain.exponentialRampToValueAtTime(volume,at+.055);
  amp.gain.exponentialRampToValueAtTime(volume*.70,at+.22);
  amp.gain.exponentialRampToValueAtTime(.0001,at+length);
  filter.connect(amp);amp.connect(out);
  for(const [type,level,detune] of [["sawtooth",.28,-4],["triangle",.66,3]] as const){
    const osc=ctx.createOscillator(),mix=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency(midi),at);osc.detune.value=detune;
    mix.gain.value=level;osc.connect(mix);mix.connect(filter);
    osc.start(at);osc.stop(at+length+.02);
  }
}

function drum(ctx:AudioContext,out:AudioNode,at:number,accent:boolean){
  const length=accent?.13:.085;
  const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
  const sound=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),volume=ctx.createGain();
  sound.buffer=buffer;filter.type="highpass";filter.frequency.value=accent?1000:2500;
  volume.gain.value=accent?.095:.045;
  sound.connect(filter);filter.connect(volume);volume.connect(out);
  sound.start(at);sound.stop(at+length);
}

export default function MenuScore(){
  const playing=useRef<PlayingScore|null>(null);
  const [enabled,setEnabled]=useState(true);
  const [audible,setAudible]=useState(false);

  const stop=useCallback(()=>{
    const current=playing.current;
    playing.current=null;
    if(current){
      window.clearInterval(current.timer);
      current.master.gain.setTargetAtTime(0,current.context.currentTime,.09);
      window.setTimeout(()=>{void current.context.close().catch(()=>{})},300);
    }
    setAudible(false);
  },[]);

  const start=useCallback(()=>{
    if(playing.current){
      if(playing.current.context.state==="suspended")void playing.current.context.resume();
      return;
    }
    const AudioClass=window.AudioContext;
    if(!AudioClass)return;
    try{
      const context=new AudioClass(),master=context.createGain();
      master.gain.value=.24;master.connect(context.destination);
      let index=0,nextAt=context.currentTime+.12;
      function tick(){
        while(nextAt<context.currentTime+.4){
          const position=index%MELODY.length;
          const pitch=MELODY[position];
          if(pitch)horn(context,master,pitch,nextAt,BEAT*.87,.19);
          if(index%4===0){
            const root=BASS[Math.floor(index/4)%BASS.length];
            horn(context,master,root,nextAt,BEAT*3.8,.15);
            horn(context,master,root+12,nextAt,BEAT*3.6,.078);
          }
          if(index%2===0)drum(context,master,nextAt,index%4===0);
          nextAt+=BEAT;index++;
        }
      }
      tick();
      const timer=window.setInterval(tick,120);
      playing.current={context,master,timer};
      void context.resume().then(()=>setAudible(true)).catch(()=>stop());
    }catch{stop()}
  },[stop]);

  useEffect(()=>{
    if(window.localStorage.getItem("kspiel.menuMusic")==="off")setEnabled(false);
  },[]);

  useEffect(()=>{
    if(!enabled){stop();return}
    // Browsers block unprompted audio. Begin on the next real keyboard/pointer interaction.
    const unlock=()=>start();
    document.addEventListener("pointerdown",unlock,{once:true});
    document.addEventListener("keydown",unlock,{once:true});
    return()=>{
      document.removeEventListener("pointerdown",unlock);
      document.removeEventListener("keydown",unlock);
    };
  },[enabled,start,stop]);

  useEffect(()=>()=>{const current=playing.current;if(current){window.clearInterval(current.timer);void current.context.close().catch(()=>{});playing.current=null}},[]);

  return <button type="button" className={"menu-music-toggle "+(enabled?"is-enabled":"")} aria-label={enabled?"Mute menu music":"Enable menu music"} aria-pressed={enabled} title="Original brass-and-drum menu theme" onClick={()=>{
    if(enabled){window.localStorage.setItem("kspiel.menuMusic","off");setEnabled(false);stop()}
    else{window.localStorage.setItem("kspiel.menuMusic","on");setEnabled(true);start()}
  }}>
    <span aria-hidden="true">{enabled?"♫":"♪"}</span>
    <span>{!enabled?"MUSIC OFF":audible?"MUSIC ON":"ENABLE AUDIO"}</span>
  </button>;
}

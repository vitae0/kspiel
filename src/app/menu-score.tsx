"use client";

import {useCallback,useEffect,useRef,useState} from "react";

// Original, synthesized military overture. No third-party audio or looping downloads.
const MELODY=[62,65,69,74,72,69,67,65,62,65,69,72,74,72,69,0,
  65,69,72,77,76,72,69,67,65,69,74,72,69,67,62,0];
const BASS=[38,38,41,41,43,43,45,45];
const BEAT=60/110; // Brisk march; 8-bar fanfare with a contrasting second pass.

type PlayingScore={context:AudioContext;timer:number;master:GainNode};

function frequency(midi:number){return 440*Math.pow(2,(midi-69)/12)}

function horn(ctx:AudioContext,out:AudioNode,midi:number,at:number,length:number,volume:number,bright=false){
  const amp=ctx.createGain();
  const filter=ctx.createBiquadFilter();
  filter.type="lowpass";filter.frequency.setValueAtTime(bright?2450:1880,at);
  filter.frequency.exponentialRampToValueAtTime(850,at+length);
  amp.gain.setValueAtTime(.0001,at);
  amp.gain.exponentialRampToValueAtTime(volume,at+.055);
  amp.gain.exponentialRampToValueAtTime(volume*.70,at+.22);
  amp.gain.exponentialRampToValueAtTime(.0001,at+length);
  filter.connect(amp);amp.connect(out);
  for(const [type,level,detune] of [["sawtooth",.28,-4],["triangle",.66,3],["square",.09,0]] as const){
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
  volume.gain.value=accent?.20:.13;
  sound.connect(filter);filter.connect(volume);volume.connect(out);
  sound.start(at);sound.stop(at+length);
}


// Low strings, bass drum and distant cymbals reinforce the brass theme.
function ostinato(ctx:AudioContext,out:AudioNode,midi:number,at:number,length:number,volume:number){
  const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
  osc.type="sawtooth";osc.frequency.setValueAtTime(frequency(midi),at);
  filter.type="lowpass";filter.frequency.value=470;
  amp.gain.setValueAtTime(.0001,at);
  amp.gain.exponentialRampToValueAtTime(volume,at+.022);
  amp.gain.exponentialRampToValueAtTime(.0001,at+length);
  osc.connect(filter);filter.connect(amp);amp.connect(out);
  osc.start(at);osc.stop(at+length+.01);
}

function bassDrum(ctx:AudioContext,out:AudioNode,at:number,accent:boolean){
  const osc=ctx.createOscillator(),amp=ctx.createGain();
  osc.type="sine";osc.frequency.setValueAtTime(accent?140:112,at);
  osc.frequency.exponentialRampToValueAtTime(45,at+.18);
  amp.gain.setValueAtTime(accent?.36:.24,at);
  amp.gain.exponentialRampToValueAtTime(.0001,at+.25);
  osc.connect(amp);amp.connect(out);osc.start(at);osc.stop(at+.26);
}

function cymbal(ctx:AudioContext,out:AudioNode,at:number,length:number,volume:number){
  const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,1.8);
  const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
  src.buffer=buffer;filter.type="highpass";filter.frequency.value=2900;
  amp.gain.setValueAtTime(volume,at);amp.gain.exponentialRampToValueAtTime(.0001,at+length);
  src.connect(filter);filter.connect(amp);amp.connect(out);
  src.start(at);src.stop(at+length+.01);
}


// Short procedural interface cues, independent of the music mute switch.
type MenuEffect="hover"|"select"|"deploy";
function uiTone(ctx:AudioContext,midi:number,at:number,length:number,volume:number,wave:OscillatorType){
  const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  osc.type=wave;osc.frequency.setValueAtTime(frequency(midi),at);
  osc.frequency.exponentialRampToValueAtTime(frequency(midi-2),at+length);
  filter.type="lowpass";filter.frequency.value=2100;
  gain.gain.setValueAtTime(.0001,at);
  gain.gain.exponentialRampToValueAtTime(volume,at+.008);
  gain.gain.exponentialRampToValueAtTime(.0001,at+length);
  osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
  osc.start(at);osc.stop(at+length+.01);
}
function uiCue(ctx:AudioContext,kind:MenuEffect){
  const t=ctx.currentTime+.008;
  if(kind==="hover"){uiTone(ctx,77,t,.065,.013,"triangle");return}
  if(kind==="select"){
    uiTone(ctx,57,t,.085,.029,"triangle");
    uiTone(ctx,69,t+.035,.095,.018,"sine");
    return;
  }
  uiTone(ctx,62,t,.16,.046,"sawtooth");
  uiTone(ctx,69,t+.09,.21,.043,"triangle");
  uiTone(ctx,74,t+.16,.27,.05,"sawtooth");
}

export default function MenuScore(){
  const playing=useRef<PlayingScore|null>(null);
  const effects=useRef<AudioContext|null>(null);
  const lastHover=useRef(0);
  const [effectsEnabled,setEffectsEnabled]=useState(true);
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
      const context=new AudioClass(),master=context.createGain(),compressor=context.createDynamicsCompressor();
      compressor.threshold.value=-14;compressor.ratio.value=3;compressor.attack.value=.01;
      master.gain.value=.25;master.connect(compressor);compressor.connect(context.destination);
      let index=0,nextAt=context.currentTime+.12;
      function tick(){
        while(nextAt<context.currentTime+.4){
          const position=index%MELODY.length,beat=index%4,bar=Math.floor(index/4)%8;
          const root=BASS[bar],pitch=MELODY[position],full=Math.floor(index/32)%2===1;
          const intensity=full?1:.78;
          if(pitch)horn(context,master,pitch,nextAt,BEAT*.88,.15*intensity,true);
          if(full&&pitch&&beat===0)horn(context,master,pitch+12,nextAt,BEAT*.74,.055,true);
          if(beat===0){
            const minor=bar!==2&&bar!==3;
            horn(context,master,root+12,nextAt,BEAT*3.7,.087*intensity);
            horn(context,master,root+12+(minor?3:4),nextAt,BEAT*3.5,.057*intensity);
            horn(context,master,root+19,nextAt,BEAT*3.4,.06*intensity);
          }
          ostinato(context,master,root,nextAt,BEAT*.6,.09*intensity);
          ostinato(context,master,root+12,nextAt+BEAT*.5,BEAT*.32,.05*intensity);
          if(beat===0||beat===2)bassDrum(context,master,nextAt,beat===0);
          if(beat===1||beat===3)drum(context,master,nextAt,full||beat===3);
          cymbal(context,master,nextAt+BEAT*.5,.052,.025*intensity);
          if(bar===7&&full&&beat>=2){
            drum(context,master,nextAt+BEAT*.5,true);
            if(beat===3)drum(context,master,nextAt+BEAT*.75,true);
          }else if(beat===0&&(bar===0||bar===4))cymbal(context,master,nextAt,.55,.07);
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
    if(window.localStorage.getItem("kspiel.menuSfx")==="off")setEffectsEnabled(false);
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

  const playEffect=useCallback((kind:MenuEffect)=>{
    if(!effectsEnabled||!window.AudioContext)return;
    try{
      let ctx=effects.current;
      // Avoid creating a suspended audio context on an unsolicited hover.
      if(!ctx){
        if(kind==="hover")return;
        ctx=new AudioContext();
        effects.current=ctx;
      }
      if(ctx.state==="suspended")void ctx.resume();
      if(ctx.state!=="closed")uiCue(ctx,kind);
    }catch{/* Audio cannot interfere with game controls. */}
  },[effectsEnabled]);

  useEffect(()=>{
    const onOver=(event:PointerEvent)=>{
      if(event.pointerType==="touch"||!(event.target instanceof Element))return;
      const button=event.target.closest(".setup-shell button");
      if(!(button instanceof HTMLButtonElement)||button.disabled)return;
      if(event.relatedTarget instanceof Node&&button.contains(event.relatedTarget))return;
      const now=performance.now();
      if(now-lastHover.current<65)return;
      lastHover.current=now;
      playEffect("hover");
    };
    const onFocus=(event:FocusEvent)=>{
      const target=event.target;
      if(target instanceof HTMLButtonElement&&target.closest(".setup-shell")&&!target.disabled)playEffect("hover");
    };
    const onClick=(event:MouseEvent)=>{
      if(!(event.target instanceof Element))return;
      const button=event.target.closest(".setup-shell button");
      if(!(button instanceof HTMLButtonElement)||button.disabled)return;
      playEffect(button.classList.contains("launch-button")?"deploy":"select");
    };
    document.addEventListener("pointerover",onOver);
    document.addEventListener("focusin",onFocus);
    document.addEventListener("click",onClick,true);
    return()=>{
      document.removeEventListener("pointerover",onOver);
      document.removeEventListener("focusin",onFocus);
      document.removeEventListener("click",onClick,true);
    };
  },[playEffect]);

  useEffect(()=>()=>{const current=playing.current;if(current){window.clearInterval(current.timer);void current.context.close().catch(()=>{});playing.current=null}
    const sfx=effects.current;if(sfx){void sfx.close().catch(()=>{});effects.current=null}
  },[]);

  return <><button type="button" className={"menu-music-toggle "+(enabled?"is-enabled":"")} aria-label={enabled?"Mute menu music":"Enable menu music"} aria-pressed={enabled} title="Original cinematic brass, strings and marching-percussion theme" onClick={()=>{
    if(enabled){window.localStorage.setItem("kspiel.menuMusic","off");setEnabled(false);stop()}
    else{window.localStorage.setItem("kspiel.menuMusic","on");setEnabled(true);start()}
  }}>
    <span aria-hidden="true">{enabled?"♫":"♪"}</span>
    <span>{!enabled?"MUSIC OFF":audible?"MUSIC ON":"ENABLE AUDIO"}</span>
  </button>
  <button type="button" className={"menu-sfx-toggle "+(effectsEnabled?"is-enabled":"")}
    aria-label={effectsEnabled?"Mute menu sound effects":"Enable menu sound effects"}
    aria-pressed={effectsEnabled} title="UI sound effects" onClick={()=>{
      const value=!effectsEnabled;
      window.localStorage.setItem("kspiel.menuSfx",value?"on":"off");
      setEffectsEnabled(value);
    }}>
    <span aria-hidden="true">{effectsEnabled?"◉":"◎"}</span>
    <span>{effectsEnabled?"SFX ON":"SFX OFF"}</span>
  </button></>;
}
